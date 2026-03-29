/**
 * Terminal IPC Handlers — Full interactive PTY terminal
 * 
 * Provides real terminal sessions via node-pty + xterm.js.
 * Supports multiple terminal tabs, resize, and AI error detection.
 */

import { IpcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as os from 'os';

let pty: any;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('[Terminal] node-pty not available, terminal features disabled');
}

interface TerminalSession {
  id: string;
  process: any;
  cwd: string;
  title: string;
  history: string;
}

const sessions = new Map<string, TerminalSession>();
let sessionCounter = 0;
const MAX_HISTORY_CHARS = 200_000;

const ERROR_PATTERNS = [
  { pattern: /Error:\s+(.+)/i, type: 'generic' },
  { pattern: /ENOENT:\s+no such file or directory/i, type: 'file_not_found' },
  { pattern: /SyntaxError:\s+(.+)/i, type: 'syntax' },
  { pattern: /TypeError:\s+(.+)/i, type: 'type' },
  { pattern: /ReferenceError:\s+(.+)/i, type: 'reference' },
  { pattern: /ModuleNotFoundError:\s+(.+)/i, type: 'module' },
  { pattern: /command not found/i, type: 'command_not_found' },
  { pattern: /Permission denied/i, type: 'permission' },
  { pattern: /npm ERR!/i, type: 'npm' },
  { pattern: /FATAL ERROR/i, type: 'fatal' },
  { pattern: /Traceback \(most recent call last\)/i, type: 'python_traceback' },
  { pattern: /Cannot find module/i, type: 'module' },
  { pattern: /EADDRINUSE/i, type: 'port_in_use' },
];

function detectErrors(data: string): Array<{ type: string; message: string; line: string }> {
  const errors: Array<{ type: string; message: string; line: string }> = [];
  const lines = data.split('\n');
  for (const line of lines) {
    for (const { pattern, type } of ERROR_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        errors.push({ type, message: match[1] || match[0], line: line.trim() });
        break;
      }
    }
  }
  return errors;
}

interface TerminalDeps {
  ipcMain: IpcMain;
  mainWindow: () => BrowserWindow | null;
  getWorkspacePath: () => string | null;
}

export function registerTerminalHandlers(deps: TerminalDeps): void {
  const { ipcMain, mainWindow, getWorkspacePath } = deps;

  if (!pty) {
    console.warn('[Terminal] PTY not available — terminal handlers not registered');
    return;
  }

  ipcMain.handle('terminal:create', async (_event, options?: { cwd?: string; shell?: string }) => {
    try {
      const id = `term_${++sessionCounter}`;
      const cwd = options?.cwd || getWorkspacePath() || os.homedir();
      
      const shell = options?.shell || (
        process.platform === 'win32' ? 'powershell.exe' :
        process.env.SHELL || '/bin/bash'
      );

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      const session: TerminalSession = {
        id,
        process: ptyProcess,
        cwd,
        title: path.basename(cwd),
        history: '',
      };

      sessions.set(id, session);

      const window = mainWindow();
      ptyProcess.onData((data: string) => {
        session.history += data;
        if (session.history.length > MAX_HISTORY_CHARS) {
          session.history = session.history.slice(-MAX_HISTORY_CHARS);
        }
        window?.webContents.send('terminal:data', { id, data });

        const errors = detectErrors(data);
        if (errors.length > 0) {
          window?.webContents.send('terminal:error-detected', { id, errors });
        }
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        window?.webContents.send('terminal:exit', { id, exitCode });
        sessions.delete(id);
      });

      console.log(`[Terminal] Created session ${id} (${shell}) in ${cwd}`);
      return { success: true, id, cwd, shell };
    } catch (error: any) {
      console.error('[Terminal] Failed to create session:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) => {
    const session = sessions.get(id);
    if (session) {
      session.process.write(data);
    }
  });

  ipcMain.on('terminal:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    const session = sessions.get(id);
    if (session) {
      try {
        session.process.resize(cols, rows);
      } catch (e) {
        // Ignore resize errors
      }
    }
  });

  ipcMain.handle('terminal:kill', async (_event, id: string) => {
    const session = sessions.get(id);
    if (session) {
      session.process.kill();
      sessions.delete(id);
      return { success: true };
    }
    return { success: false, error: 'Session not found' };
  });

  ipcMain.handle('terminal:list', async () => {
    return Array.from(sessions.values()).map(s => ({
      id: s.id,
      cwd: s.cwd,
      title: s.title,
    }));
  });

  ipcMain.handle('terminal:get-history', async (_event, id?: string, maxChars: number = 12000) => {
    const safeMaxChars = Number.isFinite(maxChars) ? Math.max(1000, Math.min(100000, maxChars)) : 12000;

    const targetSessions = id ? [sessions.get(id)].filter(Boolean) as TerminalSession[] : Array.from(sessions.values());
    const entries = targetSessions.map((session) => {
      const history = session.history || '';
      const clipped = history.length > safeMaxChars ? history.slice(-safeMaxChars) : history;
      return {
        id: session.id,
        title: session.title,
        cwd: session.cwd,
        history: clipped,
      };
    });

    return {
      success: true,
      entries,
      combined: entries
        .map((entry) => `# ${entry.title} (${entry.id})\n${entry.history}`.trim())
        .join('\n\n')
        .trim(),
    };
  });

  console.log('[Terminal] PTY terminal handlers registered');
}

export function cleanupTerminals(): void {
  for (const [id, session] of sessions) {
    try {
      session.process.kill();
    } catch (e) {
      // ignore
    }
    sessions.delete(id);
  }
}
