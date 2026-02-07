/**
 * Matrix Mode Memory Store
 * SQLite-based persistent storage for conversation memory
 * 
 * Enhanced with:
 * - LRU caching for sessions and entries
 * - Query result caching with TTL
 * - Batch operations for performance
 * - Connection pooling support
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { 
  MemoryEntry, 
  Session, 
  MemoryStats, 
  MemoryConfig, 
  DEFAULT_MEMORY_CONFIG,
  MemoryFilter,
  SessionFilter
} from './types';

// Dynamic import for better-sqlite3 (optional dependency)
let Database: any = null;

interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): any;
  close(): void;
}

// ============================================================================
// LRU CACHE IMPLEMENTATION
// ============================================================================

interface CacheEntry<T> {
  value: T;
  accessTime: number;
  insertTime: number;
}

/**
 * Generic LRU cache with TTL support
 */
class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number = 500, ttlMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.insertTime > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    entry.accessTime = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      accessTime: Date.now(),
      insertTime: Date.now()
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check TTL
    if (Date.now() - entry.insertTime > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate entries matching a prefix
   */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessTime < oldestTime) {
        oldestTime = entry.accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  getStats(): { size: number; maxSize: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }
}

/**
 * Query result cache for expensive operations
 */
class QueryCache {
  private cache: LRUCache<any>;

  constructor(maxSize: number = 200, ttlMs: number = 60 * 1000) {
    this.cache = new LRUCache(maxSize, ttlMs);
  }

  /**
   * Generate cache key from filter parameters
   */
  private generateKey(prefix: string, filter: Record<string, any>): string {
    const sortedKeys = Object.keys(filter).sort();
    const parts = sortedKeys.map(k => `${k}:${filter[k]}`);
    return `${prefix}:${parts.join('|')}`;
  }

  get<T>(prefix: string, filter: Record<string, any>): T | undefined {
    return this.cache.get(this.generateKey(prefix, filter));
  }

  set<T>(prefix: string, filter: Record<string, any>, value: T): void {
    this.cache.set(this.generateKey(prefix, filter), value);
  }

  invalidate(prefix: string): number {
    return this.cache.invalidatePrefix(prefix);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return this.cache.getStats();
  }
}

export class MemoryStore {
  private db: SQLiteDatabase | null = null;
  private config: MemoryConfig;
  private initialized: boolean = false;

  // Caching layers
  private sessionCache: LRUCache<Session>;
  private entryCache: LRUCache<MemoryEntry>;
  private queryCache: QueryCache;
  private recentEntriesCache: LRUCache<MemoryEntry[]>;

  // Prepared statements cache
  private preparedStatements: Map<string, any> = new Map();

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    
    // Set default db path if not provided
    if (!this.config.dbPath) {
      const userDataPath = app?.getPath?.('userData') || process.cwd();
      this.config.dbPath = path.join(userDataPath, 'matrix-memory.db');
    }

