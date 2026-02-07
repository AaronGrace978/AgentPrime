/**
 * Matrix Mode Session Manager
 * Session isolation and management for multi-channel conversations
 */

import { randomUUID } from 'crypto';
import { Session, MemoryEntry, SessionFilter } from './types';
import { MemoryStore, getMemoryStore } from './memory-store';
import { MemorySearch, getMemorySearch } from './memory-search';
import { MemoryCompaction, getMemoryCompaction } from './memory-compaction';

// Generate UUID using Node.js built-in crypto
function generateId(): string {
  return randomUUID();
}

export interface SessionContext {
  session: Session;
  recentMessages: MemoryEntry[];
  relevantContext: MemoryEntry[];
  compactionSummary?: string;
}

export interface AddMessageOptions {
  generateEmbedding?: boolean;
  metadata?: Record<string, any>;
}

export class SessionManager {
  private store: MemoryStore;
  private search: MemorySearch;
  private compaction: MemoryCompaction;
  private activeSessions: Map<string, Session> = new Map();
  private idleTimeout: number = 30 * 60 * 1000; // 30 minutes
  private idleCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    store?: MemoryStore,
    search?: MemorySearch,
    compaction?: MemoryCompaction
  ) {
    this.store = store || getMemoryStore();
    this.search = search || getMemorySearch();
    this.compaction = compaction || getMemoryCompaction();
  }

  /**
   * Initialize the session manager
   */
  async initialize(): Promise<void> {
    await this.store.initialize();
    
    // Load active sessions
    const activeSessions = await this.store.getSessions({ status: 'active' });
    for (const session of activeSessions) {
      this.activeSessions.set(session.id, session);
    }

    // Start idle check
    this.startIdleCheck();

    console.log(`[SessionManager] Initialized with ${activeSessions.length} active sessions`);
  }

  /**
   * Start periodic idle session check
   */
  private startIdleCheck(): void {
    if (this.idleCheckInterval) return;

    this.idleCheckInterval = setInterval(async () => {
      await this.markIdleSessions();
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  /**
   * Stop idle check
   */
  stopIdleCheck(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  /**
   * Mark sessions as idle if inactive
   */
  private async markIdleSessions(): Promise<void> {
    const now = Date.now();
    
    for (const [sessionId, session] of this.activeSessions) {
      if (now - session.lastActivityAt > this.idleTimeout) {
        await this.store.updateSession(sessionId, { status: 'idle' });
        session.status = 'idle';
        console.log(`[SessionManager] Session ${sessionId} marked as idle`);
      }
    }
  }

  /**
   * Get or create a session for a channel/user combination
   */
  async getOrCreateSession(
    channelId: string,
    channelType: string,
    userId?: string
  ): Promise<Session> {
    // Look for existing active session
    const existingSession = await this.findSession(channelId, channelType, userId);
    
    if (existingSession) {
      // Reactivate if idle
      if (existingSession.status === 'idle') {
        await this.store.updateSession(existingSession.id, { 
          status: 'active',
          lastActivityAt: Date.now()
        });
        existingSession.status = 'active';
        existingSession.lastActivityAt = Date.now();
      }
      
      this.activeSessions.set(existingSession.id, existingSession);
      return existingSession;
    }

    // Create new session
    return this.createSession(channelId, channelType, userId);
  }

  /**
   * Create a new session
   */
  async createSession(
    channelId: string,
    channelType: string,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<Session> {
    const now = Date.now();
    
    const session: Omit<Session, 'messageCount'> = {
      id: generateId(),
      channelId,
      channelType,
      userId,
      startedAt: now,
      lastActivityAt: now,
      metadata,
      status: 'active'
    };

    const createdSession = await this.store.createSession(session);
    this.activeSessions.set(createdSession.id, createdSession);

    console.log(`[SessionManager] Created session ${createdSession.id} for ${channelType}:${channelId}`);
    return createdSession;
  }

  /**
   * Find an existing session
   */
  async findSession(
    channelId: string,
    channelType: string,
    userId?: string
  ): Promise<Session | null> {
    // Check cache first
    for (const session of this.activeSessions.values()) {
      if (
        session.channelId === channelId &&
        session.channelType === channelType &&
        (!userId || session.userId === userId)
      ) {
        return session;
      }
    }

    // Check database
    const sessions = await this.store.getSessions({
      channelId,
      channelType,
      userId,
      limit: 1
    });

    return sessions[0] || null;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    // Check cache
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    return this.store.getSession(sessionId);
  }

  /**
   * List sessions with optional filters
   */
  async listSessions(filter: SessionFilter = {}): Promise<Session[]> {
    return this.store.getSessions(filter);
  }

  /**
   * Add a message to a session
   */
  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    options: AddMessageOptions = {}
  ): Promise<MemoryEntry> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const entry: MemoryEntry = {
      id: generateId(),
      sessionId,
      channelId: session.channelId,
      role,
      content,
      timestamp: Date.now(),
      metadata: options.metadata
    };

    // Generate embedding if requested
    if (options.generateEmbedding) {
      await this.search.indexEntry(entry);
    }

    // Store entry
    await this.store.addEntry(entry);

    // Update session in cache
    if (this.activeSessions.has(sessionId)) {
      const cached = this.activeSessions.get(sessionId)!;
      cached.lastActivityAt = entry.timestamp;
      cached.messageCount++;
    }

    return entry;
  }

  /**
   * Get full session context for AI
   */
  async getSessionContext(
    sessionId: string,
    currentMessage?: string,
    options: {
      maxRecentMessages?: number;
      maxContextEntries?: number;
      maxTokens?: number;
    } = {}
  ): Promise<SessionContext> {
    const { maxRecentMessages = 20, maxContextEntries = 5, maxTokens = 4000 } = options;

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Get recent messages
    const recentMessages = await this.store.getRecentEntries(sessionId, maxRecentMessages);

    // Get relevant context via semantic search
    let relevantContext: MemoryEntry[] = [];
    if (currentMessage) {
      relevantContext = await this.search.getRelevantContext(
        currentMessage,
        sessionId,
        { maxEntries: maxContextEntries }
      );
      
      // Filter out entries already in recent messages
      const recentIds = new Set(recentMessages.map(m => m.id));
      relevantContext = relevantContext.filter(e => !recentIds.has(e.id));
    }

    // Get compaction summary if exists
    const compactionHistory = await this.compaction.getCompactionHistory(sessionId);
    const compactionSummary = compactionHistory.length > 0 
      ? compactionHistory[compactionHistory.length - 1].content 
      : undefined;

    return {
      session,
      recentMessages,
      relevantContext,
      compactionSummary
    };
  }

  /**
   * Build message array for AI from session context
   */
  buildMessagesForAI(
    context: SessionContext,
    systemPrompt?: string
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // Add system prompt
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add compaction summary as context
    if (context.compactionSummary) {
      messages.push({
        role: 'system',
        content: `Previous conversation context:\n${context.compactionSummary}`
      });
    }

    // Add relevant context
    if (context.relevantContext.length > 0) {
      const contextStr = context.relevantContext
        .map(e => `[${e.role}]: ${e.content}`)
        .join('\n');
      messages.push({
        role: 'system',
        content: `Relevant context from earlier:\n${contextStr}`
      });
    }

    // Add recent messages
    for (const entry of context.recentMessages) {
      if (entry.role === 'system' && entry.metadata?.type === 'compaction_summary') {
        continue; // Skip compaction summaries in message flow
      }
      messages.push({
        role: entry.role,
        content: entry.content
      });
    }

    return messages;
  }

  /**
   * Archive a session
   */
  async archiveSession(sessionId: string): Promise<void> {
    await this.store.updateSession(sessionId, { status: 'archived' });
    this.activeSessions.delete(sessionId);
    console.log(`[SessionManager] Session ${sessionId} archived`);
  }

  /**
   * Clear a session's history
   */
  async clearSession(sessionId: string): Promise<void> {
    const entries = await this.store.getEntries({ sessionId });
    await this.store.deleteEntries(entries.map(e => e.id));
    
    await this.store.updateSession(sessionId, { 
      messageCount: 0,
      lastActivityAt: Date.now()
    });

    console.log(`[SessionManager] Session ${sessionId} cleared`);
  }

  /**
   * Search across all sessions
   */
  async searchAllSessions(
    query: string,
    options: {
      channelId?: string;
      limit?: number;
    } = {}
  ): Promise<Array<{ session: Session; entries: MemoryEntry[] }>> {
    const searchResults = await this.search.search(query, {
      channelId: options.channelId,
      limit: options.limit || 20
    });

    // Group by session
    const bySession = new Map<string, MemoryEntry[]>();
    for (const result of searchResults) {
      const entries = bySession.get(result.entry.sessionId) || [];
      entries.push(result.entry);
      bySession.set(result.entry.sessionId, entries);
    }

    // Get session info
    const results: Array<{ session: Session; entries: MemoryEntry[] }> = [];
    for (const [sessionId, entries] of bySession) {
      const session = await this.getSession(sessionId);
      if (session) {
        results.push({ session, entries });
      }
    }

    return results;
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    activeSessions: number;
    idleSessions: number;
    totalMessages: number;
    messagesByChannel: Record<string, number>;
  }> {
    const memoryStats = await this.store.getStats();
    const allSessions = await this.store.getSessions({});

    const activeSessions = allSessions.filter(s => s.status === 'active').length;
    const idleSessions = allSessions.filter(s => s.status === 'idle').length;

    return {
      activeSessions,
      idleSessions,
      totalMessages: memoryStats.totalEntries,
      messagesByChannel: memoryStats.entriesByChannel
    };
  }

  /**
   * Compact sessions that need it
   */
  async compactIfNeeded(sessionId: string): Promise<boolean> {
    if (await this.compaction.needsCompaction(sessionId)) {
      await this.compaction.compactSession(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Cleanup old sessions and data
   */
  async cleanup(retentionDays: number = 90): Promise<{
    deletedEntries: number;
    archivedSessions: number;
  }> {
    // Delete old entries
    const deletedEntries = await this.store.cleanup(retentionDays);

    // Archive old idle sessions
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const oldSessions = await this.store.getSessions({ status: 'idle' });
    
    let archivedSessions = 0;
    for (const session of oldSessions) {
      if (session.lastActivityAt < cutoff) {
        await this.archiveSession(session.id);
        archivedSessions++;
      }
    }

    console.log(`[SessionManager] Cleanup: ${deletedEntries} entries deleted, ${archivedSessions} sessions archived`);

    return { deletedEntries, archivedSessions };
  }

  /**
   * Close and cleanup
   */
  async close(): Promise<void> {
    this.stopIdleCheck();
    this.store.close();
    this.activeSessions.clear();
  }
}

// Singleton instance
let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}

export default SessionManager;
