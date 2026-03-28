/**
 * Command Execution IPC Handlers
 * Handles natural language command execution via IPC
 * 
 * Security: All commands are validated and rate-limited
 */

import { IpcMain } from 'electron';
import { CommandExecutor, CommandExecutionContext } from '../core/command-executor';
import { validateCommand, ipcRateLimiter } from '../security/ipcValidation';

interface CommandHandlersDeps {
  ipcMain: IpcMain;
  getWorkspacePath: () => string | null;
  getCurrentFile: () => string | null;
  getCurrentFolder: () => string | null;
}

let commandExecutor: CommandExecutor | null = null;

function getExecutor(): CommandExecutor {
  if (!commandExecutor) {
    commandExecutor = new CommandExecutor();
  }
  return commandExecutor;
}

/**
 * Register command-related IPC handlers
 */
export function register(deps: CommandHandlersDeps): void {
  const { ipcMain, getWorkspacePath, getCurrentFile, getCurrentFolder } = deps;

  // Execute natural language command
  ipcMain.handle('command:execute', async (event, command: string) => {
    // === SECURITY: Rate limiting ===
    const rateCheck = ipcRateLimiter.check('command:execute', 20); // 20 commands per minute max
    if (!rateCheck.allowed) {
      console.warn('[Command Execute] Rate limited');
      return {
        success: false,
        error: 'Rate limit exceeded. Please slow down command execution.'
      };
    }
    
    // === SECURITY: Validate command ===
    const commandValidation = validateCommand(command);
    if (!commandValidation.valid) {
      console.error('[Command Execute] Validation failed:', commandValidation.errors);
      return {
        success: false,
        error: `Invalid command: ${commandValidation.errors.join('; ')}`
      };
    }
    
    try {
      const executor = getExecutor();
      const context: CommandExecutionContext = {
        workspacePath: getWorkspacePath() || undefined,
        currentFile: getCurrentFile() || undefined,
        currentFolder: getCurrentFolder() || undefined
      };

      const result = await executor.execute(commandValidation.sanitized || command, context);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error executing command'
      };
    }
  });

  // Check if message is a file operation command
  ipcMain.handle('command:is-file-operation', async (event, message: string) => {
    try {
      const executor = getExecutor();
      return executor.isFileOperationCommand(message);
    } catch {
      return false;
    }
  });

  // Execute confirmed operation plan
  ipcMain.handle('command:execute-plan', async (event, plan: any) => {
    try {
      const executor = getExecutor();
      const result = await executor.executePlan(plan);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error executing plan'
      };
    }
  });

  // Get undo history
  ipcMain.handle('command:get-undo-history', async () => {
    try {
      const executor = getExecutor();
      return executor.getUndoHistory();
    } catch {
      return [];
    }
  });

  // Undo last operation
  ipcMain.handle('command:undo', async () => {
    try {
      const executor = getExecutor();
      const result = await executor.undoLastOperation();
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error undoing operation'
      };
    }
  });

}

