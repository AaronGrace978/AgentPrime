/**
 * Short-Term Memory System for AgentPrime
 * 
 * Prevents redundant operations by caching recent file reads,
 * tracking what actions have been taken, and providing
 * intelligent context to the agent.
 * 
 * This is like giving the agent "working memory" - it remembers
 * what it just did and doesn't need to repeat itself.
 */

export interface MemoryEntry {
  type: 'file_read' | 'file_write' | 'command_run' | 'search';
  key: string;           // Unique identifier (file path, command, etc.)
  content: string;       // Cached content
  timestamp: number;     // When it was cached
  hash?: string;         // Content hash for change detection
  metadata?: Record<string, any>;
}

export interface MemoryStats {
  totalEntries: number;
  fileReads: number;
  fileWrites: number;
  commands: number;
  searches: number;
  hitRate: number;
  bytesCached: number;
}

class ShortTermMemory {
  private cache: Map<string, MemoryEntry> = new Map();
  private accessLog: Array<{ key: string; hit: boolean; timestamp: number }> = [];
  
  // Configuration
  private readonly maxEntries = 50;
  private readonly maxAge = 5 * 60 * 1000; // 5 minutes
  private readonly maxFileSize = 100 * 1024; // 100KB max per file
  
  // Stats tracking
  private hits = 0;
  private misses = 0;

  /**
   * Generate a unique cache key
   */
  private makeKey(type: MemoryEntry['type'], identifier: string): string {
    return `${type}:${identifier}`;
  }

  /**
   * Simple hash function for content comparison
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Check if a file has been recently read and return cached content
   */
  getFileContent(path: string): string | null {
    const key = this.makeKey('file_read', path);
    const entry = this.cache.get(key);
    
    if (entry && (Date.now() - entry.timestamp) < this.maxAge) {
      this.hits++;
      this.accessLog.push({ key, hit: true, timestamp: Date.now() });
      console.log(`[STM] ✅ Cache HIT for file: ${path}`);
      return entry.content;
    }
    
    this.misses++;
    this.accessLog.push({ key, hit: false, timestamp: Date.now() });
    console.log(`[STM] ❌ Cache MISS for file: ${path}`);
    return null;
  }

  /**
   * Cache file content after reading
   */
  cacheFileRead(path: string, content: string): void {
    if (content.length > this.maxFileSize) {
      console.log(`[STM] ⚠️ File too large to cache: ${path} (${content.length} bytes)`);
      return;
    }
    
    const key = this.makeKey('file_read', path);
    this.cache.set(key, {
      type: 'file_read',
      key: path,
      content,
      timestamp: Date.now(),
      hash: this.hashContent(content)
    });
    
    this.enforceLimit();
    console.log(`[STM] 📦 Cached file: ${path} (${content.length} bytes)`);
  }

  /**
   * Update cache when a file is written
   */
  recordFileWrite(path: string, content: string): void {
    const readKey = this.makeKey('file_read', path);
    const writeKey = this.makeKey('file_write', path);
    
    // Update the read cache with new content
    this.cache.set(readKey, {
      type: 'file_read',
      key: path,
      content,
      timestamp: Date.now(),
      hash: this.hashContent(content)
    });
    
    // Track the write
    this.cache.set(writeKey, {
      type: 'file_write',
      key: path,
      content: content.substring(0, 500), // Just preview for writes
      timestamp: Date.now(),
      hash: this.hashContent(content),
      metadata: { fullLength: content.length }
    });
    
    this.enforceLimit();
    console.log(`[STM] ✏️ Recorded file write: ${path}`);
  }

  /**
   * Check if we recently wrote to a file (for repetition detection)
   */
  wasRecentlyWritten(path: string): { written: boolean; count: number; lastHash?: string } {
    const key = this.makeKey('file_write', path);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return { written: false, count: 0 };
    }
    
    // Count how many times in the access log
    const recentWrites = this.accessLog.filter(
      log => log.key === key && 
      (Date.now() - log.timestamp) < 60000 // Last minute
    ).length;
    
