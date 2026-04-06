/**
 * State Manager for AgentPrime
 * Provides persistent state management with memory leak prevention
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: number;
    cost?: number;
  };
}

export interface SessionState {
  id: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  metadata: {
    totalTokens: number;
    totalCost: number;
    messageCount: number;
    lastActivity: number;
  };
}

export interface GlobalState {
  sessions: Record<string, SessionState>;
  settings: Record<string, any>;
  statistics: {
    totalSessions: number;
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
    lastCleanup: number;
  };
}

export class StateManager extends EventEmitter {
  private state: GlobalState;
  private stateFile: string;
  private maxSessions = 100;
  private maxMessagesPerSession = 200; // Long PrimeSpace/Messenger threads (e.g. agent-to-agent) need more history
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor(stateFilePath: string = path.join(process.cwd(), 'data', 'agentprime-state.json')) {
    super();
    this.stateFile = stateFilePath;
    this.state = this.createInitialState();

    // Background timers should not keep tests or short-lived CLI flows alive.
    this.autoSaveInterval = setInterval(() => {
      if (this.isDirty) {
        this.saveState();
      }
    }, 30000);
    this.autoSaveInterval.unref?.();

    // Auto-cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60 * 60 * 1000); // 1 hour
    this.cleanupInterval.unref?.();
  }

  private createInitialState(): GlobalState {
    return {
      sessions: {},
      settings: {},
      statistics: {
        totalSessions: 0,
        totalMessages: 0,
        totalTokens: 0,
        totalCost: 0,
        lastCleanup: Date.now()
      }
    };
  }

  /**
   * Load state from disk
   */
  async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      const loadedState = JSON.parse(data);

      // Merge with default state to handle missing properties
      this.state = {
        ...this.createInitialState(),
        ...loadedState,
        statistics: {
          ...this.createInitialState().statistics,
          ...loadedState.statistics
        }
      };

      console.log(`[StateManager] Loaded state with ${Object.keys(this.state.sessions).length} sessions`);
    } catch (error) {
      console.log('[StateManager] No existing state file, starting fresh');
      this.state = this.createInitialState();
    }
  }

  /**
   * Save state to disk
   */
  private async saveState(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
      await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8');
      this.isDirty = false;
      console.log('[StateManager] State saved to disk');
    } catch (error) {
      console.error('[StateManager] Failed to save state:', error);
    }
  }

  /**
   * Create a new session
   */
  createSession(sessionId?: string): string {
    const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (this.state.sessions[id]) {
      throw new Error(`Session ${id} already exists`);
    }

    const session: SessionState = {
      id,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
        lastActivity: Date.now()
      }
    };

    this.state.sessions[id] = session;
    this.state.statistics.totalSessions++;
    this.isDirty = true;

    this.emit('session-created', session);
    console.log(`[StateManager] Created session: ${id}`);

    return id;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): SessionState | null {
    return this.state.sessions[sessionId] || null;
  }

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, message: Omit<ConversationMessage, 'timestamp'>): void {
    const session = this.state.sessions[sessionId];
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const fullMessage: ConversationMessage = {
      ...message,
      timestamp: Date.now()
    };

    // Limit messages per session to prevent memory leaks
    if (session.messages.length >= this.maxMessagesPerSession) {
      // Remove oldest messages (keep system messages if any)
      const systemMessages = session.messages.filter(m => m.role === 'system');
      const otherMessages = session.messages.filter(m => m.role !== 'system');

      // Keep all system messages + last N-1 other messages
      const messagesToKeep = systemMessages.concat(
        otherMessages.slice(-(this.maxMessagesPerSession - systemMessages.length - 1))
      );

      session.messages = messagesToKeep;
      console.log(`[StateManager] Trimmed session ${sessionId} to ${session.messages.length} messages`);
    }

    session.messages.push(fullMessage);
    session.updatedAt = Date.now();
    session.metadata.lastActivity = Date.now();
    session.metadata.messageCount++;

    // Update statistics
    if (message.metadata) {
      session.metadata.totalTokens += message.metadata.tokens || 0;
      session.metadata.totalCost += message.metadata.cost || 0;
      this.state.statistics.totalTokens += message.metadata.tokens || 0;
      this.state.statistics.totalCost += message.metadata.cost || 0;
    }
    this.state.statistics.totalMessages++;

    this.isDirty = true;
    this.emit('message-added', { sessionId, message: fullMessage });
  }

  /**
   * Get messages for a session
   */
  getMessages(sessionId: string, limit?: number): ConversationMessage[] {
    const session = this.state.sessions[sessionId];
    if (!session) {
      return [];
    }

    const messages = session.messages;
    return limit ? messages.slice(-limit) : messages;
  }

  /**
   * Update session metadata
   */
  updateSessionMetadata(sessionId: string, metadata: Partial<SessionState['metadata']>): void {
    const session = this.state.sessions[sessionId];
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.metadata = { ...session.metadata, ...metadata };
    session.updatedAt = Date.now();
    this.isDirty = true;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    if (!this.state.sessions[sessionId]) {
      return false;
    }

    delete this.state.sessions[sessionId];
    this.isDirty = true;
    this.emit('session-deleted', sessionId);

    console.log(`[StateManager] Deleted session: ${sessionId}`);
    return true;
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Object.keys(this.state.sessions);
  }

  /**
   * Perform cleanup of old/inactive sessions
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const inactiveThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

    const sessionsToDelete: string[] = [];

    for (const [sessionId, session] of Object.entries(this.state.sessions)) {
      const age = now - session.createdAt;
      const inactiveTime = now - session.metadata.lastActivity;

      // Delete sessions older than 30 days OR inactive for 7 days
      if (age > maxAge || inactiveTime > inactiveThreshold) {
        sessionsToDelete.push(sessionId);
      }
    }

    for (const sessionId of sessionsToDelete) {
      this.deleteSession(sessionId);
    }

    if (sessionsToDelete.length > 0) {
      console.log(`[StateManager] Cleaned up ${sessionsToDelete.length} old/inactive sessions`);
    }

    // Limit total sessions
    const sessionIds = Object.keys(this.state.sessions);
    if (sessionIds.length > this.maxSessions) {
      const sessionsToRemove = sessionIds
        .sort((a, b) => this.state.sessions[a].metadata.lastActivity - this.state.sessions[b].metadata.lastActivity)
        .slice(0, sessionIds.length - this.maxSessions);

      for (const sessionId of sessionsToRemove) {
        this.deleteSession(sessionId);
      }

      console.log(`[StateManager] Limited sessions to ${this.maxSessions} (removed ${sessionsToRemove.length})`);
    }

    this.state.statistics.lastCleanup = now;
    await this.saveState();
  }

  /**
   * Get global statistics
   */
  getStatistics() {
    return { ...this.state.statistics };
  }

  /**
   * Get settings
   */
  getSettings(): Record<string, any> {
    return { ...this.state.settings };
  }

  /**
   * Update settings
   */
  updateSettings(settings: Record<string, any>): void {
    this.state.settings = { ...this.state.settings, ...settings };
    this.isDirty = true;
  }

  /**
   * Force save state
   */
  async forceSave(): Promise<void> {
    await this.saveState();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get state summary for debugging
   */
  getSummary() {
    const sessionCount = Object.keys(this.state.sessions).length;
    const totalMessages = Object.values(this.state.sessions).reduce(
      (sum, session) => sum + session.messages.length,
      0
    );

    return {
      sessions: sessionCount,
      totalMessages,
      statistics: this.state.statistics
    };
  }
}

// Singleton instance
export const stateManager = new StateManager();