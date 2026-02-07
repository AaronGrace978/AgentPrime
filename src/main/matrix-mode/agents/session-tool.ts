/**
 * Matrix Mode Session Tool
 * Inter-agent communication and session management
 */

import { AgentMessage, AgentSession, AgentRequest, AgentResponse } from './types';

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface SessionSendOptions {
  timeout?: number;
  waitForReply?: boolean;
  maxPingPong?: number;
}

export interface SessionSendResult {
  messageId: string;
  delivered: boolean;
  reply?: AgentMessage;
  error?: string;
}

export type MessageHandler = (
  session: AgentSession,
  message: AgentMessage
) => Promise<AgentResponse | null>;

export class SessionTool {
  private sessions: Map<string, AgentSession> = new Map();
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private maxSessionMessages: number = 100;
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes

  /**
   * Create or get a session
   */
  getOrCreateSession(
    agentId: string,
    channelId?: string,
    userId?: string
  ): AgentSession {
    const sessionKey = this.getSessionKey(agentId, channelId, userId);
    
    let session = this.sessions.get(sessionKey);
    if (!session) {
      session = {
        id: generateId(),
        agentId,
        channelId,
        userId,
        startedAt: Date.now(),
        lastMessageAt: Date.now(),
        messageCount: 0,
        context: []
      };
      this.sessions.set(sessionKey, session);
    }
    
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Get session key
   */
  private getSessionKey(agentId: string, channelId?: string, userId?: string): string {
    return `${agentId}:${channelId || 'default'}:${userId || 'anonymous'}`;
  }

  /**
   * List sessions
   */
  listSessions(filter?: {
    agentId?: string;
    channelId?: string;
    userId?: string;
    activeMinutes?: number;
  }): AgentSession[] {
    let sessions = Array.from(this.sessions.values());
    
    if (filter?.agentId) {
      sessions = sessions.filter(s => s.agentId === filter.agentId);
    }
    if (filter?.channelId) {
      sessions = sessions.filter(s => s.channelId === filter.channelId);
    }
    if (filter?.userId) {
      sessions = sessions.filter(s => s.userId === filter.userId);
    }
    if (filter?.activeMinutes) {
      const cutoff = Date.now() - (filter.activeMinutes * 60 * 1000);
      sessions = sessions.filter(s => s.lastMessageAt >= cutoff);
    }
    
    return sessions;
  }

  /**
   * Get session history
   */
  getHistory(
    sessionId: string,
    limit?: number,
    includeTools?: boolean
  ): AgentMessage[] {
    const session = this.getSession(sessionId);
    if (!session) return [];
    
    let messages = [...session.context];
    
    if (!includeTools) {
      messages = messages.filter(m => !m.metadata?.isTool);
    }
    
    if (limit) {
      messages = messages.slice(-limit);
    }
    
    return messages;
  }

  /**
   * Add message to session
   */
  addMessage(
    sessionId: string,
    role: AgentMessage['role'],
    content: string,
    metadata?: Record<string, any>
  ): AgentMessage {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const message: AgentMessage = {
      id: generateId(),
      role,
      content,
      agentId: session.agentId,
      timestamp: Date.now(),
      metadata
    };

    session.context.push(message);
    session.lastMessageAt = message.timestamp;
    session.messageCount++;

    // Trim context if too long
    if (session.context.length > this.maxSessionMessages) {
      session.context = session.context.slice(-this.maxSessionMessages);
    }

    return message;
  }

  /**
   * Register a message handler for an agent
   */
  registerHandler(agentId: string, handler: MessageHandler): void {
    this.messageHandlers.set(agentId, handler);
  }

  /**
   * Unregister a message handler
   */
  unregisterHandler(agentId: string): void {
    this.messageHandlers.delete(agentId);
  }

  /**
   * Send message to another session (agent-to-agent)
   */
  async send(
    fromSessionId: string,
    toAgentId: string,
    message: string,
    options: SessionSendOptions = {}
  ): Promise<SessionSendResult> {
    const { timeout = 30000, waitForReply = true, maxPingPong = 3 } = options;
    
    const fromSession = this.getSession(fromSessionId);
    if (!fromSession) {
      return {
        messageId: '',
        delivered: false,
        error: 'Source session not found'
      };
    }

    // Get or create target session
    const toSession = this.getOrCreateSession(
      toAgentId,
      fromSession.channelId,
      `agent:${fromSession.agentId}`
    );

    // Create the message
    const agentMessage = this.addMessage(toSession.id, 'user', message, {
      fromAgentId: fromSession.agentId,
      fromSessionId,
      isAgentToAgent: true
    });

    // Get handler for target agent
    const handler = this.messageHandlers.get(toAgentId);
    if (!handler) {
      return {
        messageId: agentMessage.id,
        delivered: false,
        error: 'No handler registered for target agent'
      };
    }

    if (!waitForReply) {
      // Fire and forget
      handler(toSession, agentMessage).catch(error => {
        console.error(`[SessionTool] Handler error for ${toAgentId}:`, error);
      });
      
      return {
        messageId: agentMessage.id,
        delivered: true
      };
    }

    // Wait for reply with timeout
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeout);
      });

      const response = await Promise.race([
        handler(toSession, agentMessage),
        timeoutPromise
      ]);

      if (response === null) {
        return {
          messageId: agentMessage.id,
          delivered: true,
          error: 'Response timed out'
        };
      }

      // Add response to session
      const replyMessage = this.addMessage(toSession.id, 'assistant', response.content, {
        responseToId: agentMessage.id
      });

      return {
        messageId: agentMessage.id,
        delivered: true,
        reply: replyMessage
      };
    } catch (error: any) {
      return {
        messageId: agentMessage.id,
        delivered: true,
        error: error.message
      };
    }
  }

  /**
   * Spawn a sub-session for parallel work
   */
  spawnSubSession(
    parentSessionId: string,
    task: string,
    agentId?: string
  ): AgentSession {
    const parentSession = this.getSession(parentSessionId);
    if (!parentSession) {
      throw new Error(`Parent session not found: ${parentSessionId}`);
    }

    const subSession: AgentSession = {
      id: generateId(),
      agentId: agentId || parentSession.agentId,
      channelId: parentSession.channelId,
      userId: parentSession.userId,
      startedAt: Date.now(),
      lastMessageAt: Date.now(),
      messageCount: 0,
      context: [
        {
          id: generateId(),
          role: 'system',
          content: `Sub-task: ${task}`,
          timestamp: Date.now(),
          metadata: {
            parentSessionId,
            isSubSession: true,
            task
          }
        }
      ],
      metadata: {
        parentSessionId,
        task
      }
    };

    this.sessions.set(`sub:${subSession.id}`, subSession);
    return subSession;
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): {
    exists: boolean;
    messageCount: number;
    lastActivity: number;
    agentId?: string;
  } {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return {
        exists: false,
        messageCount: 0,
        lastActivity: 0
      };
    }

    return {
      exists: true,
      messageCount: session.messageCount,
      lastActivity: session.lastMessageAt,
      agentId: session.agentId
    };
  }

  /**
   * Set model override for session
   */
  setSessionModel(sessionId: string, model: string | null): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    session.metadata = session.metadata || {};
    if (model) {
      session.metadata.modelOverride = model;
    } else {
      delete session.metadata.modelOverride;
    }

    return true;
  }

  /**
   * Clear session context
   */
  clearSession(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    session.context = [];
    session.messageCount = 0;
    session.lastMessageAt = Date.now();

    return true;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    for (const [key, session] of this.sessions) {
      if (session.id === sessionId) {
        this.sessions.delete(key);
        return true;
      }
    }
    return false;
  }

  /**
   * Clean up old sessions
   */
  cleanup(): number {
    const cutoff = Date.now() - this.sessionTimeout;
    let cleaned = 0;

    for (const [key, session] of this.sessions) {
      if (session.lastMessageAt < cutoff) {
        this.sessions.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get all agent IDs that have handlers
   */
  getAvailableAgents(): string[] {
    return Array.from(this.messageHandlers.keys());
  }
}

// Singleton instance
let sessionToolInstance: SessionTool | null = null;

export function getSessionTool(): SessionTool {
  if (!sessionToolInstance) {
    sessionToolInstance = new SessionTool();
  }
  return sessionToolInstance;
}

export default SessionTool;
