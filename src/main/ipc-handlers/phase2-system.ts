/**
 * AgentPrime - Phase 2 System IPC Handlers
 * IPC handlers for all Phase 2 enterprise features
 */

import { ipcMain } from 'electron';
import type { CloudSyncEngine } from '../core/cloud-sync';
import type { DistributedCoordinator } from '../core/distributed-coordinator';
import type { ScalingManager } from '../core/scaling-manager';
import type { MemoryOptimizer } from '../core/memory-optimization';

export function registerPhase2SystemHandlers(
  getCloudSync: () => CloudSyncEngine,
  getDistributedCoordinator: () => DistributedCoordinator,
  getScalingManager: () => ScalingManager,
  getMemoryOptimizer: () => MemoryOptimizer
): void {
  const cloudSync = getCloudSync();
  const distributedCoordinator = getDistributedCoordinator();
  const scalingManager = getScalingManager();
  const memoryOptimizer = getMemoryOptimizer();

  // Cloud Sync
  ipcMain.handle('cloud-sync:start-sync', async (event, targetDeviceId?: string) => {
    try {
      const session = await cloudSync.startSync(targetDeviceId);
      return { success: true, session };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud-sync:queue-item', async (event, item: any) => {
    try {
      const syncItem = await cloudSync.queueItem(item);
      return { success: true, item: syncItem };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud-sync:resolve-conflict', async (event, conflictId: string, resolution: any) => {
    try {
      await cloudSync.resolveConflict(conflictId, resolution);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud-sync:get-status', () => {
    try {
      const status = cloudSync.getSyncStatus();
      return { success: true, status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Distributed Coordinator
  ipcMain.handle('distributed:submit-task', async (event, task: any) => {
    try {
      const taskId = await distributedCoordinator.submitTask(task);
      return { success: true, taskId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('distributed:get-task-status', (event, taskId: string) => {
    try {
      const task = distributedCoordinator.getTaskStatus(taskId);
      return { success: true, task };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('distributed:cancel-task', async (event, taskId: string) => {
    try {
      const cancelled = await distributedCoordinator.cancelTask(taskId);
      return { success: true, cancelled };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('distributed:get-cluster-status', () => {
    try {
      const status = distributedCoordinator.getClusterStatus();
      return { success: true, status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('distributed:is-leader', () => {
    try {
      const isLeader = distributedCoordinator.isLeader();
      return { success: true, isLeader };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('distributed:trigger-election', async () => {
    try {
      await distributedCoordinator.triggerElection();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Scaling Manager
  ipcMain.handle('scaling:get-metrics', () => {
    try {
      const metrics = scalingManager.getScalingMetrics();
      return { success: true, metrics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('scaling:get-current-metrics', () => {
    try {
      const metrics = scalingManager.getCurrentMetrics();
      return { success: true, metrics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('scaling:create-instance', async (event, type: string, config: any) => {
    try {
      const instance = await scalingManager.createInstance(type as any, config);
      return { success: true, instance };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('scaling:terminate-instance', async (event, instanceId: string) => {
    try {
      const terminated = await scalingManager.terminateInstance(instanceId);
      return { success: true, terminated };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('scaling:force-scaling', async (event, action: string, instances?: number) => {
    try {
      const decision = await scalingManager.forceScaling(action as any, instances);
      return { success: true, decision };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('scaling:predict-load', async (event, timeHorizon?: number) => {
    try {
      const prediction = await scalingManager.predictLoad(timeHorizon);
      return { success: true, prediction };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Memory Optimization
  ipcMain.handle('memory:get', async (event, key: string) => {
    try {
      const value = await memoryOptimizer.get(key);
      return { success: true, value };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory:set', async (event, key: string, value: any, options?: any) => {
    try {
      const success = await memoryOptimizer.set(key, value, options);
      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory:delete', (event, key: string) => {
    try {
      const success = memoryOptimizer.delete(key);
      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory:clear', () => {
    try {
      memoryOptimizer.clear();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory:get-analytics', () => {
    try {
      const analytics = memoryOptimizer.getAnalytics();
      return { success: true, analytics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory:get-metrics', () => {
    try {
      const metrics = memoryOptimizer.getMemoryMetrics();
      return { success: true, metrics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory:predict-accesses', async (event, currentSequence: string[]) => {
    try {
      const predictions = await memoryOptimizer.predictAccesses(currentSequence);
      return { success: true, predictions };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('memory:preload-items', async (event, keys: string[]) => {
    try {
      await memoryOptimizer.preloadItems(keys);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Event forwarding
  cloudSync.on('sync_event', (event) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('cloud-sync:event', event);
    });
  });

  distributedCoordinator.on('distributed_event', (event) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('distributed:event', event);
    });
  });

  scalingManager.on('scaling_event', (event) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('scaling:event', event);
    });
  });

  memoryOptimizer.on('memory_event', (event) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('memory:event', event);
    });
  });

  console.log('🚀 Phase 2 system IPC handlers registered');
  console.log('☁️  Cloud sync ready');
  console.log('🌐 Distributed coordinator ready');
  console.log('📈 Scaling manager ready');
  console.log('🧠 Memory optimizer ready');
}

export function register(
  getCloudSync: () => CloudSyncEngine,
  getDistributedCoordinator: () => DistributedCoordinator,
  getScalingManager: () => ScalingManager,
  getMemoryOptimizer: () => MemoryOptimizer
): void {
  registerPhase2SystemHandlers(getCloudSync, getDistributedCoordinator, getScalingManager, getMemoryOptimizer);
}
