/**
 * AgentPrime - Refactoring IPC Handlers
 * Handles refactoring requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getRefactoringEngine } from '../core/refactoring-engine';
import { getRefactoringSafety } from '../core/refactoring-safety';
import type { RefactoringRequest, RefactoringResult } from '../core/refactoring-engine';

export function registerRefactoringHandlers(): void {
  // Main refactoring handler
  ipcMain.handle('refactor-code', async (
    event: IpcMainInvokeEvent,
    request: RefactoringRequest
  ): Promise<RefactoringResult> => {
    try {
      const engine = getRefactoringEngine();
      const result = await engine.refactor(request);

      return result;
    } catch (error: any) {
      console.error('[Refactoring] Refactoring failed:', error);

      return {
        success: false,
        changes: [],
        preview: '',
        safetyScore: 0,
        warnings: [],
        errors: [error.message || 'Refactoring failed']
      };
    }
  });

  // Extract function handler
  ipcMain.handle('extract-function', async (
    event: IpcMainInvokeEvent,
    filePath: string,
    selection: { startLine: number; endLine: number },
    functionName: string,
    workspacePath: string
  ): Promise<RefactoringResult> => {
    try {
      const engine = getRefactoringEngine();
      return await engine.extractFunction(filePath, selection, functionName, workspacePath);
    } catch (error: any) {
      return {
        success: false,
        changes: [],
        preview: '',
        safetyScore: 0,
        warnings: [],
        errors: [error.message]
      };
    }
  });

  // Rename symbol handler
  ipcMain.handle('rename-symbol', async (
    event: IpcMainInvokeEvent,
    filePath: string,
    symbolName: string,
    newName: string,
    workspacePath: string
  ): Promise<RefactoringResult> => {
    try {
      const engine = getRefactoringEngine();
      return await engine.renameSymbol(filePath, symbolName, newName, workspacePath);
    } catch (error: any) {
      return {
        success: false,
        changes: [],
        preview: '',
        safetyScore: 0,
        warnings: [],
        errors: [error.message]
      };
    }
  });

  // Apply refactoring changes
  ipcMain.handle('apply-refactoring', async (
    event: IpcMainInvokeEvent,
    changes: Array<{
      filePath: string;
      type: 'modified' | 'created' | 'deleted';
      newContent: string;
    }>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const fs = require('fs');

      for (const change of changes) {
        if (change.type === 'deleted') {
          fs.unlinkSync(change.filePath);
        } else {
          // Ensure directory exists
          const dir = require('path').dirname(change.filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(change.filePath, change.newContent, 'utf-8');
        }
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Safety check handler
  ipcMain.handle('check-refactoring-safety', async (
    event: IpcMainInvokeEvent,
    request: RefactoringRequest,
    changes: any[]
  ) => {
    try {
      const safety = getRefactoringSafety();
      return await safety.validateRefactoring(request, changes);
    } catch (error: any) {
      return {
        safe: false,
        score: 0,
        warnings: [],
        errors: [error.message],
        recommendations: []
      };
    }
  });

  console.log('[Refactoring] Refactoring handlers registered');
}

