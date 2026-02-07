/**
 * AgentPrime - Mirror Intelligence IPC Handlers
 * Handles requests for Mirror Intelligence data and operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import { getOpusTrainingCorpus, OPUS_TRAINING_PATTERNS, getCriticalPatterns } from '../mirror/opus-training-corpus';

interface MirrorHandlersDeps {
  ipcMain: any;
  mainWindow?: () => any;
  getMirrorMemory?: () => any;
  getPatternExtractor?: () => any;
  getIntelligenceExpansion?: () => any;
  getKnowledgeIngester?: () => any;
}

// Track if Opus patterns have been ingested this session
let opusPatternsIngested = false;

/**
 * Convert an OpusPattern to a MirrorPattern for storage
 */
function opusToMirrorPattern(opusPattern: { id: string; category: string; name: string; description: string; technique: string; examples?: string[]; antiPatterns?: string[]; priority: string }): Record<string, any> {
  return {
    id: opusPattern.id,
    category: opusPattern.category,
    description: `${opusPattern.name}: ${opusPattern.description}`,
    pattern: opusPattern.technique,
    examples: opusPattern.examples || [],
    metadata: {
      antiPatterns: opusPattern.antiPatterns || [],
      source: 'opus-training'
    },
    confidence: opusPattern.priority === 'critical' ? 1.0 : opusPattern.priority === 'high' ? 0.9 : 0.8,
    successRate: 0.95,
    type: 'opus-pattern'
  };
}

/**
 * Helper: extract patterns from content and store in mirror memory
 */
async function extractAndStorePatterns(
  content: string,
  metadata: Record<string, any>,
  patternExtractor: any,
  mirrorMemory: any,
  emitFn: (pattern: any, category: string, intelligence: number) => void
): Promise<{ success: boolean; patternsExtracted: number; error?: string }> {
  try {
    const patternsResult = await patternExtractor.extractPatterns(content, metadata?.context || 'manual');
    let totalPatterns = 0;

    for (const category of Object.keys(patternsResult)) {
      const categoryPatterns = patternsResult[category as keyof typeof patternsResult];
      if (!Array.isArray(categoryPatterns)) continue;
      for (const pattern of categoryPatterns) {
        pattern.metadata = {
          ...pattern.metadata,
          source: metadata?.source || 'manual',
          timestamp: metadata?.timestamp || new Date().toISOString()
        };
        await mirrorMemory.storePattern(pattern, category);
        totalPatterns++;
        const metrics = mirrorMemory.getIntelligenceMetrics();
        emitFn(pattern, category, metrics?.currentIntelligence || 1.0);
      }
    }

    return { success: true, patternsExtracted: totalPatterns };
  } catch (error: any) {
    return { success: false, patternsExtracted: 0, error: error.message || 'Failed to extract patterns' };
  }
}

/**
 * Register mirror intelligence IPC handlers
 */
