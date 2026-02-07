/**
 * AgentPrime - Completions IPC Handler
 * Handles AI completion requests with optimized performance
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { completionOptimizer } from '../core/completion-optimizer';
import { getContextManager } from '../core/context-manager';
import { getCompletionPatternRecognizer } from '../core/completion-pattern-recognizer';
import type { CompletionRequest, CompletionResponse } from '../../types/completions';

let workspacePathGetter: (() => string | null) | null = null;
let activeFilePathGetter: (() => string | null) | null = null;
let activeFilePathSetter: ((path: string | null) => void) | null = null;

interface CompletionHandlerDeps {
  getWorkspacePath?: () => string | null;
  getActiveFilePath?: () => string | null;
  setActiveFilePath?: (path: string | null) => void;
}

export function registerCompletionHandlers(deps?: CompletionHandlerDeps | (() => string | null)): void {
  // Handle legacy single-argument call
  if (typeof deps === 'function') {
    workspacePathGetter = deps;
  } else if (deps) {
    if (deps.getWorkspacePath) {
      workspacePathGetter = deps.getWorkspacePath;
    }
    if (deps.getActiveFilePath) {
      activeFilePathGetter = deps.getActiveFilePath;
    }
    if (deps.setActiveFilePath) {
      activeFilePathSetter = deps.setActiveFilePath;
    }
  }

  // Main completion handler - optimized for <100ms latency
  ipcMain.handle('request-completion', async (
    event: IpcMainInvokeEvent,
    request: CompletionRequest
  ): Promise<CompletionResponse> => {
    const workspacePath = workspacePathGetter ? workspacePathGetter() : getWorkspacePathFallback();
    if (!workspacePath) {
      return {
        completion: '',
        confidence: 0,
        model: 'no-workspace',
        latency: 0
      };
    }

    try {
      // Build intelligent context using ContextManager
      const contextManager = getContextManager();
      const contextData = {
        currentFile: request.filePath,
        recentEdits: request.context?.recentEdits,
        visibleRange: request.context?.visibleRange,
        imports: request.context?.imports
      };

      const optimizedContext = await contextManager.buildIntelligentContext(
        request.beforeCursor.substring(Math.max(0, request.beforeCursor.length - 100)),
        [request.filePath || ''].filter(Boolean),
        contextData
      );

      // Combine current context with optimized context
      const enhancedContext = `${optimizedContext.content}\n\n${request.beforeCursor}`.trim();

      // Get pattern-enhanced completions
      const patternRecognizer = getCompletionPatternRecognizer();
      const patternMatches = await patternRecognizer.recognizePatterns(
        request.beforeCursor,
        request.language,
        {
          recentEdits: request.context?.recentEdits,
          imports: request.context?.imports
        }
      );

      // Use the optimized completion system
      const result = await completionOptimizer.getCompletion(
        {
          filePath: request.filePath,
          language: request.language,
          beforeCursor: enhancedContext,
          afterCursor: request.afterCursor,
          lineNumber: request.lineNumber
        },
        getAIRouter(),
        // Stream partial results for real-time feedback
        (partialCompletion: string) => {
          event.sender.send('completion-partial', {
            completion: partialCompletion,
            filePath: request.filePath,
            lineNumber: request.lineNumber
          });
        }
      );

      // Enhance completion with pattern-based suggestions if AI completion is weak
      let finalCompletion = result.completion;
      let finalConfidence = calculateConfidence(result.completion, request);

      if (finalConfidence < 0.6 && patternMatches.length > 0) {
        // Use pattern-based completion as fallback or enhancement
        const bestPatternMatch = patternMatches[0];
        if (bestPatternMatch.confidence > finalConfidence) {
          finalCompletion = bestPatternMatch.completion;
          finalConfidence = bestPatternMatch.confidence;
        }
      }

      return {
        completion: finalCompletion,
        confidence: finalConfidence,
        model: result.model,
        latency: result.latency
      };

    } catch (error: any) {
      console.error('[Completions] Request failed:', error);

      return {
        completion: '',
        confidence: 0,
        model: 'error',
        latency: 0
      };
    }
  });

  // Pre-warm completion models for faster first response
  ipcMain.handle('prewarm-completions', async () => {
    try {
      await completionOptimizer.preWarm(getAIRouter());
      return { success: true };
    } catch (error: any) {
      console.warn('[Completions] Pre-warm failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Get completion statistics for monitoring
  ipcMain.handle('get-completion-stats', () => {
    return completionOptimizer.getCacheStats();
  });

  // Clear completion cache (for debugging/performance tuning)
  ipcMain.handle('clear-completion-cache', () => {
    completionOptimizer.clearCache();
    return { success: true };
  });

  // Get current file path (for completion context)
  ipcMain.handle('get-current-file-path', () => {
    return activeFilePathGetter ? activeFilePathGetter() : null;
  });

  // Set active file path when editor focus changes
  ipcMain.on('file:active-changed', (event, filePath: string | null) => {
    if (activeFilePathSetter) {
      activeFilePathSetter(filePath);
    }
  });

  // Track analytics events
  ipcMain.handle('track-event', async (event, eventName: string, data: any) => {
    try {
      // Simple logging for now - could be extended to send to analytics service
      console.log(`[Analytics] ${eventName}:`, data);
      return { success: true };
    } catch (error: any) {
      console.warn('[Analytics] Failed to track event:', error.message);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Calculate confidence score for completion
 */
function calculateConfidence(completion: string, request: CompletionRequest): number {
  if (!completion || completion.trim().length < 2) return 0;

  let confidence = 0.5; // Base confidence

  // Length factor - longer completions are often better
  if (completion.length > 10) confidence += 0.2;
  if (completion.length > 50) confidence += 0.1;

  // Context matching - check if completion uses available imports
  if (request.context?.imports.length) {
    const usedImports = request.context.imports.some(imp =>
      completion.includes(imp.split(' ')[1] || '')
    );
    if (usedImports) confidence += 0.2;
  }

  // Syntax validation - basic check
  const hasValidSyntax = !completion.includes('undefined') &&
                        !completion.includes('null') &&
                        completion.length > 0;
  if (hasValidSyntax) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

/**
 * Get AI router instance
 */
function getAIRouter() {
  return require('../ai-providers').default;
}

/**
 * Get current workspace path (fallback)
 */
function getWorkspacePathFallback(): string | null {
  // Try to get from IPC first
  try {
    const { ipcMain } = require('electron');
    // Use the get-workspace handler if available
    return process.cwd();
  } catch {
    return process.cwd();
  }
}
