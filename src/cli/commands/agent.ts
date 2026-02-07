/**
 * AgentPrime Agent - Personal AI Assistant with full tool execution
 * Inspired by clawdbot - your own personal AI assistant
 */

import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn, exec } from 'child_process';
import * as os from 'os';
import https from 'https';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SESSION_DIR = path.join(os.homedir(), '.agentprime', 'sessions');
const WORKSPACE = process.cwd();

interface AgentOptions {
  message: string;
  thinking: string;
  verbose: boolean;
  model?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function getSessionPath(name: string = 'main'): string {
  ensureSessionDir();
  return path.join(SESSION_DIR, `${name}.json`);
}

function loadSession(name: string = 'main'): Array<{ role: string; content: any }> {
  const sessionPath = getSessionPath(name);
  if (fs.existsSync(sessionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      // Keep last 50 messages to avoid context overflow
      return data.messages?.slice(-50) || [];
    } catch {
      return [];
    }
  }
  return [];
}

function saveSession(messages: Array<{ role: string; content: any }>, name: string = 'main') {
  const sessionPath = getSessionPath(name);
  fs.writeFileSync(sessionPath, JSON.stringify({ 
    messages, 
    updated: new Date().toISOString(),
    workspace: WORKSPACE
  }, null, 2));
}

function clearSession(name: string = 'main') {
  const sessionPath = getSessionPath(name);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read contents of a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates directories if needed)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing old text with new text',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        old_text: { type: 'string', description: 'Text to find and replace' },
        new_text: { type: 'string', description: 'Replacement text' }
      },
      required: ['path', 'old_text', 'new_text']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and folders in a directory',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (defaults to current)' }
      }
    }
  },
  {
    name: 'bash',
    description: 'Run a shell/bash command. Use for git, npm, python, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to run' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout: { type: 'number', description: 'Timeout in ms (default 60000)' }
      },
      required: ['command']
    }
  },
  {
    name: 'open',
    description: 'Open a file or URL in the default application or code editor',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'File path or URL to open' },
        app: { type: 'string', description: 'App to open with: "code", "cursor", "browser", or "default"' }
      },
      required: ['target']
    }
  },
  {
    name: 'search',
    description: 'Search for files by name or search text within files (grep)',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (filename pattern or text to find)' },
        type: { type: 'string', description: '"files" to find files, "content" to search inside files' },
        path: { type: 'string', description: 'Directory to search in (default: current)' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: 'Fetch content from a URL',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' }
      },
      required: ['url']
    }
  },
  {
    name: 'system_info',
    description: 'Get system information (OS, memory, CPU, current directory, time)',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'notify',
    description: 'Show a desktop notification',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification message' }
      },
      required: ['message']
    }
  },
  {
    name: 'launch_app',
    description: 'Launch a Windows application or game by name. Searches Start Menu, Steam, Epic, Xbox, and common install locations.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Application or game name to launch' }
      },
      required: ['name']
    }
  },
  {
    name: 'type_text',
    description: 'Type text using the keyboard. Works in any focused application (Chrome, Word, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
        delay: { type: 'number', description: 'Delay between keystrokes in ms (default: 50)' }
      },
      required: ['text']
    }
  },
  {
    name: 'press_key',
    description: 'Press a keyboard key or hotkey combination (e.g., "enter", "ctrl+c", "alt+tab")',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key or combination to press (e.g., "enter", "ctrl+a", "alt+f4")' }
      },
      required: ['key']
    }
  },
  {
    name: 'click_mouse',
    description: 'Click the mouse at current position or specified coordinates',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate (optional - uses current if not specified)' },
        y: { type: 'number', description: 'Y coordinate (optional - uses current if not specified)' },
        button: { type: 'string', description: 'Mouse button: "left", "right", "middle" (default: left)' },
        double: { type: 'boolean', description: 'Double click (default: false)' }
      }
    }
  },
  {
    name: 'move_mouse',
    description: 'Move the mouse to specified coordinates',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'focus_window',
    description: 'Focus/activate a window by title',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Window title or partial match' }
      },
      required: ['title']
    }
  },
  {
    name: 'wait',
    description: 'Wait/sleep for specified milliseconds before continuing',
    input_schema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Milliseconds to wait' }
      },
      required: ['ms']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS
