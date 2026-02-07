/**
 * Tool Path Finder
 * Automatically finds Node.js/npm and Python installations
 * Handles cases where tools aren't in PATH
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface ToolPaths {
  node?: string;
  npm?: string;
  python?: string;
  python3?: string;
}

let cachedPaths: ToolPaths | null = null;

/**
 * Clear the cached paths (useful for testing or if tools are installed during runtime)
 */
export function clearToolPathCache(): void {
  cachedPaths = null;
}

/**
 * Find Node.js installation
 * IMPORTANT: Always resolves to FULL PATH, not just command name!
 * This is critical for Windows where child processes may not inherit PATH correctly.
 */
function findNodeJS(): { node?: string; npm?: string } {
  const result: { node?: string; npm?: string } = {};

  // On Windows, we MUST get full paths even if node is "in PATH"
  // because child processes (like npm post-install scripts) may not inherit PATH correctly
  if (process.platform === 'win32') {
    // Try 'where' command to get full path
    try {
      const nodePath = execSync('where node.exe', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        .split('\n')[0]?.trim();
      if (nodePath && fs.existsSync(nodePath)) {
        result.node = nodePath;
        console.log(`[ToolPathFinder] Found Node.js via 'where': ${nodePath}`);
        
        // Find npm in the same directory
        const nodeDir = path.dirname(nodePath);
        const npmPath = path.join(nodeDir, 'npm.cmd');
        if (fs.existsSync(npmPath)) {
          result.npm = npmPath;
          console.log(`[ToolPathFinder] Found npm at: ${npmPath}`);
          return result;
        }
      }
    } catch {
      // 'where' failed, continue to manual search
    }
  } else {
    // Unix: Check if already in PATH and get full path with 'which'
    try {
      const nodePath = execSync('which node', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (nodePath && fs.existsSync(nodePath)) {
        result.node = nodePath;
        try {
          const npmPath = execSync('which npm', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
          if (npmPath && fs.existsSync(npmPath)) {
            result.npm = npmPath;
            return result;
          }
        } catch {
          // npm not in PATH, continue searching
        }
      }
    } catch {
      // Node not in PATH, continue searching
    }
  }

  // Common Windows locations - check A:\Nodejs first (user's specific location)
  const windowsPaths = [
    'A:\\Nodejs',  // Check capital N first (user specified)
    'A:\\nodejs',  // Then lowercase
    'C:\\Program Files\\nodejs',
    'C:\\Program Files (x86)\\nodejs',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
    path.join(process.env.APPDATA || '', 'nvm'),
    path.join(process.env.APPDATA || '', 'nvm', 'current'),
  ];
  
  // Also check other drive letters (D, E, F, G, H)
  if (process.platform === 'win32') {
    for (const drive of ['D', 'E', 'F', 'G', 'H']) {
      windowsPaths.push(`${drive}:\\Program Files\\nodejs`);
      windowsPaths.push(`${drive}:\\nodejs`);
      windowsPaths.push(`${drive}:\\Nodejs`);
    }
  }

  // Common Unix/Mac locations
  const unixPaths = [
    '/usr/local/bin',
    '/usr/bin',
    '/opt/homebrew/bin',
    path.join(process.env.HOME || '', '.nvm', 'versions', 'node'),
  ];

  const searchPaths = process.platform === 'win32' ? windowsPaths : unixPaths;

  for (const basePath of searchPaths) {
    if (!basePath) continue;

    // Check for node.exe (Windows) or node (Unix)
    const nodeExe = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodePath = path.join(basePath, nodeExe);

    if (fs.existsSync(nodePath)) {
      result.node = nodePath;
      
      // Find npm
      const npmExe = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const npmPath = path.join(basePath, npmExe);
      
      if (fs.existsSync(npmPath)) {
        result.npm = npmPath;
      } else {
        // Try npm in same directory
        const npmPath2 = path.join(path.dirname(nodePath), npmExe);
        if (fs.existsSync(npmPath2)) {
          result.npm = npmPath2;
        }
      }

      if (result.node) {
        console.log(`[ToolPathFinder] Found Node.js at: ${result.node}`);
        if (result.npm) {
          console.log(`[ToolPathFinder] Found npm at: ${result.npm}`);
        }
        return result;
      }
    }
  }

  // Try to find via nvm (if available)
  if (process.platform === 'win32') {
    try {
      const nvmPath = path.join(process.env.APPDATA || '', 'nvm');
      if (fs.existsSync(nvmPath)) {
        // Look for current symlink or version
        const currentPath = path.join(nvmPath, 'current');
        if (fs.existsSync(currentPath)) {
          const nodePath = path.join(currentPath, 'node.exe');
          if (fs.existsSync(nodePath)) {
            result.node = nodePath;
            const npmPath = path.join(currentPath, 'npm.cmd');
            if (fs.existsSync(npmPath)) {
              result.npm = npmPath;
            }
            return result;
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return result;
}

/**
 * Find Python installation
 */
function findPython(): { python?: string; python3?: string } {
  const result: { python?: string; python3?: string } = {};

  // Check if already in PATH
  try {
    execSync('python --version', { stdio: 'ignore' });
    result.python = 'python';
  } catch {
    // Continue searching
  }

  try {
    execSync('python3 --version', { stdio: 'ignore' });
    result.python3 = 'python3';
  } catch {
    // Continue searching
  }

  if (result.python || result.python3) {
    return result;
  }

  // Common Windows locations
  if (process.platform === 'win32') {
    const windowsPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python'),
      path.join(process.env.PROGRAMFILES || '', 'Python'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Python'),
      'C:\\Python*',
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Python'),
    ];

    for (const basePath of windowsPaths) {
      if (!basePath) continue;

      // Check for Python directories
      try {
        if (fs.existsSync(basePath)) {
          const entries = fs.readdirSync(basePath);
          for (const entry of entries) {
            const pythonDir = path.join(basePath, entry);
            if (fs.statSync(pythonDir).isDirectory() && entry.toLowerCase().startsWith('python')) {
              const pythonExe = path.join(pythonDir, 'python.exe');
              if (fs.existsSync(pythonExe)) {
                result.python = pythonExe;
                console.log(`[ToolPathFinder] Found Python at: ${pythonExe}`);
                return result;
              }
            }
          }
        }
      } catch {
        // Continue
      }
    }

    // Check Start Menu Programs (Windows)
    const startMenuPath = path.join(
      process.env.APPDATA || '',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Python*'
    );
    // This is more complex, skip for now
  } else {
    // Unix/Mac locations
    const unixPaths = [
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3',
      path.join(process.env.HOME || '', '.pyenv', 'versions'),
    ];

    for (const pythonPath of unixPaths) {
      if (fs.existsSync(pythonPath)) {
        result.python3 = pythonPath;
        console.log(`[ToolPathFinder] Found Python3 at: ${pythonPath}`);
        return result;
      }
    }
  }

  return result;
}

/**
 * Get all tool paths (cached)
 */
export function getToolPaths(): ToolPaths {
  if (cachedPaths) {
    return cachedPaths;
  }

  const nodePaths = findNodeJS();
  const pythonPaths = findPython();

  cachedPaths = {
    ...nodePaths,
    ...pythonPaths,
  };

  return cachedPaths;
}

/**
 * Resolve a command to use full paths if needed
 * e.g., "npm install" -> "C:\Program Files\nodejs\npm.cmd install"
 */
export function resolveCommand(command: string): string {
  const toolPaths = getToolPaths();
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1).join(' ');

  // Handle npm - ALWAYS use full path if we found one, even if it says 'npm'
  if (cmd === 'npm') {
    // If we have a full path, use it
    if (toolPaths.npm && toolPaths.npm !== 'npm' && fs.existsSync(toolPaths.npm)) {
      return `"${toolPaths.npm}" ${args}`;
    }
    // If npm is just 'npm' but we found node, try to find npm near node
    if (toolPaths.node && toolPaths.node !== 'node' && fs.existsSync(toolPaths.node)) {
      const nodeDir = path.dirname(toolPaths.node);
      const npmPath = path.join(nodeDir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
      if (fs.existsSync(npmPath)) {
        return `"${npmPath}" ${args}`;
      }
    }
    // Last resort: try to find npm in common locations
    const commonNpmPaths = process.platform === 'win32' 
      ? ['A:\\Nodejs\\npm.cmd', 'A:\\nodejs\\npm.cmd', 'C:\\Program Files\\nodejs\\npm.cmd']
      : ['/usr/local/bin/npm', '/usr/bin/npm'];
    for (const npmPath of commonNpmPaths) {
      if (fs.existsSync(npmPath)) {
        return `"${npmPath}" ${args}`;
      }
    }
  }

  // Handle node
  if (cmd === 'node' && toolPaths.node && toolPaths.node !== 'node' && fs.existsSync(toolPaths.node)) {
    return `"${toolPaths.node}" ${args}`;
  }

  // Handle python
  if (cmd === 'python' && toolPaths.python && toolPaths.python !== 'python' && fs.existsSync(toolPaths.python)) {
    return `"${toolPaths.python}" ${args}`;
  }

  // Handle python3
  if (cmd === 'python3' && toolPaths.python3 && toolPaths.python3 !== 'python3' && fs.existsSync(toolPaths.python3)) {
    return `"${toolPaths.python3}" ${args}`;
  }

  // Return original command if no path found
  return command;
}

/**
 * Check if a command error indicates missing tool
 */
export function isMissingToolError(error: string): boolean {
  const lowerError = error.toLowerCase();
  return (
    lowerError.includes('not recognized') ||
    lowerError.includes('not found') ||
    lowerError.includes('command not found') ||
    lowerError.includes('npm') && lowerError.includes('not') ||
    lowerError.includes('node') && lowerError.includes('not') ||
    lowerError.includes('python') && lowerError.includes('not')
  );
}

/**
 * Get an environment object with proper PATH for Node.js/npm commands
 * This is CRITICAL for Windows where child processes spawned by npm (like esbuild's postinstall)
 * need node.exe to be in PATH, but the spawned cmd.exe may not inherit PATH correctly.
 */
export function getNodeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const toolPaths = getToolPaths();
  
  if (process.platform === 'win32') {
    const pathParts: string[] = [];
    
    // Add Node.js directory to PATH (this is the critical fix!)
    if (toolPaths.node && toolPaths.node !== 'node') {
      const nodeDir = path.dirname(toolPaths.node);
      if (nodeDir && nodeDir !== '.') {
        pathParts.push(nodeDir);
        console.log(`[ToolPathFinder] Adding to PATH: ${nodeDir}`);
      }
    }
    
    // Also add npm directory if different
    if (toolPaths.npm && toolPaths.npm !== 'npm') {
      const npmDir = path.dirname(toolPaths.npm);
      if (npmDir && npmDir !== '.' && !pathParts.includes(npmDir)) {
        pathParts.push(npmDir);
      }
    }
    
    // Fallback: check common Node.js locations
    if (pathParts.length === 0) {
      const commonPaths = [
        'C:\\Program Files\\nodejs',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
        'A:\\Nodejs',
        'A:\\nodejs',
      ];
      for (const p of commonPaths) {
        if (p && fs.existsSync(path.join(p, 'node.exe'))) {
          pathParts.push(p);
          console.log(`[ToolPathFinder] Using fallback Node.js path: ${p}`);
          break;
        }
      }
    }
    
    // Prepend Node directories to PATH
    if (pathParts.length > 0) {
      const currentPath = env.PATH || env.Path || '';
      env.PATH = pathParts.join(';') + ';' + currentPath;
      // Also set Path (Windows is case-insensitive but some tools check specific casing)
      env.Path = env.PATH;
    }
  } else {
    // Unix: similar logic
    if (toolPaths.node && toolPaths.node !== 'node') {
      const nodeDir = path.dirname(toolPaths.node);
      if (nodeDir && nodeDir !== '.') {
        env.PATH = nodeDir + ':' + (env.PATH || '');
      }
    }
  }
  
  return env;
}

/**
 * Get an environment object with proper PATH for Python commands
 */
export function getPythonEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const toolPaths = getToolPaths();
  
  if (process.platform === 'win32') {
    if (toolPaths.python && toolPaths.python !== 'python') {
      const pythonDir = path.dirname(toolPaths.python);
      if (pythonDir && pythonDir !== '.') {
        const currentPath = env.PATH || env.Path || '';
        env.PATH = pythonDir + ';' + currentPath;
        env.Path = env.PATH;
      }
    }
  } else {
    if (toolPaths.python3 && toolPaths.python3 !== 'python3') {
      const pythonDir = path.dirname(toolPaths.python3);
      if (pythonDir && pythonDir !== '.') {
        env.PATH = pythonDir + ':' + (env.PATH || '');
      }
    }
  }
  
  return env;
}

/**
 * Get helpful error message with tool paths
 */
export function getToolErrorHelp(command: string, error: string): string {
  const toolPaths = getToolPaths();
  const cmd = command.trim().split(/\s+/)[0];
  
  let help = `\n🔧 TOOL NOT FOUND ERROR\n`;
  help += `Command: ${command}\n`;
  help += `Error: ${error}\n\n`;

  if (cmd === 'npm' || cmd === 'node') {
    if (toolPaths.node) {
      help += `✅ Found Node.js at: ${toolPaths.node}\n`;
      if (toolPaths.npm) {
        help += `✅ Found npm at: ${toolPaths.npm}\n`;
        help += `\n💡 SOLUTION: The system will automatically use these paths.\n`;
      } else {
        help += `⚠️ npm not found near Node.js\n`;
      }
    } else {
      help += `❌ Node.js not found. Please install from https://nodejs.org/\n`;
    }
  } else if (cmd === 'python' || cmd === 'python3') {
    if (toolPaths.python || toolPaths.python3) {
      help += `✅ Found Python at: ${toolPaths.python || toolPaths.python3}\n`;
      help += `\n💡 SOLUTION: The system will automatically use this path.\n`;
    } else {
      help += `❌ Python not found. Please install from https://python.org/\n`;
    }
  }

  return help;
}

