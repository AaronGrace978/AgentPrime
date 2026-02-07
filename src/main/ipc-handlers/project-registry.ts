/**
 * Project Registry IPC Handlers
 * 
 * Exposes project memory to the frontend for:
 * - Viewing past projects
 * - Searching projects
 * - Opening project locations
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getProjectRegistry } from '../agent/project-registry';

export function registerProjectRegistryHandlers(): void {
  console.log('[ProjectRegistry] Registering IPC handlers...');

  /**
   * Get all projects
   */
  ipcMain.handle('project:get-all', async (_event: IpcMainInvokeEvent) => {
    try {
      const registry = getProjectRegistry();
      return {
        success: true,
        projects: registry.getAllProjects()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get recent projects
   */
  ipcMain.handle('project:get-recent', async (_event: IpcMainInvokeEvent, limit?: number) => {
    try {
      const registry = getProjectRegistry();
      return {
        success: true,
        projects: registry.getRecentProjects(limit || 10)
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Search projects
   */
  ipcMain.handle('project:search', async (_event: IpcMainInvokeEvent, query: string) => {
    try {
      const registry = getProjectRegistry();
      return {
        success: true,
        projects: registry.search(query)
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get project by path
   */
  ipcMain.handle('project:get-by-path', async (_event: IpcMainInvokeEvent, projectPath: string) => {
    try {
      const registry = getProjectRegistry();
      const project = registry.findByPath(projectPath);
      return {
        success: true,
        project: project || null
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[ProjectRegistry] ✅ IPC handlers registered');
}

