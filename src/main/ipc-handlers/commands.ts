/**
 * Command Execution IPC Handlers
 * Handles natural language command execution via IPC
 * 
 * Security: All commands are validated and rate-limited
 */

import { IpcMain } from 'electron';
import { CommandExecutor, CommandExecutionContext } from '../core/command-executor';
import { systemExecutor, SystemAction } from '../system-executor';
import aiRouter from '../ai-providers';
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

  // Voice command processing - converts speech to system actions
  ipcMain.handle('voice:process-command', async (event, speechText: string) => {
    try {
      console.log('🎤 Processing voice command:', speechText);

      // Use AI to convert speech to structured action
      const messages = [
        {
          role: 'system' as const,
          content: `You are a voice command interpreter. Convert user speech into structured JSON actions.

Available actions:
- open_app: { action: "open_app", app: "chrome|firefox|safari|vscode|calculator|terminal|spotify|slack|discord" }
- open_url: { action: "open_url", url: "https://example.com" }
- run_command: { action: "run_command", command: "system command" }
- type_text: { action: "type_text", text: "text to type" }
- open_file: { action: "open_file", path: "/path/to/file" }
- get_weather: { action: "get_weather", target: "city name" }

Examples:
"open chrome" → { action: "open_app", app: "chrome" }
"google something" → { action: "open_url", url: "https://google.com/search?q=something" }
"open terminal" → { action: "open_app", app: "terminal" }

Always respond with valid JSON only. No explanations.`
        },
        {
          role: 'user' as const,
          content: speechText
        }
      ];

      const aiResponse = await aiRouter.chat(messages, {
        model: 'qwen3-coder:480b-cloud',
        temperature: 0.1 // Low temperature for consistent JSON output
      });

      if (!aiResponse.success || !aiResponse.content) {
        throw new Error('AI failed to process voice command');
      }

      // Parse the JSON response
      let action: SystemAction;
      try {
        // Extract JSON from the response (AI might add extra text)
        const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in AI response');
        }
        action = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Failed to parse AI action JSON:', aiResponse.content);
        return {
          success: false,
          error: 'Could not understand voice command',
          originalSpeech: speechText
        };
      }

      console.log('🎯 Executing system action:', action);

      // Execute the system action
      const result = await systemExecutor.execute(action);

      return {
        success: result.success,
        message: result.message,
        action,
        originalSpeech: speechText
      };

    } catch (error: any) {
      console.error('Voice command processing error:', error);
      return {
        success: false,
        error: error.message || 'Voice command processing failed',
        originalSpeech: speechText
      };
    }
  });
}

