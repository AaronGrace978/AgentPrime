/**
 * Smart Controller IPC Handlers
 * Full PC automation with AI vision, mouse/keyboard control, and secure credentials
 * 
 * PERFORMANCE: Uses lazy loading for all Smart Controller subsystems
 */

import { IpcMain, WebContents, BrowserWindow } from 'electron';
import { 
  getSmartController,
  getScreenCaptureService,
  getAutomationControllerInstance,
  getCredentialVaultInstance
} from '../smart-controller';

// Type imports only
import type { SmartTask, SmartStep, ScreenCapture } from '../smart-controller';

interface SmartControllerDeps {
  ipcMain: IpcMain;
  getSettings: () => any;
  getMainWindow: () => BrowserWindow | null;
}

export function register(deps: SmartControllerDeps): void {
  const { ipcMain, getSettings, getMainWindow } = deps;
  
  // Lazy getters for subsystems - only loaded when first IPC call is made
  const getController = () => getSmartController();
  const getScreen = () => getScreenCaptureService();
  const getAutomation = () => getAutomationControllerInstance();
  const getVault = () => getCredentialVaultInstance();

  // ═══════════════════════════════════════════════════════════════
  // SCREEN CAPTURE
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('smart:capture-screen', async (event, quality?: 'high' | 'medium' | 'low') => {
    try {
      const capture = await getScreen().captureScreen(quality || 'medium');
      return {
        success: true,
        capture: {
          base64: capture.base64,
          width: capture.width,
          height: capture.height,
          timestamp: capture.timestamp
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('smart:capture-window', async (event, quality?: 'high' | 'medium' | 'low') => {
    try {
      const capture = await getScreen().captureActiveWindow(quality || 'medium');
      return {
        success: true,
        capture: {
          base64: capture.base64,
          width: capture.width,
          height: capture.height,
          timestamp: capture.timestamp
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('smart:capture-region', async (event, region: { x: number; y: number; width: number; height: number }, quality?: 'high' | 'medium' | 'low') => {
    try {
      const capture = await getScreen().captureRegion(region, quality || 'medium');
      return {
        success: true,
        capture: {
          base64: capture.base64,
          width: capture.width,
          height: capture.height,
          timestamp: capture.timestamp,
          region
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('smart:get-window-info', async () => {
    try {
      const info = await getScreen().getActiveWindowInfo();
      return { success: true, info };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // MOUSE CONTROL
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('smart:mouse-move', async (event, x: number, y: number) => {
    return await getAutomation().moveMouse(x, y);
  });

  ipcMain.handle('smart:mouse-click', async (event, options?: { x?: number; y?: number; button?: 'left' | 'right' | 'middle'; double?: boolean }) => {
    return await getAutomation().click(options);
  });

  ipcMain.handle('smart:mouse-position', async () => {
    const position = await getAutomation().getMousePosition();
    return { success: true, position };
  });

  ipcMain.handle('smart:mouse-drag', async (event, fromX: number, fromY: number, toX: number, toY: number, duration?: number) => {
    return await getAutomation().drag(fromX, fromY, toX, toY, duration || 500);
  });

  ipcMain.handle('smart:scroll', async (event, direction: 'up' | 'down' | 'left' | 'right', amount?: number) => {
    return await getAutomation().scroll({ direction, amount: amount || 3 });
  });

  // ═══════════════════════════════════════════════════════════════
  // KEYBOARD CONTROL
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('smart:type-text', async (event, text: string, delay?: number) => {
    return await getAutomation().typeText(text, { delay });
  });

  ipcMain.handle('smart:press-key', async (event, key: string, modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]) => {
    return await getAutomation().pressKey(key, modifiers);
  });

  ipcMain.handle('smart:hotkey', async (event, ...keys: string[]) => {
    return await getAutomation().hotkey(...keys);
  });

  // ═══════════════════════════════════════════════════════════════
  // WINDOW CONTROL
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('smart:focus-window', async (event, title: string) => {
    return await getAutomation().focusWindow(title);
  });

  ipcMain.handle('smart:get-windows', async () => {
    const windows = await getAutomation().getOpenWindows();
    return { success: true, windows };
  });

  // ═══════════════════════════════════════════════════════════════
  // CREDENTIAL VAULT
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('vault:create', async (event, masterPassword: string) => {
    return await getVault().createVault(masterPassword);
  });

  ipcMain.handle('vault:unlock', async (event, masterPassword: string) => {
    return await getVault().unlock(masterPassword);
  });

  ipcMain.handle('vault:lock', async () => {
    getVault().lock();
    return { success: true, message: 'Vault locked' };
  });

  ipcMain.handle('vault:status', async () => {
    return {
      exists: getVault().vaultExists(),
      unlocked: getVault().isVaultUnlocked(),
      config: getVault().isVaultUnlocked() ? getVault().getConfig() : null
    };
  });

  ipcMain.handle('vault:save-credential', async (event, credential: any) => {
    return await getVault().saveCredential(credential);
  });

  ipcMain.handle('vault:get-credential', async (event, id: string, purpose?: string) => {
    return await getVault().getCredential(id, purpose);
  });

  ipcMain.handle('vault:delete-credential', async (event, id: string) => {
    return await getVault().deleteCredential(id);
  });

  ipcMain.handle('vault:list-credentials', async () => {
    return {
      success: true,
      credentials: getVault().listCredentials()
    };
  });

  ipcMain.handle('vault:search-credentials', async (event, query: string) => {
    return {
      success: true,
      credentials: getVault().searchCredentials(query)
    };
  });

  ipcMain.handle('vault:auto-fill', async (event, url: string) => {
    const result = await getVault().getCredentialForAutoFill(url);
    if (!result.success) {
      return result;
    }
    
    // Perform auto-fill
    if (result.username) {
      await getAutomation().typeText(result.username);
      await getAutomation().pressKey('Tab');
    }
    
    await new Promise(r => setTimeout(r, 200));
    
    if (result.password) {
      await getAutomation().typeText(result.password);
    }
    
    return { success: true, message: result.message };
  });

  ipcMain.handle('vault:export', async (event, exportPassword: string) => {
    return await getVault().exportVault(exportPassword);
  });

  ipcMain.handle('vault:import', async (event, data: string, importPassword: string, merge?: boolean) => {
    return await getVault().importVault(data, importPassword, merge !== false);
  });

  ipcMain.handle('vault:change-password', async (event, oldPassword: string, newPassword: string) => {
    return await getVault().changeMasterPassword(oldPassword, newPassword);
  });

  ipcMain.handle('vault:get-audit-log', async (event, limit?: number) => {
    return {
      success: true,
      log: getVault().getAuditLog(limit || 100)
    };
  });

  // ═══════════════════════════════════════════════════════════════
  // TASK AUTOMATION
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('smart:create-task', async (event, name: string, description: string, steps: any[]) => {
    try {
      const task = getController().createTask(name, description, steps);
      return { success: true, task };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('smart:execute-task', async (event, taskId: string) => {
    const webContents = event.sender;
    
    // Set up event forwarding to renderer
    getController().setProgressHandler((task, step) => {
      webContents.send('smart:task-progress', { task, step });
    });
    
    getController().setScreenCaptureHandler((capture) => {
      webContents.send('smart:screen-update', {
        width: capture.width,
        height: capture.height,
        timestamp: capture.timestamp,
        // Send base64 for small captures, or just metadata for large ones
        base64: capture.base64.length < 500000 ? capture.base64 : undefined
      });
    });
    
    getController().setConfirmationHandler(async (confirmation) => {
      return new Promise((resolve) => {
        // Send confirmation request to renderer
        webContents.send('smart:confirmation-needed', confirmation);
        
        // Wait for response (with timeout)
        const handler = (ev: any, approved: boolean) => {
          if (ev.sender === webContents) {
            ipcMain.removeHandler('smart:confirmation-response');
            resolve(approved);
          }
        };
        
        // Set up one-time response handler
        ipcMain.handleOnce('smart:confirmation-response', (ev, approved: boolean) => {
          resolve(approved);
          return { received: true };
        });
        
        // Timeout after 60 seconds
        setTimeout(() => {
          resolve(false);
        }, 60000);
      });
    });
    
    return await getController().executeTask(taskId);
  });

  ipcMain.handle('smart:pause-task', async () => {
    getController().pauseTask();
    return { success: true, message: 'Task paused' };
  });

  ipcMain.handle('smart:resume-task', async () => {
    getController().resumeTask();
    return { success: true, message: 'Task resumed' };
  });

  ipcMain.handle('smart:cancel-task', async () => {
    getController().cancelTask();
    return { success: true, message: 'Task cancelled' };
  });

  ipcMain.handle('smart:get-task', async (event, taskId: string) => {
    const task = getController().getTask(taskId);
    return { success: !!task, task };
  });

  ipcMain.handle('smart:get-all-tasks', async () => {
    return { success: true, tasks: getController().getAllTasks() };
  });

  ipcMain.handle('smart:get-current-task', async () => {
    return { success: true, task: getController().getCurrentTask() };
  });

  ipcMain.handle('smart:delete-task', async (event, taskId: string) => {
    const deleted = getController().deleteTask(taskId);
    return { success: deleted, message: deleted ? 'Task deleted' : 'Cannot delete (task running or not found)' };
  });

  ipcMain.handle('smart:create-task-from-nl', async (event, instruction: string) => {
    const task = await getController().createTaskFromNaturalLanguage(instruction);
    return { success: !!task, task };
  });

  // ═══════════════════════════════════════════════════════════════
  // CONTROLLER STATUS & SAFETY
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('smart:get-status', async () => {
    return { success: true, status: getController().getStatus() };
  });

  ipcMain.handle('smart:get-config', async () => {
    return { success: true, config: getController().getConfig() };
  });

  ipcMain.handle('smart:update-config', async (event, config: any) => {
    getController().updateConfig(config);
    return { success: true, config: getController().getConfig() };
  });

  ipcMain.handle('smart:emergency-stop', async () => {
    getController().emergencyStop();
    return { success: true, message: '🛑 EMERGENCY STOP - All automation halted' };
  });

  ipcMain.handle('smart:resume', async () => {
    getController().resume();
    return { success: true, message: '▶️ Automation resumed' };
  });

  ipcMain.handle('smart:get-action-log', async () => {
    return { success: true, log: getAutomation().getActionLog() };
  });

  console.log('✅ Smart Controller IPC handlers registered');
}
