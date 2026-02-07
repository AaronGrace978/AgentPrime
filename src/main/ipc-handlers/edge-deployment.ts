/**
 * AgentPrime - Edge Deployment IPC Handlers
 * IPC handlers for local AI model deployment and management
 */

import { ipcMain } from 'electron';
import type { EdgeDeploymentManager } from '../core/edge-deployment';

export function registerEdgeDeploymentHandlers(
  getEdgeDeploymentManager: () => EdgeDeploymentManager
): void {
  const manager = getEdgeDeploymentManager();

  // Model management
  ipcMain.handle('edge-deployment:download-model', async (event, modelId: string, source?: string) => {
    try {
      const download = await manager.downloadModel(modelId, source);
      return { success: true, download };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('edge-deployment:deploy-model', async (event, modelId: string, config?: any) => {
    try {
      const deployment = await manager.deployModel(modelId, config);
      return { success: true, deployment };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('edge-deployment:stop-deployment', async (event, deploymentId: string) => {
    try {
      await manager.stopDeployment(deploymentId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('edge-deployment:run-inference', async (event, modelId: string, request: any) => {
    try {
      const response = await manager.runInference(modelId, request);
      return { success: true, response };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('edge-deployment:optimize-model', async (event, modelId: string, optimizationType: string, config?: any) => {
    try {
      const optimization = await manager.optimizeModel(modelId, optimizationType as any, config);
      return { success: true, optimization };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('edge-deployment:get-deployment-status', () => {
    try {
      const status = manager.getDeploymentStatus();
      return { success: true, status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Event forwarding
  manager.on('edge_deployment_event', (event) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('edge-deployment:event', event);
    });
  });

  console.log('🧠 Edge deployment IPC handlers registered');
}

export function register(getEdgeDeploymentManager: () => EdgeDeploymentManager): void {
  registerEdgeDeploymentHandlers(getEdgeDeploymentManager);
}