    return {
      written: true,
      count: recentWrites,
      lastHash: entry.hash
    };
  }

  /**
   * Check if content has changed since last read
   */
  hasFileChanged(path: string, newContent: string): boolean {
    const key = this.makeKey('file_read', path);
    const entry = this.cache.get(key);
    
    if (!entry) return true; // Unknown = assume changed
    
    const newHash = this.hashContent(newContent);
    return entry.hash !== newHash;
  }

  /**
   * Cache search results
   */
  cacheSearchResult(query: string, results: any): void {
    const key = this.makeKey('search', query);
    this.cache.set(key, {
      type: 'search',
      key: query,
      content: JSON.stringify(results),
      timestamp: Date.now()
    });
    this.enforceLimit();
  }

  /**
   * Get cached search results
   */
  getSearchResult(query: string): any | null {
    const key = this.makeKey('search', query);
    const entry = this.cache.get(key);
    
    if (entry && (Date.now() - entry.timestamp) < this.maxAge) {
      this.hits++;
      try {
        return JSON.parse(entry.content);
      } catch {
        return null;
      }
    }
    
    this.misses++;
    return null;
  }

  /**
   * Get a summary of recent actions for context
   */
  getRecentActionsSummary(): string {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
    
    if (entries.length === 0) {
      return 'No recent actions.';
    }
    
    const lines: string[] = [];
    
    for (const entry of entries) {
      const ago = Math.round((Date.now() - entry.timestamp) / 1000);
      const agoStr = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
      
      switch (entry.type) {
        case 'file_read':
          lines.push(`📖 Read ${entry.key} (${agoStr})`);
          break;
        case 'file_write':
          lines.push(`✏️ Wrote ${entry.key} (${agoStr})`);
          break;
        case 'search':
          lines.push(`🔍 Searched "${entry.key}" (${agoStr})`);
          break;
        case 'command_run':
          lines.push(`⚡ Ran command (${agoStr})`);
          break;
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Get list of files we've already read this session
   */
  getReadFiles(): string[] {
    return Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.type === 'file_read')
      .map(([_, entry]) => entry.key);
  }

  /**
   * Get stats about memory usage
   */
  getStats(): MemoryStats {
    let bytesCached = 0;
    let fileReads = 0;
    let fileWrites = 0;
    let commands = 0;
    let searches = 0;
    
    for (const entry of this.cache.values()) {
      bytesCached += entry.content.length;
      switch (entry.type) {
        case 'file_read': fileReads++; break;
        case 'file_write': fileWrites++; break;
        case 'command_run': commands++; break;
        case 'search': searches++; break;
      }
    }
    
    return {
      totalEntries: this.cache.size,
      fileReads,
      fileWrites,
      commands,
      searches,
      hitRate: this.hits + this.misses > 0 
        ? this.hits / (this.hits + this.misses) 
        : 0,
      bytesCached
    };
  }

  /**
   * Enforce cache size limits using LRU eviction
   */
  private enforceLimit(): void {
    if (this.cache.size <= this.maxEntries) return;
    
    // Sort by timestamp (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest entries until we're under limit
    while (this.cache.size > this.maxEntries && entries.length > 0) {
      const [key] = entries.shift()!;
      this.cache.delete(key);
    }
    
    console.log(`[STM] 🧹 Evicted old entries, now at ${this.cache.size}`);
  }

  /**
   * Clear old entries (called periodically)
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    // Trim access log
    this.accessLog = this.accessLog.filter(
      log => now - log.timestamp < this.maxAge
    );
    
    if (removed > 0) {
      console.log(`[STM] 🧹 Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Clear all memory (e.g., when switching workspaces)
   */
  clear(): void {
    this.cache.clear();
    this.accessLog = [];
    this.hits = 0;
    this.misses = 0;
    this.stopCleanupTimer();
    console.log('[STM] 🗑️ Memory cleared');
  }

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  startCleanupTimer(intervalMs: number = 60_000): void {
    this.stopCleanupTimer();
    this.cleanupTimer = setInterval(() => this.cleanup(), intervalMs);
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// Singleton instance
export const shortTermMemory = new ShortTermMemory();
shortTermMemory.startCleanupTimer();