// ═══════════════════════════════════════════════════════════════════════════

async function executeTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case 'read_file': {
        const filePath = path.resolve(input.path);
        if (!fs.existsSync(filePath)) {
          return `Error: File not found: ${filePath}`;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        if (lines.length > 500) {
          return `${lines.slice(0, 500).join('\n')}\n\n... (${lines.length - 500} more lines truncated)`;
        }
        return content;
      }
      
      case 'write_file': {
        const filePath = path.resolve(input.path);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, input.content, 'utf-8');
        return `✅ Written ${input.content.length} bytes to ${filePath}`;
      }
      
      case 'edit_file': {
        const filePath = path.resolve(input.path);
        if (!fs.existsSync(filePath)) {
          return `Error: File not found: ${filePath}`;
        }
        let content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(input.old_text)) {
          return `Error: Could not find the text to replace in ${filePath}`;
        }
        content = content.replace(input.old_text, input.new_text);
        fs.writeFileSync(filePath, content, 'utf-8');
        return `✅ Edited ${filePath}`;
      }
      
      case 'list_directory': {
        const dirPath = path.resolve(input.path || '.');
        if (!fs.existsSync(dirPath)) {
          return `Error: Directory not found: ${dirPath}`;
        }
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = items
          .filter(item => !item.name.startsWith('.') || input.showHidden)
          .slice(0, 100)
          .map(item => {
            const prefix = item.isDirectory() ? '📁' : '📄';
            return `${prefix} ${item.name}`;
          }).join('\n');
        return `${dirPath}:\n${result}${items.length > 100 ? `\n... and ${items.length - 100} more` : ''}`;
      }
      
      case 'bash': {
        const cwd = input.cwd ? path.resolve(input.cwd) : WORKSPACE;
        const timeout = input.timeout || 60000;
        try {
          const output = execSync(input.command, { 
            cwd, 
            encoding: 'utf-8',
            timeout,
            maxBuffer: 1024 * 1024 * 5,
            shell: os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash'
          });
          return output || '(completed with no output)';
        } catch (e: any) {
          const stdout = e.stdout || '';
          const stderr = e.stderr || '';
          return `Exit code: ${e.status || 1}\n${stdout}\n${stderr}`.trim();
        }
      }
      
      case 'open': {
        const target = input.target;
        const app = input.app || 'default';
        
        let cmd: string;
        if (app === 'code' || app === 'cursor') {
          cmd = os.platform() === 'win32' 
            ? `${app} "${target}"` 
            : `${app} "${target}"`;
        } else if (app === 'browser' || target.startsWith('http')) {
          if (os.platform() === 'win32') {
            cmd = `start "" "${target}"`;
          } else if (os.platform() === 'darwin') {
            cmd = `open "${target}"`;
          } else {
            cmd = `xdg-open "${target}"`;
          }
        } else {
          // Default app
          if (os.platform() === 'win32') {
            cmd = `start "" "${path.resolve(target)}"`;
          } else if (os.platform() === 'darwin') {
            cmd = `open "${path.resolve(target)}"`;
          } else {
            cmd = `xdg-open "${path.resolve(target)}"`;
          }
        }
        
        try {
          execSync(cmd, { stdio: 'ignore', shell: true });
          return `✅ Opened ${target}`;
        } catch (e: any) {
          return `Error opening: ${e.message}`;
        }
      }
      
      case 'search': {
        const searchPath = path.resolve(input.path || '.');
        const query = input.query;
        const type = input.type || 'files';
        
        if (type === 'content') {
          // Search file contents
          try {
            let cmd: string;
            if (os.platform() === 'win32') {
              cmd = `findstr /s /i /n "${query}" "${searchPath}\\*" 2>nul`;
            } else {
              cmd = `grep -rn --include="*" "${query}" "${searchPath}" 2>/dev/null | head -100`;
            }
            const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
            return output || 'No matches found';
          } catch (e: any) {
            if (e.status === 1) return 'No matches found';
            return `Search error: ${e.message}`;
          }
        } else {
          // Search for files
          const results: string[] = [];
          const pattern = query.toLowerCase();
          
          function search(dir: string, depth: number = 0) {
            if (depth > 6 || results.length > 50) return;
            try {
              const items = fs.readdirSync(dir, { withFileTypes: true });
              for (const item of items) {
                if (item.name.startsWith('.') || item.name === 'node_modules') continue;
                const fullPath = path.join(dir, item.name);
                if (item.name.toLowerCase().includes(pattern)) {
                  results.push(fullPath);
                }
                if (item.isDirectory()) {
                  search(fullPath, depth + 1);
                }
              }
            } catch {}
          }
          
          search(searchPath);
          return results.length > 0 
            ? `Found ${results.length} matches:\n${results.join('\n')}`
            : `No files matching "${query}" found`;
        }
      }
      
      case 'web_fetch': {
        return new Promise((resolve) => {
          const url = new URL(input.url);
          const req = https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              if (data.length > 10000) {
                data = data.slice(0, 10000) + '\n... (truncated)';
              }
              resolve(data);
            });
          });
          req.on('error', (e) => resolve(`Error: ${e.message}`));
          req.setTimeout(10000, () => {
            req.destroy();
            resolve('Error: Request timeout');
          });
        });
      }
      
      case 'system_info': {
        return `System Info:
  Time: ${new Date().toLocaleString()}
  OS: ${os.type()} ${os.release()} (${os.arch()})
  Host: ${os.hostname()}
  User: ${os.userInfo().username}
  Home: ${os.homedir()}
  CWD: ${WORKSPACE}
  Memory: ${Math.round(os.freemem() / 1024 / 1024)}MB free / ${Math.round(os.totalmem() / 1024 / 1024)}MB total
  CPUs: ${os.cpus().length}x ${os.cpus()[0]?.model || 'Unknown'}
  Node: ${process.version}`;
      }
      
      case 'notify': {
        const title = input.title || 'AgentPrime';
        const message = input.message;
        
        try {
          if (os.platform() === 'win32') {
            // PowerShell toast notification
            const ps = `
              [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
              [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
              $template = "<toast><visual><binding template='ToastText02'><text id='1'>${title}</text><text id='2'>${message}</text></binding></visual></toast>"
              $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
              $xml.LoadXml($template)
              $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
              [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AgentPrime').Show($toast)
            `;
            execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { stdio: 'ignore' });
          } else if (os.platform() === 'darwin') {
            execSync(`osascript -e 'display notification "${message}" with title "${title}"'`);
          } else {
            execSync(`notify-send "${title}" "${message}"`);
          }
          return `✅ Notification sent`;
        } catch (e: any) {
          return `Notification error: ${e.message}`;
        }
      }
      
      case 'launch_app': {
        const appName = input.name.toLowerCase()
          .replace(/[:\-_]/g, ' ')  // Normalize punctuation
          .replace(/\s+/g, ' ')     // Normalize spaces
          .trim();
        const searchTerms = appName.split(/\s+/).filter(t => t.length > 1);
        
        // Known game/app aliases for fuzzy matching
        const aliases: Record<string, string[]> = {
          'clair obscur': ['clair', 'obscur', 'expedition', '33'],
          'baldurs gate': ['baldur', 'gate', 'bg3'],
          'cyberpunk': ['cyberpunk', '2077'],
          'elden ring': ['elden', 'ring'],
          'steam': ['steam'],
          'discord': ['discord'],
          'spotify': ['spotify'],
          'chrome': ['chrome', 'google'],
          'firefox': ['firefox'],
          'code': ['code', 'vscode', 'visual studio code'],
          'cursor': ['cursor'],
        };
        
        // Check if input matches any aliases
        for (const [key, values] of Object.entries(aliases)) {
          if (values.some(v => appName.includes(v))) {
            // Add all alias terms to search
            searchTerms.push(...key.split(' '));
          }
        }
        
        // Common locations to search for apps/games
        const searchPaths = [
          // Start Menu
          path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
          'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
          // Steam
          'C:\\Program Files (x86)\\Steam\\steamapps\\common',
          'C:\\Program Files\\Steam\\steamapps\\common',
          'D:\\Steam\\steamapps\\common',
          'D:\\SteamLibrary\\steamapps\\common',
          'E:\\Steam\\steamapps\\common',
          'E:\\SteamLibrary\\steamapps\\common',
          'F:\\Steam\\steamapps\\common',
          'F:\\SteamLibrary\\steamapps\\common',
          'G:\\Steam\\steamapps\\common',
          'G:\\SteamLibrary\\steamapps\\common',
          // Epic Games
          'C:\\Program Files\\Epic Games',
          'D:\\Epic Games',
          'E:\\Epic Games',
          'F:\\Epic Games',
          // Xbox/Microsoft Store
          'C:\\Program Files\\WindowsApps',
          // Common install locations
          'C:\\Program Files',
          'C:\\Program Files (x86)',
          'D:\\Games',
          'E:\\Games',
          'F:\\Games',
          'G:\\Games',
        ];
        
        const foundApps: Array<{ name: string; path: string; score: number }> = [];
        
        function searchDir(dir: string, depth: number = 0) {
          if (depth > 3 || foundApps.length > 20) return;
          try {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
              const itemLower = item.name.toLowerCase();
              const fullPath = path.join(dir, item.name);
              
              // Check if name matches search terms
              let score = 0;
              for (const term of searchTerms) {
                if (itemLower.includes(term)) score += 10;
              }
              
              if (score > 0) {
                // Look for executables
                if (item.isFile() && (item.name.endsWith('.exe') || item.name.endsWith('.lnk') || item.name.endsWith('.url'))) {
                  foundApps.push({ name: item.name, path: fullPath, score: score + 5 });
                } else if (item.isDirectory()) {
                  // Look for exe inside matching directory
                  try {
                    const subItems = fs.readdirSync(fullPath);
                    for (const sub of subItems) {
                      if (sub.endsWith('.exe') && !sub.toLowerCase().includes('uninstall') && !sub.toLowerCase().includes('crash')) {
                        const subLower = sub.toLowerCase();
                        let subScore = score;
                        for (const term of searchTerms) {
                          if (subLower.includes(term)) subScore += 5;
                        }
                        foundApps.push({ name: `${item.name}/${sub}`, path: path.join(fullPath, sub), score: subScore });
                      }
                    }
                  } catch {}
                  // Also recurse into matching directories
                  searchDir(fullPath, depth + 1);
                }
              } else if (item.isDirectory() && depth < 2) {
                // Recurse into non-matching directories at shallow depth
                searchDir(fullPath, depth + 1);
              }
            }
          } catch {}
        }
        
        // Search all paths
        for (const searchPath of searchPaths) {
          searchDir(searchPath);
        }
        
        // Sort by score
        foundApps.sort((a, b) => b.score - a.score);
        
        if (foundApps.length === 0) {
          // Try using Windows search as fallback
          try {
            const searchCmd = `powershell -Command "Get-ChildItem -Path 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu' -Recurse -Include '*.lnk' | Where-Object { $_.Name -match '${searchTerms.join('.*')}' } | Select-Object -First 5 -ExpandProperty FullName"`;
            const result = execSync(searchCmd, { encoding: 'utf-8', timeout: 10000 });
            const shortcuts = result.trim().split('\n').filter(Boolean);
            if (shortcuts.length > 0) {
              const shortcut = shortcuts[0];
              spawn('cmd.exe', ['/c', 'start', '', shortcut], { detached: true, stdio: 'ignore' }).unref();
              return `✅ Launching: ${path.basename(shortcut)}`;
            }
          } catch {}
          
          return `Could not find application matching "${input.name}".\n\nTry:\n- Check exact game/app name\n- Launch from Steam/Epic directly\n- Provide the full path to the .exe`;
        }
        
        // Launch the best match
        const best = foundApps[0];
        try {
          if (best.path.endsWith('.lnk') || best.path.endsWith('.url')) {
            spawn('cmd.exe', ['/c', 'start', '', best.path], { detached: true, stdio: 'ignore' }).unref();
          } else {
            spawn(best.path, [], { detached: true, stdio: 'ignore', cwd: path.dirname(best.path) }).unref();
          }
          return `✅ Launching: ${best.name}\n   Path: ${best.path}`;
        } catch (e: any) {
          return `Error launching ${best.name}: ${e.message}`;
        }
      }
      
      case 'type_text': {
        const text = input.text;
        const delay = input.delay || 50;
        
        try {
          // Use PowerShell to send keystrokes via SendKeys
          const escapedText = text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\+/g, '{+}')
            .replace(/\^/g, '{^}')
            .replace(/~/g, '{~}')
            .replace(/%/g, '{%}')
            .replace(/\(/g, '{(}')
            .replace(/\)/g, '{)}')
            .replace(/\[/g, '{[}')
            .replace(/\]/g, '{]}')
            .replace(/\{/g, '{{}')
            .replace(/\}/g, '{}}');
          
          const ps = `
            Add-Type -AssemblyName System.Windows.Forms;
            Start-Sleep -Milliseconds 500;
            [System.Windows.Forms.SendKeys]::SendWait("${escapedText}");
          `;
          execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { timeout: 30000 });
          return `✅ Typed: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`;
        } catch (e: any) {
          return `Error typing text: ${e.message}`;
        }
      }
      
      case 'press_key': {
        const key = input.key.toLowerCase();
        
        // Map common key names to SendKeys format
        const keyMap: Record<string, string> = {
          'enter': '{ENTER}',
          'return': '{ENTER}',
          'tab': '{TAB}',
          'escape': '{ESC}',
          'esc': '{ESC}',
          'backspace': '{BACKSPACE}',
          'delete': '{DELETE}',
          'del': '{DELETE}',
          'home': '{HOME}',
          'end': '{END}',
          'pageup': '{PGUP}',
          'pagedown': '{PGDN}',
          'up': '{UP}',
          'down': '{DOWN}',
          'left': '{LEFT}',
          'right': '{RIGHT}',
          'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
          'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
          'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
          'space': ' ',
        };
        
        try {
          let sendKey = '';
          
          // Handle modifier combinations like ctrl+c, alt+tab
          if (key.includes('+')) {
            const parts = key.split('+');
            let modifiers = '';
            let mainKey = parts[parts.length - 1];
            
            for (let i = 0; i < parts.length - 1; i++) {
              const mod = parts[i].trim();
              if (mod === 'ctrl' || mod === 'control') modifiers += '^';
              else if (mod === 'alt') modifiers += '%';
              else if (mod === 'shift') modifiers += '+';
              else if (mod === 'win' || mod === 'windows') modifiers += '^{ESC}'; // Win key approximation
            }
            
            mainKey = keyMap[mainKey] || mainKey.toUpperCase();
            sendKey = modifiers + mainKey;
          } else {
            sendKey = keyMap[key] || key.toUpperCase();
          }
          
          const ps = `
            Add-Type -AssemblyName System.Windows.Forms;
            Start-Sleep -Milliseconds 200;
            [System.Windows.Forms.SendKeys]::SendWait("${sendKey}");
          `;
          execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { timeout: 10000 });
          return `✅ Pressed: ${input.key}`;
        } catch (e: any) {
          return `Error pressing key: ${e.message}`;
        }
      }
      
      case 'click_mouse': {
        const button = input.button || 'left';
        const double = input.double || false;
        
        try {
          let moveCmd = '';
          if (input.x !== undefined && input.y !== undefined) {
            moveCmd = `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${input.x}, ${input.y});`;
          }
          
          const buttonCode = button === 'right' ? '0x0002' : button === 'middle' ? '0x0020' : '0x0002';
          const upCode = button === 'right' ? '0x0004' : button === 'middle' ? '0x0040' : '0x0004';
          
          // Use user32.dll for mouse clicks
          const ps = `
            Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name U32 -Namespace W;
            Add-Type -AssemblyName System.Windows.Forms;
            ${moveCmd}
            Start-Sleep -Milliseconds 100;
            [W.U32]::mouse_event(0x0002, 0, 0, 0, 0);
            [W.U32]::mouse_event(0x0004, 0, 0, 0, 0);
            ${double ? '[W.U32]::mouse_event(0x0002, 0, 0, 0, 0); [W.U32]::mouse_event(0x0004, 0, 0, 0, 0);' : ''}
          `;
          execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { timeout: 10000 });
          
          const posStr = input.x !== undefined ? ` at (${input.x}, ${input.y})` : '';
          return `✅ ${double ? 'Double-' : ''}Clicked ${button}${posStr}`;
        } catch (e: any) {
          return `Error clicking: ${e.message}`;
        }
      }
      
      case 'move_mouse': {
        try {
          const ps = `
            Add-Type -AssemblyName System.Windows.Forms;
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${input.x}, ${input.y});
          `;
          execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { timeout: 5000 });
          return `✅ Moved mouse to (${input.x}, ${input.y})`;
        } catch (e: any) {
          return `Error moving mouse: ${e.message}`;
        }
      }
      
      case 'focus_window': {
        const title = input.title;
        try {
          const ps = `
            Add-Type -TypeDefinition @'
              using System;
              using System.Runtime.InteropServices;
              public class Win32 {
                [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
              }
'@
            $procs = Get-Process | Where-Object { $_.MainWindowTitle -like "*${title}*" }
            if ($procs) {
              $hwnd = $procs[0].MainWindowHandle
              [Win32]::SetForegroundWindow($hwnd)
              Write-Output "Focused: $($procs[0].MainWindowTitle)"
            } else {
              Write-Output "No window found matching: ${title}"
            }
          `;
          const result = execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { encoding: 'utf-8', timeout: 10000 });
          return result.trim() || `✅ Focused window: ${title}`;
        } catch (e: any) {
          return `Error focusing window: ${e.message}`;
        }
      }
      
      case 'wait': {
        const ms = input.ms || 1000;
        return new Promise((resolve) => {
          setTimeout(() => resolve(`✅ Waited ${ms}ms`), ms);
        });
      }
      
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e: any) {
    return `Error executing ${name}: ${e.message}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ANTHROPIC API WITH TOOL USE
// ═══════════════════════════════════════════════════════════════════════════

async function callClaude(
  messages: Array<{ role: string; content: any }>,
  onText: (text: string) => void
): Promise<{ text: string; toolCalls: any[]; stopReason: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: `You are AgentPrime, a personal AI assistant running on the user's Windows computer.
You have FULL ACCESS to the filesystem, can run commands, launch apps/games, open files, and more.

CURRENT STATE:
- OS: ${os.type()} ${os.arch()} (Windows 11)
- Workspace: ${WORKSPACE}
- Time: ${new Date().toLocaleString()}
- User: ${os.userInfo().username}

PERSONALITY: You're casual, friendly, and ACTION-ORIENTED. When the user asks for something, DO IT immediately.
Don't ask for clarification unless absolutely necessary. Make reasonable assumptions.

YOU HAVE FULL COMPUTER CONTROL:
- type_text: Type text into any focused application (Chrome, Word, etc.)
- press_key: Press keys/hotkeys (enter, ctrl+c, alt+tab, etc.)
- click_mouse: Click at coordinates or current position
- move_mouse: Move cursor to coordinates
- focus_window: Focus a window by title
- wait: Pause between actions

TYPICAL WORKFLOW for "open Chrome and type X":
1. launch_app("Chrome")
2. wait(2000) - give it time to open
3. focus_window("Chrome") - ensure it's focused
4. type_text("your text here")
5. press_key("enter") if needed

UNDERSTANDING INTENT:
- "launch X" / "open X" / "play X" / "run X" = use launch_app tool
- "type X in Y" = launch_app(Y), wait, focus_window(Y), type_text(X)
- "clair obscur" = the game "Clair Obscur: Expedition 33" 
- Partial names are fine - fuzzy match them
- Game/app names don't need to be exact
- If user says "it" or "that", refer to context from the conversation

COMMON APPS/GAMES the user might reference:
- Steam games: search Steam folders
- Epic Games: search Epic folders  
- Discord, Spotify, Chrome, VS Code, Cursor, etc.
- Recent/popular games: Baldur's Gate 3, Elden Ring, Cyberpunk, etc.

BE PROACTIVE:
- Don't just explain what you'd do - DO IT
- Use tools immediately when appropriate
- Chain multiple tools for complex tasks
- Keep responses SHORT and friendly`,
      tools: TOOLS,
      messages
    });

    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`API error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          let text = '';
          const toolCalls: any[] = [];
          
          for (const block of json.content || []) {
            if (block.type === 'text') {
              text += block.text;
              onText(block.text);
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.id,
                name: block.name,
                input: block.input
              });
            }
          }
          
          resolve({ text, toolCalls, stopReason: json.stop_reason });
        } catch (e: any) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function runAgentLoop(
  userMessage: string,
  messages: Array<{ role: string; content: any }>,
  verbose: boolean = false
): Promise<Array<{ role: string; content: any }>> {
  messages.push({ role: 'user', content: userMessage });
  
  let iterations = 0;
  const maxIterations = 20;
  
  while (iterations < maxIterations) {
    iterations++;
    
    process.stdout.write(chalk.cyan('Agent: '));
    
    const { text, toolCalls, stopReason } = await callClaude(messages, (t) => {
      process.stdout.write(t);
    });
    
    if (text) console.log('');
    
    // No tool calls = done
    if (toolCalls.length === 0) {
      if (text) {
        messages.push({ role: 'assistant', content: text });
      }
      break;
    }
    
    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: [
        ...(text ? [{ type: 'text', text }] : []),
        ...toolCalls.map(tc => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input
        }))
      ]
    });
    
    // Execute tools
    const toolResults: any[] = [];
    for (const tc of toolCalls) {
      const inputStr = JSON.stringify(tc.input);
      const shortInput = inputStr.length > 60 ? inputStr.slice(0, 60) + '...' : inputStr;
      console.log(chalk.yellow(`⚡ ${tc.name}`) + chalk.gray(` ${shortInput}`));
      
      const result = await executeTool(tc.name, tc.input);
      
      if (verbose || result.length < 200) {
        console.log(chalk.gray(result.slice(0, 500) + (result.length > 500 ? '...' : '')));
      } else {
        console.log(chalk.gray(`(${result.length} chars)`));
      }
      
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tc.id,
        content: result
      });
    }
    
    messages.push({ role: 'user', content: toolResults });
    console.log('');
  }
  
  if (iterations >= maxIterations) {
    console.log(chalk.yellow('\n⚠️ Max iterations reached'));
  }
  
  return messages;
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE MESSAGE MODE
// ═══════════════════════════════════════════════════════════════════════════

