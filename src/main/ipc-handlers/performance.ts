/**
 * Performance IPC Handlers - P95 Latency Monitoring
 */

import { ipcMain } from 'electron';
import { getPerformanceTracker } from '../core/performance-tracker';

const perfTracker = getPerformanceTracker();

// Set up performance alerts
perfTracker.onAlert((alert, value) => {
  console.warn(`[Performance Alert] ${alert.operation} P${alert.percentile} exceeded threshold: ${value.toFixed(2)}ms > ${alert.threshold}ms`);
});

export function registerPerformanceHandlers(): void {
  /**
   * Record latency measurement
   */
  ipcMain.handle('perf:record-latency', async (event, { operation, latency }) => {
    try {
      perfTracker.recordLatency(operation, latency);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get metrics for operation
   */
  ipcMain.handle('perf:get-metrics', async (event, { operation }) => {
    try {
      const metrics = perfTracker.getMetrics(operation);
      return { success: true, metrics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get aggregate metrics
   */
  ipcMain.handle('perf:get-aggregate', async () => {
    try {
      const aggregate = perfTracker.getAggregateMetrics();
      return { success: true, aggregate };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get percentile
   */
  ipcMain.handle('perf:get-percentile', async (event, { operation, percentile }) => {
    try {
      const value = perfTracker.getPercentile(operation, percentile);
      return { success: true, value };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Set threshold
   */
  ipcMain.handle('perf:set-threshold', async (event, { operation, threshold, percentile }) => {
    try {
      perfTracker.setThreshold(operation, threshold, percentile);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Generate report
   */
  ipcMain.handle('perf:generate-report', async (event, { operation }) => {
    try {
      const report = perfTracker.generateReport(operation);
      return { success: true, report };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Export metrics
   */
  ipcMain.handle('perf:export-metrics', async () => {
    try {
      const json = perfTracker.exportMetrics();
      return { success: true, data: json };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Clear metrics
   */
  ipcMain.handle('perf:clear', async (event, { operation }) => {
    try {
      if (operation) {
        perfTracker.clear(operation);
      } else {
        perfTracker.clearAll();
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Performance handlers registered');
}

