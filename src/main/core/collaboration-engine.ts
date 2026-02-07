/**
 * AgentPrime - Collaboration Engine
 * Real-time collaborative editing and session management
 */

import type {
  CollaborationSession,
  UserPresence,
  DocumentChange,
  ConflictResolution,
  CollaborationEvent,
  SharedWorkspace,
  CollaborationConfig
} from '../../types/collaboration';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as Y from 'yjs';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

// Message types for WebSocket communication
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_CURSOR = 2;

export class CollaborationEngine extends EventEmitter {
  private sessions: Map<string, CollaborationSession> = new Map();
  private workspaces: Map<string, SharedWorkspace> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private pendingChanges: Map<string, DocumentChange[]> = new Map(); // sessionId -> changes
  private conflicts: Map<string, ConflictResolution> = new Map(); // conflictId -> resolution
  private config: CollaborationConfig;
  
  // Yjs CRDT documents for each session/file
  private yjsDocs: Map<string, Y.Doc> = new Map(); // sessionId:filePath -> Y.Doc
  private awareness: Map<string, awarenessProtocol.Awareness> = new Map();
  
  // WebSocket server for real-time sync
  private wss: WebSocketServer | null = null;
  private connections: Map<string, Set<WebSocket>> = new Map(); // sessionId -> connections
  private wsPort: number = 0;

  constructor(config?: Partial<CollaborationConfig>) {
    super();

    this.config = {
      maxSessionsPerUser: 5,
      sessionTimeout: 60, // 1 hour
      maxFileSize: 10 * 1024 * 1024, // 10MB
      backupInterval: 5, // 5 minutes
      enableRealTimeSync: true,
      conflictResolutionStrategy: 'manual',
      ...config
    };

    // Start cleanup interval
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Create a new collaboration session
   */
  async createSession(
    name: string,
    workspace: string,
    ownerId: string,
    settings?: Partial<CollaborationSession['settings']>
  ): Promise<CollaborationSession> {
    // Check user session limit
    const userSessions = this.userSessions.get(ownerId) || new Set();
    if (userSessions.size >= this.config.maxSessionsPerUser) {
      throw new Error('Maximum sessions per user exceeded');
    }

    const session: CollaborationSession = {
      id: this.generateId(),
      name,
      workspace,
      participants: [{
        userId: ownerId,
        username: 'Owner', // Should be resolved from user service
        color: this.generateUserColor(ownerId),
        lastActive: Date.now(),
        status: 'online'
      }],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      settings: {
        allowAnonymous: false,
        requireApproval: false,
        maxParticipants: 10,
        autoSave: true,
        conflictResolution: this.config.conflictResolutionStrategy,
        realTimeSync: this.config.enableRealTimeSync,
        ...settings
      },
      permissions: {
        canEdit: [ownerId],
        canInvite: [ownerId],
        canKick: [ownerId],
        isOwner: ownerId
      }
    };

    this.sessions.set(session.id, session);
    userSessions.add(session.id);
    this.userSessions.set(ownerId, userSessions);

    this.emitEvent('session_created', session.id, ownerId, { session });

    return session;
  }

  /**
   * Join an existing collaboration session
   */
  async joinSession(sessionId: string, userId: string, username?: string): Promise<CollaborationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if user is already in session
    if (session.participants.some(p => p.userId === userId)) {
      return session;
    }

    // Check participant limit
    if (session.participants.length >= session.settings.maxParticipants) {
      throw new Error('Session is full');
    }

    // Check if approval is required
    if (session.settings.requireApproval && !session.permissions.canInvite.includes(userId)) {
      throw new Error('Approval required to join this session');
    }

    const participant: UserPresence = {
      userId,
      username: username || `User-${userId.slice(0, 8)}`,
      color: this.generateUserColor(userId),
      lastActive: Date.now(),
      status: 'online'
    };

    session.participants.push(participant);
    session.lastActivity = Date.now();

    // Add to user's sessions
    const userSessions = this.userSessions.get(userId) || new Set();
    userSessions.add(sessionId);
    this.userSessions.set(userId, userSessions);

    this.emitEvent('user_joined', sessionId, userId, { participant });

    return session;
  }

  /**
   * Leave a collaboration session
   */
  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.participants = session.participants.filter(p => p.userId !== userId);
    session.lastActivity = Date.now();

