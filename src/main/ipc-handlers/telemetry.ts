/**
 * AgentPrime - Telemetry IPC Handlers
 * 
 * Handles IPC communication for telemetry functionality
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getTelemetryService, TelemetryEventType, TelemetryStats } from '../core/telemetry-service';

export interface TelemetryHandlerDeps {
  getSettings: () => any;
  updateSettings: (settings: any) => void;
}

/**
 * Register telemetry-related IPC handlers
 */
export function registerTelemetryHandlers(deps: TelemetryHandlerDeps): void {
  const telemetry = getTelemetryService();

  // Get telemetry status
  ipcMain.handle('telemetry:get-status', async (_event: IpcMainInvokeEvent) => {
    try {
      return {
        success: true,
        enabled: telemetry.isEnabled(),
        sessionId: telemetry.getSessionId(),
        installId: telemetry.getInstallId().substring(0, 8) + '...', // Partial for privacy
      };
    } catch (error: any) {
      console.error('[Telemetry IPC] Error getting status:', error);
      return { success: false, error: error.message };
    }
  });

  // Enable/disable telemetry
  ipcMain.handle('telemetry:set-enabled', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    try {
      telemetry.setEnabled(enabled);
      
      // Also update settings
      const settings = deps.getSettings();
      settings.telemetryEnabled = enabled;
      deps.updateSettings(settings);
      
      return { success: true, enabled };
    } catch (error: any) {
      console.error('[Telemetry IPC] Error setting enabled:', error);
      return { success: false, error: error.message };
    }
  });

  // Track a custom event
  ipcMain.handle('telemetry:track', async (_event: IpcMainInvokeEvent, eventType: TelemetryEventType, data?: Record<string, any>) => {
    try {
      telemetry.track(eventType, data || {});
      return { success: true };
    } catch (error: any) {
      console.error('[Telemetry IPC] Error tracking event:', error);
      return { success: false, error: error.message };
    }
  });

  // Get telemetry statistics
  ipcMain.handle('telemetry:get-stats', async (_event: IpcMainInvokeEvent) => {
    try {
      const stats = telemetry.getStats();
      return { success: true, stats };
    } catch (error: any) {
      console.error('[Telemetry IPC] Error getting stats:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear telemetry data
  ipcMain.handle('telemetry:clear-data', async (_event: IpcMainInvokeEvent) => {
    try {
      telemetry.clearData();
      return { success: true };
    } catch (error: any) {
      console.error('[Telemetry IPC] Error clearing data:', error);
      return { success: false, error: error.message };
    }
  });

  // Flush pending events
  ipcMain.handle('telemetry:flush', async (_event: IpcMainInvokeEvent) => {
    try {
      await telemetry.flush();
      return { success: true };
    } catch (error: any) {
      console.error('[Telemetry IPC] Error flushing:', error);
      return { success: false, error: error.message };
    }
  });

  // Legacy track-event handler (update to use telemetry service)
  // This replaces the existing handler in completions.ts
  ipcMain.removeHandler('track-event');
  ipcMain.handle('track-event', async (_event: IpcMainInvokeEvent, eventName: string, data: any) => {
    try {
      // Map generic event names to telemetry event types
      const eventTypeMap: Record<string, TelemetryEventType> = {
        'completion_requested': 'ai_request',
        'completion_accepted': 'completion_accepted',
        'completion_rejected': 'completion_rejected',
        'ghost_completion_accepted': 'completion_accepted',
        'chat_message': 'ai_request',
        'chat_response': 'ai_response',
        'file_saved': 'file_operation',
        'file_opened': 'file_operation',
        'error': 'error_occurred',
      };

      const eventType = eventTypeMap[eventName] || 'feature_used';
      telemetry.track(eventType, { originalEvent: eventName, ...data });
      
      // Also log to console for debugging
      console.log(`[Analytics] ${eventName}:`, data);
      
      return { success: true };
    } catch (error: any) {
      console.error('[Telemetry IPC] Error tracking event:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('📊 Telemetry IPC handlers registered');
}

export default registerTelemetryHandlers;