export function register(deps: MirrorHandlersDeps): void {
  const { ipcMain, mainWindow, getMirrorMemory, getPatternExtractor, getIntelligenceExpansion, getKnowledgeIngester } = deps;
  
  // Helper function to emit pattern learned events
  const emitPatternLearned = (pattern: any, category: string, intelligence: number) => {
    const window = mainWindow?.();
    if (window && !window.isDestroyed()) {
      window.webContents.send('mirror:pattern-learned', {
        pattern: pattern.name || pattern.description?.substring(0, 50) || 'New Pattern',
        category: category,
        intelligence: intelligence
      });
    }
  };

  // Get Mirror Intelligence metrics
  ipcMain.handle('mirror:get-intelligence', async () => {
    try {
      const mirrorMemory = getMirrorMemory?.();
      if (!mirrorMemory) {
        return { success: false, error: 'Mirror Memory not available' };
      }

      const metrics = mirrorMemory.getIntelligenceMetrics();
      const stats = mirrorMemory.getStats();

      return {
        success: true,
        intelligence: metrics?.currentIntelligence || metrics?.Q || 1.0,
        patterns: stats?.totalPatterns || 0,
        learningRate: 'Normal',
        growthRate: metrics?.growthRate || 0.0,
        isLearning: true
      };
    } catch (error: any) {
      console.error('Error getting mirror intelligence:', error);
      return { success: false, error: error.message };
    }
  });

  // Get Mirror Intelligence insights (recent learned patterns)
  ipcMain.handle('mirror:get-insights', async () => {
    try {
      const mirrorMemory = getMirrorMemory?.();
      if (!mirrorMemory) {
        return { success: false, error: 'Mirror Memory not available' };
      }

      // Get recent patterns using public method
      const recentPatterns = await mirrorMemory.retrievePatterns(null, 10, 'recent');
      const insights: string[] = [];

      // Build insights from recent patterns
      for (const pattern of recentPatterns) {
        if (pattern.description) {
          const category = pattern.category || pattern.type || 'pattern';
          insights.push(`Learned ${category}: ${pattern.description.substring(0, 50)}...`);
        }
      }

      // If no patterns, provide default insights
      if (insights.length === 0) {
        insights.push('Mirror System initializing...');
        insights.push('Ready to learn from your coding patterns');
        insights.push('Start creating to see intelligence growth');
      }

      return { success: true, insights: insights.slice(0, 5) }; // Return first 5 insights
    } catch (error: any) {
      console.error('Error getting mirror insights:', error);
      return {
        success: true,
        insights: [
          'Learning React component patterns',
          'Discovering API design best practices',
          'Identifying error handling strategies'
        ]
      };
    }
  });

  // Get all learned patterns
  ipcMain.handle('mirror:get-patterns', async (_event: IpcMainInvokeEvent, category?: string | null, limit?: number) => {
    try {
      const mirrorMemory = getMirrorMemory?.();
      if (!mirrorMemory) {
        return { success: false, error: 'Mirror Memory not available', patterns: [] };
      }

      // Use the public retrievePatterns method
      const patterns = await mirrorMemory.retrievePatterns(category, limit, 'recent');

      return { success: true, patterns: patterns || [] };
    } catch (error: any) {
      console.error('Error getting mirror patterns:', error);
      return { success: false, error: error.message, patterns: [] };
    }
  });

  // Trigger pattern learning from code
  ipcMain.handle('mirror:learn-from-code', async (_event: IpcMainInvokeEvent, code: string, context?: string) => {
    try {
      const patternExtractor = getPatternExtractor?.();
      const mirrorMemory = getMirrorMemory?.();

      if (!patternExtractor || !mirrorMemory) {
        return { success: false, error: 'Pattern extraction not available' };
      }

      const patternsResult = await patternExtractor.extractPatterns(code, context);
      
      // patternsResult is an object with categories, not an array
      let totalPatterns = 0;
      const metrics = mirrorMemory.getIntelligenceMetrics();
      for (const category of Object.keys(patternsResult)) {
        const categoryPatterns = patternsResult[category as keyof typeof patternsResult];
        if (Array.isArray(categoryPatterns)) {
          for (const pattern of categoryPatterns) {
            await mirrorMemory.storePattern(pattern, category);
            totalPatterns++;
            // Emit pattern learned event
            emitPatternLearned(pattern, category, metrics?.currentIntelligence || 1.0);
          }
        }
      }

      return { success: true, patternsLearned: totalPatterns };
    } catch (error: any) {
      console.error('Error learning from code:', error);
      return { success: false, error: error.message };
    }
  });

  // Get intelligence expansion suggestions
  ipcMain.handle('mirror:get-suggestions', async (_event: IpcMainInvokeEvent, task: string) => {
    try {
      const intelligenceExpansion = getIntelligenceExpansion?.();
      const mirrorMemory = getMirrorMemory?.();

      if (!intelligenceExpansion || !mirrorMemory) {
        return { success: false, error: 'Intelligence expansion not available' };
      }

      const suggestions = await intelligenceExpansion.generateLearningSuggestions();
      return { success: true, suggestions };
    } catch (error: any) {
      console.error('Error getting suggestions:', error);
      return { success: false, error: error.message };
    }
  });

  // Ingest knowledge from direct content (paste/clipboard)
  ipcMain.handle('mirror-ingest-content', async (_event: IpcMainInvokeEvent, content: string, metadata: any = {}) => {
    const knowledgeIngester = getKnowledgeIngester?.();
    if (!knowledgeIngester) {
      return { success: false, error: 'Knowledge ingester not initialized' };
    }
    try {
      const result = await knowledgeIngester.ingestFromContent(content, metadata);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Ingest knowledge from a single URL
  ipcMain.handle('mirror-ingest-url', async (_event: IpcMainInvokeEvent, url: string, options: any = {}) => {
    const knowledgeIngester = getKnowledgeIngester?.();
    if (!knowledgeIngester) {
      return { success: false, error: 'Knowledge ingester not initialized' };
    }
    try {
      const result = await knowledgeIngester.ingestFromURL(url, options);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Ingest knowledge from URLs
  ipcMain.handle('mirror-ingest-urls', async (_event: IpcMainInvokeEvent, urls: string[], options: any = {}) => {
    const knowledgeIngester = getKnowledgeIngester?.();
    if (!knowledgeIngester) {
      return { success: false, error: 'Knowledge ingester not initialized' };
    }
    try {
      const result = await knowledgeIngester.ingestFromURLs(urls, options);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get ingestion history
  ipcMain.handle('mirror-get-ingestion-history', async (_event: IpcMainInvokeEvent, limit: number = 50) => {
    const knowledgeIngester = getKnowledgeIngester?.();
    if (!knowledgeIngester) {
      return { success: false, error: 'Knowledge ingester not initialized', history: [] };
    }
    try {
      const history = knowledgeIngester.getIngestionHistory(limit);
      return { success: true, history };
    } catch (error: any) {
      return { success: false, error: error.message, history: [] };
    }
  });

  // ============================================
  // OPUS TRAINING INTEGRATION
  // ============================================

  // Get mirror status
  ipcMain.handle('mirror:get-status', async () => {
    try {
      const mirrorMemory = getMirrorMemory?.();
      const stats = mirrorMemory?.getStats?.() || { totalPatterns: 0 };
      
      return {
        success: true,
        isLearning: true,
        opusPatternsLoaded: opusPatternsIngested,
        patternsCount: stats.totalPatterns || 0
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get mirror metrics
  ipcMain.handle('mirror:get-metrics', async () => {
    try {
      const mirrorMemory = getMirrorMemory?.();
      if (!mirrorMemory) {
        return { 
          success: true, 
          metrics: { Q: 0, R: 0, E: 0, intelligence: 1.0 } 
        };
      }

      const metrics = mirrorMemory.getIntelligenceMetrics() || {};
      return {
        success: true,
        metrics: {
          Q: metrics.Q || 0.75,
          R: metrics.R || 0.3,
          E: metrics.E || 0.6,
          intelligence: metrics.currentIntelligence || 1.0
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Ingest Opus training patterns (shared helper for both endpoints)
  const ingestOpusPatterns = async (): Promise<{ success: boolean; patternsIngested: number; error?: string }> => {
    const mirrorMemory = getMirrorMemory?.();
    if (!mirrorMemory) {
      return { success: false, patternsIngested: 0, error: 'Mirror Memory not available' };
    }

    let count = 0;
    for (const opusPattern of OPUS_TRAINING_PATTERNS) {
      const mirrorPattern = opusToMirrorPattern(opusPattern);
      await mirrorMemory.storePattern(mirrorPattern as any, opusPattern.category);
      count++;
      const metrics = mirrorMemory.getIntelligenceMetrics();
      emitPatternLearned(mirrorPattern, opusPattern.category, metrics?.currentIntelligence || 1.0);
    }

    opusPatternsIngested = true;
    console.log(`[Mirror] Ingested ${count} Opus training patterns`);
    return { success: true, patternsIngested: count };
  };

  ipcMain.handle('mirror:ingest-opus', async () => {
    try {
      return await ingestOpusPatterns();
    } catch (error: any) {
      console.error('Error ingesting Opus patterns:', error);
      return { success: false, error: error.message };
    }
  });

  // Get Opus training corpus as text (for display or export)
  ipcMain.handle('mirror:get-opus-corpus', async () => {
    try {
      const corpus = getOpusTrainingCorpus();
      return { success: true, corpus };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get critical patterns for quick reference
  ipcMain.handle('mirror:get-critical-patterns', async () => {
    try {
      const patterns = getCriticalPatterns();
      return { 
        success: true, 
        patterns: patterns.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          technique: p.technique,
          category: p.category
        }))
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Auto-ingest Opus patterns on first call (lazy initialization)
  ipcMain.handle('mirror:auto-init', async () => {
    try {
      if (opusPatternsIngested) {
        return { success: true, message: 'Already initialized', alreadyLoaded: true };
      }

      const result = await ingestOpusPatterns();
      return {
        ...result,
        message: result.success ? 'Opus 4.5 patterns loaded successfully' : result.error,
        alreadyLoaded: false
      };
    } catch (error: any) {
      console.error('Error auto-initializing:', error);
      return { success: false, error: error.message };
    }
  });

  // Content ingestion handler (consolidated -- no more duplicate code paths)
  ipcMain.handle('mirror:ingest-content', async (_event: IpcMainInvokeEvent, content: string, metadata?: any) => {
    console.log(`[Mirror] Ingesting content, length: ${content.length}`);

    // Try knowledge ingester first (preferred)
    const knowledgeIngester = getKnowledgeIngester?.();
    if (knowledgeIngester) {
      try {
        return await knowledgeIngester.ingestFromContent(content, metadata);
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }

    // Fallback: use pattern extractor directly
    const patternExtractor = getPatternExtractor?.();
    // Try deps first, then singleton as fallback
    let mirrorMemory = getMirrorMemory?.();
    if (!mirrorMemory) {
      try {
        const { getMirrorMemory: getSingletonMemory } = await import('../mirror/mirror-singleton');
        mirrorMemory = getSingletonMemory() as any;
      } catch { /* no-op */ }
    }

    if (!patternExtractor || !mirrorMemory) {
      return { success: false, error: 'Pattern extraction not available. Mirror system may not be initialized.' };
    }

    return extractAndStorePatterns(content, metadata || {}, patternExtractor, mirrorMemory, emitPatternLearned);
  });

  // Clear all anti-patterns
  ipcMain.handle('mirror:clear-antipatterns', async () => {
    try {
      const mirrorMemory = getMirrorMemory?.();
      if (!mirrorMemory) {
        return { success: false, error: 'Mirror memory not available' };
      }

      const result = await mirrorMemory.clearCategory('antiPatterns');
      console.log(`[Mirror] Cleared ${result.cleared} anti-patterns`);
      return { success: true, clearedCount: result.cleared };
    } catch (error: any) {
      console.error('[Mirror] Error clearing anti-patterns:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mirror:ingest-url', async (_event: IpcMainInvokeEvent, url: string, metadata?: any) => {
    // Try knowledge ingester first (preferred)
    const knowledgeIngester = getKnowledgeIngester?.();
    if (knowledgeIngester) {
      try {
        return await knowledgeIngester.ingestFromURL(url, metadata);
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }

    // Fallback: fetch and extract directly
    const patternExtractor = getPatternExtractor?.();
    const mirrorMemory = getMirrorMemory?.();
    if (!patternExtractor || !mirrorMemory) {
      return { success: false, error: 'Pattern extraction not available' };
    }

    try {
      let rawUrl = url;
      if (url.includes('github.com') && url.includes('/blob/')) {
        rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
      }

      const response = await fetch(rawUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const content = await response.text();
      const result = await extractAndStorePatterns(
        content,
        { source: 'url', sourceUrl: url, ...metadata },
        patternExtractor,
        mirrorMemory,
        emitPatternLearned
      );
      return { ...result, sourceUrl: url };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ============================================================
  // 🧠 CONSCIOUSNESS SYSTEM HANDLERS (ActivatePrime Integration)
  // ============================================================

  // Process a message through consciousness for deep understanding
  ipcMain.handle('consciousness:process', async (_event: IpcMainInvokeEvent, message: string, context?: any) => {
    try {
      const { processWithConsciousness } = await import('../consciousness');
      const result = await processWithConsciousness(message, context);
      return { 
        success: true, 
        state: result.state,
        injection: result.injection
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get current consciousness state
  ipcMain.handle('consciousness:get-state', async () => {
    try {
      const { getIntentOrchestrator } = await import('../consciousness');
      const orchestrator = getIntentOrchestrator();
      return { 
        success: true, 
        state: orchestrator.getState(),
        summary: orchestrator.getStateSummary()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ============================================================
  // 💚 RELATIONSHIP INTELLIGENCE HANDLERS (Matrix Agent)
  // ============================================================

  // Get relationship state
  ipcMain.handle('relationship:get-state', async () => {
    try {
      const { getRelationshipCore } = await import('../relationship');
      const core = getRelationshipCore();
      return { 
        success: true, 
        state: core.getState(),
        status: core.getStatusSummary()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get Matrix greeting
  ipcMain.handle('relationship:get-greeting', async () => {
    try {
      const { getMatrixGreeting } = await import('../relationship');
      return { success: true, greeting: getMatrixGreeting() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Check if action is allowed
  ipcMain.handle('relationship:check-action', async (_event: IpcMainInvokeEvent, action: string, actionType: string) => {
    try {
      const { checkActionAllowed } = await import('../relationship');
      const result = checkActionAllowed(action, actionType);
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Record action result
  ipcMain.handle('relationship:record-action', async (
    _event: IpcMainInvokeEvent, 
    userMessage: string,
    action: string,
    actionType: string,
    wasSuccessful: boolean,
    userReaction?: 'positive' | 'negative' | 'neutral'
  ) => {
    try {
      const { recordMatrixAction } = await import('../relationship');
      recordMatrixAction(userMessage, action, actionType, wasSuccessful, userReaction);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get persona context for prompt injection
  ipcMain.handle('relationship:get-persona-context', async () => {
    try {
      const { getMatrixPersonaContext } = await import('../relationship');
      return { success: true, context: getMatrixPersonaContext() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Process message through relationship system
  ipcMain.handle('relationship:process-message', async (_event: IpcMainInvokeEvent, message: string) => {
    try {
      const { getRelationshipCore } = await import('../relationship');
      const core = getRelationshipCore();
      const result = core.processMessage(message);
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get user trust level
  ipcMain.handle('relationship:get-trust', async () => {
    try {
      const { getUserProfileManager, getTrustLevelDisplay } = await import('../relationship');
      const profile = getUserProfileManager();
      return { 
        success: true, 
        level: profile.getTrustLevel(),
        score: profile.getTrustScore(),
        display: getTrustLevelDisplay(profile.getTrustLevel())
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Boost trust (for testing)
  ipcMain.handle('relationship:boost-trust', async (_event: IpcMainInvokeEvent, amount: number) => {
    try {
      const { getUserProfileManager } = await import('../relationship');
      const profile = getUserProfileManager();
      profile.boostTrust(amount);
      return { 
        success: true, 
        newScore: profile.getTrustScore(),
        newLevel: profile.getTrustLevel()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
