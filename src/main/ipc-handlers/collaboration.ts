/**
 * Collaboration IPC Handlers - Real-time Editing
 */

import { ipcMain, BrowserWindow } from 'electron';
import { CollaborationEngine } from '../core/collaboration-engine';
import { getPerformanceTracker } from '../core/performance-tracker';

/**
 * Broadcast event to all renderer windows
 */
function broadcastToRenderers(channel: string, data: any): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

const collabEngine = new CollaborationEngine({
  enableRealTimeSync: true,
  conflictResolutionStrategy: 'manual'
});

const perfTracker = getPerformanceTracker();

export function registerCollaborationHandlers(): void {
  /**
   * Create collaboration session
   */
  ipcMain.handle('collab:create-session', async (event, { name, workspace, ownerId, settings }) => {
    const start = Date.now();
    try {
      const session = await collabEngine.createSession(name, workspace, ownerId, settings);
      perfTracker.recordLatency('collab-create-session', Date.now() - start);
      return { success: true, session };
    } catch (error: any) {
      perfTracker.recordLatency('collab-create-session', Date.now() - start);
      return { success: false, error: error.message };
    }
  });

  /**
   * Join collaboration session
   */
  ipcMain.handle('collab:join-session', async (event, { sessionId, userId, username }) => {
    const start = Date.now();
    try {
      await collabEngine.joinSession(sessionId, userId, username);
      const session = await collabEngine.getSession(sessionId);
      perfTracker.recordLatency('collab-join-session', Date.now() - start);
      return { success: true, session };
    } catch (error: any) {
      perfTracker.recordLatency('collab-join-session', Date.now() - start);
      return { success: false, error: error.message };
    }
  });

  /**
   * Leave collaboration session
   */
  ipcMain.handle('collab:leave-session', async (event, { sessionId, userId }) => {
    const start = Date.now();
    try {
      await collabEngine.leaveSession(sessionId, userId);
      perfTracker.recordLatency('collab-leave-session', Date.now() - start);
      return { success: true };
    } catch (error: any) {
      perfTracker.recordLatency('collab-leave-session', Date.now() - start);
      return { success: false, error: error.message };
    }
  });

  /**
   * Record document change
   */
  ipcMain.handle('collab:record-change', async (event, { sessionId, userId, change }) => {
    const start = Date.now();
    try {
      const documentChange = await collabEngine.recordChange(sessionId, userId, change);
      const latency = Date.now() - start;
      perfTracker.recordLatency('collab-change', latency);
      
      // Alert if latency exceeds threshold
      if (latency > 50) {
        console.warn(`[Collab] High latency detected: ${latency}ms`);
      }
      
      return { success: true, change: documentChange };
    } catch (error: any) {
      perfTracker.recordLatency('collab-change', Date.now() - start);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get pending changes
   */
  ipcMain.handle('collab:get-pending-changes', async (event, { sessionId }) => {
    const start = Date.now();
    try {
      const changes = collabEngine.getPendingChanges(sessionId);
      perfTracker.recordLatency('collab-get-changes', Date.now() - start);
      return { success: true, changes };
    } catch (error: any) {
      perfTracker.recordLatency('collab-get-changes', Date.now() - start);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update user presence
   */
  ipcMain.handle('collab:update-presence', async (event, { sessionId, userId, presence }) => {
    const start = Date.now();
    try {
      await collabEngine.updatePresence(sessionId, userId, presence);
      const latency = Date.now() - start;
      perfTracker.recordLatency('collab-presence', latency);
      
      // Presence updates should be <10ms
      if (latency > 10) {
        console.warn(`[Collab] Slow presence update: ${latency}ms`);
      }
      
      return { success: true };
    } catch (error: any) {
      perfTracker.recordLatency('collab-presence', Date.now() - start);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get session info
   */
  ipcMain.handle('collab:get-session', async (event, { sessionId }) => {
    try {
      const session = await collabEngine.getSession(sessionId);
      return { success: true, session };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get conflicts
   */
  ipcMain.handle('collab:get-conflicts', async (event, { sessionId }) => {
    try {
      const conflicts = collabEngine.getConflicts(sessionId);
      return { success: true, conflicts };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Resolve conflict
   */
  ipcMain.handle('collab:resolve-conflict', async (event, { conflictId, acceptedChangeId, userId, mergedContent }) => {
    try {
      await collabEngine.resolveConflict(conflictId, acceptedChangeId, userId, mergedContent);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get performance metrics
   */
  ipcMain.handle('collab:get-metrics', async () => {
    try {
      const metrics = perfTracker.getAggregateMetrics();
      const collabMetrics = {
        'collab-change': perfTracker.getMetrics('collab-change'),
        'collab-presence': perfTracker.getMetrics('collab-presence'),
        'collab-create-session': perfTracker.getMetrics('collab-create-session'),
        'collab-join-session': perfTracker.getMetrics('collab-join-session')
      };
      
      return { success: true, metrics: collabMetrics, aggregate: metrics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Forward collaboration events to renderer
  collabEngine.on('session_created', (sessionId: string, userId: string, data: any) => {
    broadcastToRenderers('collab:event', {
      type: 'session_created',
      sessionId,
      userId,
      data
    });
  });

  collabEngine.on('user_joined', (sessionId: string, userId: string, data: any) => {
    broadcastToRenderers('collab:event', {
      type: 'user_joined',
      sessionId,
      userId,
      data
    });
  });

  collabEngine.on('user_left', (sessionId: string, userId: string, data: any) => {
    broadcastToRenderers('collab:event', {
      type: 'user_left',
      sessionId,
      userId,
      data
    });
  });

  collabEngine.on('change_made', (sessionId: string, userId: string, data: any) => {
    broadcastToRenderers('collab:event', {
      type: 'change_made',
      sessionId,
      userId,
      data
    });
  });

  collabEngine.on('presence_updated', (sessionId: string, userId: string, data: any) => {
    broadcastToRenderers('collab:event', {
      type: 'presence_updated',
      sessionId,
      userId,
      data
    });
  });

  collabEngine.on('conflict_detected', (sessionId: string, userId: string, data: any) => {
    broadcastToRenderers('collab:event', {
      type: 'conflict_detected',
      sessionId,
      userId,
      data
    });
  });

  console.log('[IPC] Collaboration handlers registered');
}