    // Remove from user's sessions
    const userSessions = this.userSessions.get(userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessions.delete(userId);
      } else {
        this.userSessions.set(userId, userSessions);
      }
    }

    this.emitEvent('user_left', sessionId, userId, {});

    // If owner left and no participants remain, delete session
    if (session.permissions.isOwner === userId && session.participants.length === 0) {
      this.sessions.delete(sessionId);
      this.pendingChanges.delete(sessionId);
    }
  }

  /**
   * Record a document change in a session
   */
  async recordChange(sessionId: string, userId: string, change: Omit<DocumentChange, 'id' | 'sessionId' | 'userId' | 'timestamp' | 'version'>): Promise<DocumentChange> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if user can edit
    if (!session.permissions.canEdit.includes(userId)) {
      throw new Error('User does not have edit permissions');
    }

    const documentChange: DocumentChange = {
      id: this.generateId(),
      sessionId,
      userId,
      timestamp: Date.now(),
      version: this.getNextVersion(sessionId, change.filePath),
      ...change
    };

    // Store pending change
    const changes = this.pendingChanges.get(sessionId) || [];
    changes.push(documentChange);
    this.pendingChanges.set(sessionId, changes);

    // Check for conflicts
    const conflicts = this.detectConflicts(sessionId, documentChange);
    if (conflicts.length > 0) {
      await this.handleConflicts(sessionId, conflicts);
    }

    session.lastActivity = Date.now();
    this.emitEvent('change_made', sessionId, userId, { change: documentChange });

    return documentChange;
  }

  /**
   * Get pending changes for a session
   */
  getPendingChanges(sessionId: string): DocumentChange[] {
    return this.pendingChanges.get(sessionId) || [];
  }

  /**
   * Apply changes to a file (resolve conflicts and merge)
   */
  async applyChanges(sessionId: string, filePath: string): Promise<void> {
    const changes = this.pendingChanges.get(sessionId) || [];
    const fileChanges = changes.filter(c => c.filePath === filePath);

    if (fileChanges.length === 0) return;

    // Sort by version
    fileChanges.sort((a, b) => a.version - b.version);

    // Apply changes to file (simplified - would need proper diff/merge logic)
    try {
      const content = await this.readFile(filePath);
      const newContent = this.applyChangesToContent(content, fileChanges);

      await this.writeFile(filePath, newContent);

      // Clear applied changes
      const remainingChanges = changes.filter(c => c.filePath !== filePath);
      if (remainingChanges.length > 0) {
        this.pendingChanges.set(sessionId, remainingChanges);
      } else {
        this.pendingChanges.delete(sessionId);
      }

    } catch (error) {
      console.error('Failed to apply changes:', error);
      throw new Error('Failed to apply changes to file');
    }
  }

  /**
   * Update user presence in a session
   */
  updatePresence(sessionId: string, userId: string, presence: Partial<UserPresence>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
      Object.assign(participant, presence);
      participant.lastActive = Date.now();
      session.lastActivity = Date.now();

      this.emitEvent('presence_updated', sessionId, userId, { presence: participant });
    }
  }

  /**
   * Get active sessions for a user
   */
  getUserSessions(userId: string): CollaborationSession[] {
    const sessionIds = this.userSessions.get(userId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter(session => session !== undefined) as CollaborationSession[];
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Create a shared workspace
   */
  async createWorkspace(name: string, ownerId: string, description?: string): Promise<SharedWorkspace> {
    const workspace: SharedWorkspace = {
      id: this.generateId(),
      name,
      description,
      owner: ownerId,
      collaborators: [ownerId],
      files: [],
      sessions: [],
      createdAt: Date.now(),
      lastModified: Date.now(),
      permissions: {
        public: false,
        allowForking: false,
        requireApproval: true,
        collaboratorRoles: {
          [ownerId]: 'admin'
        }
      }
    };

    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId: string): SharedWorkspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  // Private helper methods

  private generateId(): string {
    return crypto.randomUUID();
  }

  private generateUserColor(userId: string): string {
    // Generate consistent color based on user ID
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    const hue = parseInt(hash.slice(0, 2), 16) / 255 * 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  private getNextVersion(sessionId: string, filePath: string): number {
    const changes = this.pendingChanges.get(sessionId) || [];
    const fileChanges = changes.filter(c => c.filePath === filePath);
    return fileChanges.length + 1;
  }

  private detectConflicts(sessionId: string, newChange: DocumentChange): ConflictResolution[] {
    const conflicts: ConflictResolution[] = [];
    const changes = this.pendingChanges.get(sessionId) || [];

    // Check for overlapping changes
    for (const existingChange of changes) {
      if (existingChange.filePath === newChange.filePath &&
          existingChange.userId !== newChange.userId &&
          this.changesOverlap(existingChange, newChange)) {

        const conflictId = this.generateId();
        const conflict: ConflictResolution = {
          conflictId,
          sessionId,
          filePath: newChange.filePath,
          conflictingChanges: [existingChange, newChange],
          resolved: false
        };

        conflicts.push(conflict);
        this.conflicts.set(conflictId, conflict);
      }
    }

    return conflicts;
  }

  private changesOverlap(change1: DocumentChange, change2: DocumentChange): boolean {
    // Simple overlap detection - would need more sophisticated logic for production
    const start1 = change1.position.start;
    const end1 = change1.position.end;
    const start2 = change2.position.start;
    const end2 = change2.position.end;

    return !(end1.line < start2.line ||
             end2.line < start1.line ||
             (end1.line === start2.line && end1.column <= start2.column) ||
             (end2.line === start1.line && end2.column <= start1.column));
  }

  private async handleConflicts(sessionId: string, conflicts: ConflictResolution[]): Promise<void> {
    for (const conflict of conflicts) {
      this.emitEvent('conflict_detected', sessionId, 'system', { conflict });

      // Auto-resolve based on strategy
      if (this.config.conflictResolutionStrategy === 'last-writer-wins') {
        const latestChange = conflict.conflictingChanges.reduce((latest, current) =>
          current.timestamp > latest.timestamp ? current : latest
        );

        conflict.resolved = true;
        conflict.resolution = {
          acceptedChange: latestChange.id,
          resolvedBy: 'system',
          timestamp: Date.now()
        };
      }
    }
  }

  private emitEvent(type: CollaborationEvent['type'], sessionId: string, userId: string, data: any): void {
    const event: CollaborationEvent = {
      type,
      sessionId,
      userId,
      data,
      timestamp: Date.now()
    };

    this.emit('collaboration_event', event);
  }

  private async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf-8');
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  private applyChangesToContent(content: string, changes: DocumentChange[]): string {
    // Simplified change application - would need proper diff/merge logic
    let lines = content.split('\n');

    for (const change of changes) {
      const start = change.position.start;
      const end = change.position.end;

      if (change.type === 'insert') {
        // Insert at position
        const line = lines[start.line];
        const before = line.slice(0, start.column);
        const after = line.slice(start.column);
        lines[start.line] = before + change.content + after;
      } else if (change.type === 'delete') {
        // Delete range
        if (start.line === end.line) {
          const line = lines[start.line];
          const before = line.slice(0, start.column);
          const after = line.slice(end.column);
          lines[start.line] = before + after;
        } else {
          // Multi-line delete
          lines[start.line] = lines[start.line].slice(0, start.column);
          lines[end.line] = lines[end.line].slice(end.column);
          lines.splice(start.line + 1, end.line - start.line);
        }
      }
      // Replace would be similar to delete + insert
    }

    return lines.join('\n');
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const timeoutMs = this.config.sessionTimeout * 60 * 1000;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > timeoutMs) {
        // Remove session
        this.sessions.delete(sessionId);
        this.pendingChanges.delete(sessionId);

        // Remove from user sessions
        for (const [userId, sessions] of this.userSessions) {
          sessions.delete(sessionId);
          if (sessions.size === 0) {
            this.userSessions.delete(userId);
          }
        }

        this.emitEvent('session_expired', sessionId, 'system', { session });
      }
    }
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all conflicts for a session
   */
  getConflicts(sessionId: string): ConflictResolution[] {
    const conflicts: ConflictResolution[] = [];
    for (const [conflictId, conflict] of this.conflicts) {
      if (conflictId.startsWith(sessionId)) {
        conflicts.push(conflict);
      }
    }
    return conflicts;
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    conflictId: string,
    acceptedChangeId: string,
    resolvedBy: string,
    mergedContent?: string
  ): Promise<boolean> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      return false;
    }

    conflict.resolved = true;
    conflict.resolution = {
      acceptedChange: acceptedChangeId,
      mergedContent,
      resolvedBy,
      timestamp: Date.now()
    };

    this.conflicts.set(conflictId, conflict);
    this.emitEvent('conflict_resolved', conflict.sessionId, 'system', { conflictId, resolution: conflict.resolution });

    return true;
  }

  // ==========================================
  // Yjs CRDT Integration
  // ==========================================

  /**
   * Get or create a Yjs document for a session/file
   */
  getOrCreateYjsDoc(sessionId: string, filePath: string): Y.Doc {
    const docKey = `${sessionId}:${filePath}`;
    
    if (!this.yjsDocs.has(docKey)) {
      const doc = new Y.Doc();
      
      // Set up document update listener
      doc.on('update', (update: Uint8Array, origin: any) => {
        this.broadcastUpdate(sessionId, filePath, update);
      });
      
      this.yjsDocs.set(docKey, doc);
      
      // Create awareness for cursor sync
      const awareness = new awarenessProtocol.Awareness(doc);
      this.awareness.set(docKey, awareness);
      
      awareness.on('update', ({ added, updated, removed }: any) => {
        const changedClients = added.concat(updated).concat(removed);
        const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
        this.broadcastAwareness(sessionId, awarenessUpdate);
      });
    }
    
    return this.yjsDocs.get(docKey)!;
  }

  /**
   * Get text content from a Yjs document
   */
  getYjsText(sessionId: string, filePath: string): Y.Text {
    const doc = this.getOrCreateYjsDoc(sessionId, filePath);
    return doc.getText('content');
  }

  /**
   * Initialize Yjs document with file content
   */
  async initializeDocContent(sessionId: string, filePath: string): Promise<void> {
    try {
      const content = await this.readFile(filePath);
      const yText = this.getYjsText(sessionId, filePath);
      
      // Only set content if empty (new doc)
      if (yText.length === 0) {
        yText.insert(0, content);
      }
    } catch (error) {
      console.error('Failed to initialize doc content:', error);
    }
  }

  /**
   * Apply a change using Yjs CRDT
   */
  applyYjsChange(sessionId: string, filePath: string, change: DocumentChange): void {
    const yText = this.getYjsText(sessionId, filePath);
    const doc = this.getOrCreateYjsDoc(sessionId, filePath);
    
    doc.transact(() => {
      if (change.type === 'insert') {
        const index = this.positionToIndex(yText.toString(), change.position.start);
        yText.insert(index, change.content);
      } else if (change.type === 'delete') {
        const startIndex = this.positionToIndex(yText.toString(), change.position.start);
        const endIndex = this.positionToIndex(yText.toString(), change.position.end);
        yText.delete(startIndex, endIndex - startIndex);
      } else if (change.type === 'replace') {
        const startIndex = this.positionToIndex(yText.toString(), change.position.start);
        const endIndex = this.positionToIndex(yText.toString(), change.position.end);
        yText.delete(startIndex, endIndex - startIndex);
        yText.insert(startIndex, change.content);
      }
    }, change.userId);
  }

  private positionToIndex(content: string, position: { line: number; column: number }): number {
    const lines = content.split('\n');
    let index = 0;
    
    for (let i = 0; i < position.line && i < lines.length; i++) {
      index += lines[i].length + 1; // +1 for newline
    }
    
    index += Math.min(position.column, lines[position.line]?.length || 0);
    return index;
  }

  // ==========================================
  // WebSocket Server for Real-time Sync
  // ==========================================

  /**
   * Start the WebSocket server for real-time collaboration
   */
  startWebSocketServer(port: number = 4433): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port });
        this.wsPort = port;
        
        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
          this.handleWebSocketConnection(ws, req);
        });
        
        this.wss.on('listening', () => {
          console.log(`[Collaboration] WebSocket server started on port ${port}`);
          resolve(port);
        });
        
        this.wss.on('error', (error: Error) => {
          console.error('[Collaboration] WebSocket server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  stopWebSocketServer(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.wsPort = 0;
    }
  }

  /**
   * Get WebSocket server port
   */
  getWebSocketPort(): number {
    return this.wsPort;
  }

  private handleWebSocketConnection(ws: WebSocket, req: any): void {
    // Parse session ID from URL
    const urlParams = new URL(req.url || '', `http://localhost`).searchParams;
    const sessionId = urlParams.get('sessionId');
    const filePath = urlParams.get('filePath');
    const userId = urlParams.get('userId');
    
    if (!sessionId || !filePath || !userId) {
      ws.close(1008, 'Missing required parameters');
      return;
    }
    
    // Verify session exists
    const session = this.sessions.get(sessionId);
    if (!session) {
      ws.close(1008, 'Session not found');
      return;
    }
    
    // Add connection to session
    const connectionKey = `${sessionId}:${filePath}`;
    if (!this.connections.has(connectionKey)) {
      this.connections.set(connectionKey, new Set());
    }
    this.connections.get(connectionKey)!.add(ws);
    
    // Get or create Yjs doc
    const doc = this.getOrCreateYjsDoc(sessionId, filePath);
    const awareness = this.awareness.get(connectionKey);
    
    // Send initial sync
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    ws.send(encoding.toUint8Array(encoder));
    
    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(data));
        const messageType = decoding.readVarUint(decoder);
        
        switch (messageType) {
          case MESSAGE_SYNC:
            this.handleSyncMessage(ws, decoder, doc, sessionId, filePath);
            break;
          case MESSAGE_AWARENESS:
            if (awareness) {
              awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws);
            }
            break;
          case MESSAGE_CURSOR:
            // Broadcast cursor position to other clients
            this.broadcastCursor(sessionId, filePath, data, ws);
            break;
        }
      } catch (error) {
        console.error('[Collaboration] Message handling error:', error);
      }
    });
    
    // Handle disconnect
    ws.on('close', () => {
      const connections = this.connections.get(connectionKey);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          this.connections.delete(connectionKey);
        }
      }
      
      // Update awareness
      if (awareness) {
        awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
      }
    });
    
    console.log(`[Collaboration] Client connected: session=${sessionId}, file=${filePath}, user=${userId}`);
  }

  private handleSyncMessage(ws: WebSocket, decoder: decoding.Decoder, doc: Y.Doc, sessionId: string, filePath: string): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    
    const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, null);
    
    // If step2 (sync response), send it back
    if (syncMessageType === syncProtocol.messageYjsSyncStep2 || syncMessageType === syncProtocol.messageYjsUpdate) {
      if (encoding.length(encoder) > 1) {
        ws.send(encoding.toUint8Array(encoder));
      }
    }
  }

  private broadcastUpdate(sessionId: string, filePath: string, update: Uint8Array): void {
    const connectionKey = `${sessionId}:${filePath}`;
    const connections = this.connections.get(connectionKey);
    
    if (connections) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }

  private broadcastAwareness(sessionId: string, update: Uint8Array): void {
    // Broadcast to all connections in this session
    for (const [key, connections] of this.connections) {
      if (key.startsWith(sessionId)) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, update);
        const message = encoding.toUint8Array(encoder);
        
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        });
      }
    }
  }

  private broadcastCursor(sessionId: string, filePath: string, data: Buffer, sender: WebSocket): void {
    const connectionKey = `${sessionId}:${filePath}`;
    const connections = this.connections.get(connectionKey);
    
    if (connections) {
      connections.forEach(ws => {
        if (ws !== sender && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }
  }

  /**
   * Sync Yjs document content to file
   */
  async syncYjsToFile(sessionId: string, filePath: string): Promise<void> {
    const yText = this.getYjsText(sessionId, filePath);
    const content = yText.toString();
    await this.writeFile(filePath, content);
  }

  /**
   * Update user cursor position (for cursor sync)
   */
  updateCursorPosition(sessionId: string, filePath: string, userId: string, cursor: { line: number; column: number; selection?: { start: { line: number; column: number }; end: { line: number; column: number } } }): void {
    const docKey = `${sessionId}:${filePath}`;
    const awareness = this.awareness.get(docKey);
    
    if (awareness) {
      const participant = this.sessions.get(sessionId)?.participants.find(p => p.userId === userId);
      awareness.setLocalStateField('cursor', {
        userId,
        username: participant?.username || userId,
        color: participant?.color || '#888',
        ...cursor
      });
    }
  }

  /**
   * Get all cursor positions for a document
   */
  getCursorPositions(sessionId: string, filePath: string): Array<{ userId: string; cursor: any }> {
    const docKey = `${sessionId}:${filePath}`;
    const awareness = this.awareness.get(docKey);
    
    if (!awareness) return [];
    
    const cursors: Array<{ userId: string; cursor: any }> = [];
    awareness.getStates().forEach((state, clientId) => {
      if (state.cursor) {
        cursors.push({
          userId: state.cursor.userId,
          cursor: state.cursor
        });
      }
    });
    
    return cursors;
  }
}