    // Initialize caches
    this.sessionCache = new LRUCache<Session>(200, 10 * 60 * 1000); // 10 min TTL
    this.entryCache = new LRUCache<MemoryEntry>(1000, 5 * 60 * 1000); // 5 min TTL
    this.queryCache = new QueryCache(100, 30 * 1000); // 30 sec TTL for query results
    this.recentEntriesCache = new LRUCache<MemoryEntry[]>(50, 10 * 1000); // 10 sec TTL
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Try to load better-sqlite3
      Database = require('better-sqlite3');
    } catch (err) {
      console.warn('[MemoryStore] better-sqlite3 not available, using in-memory fallback');
      this.initializeFallback();
      this.initialized = true;
      return;
    }

    // Ensure directory exists
    const dbDir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.config.dbPath);
    
    // Enable WAL mode for better concurrent access
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA cache_size = 10000');
    
    this.createTables();
    this.prepareCachedStatements();
    this.initialized = true;
    console.log('[MemoryStore] Initialized SQLite database with caching at:', this.config.dbPath);
  }

  private fallbackMemory: MemoryEntry[] = [];
  private fallbackSessions: Session[] = [];

  private initializeFallback(): void {
    // In-memory fallback when SQLite is not available
    this.fallbackMemory = [];
    this.fallbackSessions = [];
  }

  /**
   * Prepare commonly used statements for performance
   */
  private prepareCachedStatements(): void {
    if (!this.db) return;

    this.preparedStatements.set('getSession', 
      this.db.prepare('SELECT * FROM sessions WHERE id = ?'));
    
    this.preparedStatements.set('getEntry',
      this.db.prepare('SELECT * FROM memory_entries WHERE id = ?'));
    
    this.preparedStatements.set('getRecentEntries',
      this.db.prepare(`
        SELECT * FROM memory_entries 
        WHERE session_id = ? AND compacted = 0
        ORDER BY timestamp DESC 
        LIMIT ?
      `));
    
    this.preparedStatements.set('insertEntry',
      this.db.prepare(`
        INSERT INTO memory_entries (id, session_id, channel_id, role, content, timestamp, metadata, embedding, compacted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `));
    
    this.preparedStatements.set('updateSessionActivity',
      this.db.prepare(`
        UPDATE sessions 
        SET message_count = message_count + 1, last_activity_at = ?
        WHERE id = ?
      `));
  }

  /**
   * Get a prepared statement
   */
  private getStatement(name: string): any {
    return this.preparedStatements.get(name);
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        user_id TEXT,
        started_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0,
        metadata TEXT,
        status TEXT DEFAULT 'active'
      );

      -- Memory entries table
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        embedding BLOB,
        compacted INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      -- Indexes for fast queries
      CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_entries(session_id);
      CREATE INDEX IF NOT EXISTS idx_memory_channel ON memory_entries(channel_id);
      CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

      -- Compaction summaries table
      CREATE TABLE IF NOT EXISTS compaction_summaries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        original_count INTEGER NOT NULL,
        compacted_count INTEGER NOT NULL,
        tokens_reduced INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
    `);
  }

  // Session management
  async createSession(session: Omit<Session, 'messageCount'>): Promise<Session> {
    const fullSession: Session = { ...session, messageCount: 0 };

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO sessions (id, channel_id, channel_type, user_id, started_at, last_activity_at, message_count, metadata, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        session.id,
        session.channelId,
        session.channelType,
        session.userId || null,
        session.startedAt,
        session.lastActivityAt,
        0,
        session.metadata ? JSON.stringify(session.metadata) : null,
        session.status
      );
    } else {
      this.fallbackSessions.push(fullSession);
    }

    // Add to cache
    this.sessionCache.set(session.id, fullSession);
    
    // Invalidate query cache for sessions
    this.queryCache.invalidate('sessions');

    return fullSession;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      return cached;
    }

    let session: Session | null = null;

    if (this.db) {
      const stmt = this.getStatement('getSession') || this.db.prepare('SELECT * FROM sessions WHERE id = ?');
      const row = stmt.get(sessionId);
      session = row ? this.rowToSession(row) : null;
    } else {
      session = this.fallbackSessions.find(s => s.id === sessionId) || null;
    }

    // Cache the result
    if (session) {
      this.sessionCache.set(sessionId, session);
    }

    return session;
  }

  async getSessions(filter: SessionFilter = {}): Promise<Session[]> {
    if (this.db) {
      let query = 'SELECT * FROM sessions WHERE 1=1';
      const params: any[] = [];

      if (filter.channelId) {
        query += ' AND channel_id = ?';
        params.push(filter.channelId);
      }
      if (filter.channelType) {
        query += ' AND channel_type = ?';
        params.push(filter.channelType);
      }
      if (filter.userId) {
        query += ' AND user_id = ?';
        params.push(filter.userId);
      }
      if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter.since) {
        query += ' AND last_activity_at >= ?';
        params.push(filter.since);
      }

      query += ' ORDER BY last_activity_at DESC';

      if (filter.limit) {
        query += ' LIMIT ?';
        params.push(filter.limit);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params);
      return rows.map((r: any) => this.rowToSession(r));
    } else {
      let sessions = [...this.fallbackSessions];
      
      if (filter.channelId) sessions = sessions.filter(s => s.channelId === filter.channelId);
      if (filter.channelType) sessions = sessions.filter(s => s.channelType === filter.channelType);
      if (filter.userId) sessions = sessions.filter(s => s.userId === filter.userId);
      if (filter.status) sessions = sessions.filter(s => s.status === filter.status);
      if (filter.since) sessions = sessions.filter(s => s.lastActivityAt >= filter.since!);
      
      sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
      
      if (filter.limit) sessions = sessions.slice(0, filter.limit);
      
      return sessions;
    }
  }

  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    if (this.db) {
      const fields: string[] = [];
      const params: any[] = [];

      if (updates.lastActivityAt !== undefined) {
        fields.push('last_activity_at = ?');
        params.push(updates.lastActivityAt);
      }
      if (updates.messageCount !== undefined) {
        fields.push('message_count = ?');
        params.push(updates.messageCount);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        params.push(updates.status);
      }
      if (updates.metadata !== undefined) {
        fields.push('metadata = ?');
        params.push(JSON.stringify(updates.metadata));
      }

      if (fields.length > 0) {
        params.push(sessionId);
        const stmt = this.db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...params);
      }
    } else {
      const session = this.fallbackSessions.find(s => s.id === sessionId);
      if (session) {
        Object.assign(session, updates);
      }
    }

    // Invalidate caches
    this.sessionCache.delete(sessionId);
    this.queryCache.invalidate('sessions');
  }

  // Memory entry management
  async addEntry(entry: MemoryEntry): Promise<void> {
    if (this.db) {
      // Use prepared statement for better performance
      const insertStmt = this.getStatement('insertEntry') || this.db.prepare(`
        INSERT INTO memory_entries (id, session_id, channel_id, role, content, timestamp, metadata, embedding, compacted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        entry.id,
        entry.sessionId,
        entry.channelId,
        entry.role,
        entry.content,
        entry.timestamp,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.embedding ? Buffer.from(new Float32Array(entry.embedding).buffer) : null,
        entry.compacted ? 1 : 0
      );

      // Update session message count and activity
      const updateStmt = this.getStatement('updateSessionActivity') || this.db.prepare(`
        UPDATE sessions 
        SET message_count = message_count + 1, last_activity_at = ?
        WHERE id = ?
      `);
      updateStmt.run(entry.timestamp, entry.sessionId);
    } else {
      this.fallbackMemory.push(entry);
      const session = this.fallbackSessions.find(s => s.id === entry.sessionId);
      if (session) {
        session.messageCount++;
        session.lastActivityAt = entry.timestamp;
      }
    }

    // Cache the entry
    this.entryCache.set(entry.id, entry);
    
    // Invalidate related caches
    this.queryCache.invalidate('entries');
    this.recentEntriesCache.delete(entry.sessionId);
    this.sessionCache.delete(entry.sessionId);
  }

  /**
   * Add multiple entries in a batch (much faster for bulk inserts)
   */
  async addEntriesBatch(entries: MemoryEntry[]): Promise<void> {
    if (entries.length === 0) return;

    if (this.db) {
      const insertStmt = this.getStatement('insertEntry') || this.db.prepare(`
        INSERT INTO memory_entries (id, session_id, channel_id, role, content, timestamp, metadata, embedding, compacted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Use transaction for batch insert
      const insertMany = this.db.transaction((entries: MemoryEntry[]) => {
        for (const entry of entries) {
          insertStmt.run(
            entry.id,
            entry.sessionId,
            entry.channelId,
            entry.role,
            entry.content,
            entry.timestamp,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            entry.embedding ? Buffer.from(new Float32Array(entry.embedding).buffer) : null,
            entry.compacted ? 1 : 0
          );
        }
      });

      insertMany(entries);

      // Update session counts
      const sessionCounts = new Map<string, { count: number; lastActivity: number }>();
      for (const entry of entries) {
        const existing = sessionCounts.get(entry.sessionId) || { count: 0, lastActivity: 0 };
        existing.count++;
        existing.lastActivity = Math.max(existing.lastActivity, entry.timestamp);
        sessionCounts.set(entry.sessionId, existing);
      }

      for (const [sessionId, { count, lastActivity }] of sessionCounts) {
        const updateStmt = this.db.prepare(`
          UPDATE sessions 
          SET message_count = message_count + ?, last_activity_at = ?
          WHERE id = ?
        `);
        updateStmt.run(count, lastActivity, sessionId);
      }
    } else {
      this.fallbackMemory.push(...entries);
      for (const entry of entries) {
        const session = this.fallbackSessions.find(s => s.id === entry.sessionId);
        if (session) {
          session.messageCount++;
          session.lastActivityAt = entry.timestamp;
        }
      }
    }

    // Cache entries and invalidate queries
    for (const entry of entries) {
      this.entryCache.set(entry.id, entry);
      this.recentEntriesCache.delete(entry.sessionId);
      this.sessionCache.delete(entry.sessionId);
    }
    this.queryCache.invalidate('entries');
    
    console.log(`[MemoryStore] Batch inserted ${entries.length} entries`);
  }

  async getEntries(filter: MemoryFilter = {}): Promise<MemoryEntry[]> {
    if (this.db) {
      let query = 'SELECT * FROM memory_entries WHERE 1=1';
      const params: any[] = [];

      if (filter.sessionId) {
        query += ' AND session_id = ?';
        params.push(filter.sessionId);
      }
      if (filter.channelId) {
        query += ' AND channel_id = ?';
        params.push(filter.channelId);
      }
      if (filter.role) {
        query += ' AND role = ?';
        params.push(filter.role);
      }
      if (filter.since) {
        query += ' AND timestamp >= ?';
        params.push(filter.since);
      }
      if (filter.until) {
        query += ' AND timestamp <= ?';
        params.push(filter.until);
      }
      if (!filter.includeCompacted) {
        query += ' AND compacted = 0';
      }

      query += ' ORDER BY timestamp ASC';

      if (filter.limit) {
        query += ' LIMIT ?';
        params.push(filter.limit);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params);
      return rows.map((r: any) => this.rowToEntry(r));
    } else {
      let entries = [...this.fallbackMemory];
      
      if (filter.sessionId) entries = entries.filter(e => e.sessionId === filter.sessionId);
      if (filter.channelId) entries = entries.filter(e => e.channelId === filter.channelId);
      if (filter.role) entries = entries.filter(e => e.role === filter.role);
      if (filter.since) entries = entries.filter(e => e.timestamp >= filter.since!);
      if (filter.until) entries = entries.filter(e => e.timestamp <= filter.until!);
      if (!filter.includeCompacted) entries = entries.filter(e => !e.compacted);
      
      entries.sort((a, b) => a.timestamp - b.timestamp);
      
      if (filter.limit) entries = entries.slice(0, filter.limit);
      
      return entries;
    }
  }

  async getRecentEntries(sessionId: string, limit: number = 20): Promise<MemoryEntry[]> {
    // Check cache for recent entries (only cache for default limit)
    const cacheKey = `${sessionId}:${limit}`;
    if (limit <= 50) {
      const cached = this.recentEntriesCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let entries: MemoryEntry[];

    if (this.db) {
      const stmt = this.getStatement('getRecentEntries') || this.db.prepare(`
        SELECT * FROM memory_entries 
        WHERE session_id = ? AND compacted = 0
        ORDER BY timestamp DESC 
        LIMIT ?
      `);
      const rows = stmt.all(sessionId, limit);
      entries = rows.map((r: any) => this.rowToEntry(r)).reverse();
    } else {
      entries = this.fallbackMemory
        .filter(e => e.sessionId === sessionId && !e.compacted)
        .slice(-limit);
    }

    // Cache result for common queries
    if (limit <= 50) {
      this.recentEntriesCache.set(cacheKey, entries);
    }

    return entries;
  }

  async markAsCompacted(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;

    if (this.db) {
      const placeholders = entryIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`UPDATE memory_entries SET compacted = 1 WHERE id IN (${placeholders})`);
      stmt.run(...entryIds);
    } else {
      for (const id of entryIds) {
        const entry = this.fallbackMemory.find(e => e.id === id);
        if (entry) entry.compacted = true;
      }
    }

    // Invalidate caches
    for (const id of entryIds) {
      this.entryCache.delete(id);
    }
    this.queryCache.invalidate('entries');
    // Clear all recent entries caches since compaction affects them
    this.recentEntriesCache.clear();
  }

  async deleteEntries(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;

    if (this.db) {
      const placeholders = entryIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`DELETE FROM memory_entries WHERE id IN (${placeholders})`);
      stmt.run(...entryIds);
    } else {
      this.fallbackMemory = this.fallbackMemory.filter(e => !entryIds.includes(e.id));
    }

    // Invalidate caches
    for (const id of entryIds) {
      this.entryCache.delete(id);
    }
    this.queryCache.invalidate('entries');
    this.recentEntriesCache.clear();
  }

  // Stats
  async getStats(): Promise<MemoryStats> {
    if (this.db) {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM memory_entries');
      const sessionsStmt = this.db.prepare('SELECT COUNT(*) as count FROM sessions');
      const minMaxStmt = this.db.prepare('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM memory_entries');
      const byChannelStmt = this.db.prepare('SELECT channel_id, COUNT(*) as count FROM memory_entries GROUP BY channel_id');

      const count = countStmt.get() as { count: number };
      const sessions = sessionsStmt.get() as { count: number };
      const minMax = minMaxStmt.get() as { oldest: number; newest: number };
      const byChannel = byChannelStmt.all() as { channel_id: string; count: number }[];

      const entriesByChannel: Record<string, number> = {};
      for (const row of byChannel) {
        entriesByChannel[row.channel_id] = row.count;
      }

      return {
        totalEntries: count.count,
        totalSessions: sessions.count,
        totalTokens: 0, // Would need to calculate from content
        oldestEntry: minMax.oldest || 0,
        newestEntry: minMax.newest || 0,
        entriesByChannel
      };
    } else {
      const entriesByChannel: Record<string, number> = {};
      for (const entry of this.fallbackMemory) {
        entriesByChannel[entry.channelId] = (entriesByChannel[entry.channelId] || 0) + 1;
      }

      const timestamps = this.fallbackMemory.map(e => e.timestamp);

      return {
        totalEntries: this.fallbackMemory.length,
        totalSessions: this.fallbackSessions.length,
        totalTokens: 0,
        oldestEntry: Math.min(...timestamps) || 0,
        newestEntry: Math.max(...timestamps) || 0,
        entriesByChannel
      };
    }
  }

  // Cleanup
  async cleanup(retentionDays?: number): Promise<number> {
    const days = retentionDays || this.config.retentionDays;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    if (this.db) {
      const stmt = this.db.prepare('DELETE FROM memory_entries WHERE timestamp < ?');
      const result = stmt.run(cutoff);
      return result.changes;
    } else {
      const before = this.fallbackMemory.length;
      this.fallbackMemory = this.fallbackMemory.filter(e => e.timestamp >= cutoff);
      return before - this.fallbackMemory.length;
    }
  }

  // Close database
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.clearAllCaches();
    this.preparedStatements.clear();
    this.initialized = false;
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.sessionCache.clear();
    this.entryCache.clear();
    this.queryCache.clear();
    this.recentEntriesCache.clear();
    console.log('[MemoryStore] All caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    sessions: ReturnType<LRUCache<Session>['getStats']>;
    entries: ReturnType<LRUCache<MemoryEntry>['getStats']>;
    queries: ReturnType<QueryCache['getStats']>;
    recentEntries: ReturnType<LRUCache<MemoryEntry[]>['getStats']>;
  } {
    return {
      sessions: this.sessionCache.getStats(),
      entries: this.entryCache.getStats(),
      queries: this.queryCache.getStats(),
      recentEntries: this.recentEntriesCache.getStats()
    };
  }

  /**
   * Warm up caches with frequently accessed data
   */
  async warmCaches(sessionIds?: string[]): Promise<void> {
    if (!this.db) return;

    // Get active sessions
    const sessions = await this.getSessions({ status: 'active', limit: 20 });
    
    for (const session of sessions) {
      this.sessionCache.set(session.id, session);
      
      // Pre-load recent entries for specified sessions or all active
      if (!sessionIds || sessionIds.includes(session.id)) {
        await this.getRecentEntries(session.id, 20);
      }
    }

    console.log(`[MemoryStore] Warmed caches with ${sessions.length} sessions`);
  }

  // Helper methods
  private rowToSession(row: any): Session {
    return {
      id: row.id,
      channelId: row.channel_id,
      channelType: row.channel_type,
      userId: row.user_id || undefined,
      startedAt: row.started_at,
      lastActivityAt: row.last_activity_at,
      messageCount: row.message_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      status: row.status
    };
  }

  private rowToEntry(row: any): MemoryEntry {
    let embedding: number[] | undefined;
    if (row.embedding) {
      const buffer = row.embedding as Buffer;
      embedding = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      channelId: row.channel_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      embedding,
      compacted: row.compacted === 1
    };
  }
}

// Singleton instance
let memoryStoreInstance: MemoryStore | null = null;

export function getMemoryStore(config?: Partial<MemoryConfig>): MemoryStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryStore(config);
  }
  return memoryStoreInstance;
}

export default MemoryStore;