export async function runAgent(options: AgentOptions) {
  console.log(chalk.cyan('\n🤖 AgentPrime\n'));
  
  try {
    console.log(chalk.green('You: ') + options.message);
    console.log('');
    
    // Load existing session for context
    let messages = loadSession();
    
    messages = await runAgentLoop(options.message, messages, options.verbose);
    
    // Save session
    saveSession(messages);
    
  } catch (error: any) {
    console.error(chalk.red(`\nError: ${error.message}`));
    if (options.verbose) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIVE MODE - The main experience
// ═══════════════════════════════════════════════════════════════════════════

export async function runInteractiveAgent(options: Partial<AgentOptions> = {}) {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║  🤖 AgentPrime - Your Personal AI Assistant               ║
╚═══════════════════════════════════════════════════════════╝
`));
  console.log(chalk.gray(`Workspace: ${WORKSPACE}`));
  console.log(chalk.gray(`Commands: /new (reset) | /status | /exit\n`));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Load existing session
  let messages = loadSession();
  if (messages.length > 0) {
    console.log(chalk.gray(`📝 Loaded ${messages.length} messages from previous session\n`));
  }
  
  const prompt = () => {
    rl.question(chalk.green('You: '), async (input) => {
      const message = input.trim();
      
      // Commands
      if (message.toLowerCase() === '/exit' || message.toLowerCase() === 'exit') {
        saveSession(messages);
        console.log(chalk.cyan('\n👋 Session saved. Goodbye!\n'));
        rl.close();
        process.exit(0);
      }
      
      if (message.toLowerCase() === '/new' || message.toLowerCase() === '/reset') {
        messages = [];
        clearSession();
        console.log(chalk.cyan('🔄 Session cleared\n'));
        prompt();
        return;
      }
      
      if (message.toLowerCase() === '/status') {
        console.log(chalk.cyan(`
📊 Status:
   Messages: ${messages.length}
   Workspace: ${WORKSPACE}
   Session: main
`));
        prompt();
        return;
      }
      
      if (!message) {
        prompt();
        return;
      }
      
      try {
        messages = await runAgentLoop(message, messages, options.verbose || false);
        saveSession(messages);
      } catch (error: any) {
        console.log(chalk.red('\nError: ') + error.message);
      }
      
      console.log('');
      prompt();
    });
  };
  
  prompt();
}
