/**
 * AgentPrime - Memory Optimization
 * Intelligent caching and memory management
 */

import type {
  CacheConfig,
  CacheEntry,
  MemoryPool,
  MemoryMetrics,
  PredictiveCache,
  MemoryOptimizationEvent,
  CompressionConfig,
  PersistenceConfig,
  MemoryPressureHandler,
  SmartPreloader,
  CacheAnalytics
} from '../../types/memory-optimization';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';

export class MemoryOptimizer extends EventEmitter {
  private cache: Map<string, CacheEntry> = new Map();
  private memoryPools: Map<string, MemoryPool> = new Map();
  private accessPatterns: Map<string, number[]> = new Map();
  private config: CacheConfig;
  private compressionConfig: CompressionConfig;
  private persistenceConfig: PersistenceConfig;
  private pressureHandler: MemoryPressureHandler;
  private preloader: SmartPreloader;
  private predictiveCache: PredictiveCache;

  private gcTimer?: NodeJS.Timeout;
  private persistenceTimer?: NodeJS.Timeout;
  private monitoringTimer?: NodeJS.Timeout;

  private analytics: CacheAnalytics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    evictions: 0,
    inserts: 0,
    hitRate: 0,
    averageAccessTime: 0,
    topAccessedItems: [],
    memoryEfficiency: 0,
    compressionRatio: 0
  };

  constructor(config?: Partial<CacheConfig>) {
    super();

    this.config = {
      enabled: true,
      maxSize: 100 * 1024 * 1024, // 100MB
      ttl: 3600, // 1 hour
      compression: true,
      persistence: true,
      evictionPolicy: 'lru',
      preloadStrategy: 'predictive',
      ...config
    };

    this.compressionConfig = {
      enabled: true,
      algorithm: 'gzip',
      level: 6,
      threshold: 1024, // 1KB
      async: true
    };

    this.persistenceConfig = {
      enabled: true,
      path: path.join(process.cwd(), 'cache', 'persistent-cache.json'),
      format: 'json',
      syncInterval: 300, // 5 minutes
      maxFileSize: 50 * 1024 * 1024, // 50MB
      compression: false
    };

    this.pressureHandler = {
      enabled: true,
      thresholds: {
        warning: 75,
        critical: 85,
        emergency: 95
      },
      actions: [
        { threshold: 'warning', action: 'gc', priority: 1, cooldown: 60 },
        { threshold: 'critical', action: 'evict_cache', priority: 2, cooldown: 30 },
        { threshold: 'emergency', action: 'alert', priority: 3, cooldown: 10 }
      ]
    };

    this.preloader = {
      enabled: true,
      strategies: [],
      maxConcurrentLoads: 3,
      prefetchWindow: 5
    };

    this.predictiveCache = {
      enabled: true,
      model: 'markov',
      confidence: 0.7,
      lookAhead: 3,
      trainingData: []
    };

    // Create default memory pool
    this.createMemoryPool('default', 50 * 1024 * 1024); // 50MB

    if (this.config.enabled) {
      this.startGarbageCollection();
      this.startPersistence();
      this.startMonitoring();
      this.loadPersistentCache();
    }
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<any | null> {
    if (!this.config.enabled) return null;

    const startTime = Date.now();
    this.analytics.totalRequests++;

    const entry = this.cache.get(key);
    if (!entry) {
      this.analytics.cacheMisses++;
      this.emitEvent('cache_miss', { key });
      return null;
    }

    // Check TTL
    if (Date.now() - entry.metadata.created > entry.metadata.ttl * 1000) {
      this.cache.delete(key);
      this.analytics.cacheMisses++;
      this.emitEvent('cache_miss', { key, reason: 'expired' });
      return null;
    }

    // Update access metadata
    entry.metadata.accessed = Date.now();
    entry.metadata.accessCount++;

    // Record access pattern
    this.recordAccessPattern(key);

    this.analytics.cacheHits++;
    this.analytics.averageAccessTime = (this.analytics.averageAccessTime + (Date.now() - startTime)) / 2;

    this.emitEvent('cache_hit', { key, accessTime: Date.now() - startTime });

    // Decompress if needed
    let value = entry.value;
    if (entry.compressed) {
      value = await this.decompress(value);
    }

    // Deserialize if needed
    if (entry.serialized) {
      value = JSON.parse(value);
    }

    return value;
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options?: {
    ttl?: number;
    priority?: CacheEntry['metadata']['priority'];
    tags?: string[];
    dependencies?: string[];
  }): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      // Serialize value
      let serializedValue = value;
      let isSerialized = false;

      if (typeof value === 'object' && value !== null) {
        serializedValue = JSON.stringify(value);
        isSerialized = true;
      }

      // Compress if enabled and above threshold
      let finalValue = serializedValue;
      let isCompressed = false;

      if (this.compressionConfig.enabled && serializedValue.length > this.compressionConfig.threshold) {
        finalValue = await this.compress(serializedValue);
        isCompressed = true;
      }

      const size = Buffer.byteLength(finalValue, 'utf8');

      // Check if we have space
      if (!this.ensureSpace(size)) {
        this.emitEvent('memory_pressure', { required: size, available: this.getAvailableSpace() });
        return false;
      }

      const entry: CacheEntry = {
        key,
        value: finalValue,
        metadata: {
          size,
          created: Date.now(),
          accessed: Date.now(),
          accessCount: 0,
          ttl: options?.ttl || this.config.ttl,
          priority: options?.priority || 'normal',
          tags: options?.tags || [],
          dependencies: options?.dependencies || []
        },
        compressed: isCompressed,
        serialized: isSerialized
      };

      this.cache.set(key, entry);
      this.analytics.inserts++;

      // Update memory pool
      this.allocateMemory('default', size, `cache:${key}`, 'cache');

      this.emitEvent('cache_insert', { key, size, compressed: isCompressed });

      return true;
    } catch (error: unknown) {
      this.emitEvent('cache_error', { key, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Delete from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.deallocateMemory('default', entry.metadata.size);
    this.analytics.evictions++;

    this.emitEvent('cache_delete', { key, size: entry.metadata.size });

    return true;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.memoryPools.get('default')!.allocations = [];
    this.memoryPools.get('default')!.usedSize = 0;

    this.emitEvent('cache_clear', {});
  }

  /**
   * Get cache analytics
   */
  getAnalytics(): CacheAnalytics {
    this.analytics.hitRate = this.analytics.totalRequests > 0
      ? this.analytics.cacheHits / this.analytics.totalRequests
      : 0;

    this.analytics.memoryEfficiency = this.calculateMemoryEfficiency();
    this.analytics.compressionRatio = this.calculateCompressionRatio();

    // Get top accessed items
    this.analytics.topAccessedItems = Array.from(this.cache.values())
      .sort((a, b) => b.metadata.accessCount - a.metadata.accessCount)
      .slice(0, 10);

    return { ...this.analytics };
  }

  /**
   * Get memory metrics
   */
  getMemoryMetrics(): MemoryMetrics {
    const memUsage = process.memoryUsage();

    return {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      cacheHitRate: this.analytics.hitRate,
      cacheMissRate: this.analytics.totalRequests > 0 ? this.analytics.cacheMisses / this.analytics.totalRequests : 0,
      evictionRate: this.analytics.totalRequests > 0 ? this.analytics.evictions / this.analytics.totalRequests : 0,
      gcCycles: 0, // Would track actual GC cycles
      fragmentation: this.calculateFragmentation(),
      pools: Object.fromEntries(this.memoryPools)
    };
  }

  /**
   * Create memory pool
   */
  createMemoryPool(id: string, maxSize: number): MemoryPool {
    const pool: MemoryPool = {
      id,
      name: id,
      maxSize,
      usedSize: 0,
      allocations: [],
      fragmentation: 0,
      efficiency: 1.0
    };

    this.memoryPools.set(id, pool);
    this.emitEvent('pool_created', { pool });

    return pool;
  }

  /**
   * Predict next cache accesses
   */
  async predictAccesses(currentSequence: string[]): Promise<string[]> {
    if (!this.predictiveCache.enabled || currentSequence.length === 0) {
      return [];
    }

    const predictions: string[] = [];
    const confidenceThreshold = this.predictiveCache.confidence;

    // Simple Markov chain prediction
    for (const pattern of this.predictiveCache.trainingData) {
      if (pattern.sequence.length > currentSequence.length) {
        const matchLength = Math.min(currentSequence.length, pattern.sequence.length - 1);
        const sequenceMatch = currentSequence.slice(-matchLength);
        const patternPrefix = pattern.sequence.slice(0, matchLength);

        if (this.sequencesMatch(sequenceMatch, patternPrefix) && pattern.probability > confidenceThreshold) {
          const nextItem = pattern.sequence[matchLength];
          if (nextItem && !predictions.includes(nextItem)) {
            predictions.push(nextItem);
          }
        }
      }
    }

    return predictions.slice(0, this.predictiveCache.lookAhead);
  }

  /**
   * Preload items based on predictions
   */
  async preloadItems(keys: string[]): Promise<void> {
    if (!this.preloader.enabled) return;

    const promises = keys.slice(0, this.preloader.maxConcurrentLoads).map(async (key) => {
      // Simulate loading from persistent storage or external source
      // In real implementation, this would load actual data
      const mockData = { key, loaded: true, timestamp: Date.now() };
      await this.set(key, mockData, { ttl: 3600 });
    });

    await Promise.all(promises);
  }

  // Private methods

  private createDefaultMemoryPool(name: string, maxSize: number): MemoryPool {
    return {
      id: crypto.randomUUID(),
      name,
      maxSize,
      usedSize: 0,
      allocations: [],
      fragmentation: 0,
      efficiency: 1.0
    };
  }

  private allocateMemory(poolId: string, size: number, owner: string, type: any): boolean {
    const pool = this.memoryPools.get(poolId);
    if (!pool || pool.usedSize + size > pool.maxSize) {
      return false;
    }

    const allocation = {
      id: crypto.randomUUID(),
      size,
      owner,
      type,
      created: Date.now(),
      lastAccessed: Date.now(),
      accessPattern: 'frequent' as const,
      priority: 'normal' as const
    };

    pool.allocations.push(allocation);
    pool.usedSize += size;
    pool.efficiency = this.calculatePoolEfficiency(pool);

    return true;
  }

  private deallocateMemory(poolId: string, size: number): void {
    const pool = this.memoryPools.get(poolId);
    if (pool) {
      pool.usedSize = Math.max(0, pool.usedSize - size);
      pool.efficiency = this.calculatePoolEfficiency(pool);
    }
  }

  private ensureSpace(requiredSize: number): boolean {
    const available = this.getAvailableSpace();

    if (available >= requiredSize) {
      return true;
    }

    // Try eviction
    return this.evictEntries(requiredSize - available);
  }

  private getAvailableSpace(): number {
    const totalCacheSize = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.metadata.size, 0);

    return Math.max(0, this.config.maxSize - totalCacheSize);
  }

  private evictEntries(targetSize: number): boolean {
    let freedSize = 0;
    const entries = Array.from(this.cache.entries());

    // Sort by eviction priority based on policy
    entries.sort((a, b) => this.getEvictionPriority(a[1], b[1]));

    for (const [key, entry] of entries) {
      if (freedSize >= targetSize) break;

      this.cache.delete(key);
      freedSize += entry.metadata.size;
      this.analytics.evictions++;

      this.emitEvent('eviction', { key, size: entry.metadata.size, reason: 'space' });
    }

    return freedSize >= targetSize;
  }

  private getEvictionPriority(a: CacheEntry, b: CacheEntry): number {
    switch (this.config.evictionPolicy) {
      case 'lru':
        return a.metadata.accessed - b.metadata.accessed;
      case 'lfu':
        return a.metadata.accessCount - b.metadata.accessCount;
      case 'fifo':
        return a.metadata.created - b.metadata.created;
      default:
        return Math.random() - 0.5;
    }
  }

  private async compress(data: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gzip(data, { level: this.compressionConfig.level }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  private async decompress(data: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (error, result) => {
        if (error) reject(error);
        else resolve(result.toString());
      });
    });
  }

  private recordAccessPattern(key: string): void {
    const patterns = this.accessPatterns.get(key) || [];
    patterns.push(Date.now());

    // Keep only recent patterns (last 100 accesses)
    if (patterns.length > 100) {
      patterns.shift();
    }

    this.accessPatterns.set(key, patterns);

    // Update predictive model
    this.updatePredictiveModel(key, patterns);
  }

  private updatePredictiveModel(key: string, accessTimes: number[]): void {
    // Simple pattern extraction - would be more sophisticated in production
    if (accessTimes.length >= 3) {
      const intervals = [];
      for (let i = 1; i < accessTimes.length; i++) {
        intervals.push(accessTimes[i] - accessTimes[i - 1]);
      }

      const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
      const regularity = Math.max(0, 1 - variance / (avgInterval * avgInterval));

      if (regularity > 0.7) {
        // Add to training data
        this.predictiveCache.trainingData.push({
          sequence: [key],
          probability: regularity,
          frequency: accessTimes.length,
          lastSeen: accessTimes[accessTimes.length - 1]
        });
      }
    }
  }

  private sequencesMatch(seq1: string[], seq2: string[]): boolean {
    if (seq1.length !== seq2.length) return false;
    return seq1.every((item, index) => item === seq2[index]);
  }

  private startGarbageCollection(): void {
    this.gcTimer = setInterval(() => {
      this.performGarbageCollection();
    }, 300000); // 5 minutes
  }

  private performGarbageCollection(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      // Remove expired entries
      if (now - entry.metadata.created > entry.metadata.ttl * 1000) {
        this.cache.delete(key);
        this.deallocateMemory('default', entry.metadata.size);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.emitEvent('gc_cycle', { cleaned, remaining: this.cache.size });
    }

    // Check memory pressure
    this.checkMemoryPressure();
  }

  private checkMemoryPressure(): void {
    const metrics = this.getMemoryMetrics();
    const memoryUsagePercent = (metrics.heapUsed / metrics.heapTotal) * 100;

    for (const action of this.pressureHandler.actions) {
      const threshold = this.pressureHandler.thresholds[action.threshold];

      if (memoryUsagePercent >= threshold) {
        this.executePressureAction(action, memoryUsagePercent);
        break; // Execute highest priority action
      }
    }
  }

  private executePressureAction(action: any, memoryUsage: number): void {
    switch (action.action) {
      case 'gc':
        this.performGarbageCollection();
        break;
      case 'evict_cache':
        this.evictEntries(this.config.maxSize * 0.2); // Evict 20%
        break;
      case 'alert':
        this.emitEvent('memory_pressure', { level: action.threshold, usage: memoryUsage });
        break;
    }
  }

  private startPersistence(): void {
    if (!this.persistenceConfig.enabled) return;

    // Ensure directory exists
    const dir = path.dirname(this.persistenceConfig.path);
    fs.mkdirSync(dir, { recursive: true });

    this.persistenceTimer = setInterval(() => {
      this.savePersistentCache();
    }, this.persistenceConfig.syncInterval * 1000);
  }

  private async savePersistentCache(): Promise<void> {
    try {
      const cacheData = {
        timestamp: Date.now(),
        entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
          key,
          value: entry.value,
          metadata: entry.metadata,
          compressed: entry.compressed,
          serialized: entry.serialized
        }))
      };

      const data = JSON.stringify(cacheData, null, 2);
      await fs.promises.writeFile(this.persistenceConfig.path, data, 'utf-8');
    } catch (error: unknown) {
      this.emitEvent('persistence_error', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async loadPersistentCache(): Promise<void> {
    try {
      if (!fs.existsSync(this.persistenceConfig.path)) return;

      const data = await fs.promises.readFile(this.persistenceConfig.path, 'utf-8');
      const cacheData = JSON.parse(data);

      for (const entry of cacheData.entries) {
        this.cache.set(entry.key, entry);
        this.allocateMemory('default', entry.metadata.size, `cache:${entry.key}`, 'cache');
      }

      this.emitEvent('cache_loaded', { entries: cacheData.entries.length });
    } catch (error: unknown) {
      this.emitEvent('cache_load_error', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      // Update analytics periodically
      this.getAnalytics();
    }, 60000); // 1 minute
  }

  private calculateMemoryEfficiency(): number {
    const pool = this.memoryPools.get('default');
    if (!pool) return 0;

    const totalAllocated = pool.allocations.length;
    const activeAllocations = pool.allocations.filter(a =>
      Date.now() - a.lastAccessed < 3600000 // Accessed within last hour
    ).length;

    return totalAllocated > 0 ? activeAllocations / totalAllocated : 0;
  }

  private calculateCompressionRatio(): number {
    const compressedEntries = Array.from(this.cache.values()).filter(e => e.compressed);
    if (compressedEntries.length === 0) return 1;

    const originalSize = compressedEntries.reduce((sum, e) => sum + e.metadata.size * 2, 0); // Estimate
    const compressedSize = compressedEntries.reduce((sum, e) => sum + e.metadata.size, 0);

    return originalSize > 0 ? originalSize / compressedSize : 1;
  }

  private calculateFragmentation(): number {
    const pool = this.memoryPools.get('default');
    if (!pool || pool.allocations.length === 0) return 0;

    // Simple fragmentation calculation
    const totalSize = pool.maxSize;
    const usedSize = pool.usedSize;
    const allocationCount = pool.allocations.length;
    const averageAllocationSize = usedSize / allocationCount;

    // Fragmentation increases with more, smaller allocations
    return Math.min(1, allocationCount / (usedSize / averageAllocationSize));
  }

  private calculatePoolEfficiency(pool: MemoryPool): number {
    if (pool.allocations.length === 0) return 1.0;

    const totalRequested = pool.allocations.reduce((sum, a) => sum + a.size, 0);
    const efficiency = totalRequested > 0 ? pool.usedSize / totalRequested : 1.0;

    return Math.max(0, Math.min(1, efficiency));
  }

  private emitEvent(type: MemoryOptimizationEvent['type'], data: any): void {
    const event: MemoryOptimizationEvent = {
      type,
      data,
      timestamp: Date.now(),
      severity: type.includes('error') ? 'error' : type.includes('pressure') ? 'warning' : 'info'
    };

    this.emit('memory_event', event);
  }
}
