/**
 * AgentPrime - Memory Optimization Types
 * Intelligent caching and memory management
 */

export interface CacheConfig {
  enabled: boolean;
  maxSize: number; // bytes
  ttl: number; // seconds
  compression: boolean;
  persistence: boolean;
  evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'random';
  preloadStrategy: 'none' | 'predictive' | 'frequent';
}

export interface CacheEntry {
  key: string;
  value: any;
  metadata: CacheMetadata;
  compressed: boolean;
  serialized: boolean;
}

export interface CacheMetadata {
  size: number;
  created: number;
  accessed: number;
  accessCount: number;
  ttl: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  tags: string[];
  dependencies: string[];
}

export interface MemoryPool {
  id: string;
  name: string;
  maxSize: number;
  usedSize: number;
  allocations: MemoryAllocation[];
  fragmentation: number;
  efficiency: number;
}

export interface MemoryAllocation {
  id: string;
  size: number;
  owner: string;
  type: 'cache' | 'buffer' | 'object' | 'array' | 'string';
  created: number;
  lastAccessed: number;
  accessPattern: 'frequent' | 'occasional' | 'rare';
  priority: 'low' | 'normal' | 'high';
}

export interface GarbageCollectionConfig {
  enabled: boolean;
  interval: number; // seconds
  aggressive: boolean;
  generational: boolean;
  concurrent: boolean;
  threshold: number; // percentage of memory usage
}

export interface MemoryMetrics {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  cacheHitRate: number;
  cacheMissRate: number;
  evictionRate: number;
  gcCycles: number;
  fragmentation: number;
  pools: { [poolId: string]: MemoryPool };
}

export interface PredictiveCache {
  enabled: boolean;
  model: 'markov' | 'neural' | 'statistical' | 'hybrid';
  confidence: number;
  lookAhead: number; // items
  trainingData: CacheAccessPattern[];
}

export interface CacheAccessPattern {
  sequence: string[];
  probability: number;
  frequency: number;
  lastSeen: number;
}

export interface MemoryOptimizationEvent {
  type: 'cache_hit' | 'cache_miss' | 'eviction' | 'gc_cycle' | 'memory_pressure' | 'pool_created' | 'pool_destroyed' |
        'cache_insert' | 'cache_error' | 'cache_delete' | 'cache_clear' | 'persistence_error' | 'cache_loaded' | 'cache_load_error';
  data: any;
  timestamp: number;
  severity: 'info' | 'warning' | 'error';
}

export interface CompressionConfig {
  enabled: boolean;
  algorithm: 'gzip' | 'deflate' | 'brotli' | 'lz4';
  level: number; // 0-9
  threshold: number; // minimum size to compress
  async: boolean;
}

export interface PersistenceConfig {
  enabled: boolean;
  path: string;
  format: 'json' | 'binary' | 'msgpack';
  syncInterval: number; // seconds
  maxFileSize: number;
  compression: boolean;
}

export interface MemoryPressureHandler {
  enabled: boolean;
  thresholds: {
    warning: number; // percentage
    critical: number; // percentage
    emergency: number; // percentage
  };
  actions: MemoryPressureAction[];
}

export interface MemoryPressureAction {
  threshold: 'warning' | 'critical' | 'emergency';
  action: 'gc' | 'evict_cache' | 'reduce_pool' | 'alert' | 'shutdown';
  priority: number;
  cooldown: number; // seconds
}

export interface SmartPreloader {
  enabled: boolean;
  strategies: PreloadStrategy[];
  maxConcurrentLoads: number;
  prefetchWindow: number; // items ahead
}

export interface PreloadStrategy {
  name: string;
  condition: string; // expression to evaluate
  priority: number;
  items: string[]; // cache keys to preload
  weight: number;
}

export interface MemoryLeakDetector {
  enabled: boolean;
  threshold: number; // growth rate
  window: number; // minutes
  sensitivity: number;
  actions: 'alert' | 'gc' | 'restart' | 'shutdown';
}

export interface CacheAnalytics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  evictions: number;
  inserts: number;
  hitRate: number;
  averageAccessTime: number;
  topAccessedItems: CacheEntry[];
  memoryEfficiency: number;
  compressionRatio: number;
}
