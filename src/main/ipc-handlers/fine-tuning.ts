/**
 * Fine-tuning IPC Handlers - Proprietary Models
 */

import { ipcMain } from 'electron';
import { getFineTuningManager } from '../ai-providers/fine-tuning-manager';

const fineTuneManager = getFineTuningManager();

export function registerFineTuningHandlers(): void {
  /**
   * Record training interaction
   */
  ipcMain.handle('finetune:record-interaction', async (event, { interaction }) => {
    try {
      const id = await fineTuneManager.recordInteraction(interaction);
      return { success: true, id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get training data
   */
  ipcMain.handle('finetune:get-training-data', async () => {
    try {
      const data = await fineTuneManager.getTrainingData();
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get quality-filtered data
   */
  ipcMain.handle('finetune:get-quality-data', async () => {
    try {
      const data = await fineTuneManager.getQualityFilteredData();
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Start fine-tuning
   */
  ipcMain.handle('finetune:start', async (event, { config }) => {
    try {
      const job = await fineTuneManager.startFineTuning(config);
      return { success: true, job };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get fine-tuning status
   */
  ipcMain.handle('finetune:get-status', async (event, { jobId }) => {
    try {
      const job = await fineTuneManager.getFineTuningStatus(jobId);
      return { success: true, job };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Deploy model
   */
  ipcMain.handle('finetune:deploy', async (event, { config }) => {
    try {
      const deployment = await fineTuneManager.deployModel(config);
      return { success: true, deployment };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Validate model
   */
  ipcMain.handle('finetune:validate', async (event, { modelId, config }) => {
    try {
      const validation = await fineTuneManager.validateModel(modelId, config);
      return { success: true, validation };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Evaluate model
   */
  ipcMain.handle('finetune:evaluate', async (event, { modelId, config }) => {
    try {
      const evaluation = await fineTuneManager.evaluateModel(modelId, config);
      return { success: true, evaluation };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Compare models
   */
  ipcMain.handle('finetune:compare', async (event, { modelIds }) => {
    try {
      const comparison = await fineTuneManager.compareModels(modelIds);
      return { success: true, comparison };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Estimate cost
   */
  ipcMain.handle('finetune:estimate-cost', async (event, { config }) => {
    try {
      const cost = await fineTuneManager.estimateCost(config);
      return { success: true, cost };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get total cost
   */
  ipcMain.handle('finetune:get-total-cost', async () => {
    try {
      const totalCost = await fineTuneManager.getTotalCost();
      return { success: true, totalCost };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Export data
   */
  ipcMain.handle('finetune:export-data', async (event, { format }) => {
    try {
      const data = await fineTuneManager.exportData(format);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete training data
   */
  ipcMain.handle('finetune:delete-data', async (event, { id }) => {
    try {
      await fineTuneManager.deleteTrainingData(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Fine-tuning handlers registered');
}

