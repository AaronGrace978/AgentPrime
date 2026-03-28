/**
 * Completion Optimizer
 * 
 * Optimizes inline code completions for <100ms latency by:
 * - Using dedicated tiny local models
 * - Aggressive caching with smart invalidation
 * - Pre-warming models on editor focus
 * - Reducing context window to last 200 chars
 */

import type { ChatMessage, ChatOptions } from '../../types/ai-providers';
import { getIntentOrchestrator } from '../consciousness/intent-orchestrator';

/**
 * Dedicated fast completion models (ordered by preference)
 * These are tiny models optimized for speed over quality
 * Order matters: we try each until one works
 */
export const COMPLETION_MODELS = [
  'qwen2.5-coder:1.5b',  // Ultra-fast local model (primary) - ~50ms
  'deepseek-coder:1.3b', // Fallback fast model - ~60ms
  'starcoder2:3b',       // Good quality, still fast - ~80ms
  'codellama:7b',        // Fallback (slower but reliable) - ~120ms
  'qwen2.5-coder:7b',    // Alternative if 1.5b not available
  'deepseek-coder:6b',   // Alternative fallback
  'codegemma:2b'         // Google's small coder
];

/**
 * Streaming completion models (for longer completions)
 * These support streaming tokens for progressive display
 */
export const STREAMING_MODELS = [
  'qwen2.5-coder:7b',
  'codellama:13b',
  'deepseek-coder:6b'
];

/**
 * Cache entry for completions
 */
interface CacheEntry {
  completion: string;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  contextHash: string;
  filePath: string;
  fileHash: string; // Hash of file content when cached (for smart invalidation)
  contextSnippet: string; // Normalized context for similarity matching
}

/**
 * Completion cache with LRU eviction and smart invalidation
 */
