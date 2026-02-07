/**
 * Matrix Mode Memory System - Type Definitions
 * Persistent memory for cross-session context and semantic search
 */

export interface MemoryEntry {
  id: string;
  sessionId: string;
  channelId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
  embedding?: number[];
  compacted?: boolean;
}

export interface Session {
  id: string;
  channelId: string;
  channelType: string;
  userId?: string;
  startedAt: number;
  lastActivityAt: number;
  messageCount: number;
  metadata?: Record<string, any>;
  status: 'active' | 'idle' | 'archived';
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  distance?: number;
  /** Additional metadata about the search result (e.g., scoring breakdown) */
  metadata?: {
    vectorScore?: number;
    bm25Score?: number;
    method?: 'vector' | 'keyword' | 'hybrid';
    [key: string]: any;
  };
}

export interface CompactionResult {
  originalCount: number;
  compactedCount: number;
  summary: string;
  tokensReduced: number;
}

export interface MemoryStats {
  totalEntries: number;
  totalSessions: number;
  totalTokens: number;
  oldestEntry: number;
  newestEntry: number;
  entriesByChannel: Record<string, number>;
}

export interface MemoryConfig {
  dbPath: string;
  maxEntriesPerSession: number;
  compactionThreshold: number;
  embeddingModel: string;
  maxSearchResults: number;
  retentionDays: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  dbPath: '', // Set at runtime based on userData path
  maxEntriesPerSession: 1000,
  compactionThreshold: 500,
  embeddingModel: 'local', // or 'openai'
  maxSearchResults: 10,
  retentionDays: 90
};

export interface SessionFilter {
  channelId?: string;
  channelType?: string;
  userId?: string;
  status?: Session['status'];
  since?: number;
  limit?: number;
}

export interface MemoryFilter {
  sessionId?: string;
  channelId?: string;
  role?: MemoryEntry['role'];
  since?: number;
  until?: number;
  limit?: number;
  includeCompacted?: boolean;
}
