/**
 * Performance Utilities for AgentPrime
 * 
 * Optimizations for handling large codebases (10k+ files):
 * - Chunked file processing
 * - Incremental indexing
 * - Memory-efficient file reading
 * - Debounced operations
 * - Worker thread support preparation
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Chunked directory walker that yields batches of files
 * Prevents memory spikes when processing large directories
 */
export async function* walkDirectoryChunked(
  dirPath: string,
  options: {
    batchSize?: number;
    extensions?: string[];
    ignore?: string[];
    maxDepth?: number;
  } = {}
): AsyncGenerator<string[], void, unknown> {
  const {
    batchSize = 100,
    extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'],
    ignore = ['node_modules', '.git', 'dist', 'build', '__pycache__', 'venv', '.next', 'coverage'],
    maxDepth = 20
  } = options;

  const batch: string[] = [];
  
  async function* walk(dir: string, depth: number): AsyncGenerator<string[], void, unknown> {
    if (depth > maxDepth) return;
    
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return; // Skip unreadable directories
    }
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!ignore.includes(entry.name) && !entry.name.startsWith('.')) {
          yield* walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          batch.push(fullPath);
          
          if (batch.length >= batchSize) {
            yield [...batch];
            batch.length = 0;
          }
        }
      }
    }
    
    // Yield remaining files at end
    if (batch.length > 0 && depth === 0) {
      yield [...batch];
      batch.length = 0;
    }
  }
  
  yield* walk(dirPath, 0);
  
  // Final batch
  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * Memory-efficient file reader that streams large files
 */
export async function readFileSafe(
  filePath: string,
  maxSize: number = 1024 * 1024 // 1MB default
): Promise<{ content: string; truncated: boolean }> {
  try {
    const stat = fs.statSync(filePath);
    
    if (stat.size > maxSize) {
      // Read only first portion of large files
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(maxSize);
      fs.readSync(fd, buffer, 0, maxSize, 0);
      fs.closeSync(fd);
      
      const content = buffer.toString('utf-8');
      // Find last complete line
      const lastNewline = content.lastIndexOf('\n');
      
      return {
        content: lastNewline > 0 ? content.substring(0, lastNewline) + '\n\n// ... file truncated (too large) ...' : content,
        truncated: true
      };
    }
    
    return {
      content: fs.readFileSync(filePath, 'utf-8'),
      truncated: false
    };
  } catch (e) {
    return { content: '', truncated: false };
  }
}

/**
 * Debounce function for expensive operations
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * Throttle function for rate-limiting operations
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * LRU Cache for frequently accessed data
 */
export class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Delete if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * File content cache with TTL
 */
export class FileCache {
  private cache: Map<string, { content: string; mtime: number; expires: number }> = new Map();
  private ttl: number;
  private maxEntries: number;

  constructor(ttl: number = 30000, maxEntries: number = 500) {
    this.ttl = ttl;
    this.maxEntries = maxEntries;
  }

  get(filePath: string): string | null {
    const entry = this.cache.get(filePath);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expires) {
      this.cache.delete(filePath);
      return null;
    }
    
    // Check if file was modified
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs > entry.mtime) {
        this.cache.delete(filePath);
        return null;
      }
    } catch (e) {
      this.cache.delete(filePath);
      return null;
    }
    
    return entry.content;
  }

  set(filePath: string, content: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    
    try {
      const stat = fs.statSync(filePath);
      this.cache.set(filePath, {
        content,
        mtime: stat.mtimeMs,
        expires: Date.now() + this.ttl
      });
    } catch (e) {
      // Don't cache if we can't stat
    }
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  invalidateDirectory(dirPath: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(dirPath)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; maxEntries: number } {
    return { size: this.cache.size, maxEntries: this.maxEntries };
  }
}

/**
 * Batch processor for parallel operations
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 10
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const p = processor(item).then(result => {
      results.push(result);
    });
    
    executing.push(p);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      const completed = executing.filter(p => {
        // Check if promise is settled
        let settled = false;
        p.then(() => { settled = true; }).catch(() => { settled = true; });
        return settled;
      });
      for (const c of completed) {
        const idx = executing.indexOf(c);
        if (idx > -1) executing.splice(idx, 1);
      }
    }
  }
  
  await Promise.all(executing);
  return results;
}

/**
 * Memory usage monitor
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss
  };
}

/**
 * Check if memory usage is high
 */
export function isMemoryHigh(thresholdMB: number = 500): boolean {
  const usage = getMemoryUsage();
  return usage.heapUsed > thresholdMB * 1024 * 1024;
}

/**
 * Force garbage collection if available
 */
export function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

// Singleton file cache instance
export const fileCache = new FileCache();

// Export default
export default {
  walkDirectoryChunked,
  readFileSafe,
  debounce,
  throttle,
  LRUCache,
  FileCache,
  fileCache,
  processBatch,
  getMemoryUsage,
  isMemoryHigh,
  forceGC
};