class CompletionCache {
  private cache: Map<string, CacheEntry>;
  private fileHashes: Map<string, string>; // Track current file hashes for change detection
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0
  };

  constructor(maxSize: number = 1000, ttl: number = 30000) {
    this.cache = new Map();
    this.fileHashes = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl; // 30 seconds default
  }

  /**
   * Generate cache key from context
   */
  generateKey(context: {
    filePath?: string;
    language?: string;
    beforeCursor: string;
    lineNumber?: number;
  }): string {
    // Use only last 200 chars for context (as per plan)
    const contextSnippet = context.beforeCursor.substring(
      Math.max(0, context.beforeCursor.length - 200)
    );
    
    // Create hash from context
    const contextHash = this.simpleHash(
      `${context.filePath || ''}:${context.language || ''}:${contextSnippet}`
    );
    
    return `${contextHash}:${context.lineNumber || 0}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Hash file content (for change detection)
   */
  private hashContent(content: string): string {
    return this.simpleHash(content);
  }

  /**
   * Get file content hash (for change detection)
   */
  private getFileHash(filePath: string, fileContent?: string): string {
    if (fileContent !== undefined) {
      const hash = this.hashContent(fileContent);
      this.fileHashes.set(filePath, hash);
      return hash;
    }
    return this.fileHashes.get(filePath) || '';
  }

  /**
   * Get cached completion (with smart invalidation)
   */
  get(key: string, filePath?: string): string | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Smart invalidation: Check if file has changed
    if (filePath && entry.filePath === filePath) {
      const currentFileHash = this.getFileHash(filePath);
      if (currentFileHash && entry.fileHash !== currentFileHash) {
        // File changed, invalidate this entry
        this.cache.delete(key);
        this.stats.invalidations++;
        this.stats.misses++;
        return null;
      }
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access tracking for LRU
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    
    return entry.completion;
  }

  /**
   * Set completion in cache (with file tracking for smart invalidation)
   */
  set(
    key: string, 
    completion: string, 
    contextHash: string,
    filePath?: string,
    fileContent?: string,
    contextSnippet?: string
  ): void {
    // Don't cache empty or very short completions
    if (!completion || completion.trim().length < 2) {
      return;
    }

    // Don't cache comments or unhelpful completions
    if (completion.startsWith('//') || completion.trim().length < 2) {
      return;
    }

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const fileHash = filePath ? this.getFileHash(filePath, fileContent) : '';
    const normalizedSnippet = contextSnippet || '';

    this.cache.set(key, {
      completion,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      contextHash,
      filePath: filePath || '',
      fileHash,
      contextSnippet: normalizedSnippet
    });
  }

  /**
   * Evict oldest/least used entries (LRU)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    let lowestAccess = Infinity;

    // Find entry with lowest access count, then oldest lastAccessed time
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < lowestAccess || 
          (entry.accessCount === lowestAccess && entry.lastAccessed < oldestTime)) {
        oldestKey = key;
        oldestTime = entry.lastAccessed;
        lowestAccess = entry.accessCount;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Invalidate cache entries for a specific file (smart invalidation)
   */
  invalidateFile(filePath: string): void {
    let invalidated = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.filePath === filePath) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    this.stats.invalidations += invalidated;
    
    // Also remove file hash tracking
    this.fileHashes.delete(filePath);
    
    if (invalidated > 0) {
      console.log(`[CompletionCache] Invalidated ${invalidated} entries for ${filePath}`);
    }
  }

  /**
   * Invalidate cache entries matching pattern (legacy method)
   */
  invalidate(pattern: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.contextHash.includes(pattern) || key.includes(pattern) || entry.filePath.includes(pattern)) {
        this.cache.delete(key);
        this.stats.invalidations++;
      }
    }
  }

  /**
   * Update file hash when file is saved (for smart invalidation)
   */
  onFileSaved(filePath: string, fileContent: string): void {
    const newHash = this.hashContent(fileContent);
    const oldHash = this.fileHashes.get(filePath);
    
    if (oldHash && oldHash !== newHash) {
      // File content changed, invalidate cache for this file
      this.invalidateFile(filePath);
    }
    
    // Update hash
    this.fileHashes.set(filePath, newHash);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.fileHashes.clear();
    this.stats.invalidations += size;
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[CompletionCache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Get cache stats (with hit rate and invalidation tracking)
   */
  getStats(): { 
    size: number; 
    maxSize: number; 
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    invalidations: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions,
      invalidations: this.stats.invalidations
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0
    };
  }
}

/**
 * Model pre-warming manager
 */
class ModelPreWarmer {
  private preWarmedModels: Set<string>;
  private preWarmPromise: Promise<void> | null;

  constructor() {
    this.preWarmedModels = new Set();
    this.preWarmPromise = null;
  }

  /**
   * Pre-warm a completion model by sending a dummy request
   */
  async preWarmModel(model: string, aiRouter: any): Promise<void> {
    if (this.preWarmedModels.has(model)) {
      return; // Already pre-warmed
    }

    try {
      // Send a minimal completion request to load the model
      const dummyMessages: ChatMessage[] = [
        { role: 'user', content: 'const x = ' }
      ];

      await aiRouter.stream(dummyMessages, () => {}, {
        model,
        max_tokens: 1,
        temperature: 0.0
      });

      this.preWarmedModels.add(model);
      console.log(`[CompletionOptimizer] ✅ Pre-warmed model: ${model}`);
    } catch (error: any) {
      console.warn(`[CompletionOptimizer] ⚠️ Failed to pre-warm ${model}:`, error.message);
    }
  }

  /**
   * Pre-warm the primary completion model
   */
  async preWarmPrimary(aiRouter: any): Promise<void> {
    if (this.preWarmPromise) {
      return this.preWarmPromise; // Already pre-warming
    }

    this.preWarmPromise = (async () => {
      const primaryModel = COMPLETION_MODELS[0];
      await this.preWarmModel(primaryModel, aiRouter);
      this.preWarmPromise = null;
    })();

    return this.preWarmPromise;
  }

  /**
   * Check if model is pre-warmed
   */
  isPreWarmed(model: string): boolean {
    return this.preWarmedModels.has(model);
  }

  /**
   * Clear pre-warmed state
   */
  clear(): void {
    this.preWarmedModels.clear();
    this.preWarmPromise = null;
  }
}

/**
 * Completion Optimizer
 */
export class CompletionOptimizer {
  private cache: CompletionCache;
  private preWarmer: ModelPreWarmer;
  private currentModel: string | null;

  constructor() {
    this.cache = new CompletionCache(1000, 30000); // 1000 entries, 30s TTL
    this.preWarmer = new ModelPreWarmer();
    this.currentModel = null;
  }

  /**
   * Get the best available completion model
   */
  async getBestModel(aiRouter: any): Promise<string> {
    // Check if we already have a working model
    if (this.currentModel) {
      return this.currentModel;
    }

    // Try each model in order until we find one that works
    for (const model of COMPLETION_MODELS) {
      try {
        // Quick test to see if model is available
        const testMessages: ChatMessage[] = [
          { role: 'user', content: 'test' }
        ];

        // Try a very short stream to test availability
        let modelWorks = false;
        await aiRouter.stream(testMessages, () => {
          modelWorks = true;
        }, {
          model,
          max_tokens: 1,
          temperature: 0.0,
          timeout: 2000 // 2 second timeout for testing
        });

        if (modelWorks) {
          this.currentModel = model;
          console.log(`[CompletionOptimizer] ✅ Selected model: ${model}`);
          return model;
        }
      } catch (error: any) {
        // Model not available, try next
        console.debug(`[CompletionOptimizer] Model ${model} not available:`, error.message);
        continue;
      }
    }

    // Fallback to first model if none work (will fail gracefully)
    this.currentModel = COMPLETION_MODELS[0];
    return this.currentModel;
  }

  /**
   * Get completion with optimization
   */
  async getCompletion(
    context: {
      filePath?: string;
      language?: string;
      beforeCursor: string;
      afterCursor?: string;
      lineNumber?: number;
    },
    aiRouter: any,
    onPartial?: (completion: string) => void
  ): Promise<{ completion: string; fromCache: boolean; latency: number; model: string }> {
    const startTime = Date.now();

    // Generate cache key
    const cacheKey = this.cache.generateKey(context);

    // Check cache first (instant response with smart invalidation)
    const cached = this.cache.get(cacheKey, context.filePath);
    if (cached) {
      return {
        completion: cached,
        fromCache: true,
        latency: Date.now() - startTime,
        model: this.currentModel || COMPLETION_MODELS[0]
      };
    }

    // Get best available model
    const model = await this.getBestModel(aiRouter);

    // Reduce context to last 200 chars (as per plan)
    const reducedContext = context.beforeCursor.substring(
      Math.max(0, context.beforeCursor.length - 200)
    );

    // ActivatePrime consciousness: inject lightweight project hints
    // so completions match the user's tech stack and code style
    let consciousnessHint = '';
    try {
      const orchestrator = getIntentOrchestrator();
      const state = orchestrator.getState();
      const hints: string[] = [];
      if (state.codeContext.projectType) hints.push(state.codeContext.projectType);
      if (state.codeContext.hasTypes) hints.push('TypeScript');
      if (state.codeContext.techStack.length > 0) hints.push(state.codeContext.techStack.slice(0, 2).join('+'));
      if (hints.length > 0) {
        consciousnessHint = `// ${hints.join(' | ')}\n`;
      }
    } catch {
      // Consciousness not yet initialised — no-op
    }

    // Build minimal completion prompt - optimized for FIM (fill-in-middle) models
    const contextWithHint = consciousnessHint + reducedContext;
    const completionPrompt = context.language 
      ? `<|fim_prefix|>${contextWithHint}<|fim_suffix|>${context.afterCursor?.substring(0, 50) || ''}<|fim_middle|>`
      : `Complete: ${contextWithHint}`;
    
    // Fallback to simpler prompt if model doesn't support FIM
    const simpleFallback = contextWithHint;

    // Get AI completion with optimized settings
    // Use FIM prompt for supported models, simple prompt as fallback
    const useFIM = model.includes('qwen') || model.includes('deepseek') || model.includes('starcoder');
    const prompt = useFIM ? completionPrompt : simpleFallback;
    
    const messages: ChatMessage[] = [
      { role: 'user', content: prompt }
    ];

    let completion = '';
    let chunkCount = 0;
    const MAX_CHUNKS = 5; // Stop after 5 chunks for speed

    try {
      await aiRouter.stream(messages, (chunk: any) => {
        if (chunk.content && chunkCount < MAX_CHUNKS) {
          completion += chunk.content;
          chunkCount++;

          // Stream partial results immediately
          if (onPartial && completion.length > 0) {
            onPartial(completion);
          }

          // Stop early if we have a reasonable completion
          if (completion.length > 50 || completion.includes('\n')) {
            chunkCount = MAX_CHUNKS; // Force stop
          }
        }
      }, {
        model,
        max_tokens: 50, // Very short for speed
        temperature: 0.0, // Deterministic for consistency and caching
        stop: ['\n\n', '```', '//', '\n    '], // Stop at natural boundaries
        timeout: 5000 // 5 second timeout
      });
    } catch (error: any) {
      console.warn('[CompletionOptimizer] Completion error:', error.message);
      // Return empty completion on error
      return {
        completion: '',
        fromCache: false,
        latency: Date.now() - startTime,
        model
      };
    }

    // Clean up completion
    completion = completion
      .replace(/^```\w*\n?/, '') // Remove opening code block
      .replace(/\n```$/, '')     // Remove closing code block
      .replace(/^(Here's|Here is|This|Complete:).*?:/gi, '') // Remove explanations
      .trim()
      .split('\n')[0]            // Take only first line
      .substring(0, 100);         // Limit length

    // Cache the completion (with file tracking for smart invalidation)
    if (completion && completion.length > 2 && !completion.startsWith('//')) {
      const contextHash = this.cache.generateKey(context);
      const contextSnippet = context.beforeCursor.substring(
        Math.max(0, context.beforeCursor.length - 150)
      ).replace(/\s+/g, ' ').trim();
      
      // Note: fileContent would need to be passed in for full smart invalidation
      // For now, we'll track file path and invalidate on file save events
      this.cache.set(cacheKey, completion, contextHash, context.filePath, undefined, contextSnippet);
    }

    const latency = Date.now() - startTime;
    
    if (latency > 100) {
      console.warn(`[CompletionOptimizer] ⚠️ Slow completion: ${latency}ms (target: <100ms)`);
    } else {
      console.debug(`[CompletionOptimizer] ✅ Fast completion: ${latency}ms`);
    }

    return {
      completion: completion || '',
      fromCache: false,
      latency,
      model
    };
  }

  /**
   * Pre-warm completion model (call when editor gains focus)
   */
  async preWarm(aiRouter: any): Promise<void> {
    await this.preWarmer.preWarmPrimary(aiRouter);
  }

  /**
   * Invalidate cache for a file (smart invalidation)
   */
  invalidateFile(filePath: string): void {
    this.cache.invalidateFile(filePath);
  }

  /**
   * Handle file save event (for smart invalidation)
   */
  onFileSaved(filePath: string, fileContent: string): void {
    this.cache.onFileSaved(filePath, fileContent);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

// Export singleton instance
export const completionOptimizer = new CompletionOptimizer();

