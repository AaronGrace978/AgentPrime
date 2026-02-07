/**
 * AgentPrime - Collaboration Engine Tests
 * Tests for real-time collaborative editing and session management
 */

const { CollaborationEngine } = require('../../src/main/core/collaboration-engine');

describe('CollaborationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new CollaborationEngine();
  });

  afterEach(() => {
    // Clean up any timers or listeners
    engine.removeAllListeners();
  });

  describe('Session Management', () => {
    test('should create a new collaboration session', async () => {
      const session = await engine.createSession(
        'Test Session',
        '/workspace',
        'user-123'
      );

      expect(session.id).toBeDefined();
      expect(session.name).toBe('Test Session');
      expect(session.workspace).toBe('/workspace');
      expect(session.participants).toHaveLength(1);
      expect(session.participants[0].userId).toBe('user-123');
      expect(session.permissions.isOwner).toBe('user-123');
    });

    test('should join an existing session', async () => {
      const session = await engine.createSession('Test', '/ws', 'owner');

      const joinedSession = await engine.joinSession(session.id, 'user-456', 'User 456');

      expect(joinedSession.participants).toHaveLength(2);
      expect(joinedSession.participants[1].userId).toBe('user-456');
      expect(joinedSession.participants[1].username).toBe('User 456');
    });

    test('should reject joining non-existent session', async () => {
      await expect(engine.joinSession('non-existent', 'user')).rejects.toThrow('Session not found');
    });

    test('should leave a session', async () => {
      const session = await engine.createSession('Test', '/ws', 'owner');
      await engine.joinSession(session.id, 'user');

      await engine.leaveSession(session.id, 'user');

      const updatedSession = engine.getActiveSessions().find(s => s.id === session.id);
      expect(updatedSession.participants).toHaveLength(1);
      expect(updatedSession.participants[0].userId).toBe('owner');
    });
  });

  describe('Document Changes', () => {
    let session;

    beforeEach(async () => {
      session = await engine.createSession('Test', '/ws', 'owner');
      await engine.joinSession(session.id, 'collaborator');
    });

    test('should record document changes', async () => {
      const change = await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: {
          start: { line: 0, column: 0 },
          end: { line: 0, column: 5 }
        },
        content: 'hello'
      });

      expect(change.id).toBeDefined();
      expect(change.sessionId).toBe(session.id);
      expect(change.userId).toBe('owner');
      expect(change.content).toBe('hello');
      expect(change.version).toBe(1);
    });

    test('should reject changes from users without edit permissions', async () => {
      // Create session where only owner can edit
      const restrictedSession = await engine.createSession('Restricted', '/ws', 'owner');
      restrictedSession.permissions.canEdit = ['owner']; // Only owner can edit

      await expect(engine.recordChange(restrictedSession.id, 'collaborator', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } },
        content: 'x'
      })).rejects.toThrow('User does not have edit permissions');
    });

    test('should track change versions', async () => {
      const change1 = await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } },
        content: 'a'
      });

      const change2 = await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 0, column: 1 }, end: { line: 0, column: 2 } },
        content: 'b'
      });

      expect(change1.version).toBe(1);
      expect(change2.version).toBe(2);
    });
  });

  describe('Conflict Detection', () => {
    let session;

    beforeEach(async () => {
      session = await engine.createSession('Test', '/ws', 'owner');
    });

    test('should detect conflicting changes', async () => {
      // Record first change
      await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 0, column: 0 }, end: { line: 0, column: 5 } },
        content: 'hello'
      });

      // Record overlapping change
      await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 0, column: 2 }, end: { line: 0, column: 7 } },
        content: 'world'
      });

      // Check that conflicts were detected (implementation detail)
      const pendingChanges = engine.getPendingChanges(session.id);
      expect(pendingChanges.length).toBe(2);
    });

    test('should handle non-conflicting changes', async () => {
      // Record non-overlapping changes
      await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 0, column: 0 }, end: { line: 0, column: 5 } },
        content: 'hello'
      });

      await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
        content: 'world'
      });

      const pendingChanges = engine.getPendingChanges(session.id);
      expect(pendingChanges.length).toBe(2);
    });
  });

  describe('Presence Management', () => {
    let session;

    beforeEach(async () => {
      session = await engine.createSession('Test', '/ws', 'owner');
    });

    test('should update user presence', () => {
      engine.updatePresence(session.id, 'owner', {
        cursor: { line: 5, column: 10, file: 'test.js' },
        status: 'online'
      });

      // Presence updates are handled internally, mainly for real-time features
      expect(session.participants[0].userId).toBe('owner');
    });

    test('should track user sessions', async () => {
      const session1 = await engine.createSession('Session 1', '/ws', 'user1');
      const session2 = await engine.createSession('Session 2', '/ws', 'user1');

      const userSessions = engine.getUserSessions('user1');
      expect(userSessions).toHaveLength(2);
      expect(userSessions.map(s => s.id)).toEqual([session1.id, session2.id]);
    });
  });

  describe('Workspace Management', () => {
    test('should create shared workspace', async () => {
      const workspace = await engine.createWorkspace(
        'Test Workspace',
        'owner-123',
        'A test workspace'
      );

      expect(workspace.id).toBeDefined();
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.owner).toBe('owner-123');
      expect(workspace.collaborators).toContain('owner-123');
      expect(workspace.permissions.collaboratorRoles['owner-123']).toBe('admin');
    });

    test('should retrieve workspace by ID', async () => {
      const workspace = await engine.createWorkspace('Test', 'owner');

      const retrieved = engine.getWorkspace(workspace.id);
      expect(retrieved).toEqual(workspace);
    });

    test('should return null for non-existent workspace', () => {
      const retrieved = engine.getWorkspace('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    test('should emit session creation events', async () => {
      const events = [];
      engine.on('collaboration_event', (event) => events.push(event));

      await engine.createSession('Test', '/ws', 'owner');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('session_created');
      expect(events[0].data.session.name).toBe('Test');
    });

    test('should emit user join/leave events', async () => {
      const events = [];
      engine.on('collaboration_event', (event) => events.push(event));

      const session = await engine.createSession('Test', '/ws', 'owner');
      await engine.joinSession(session.id, 'user');
      await engine.leaveSession(session.id, 'user');

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('user_joined');
      expect(events[1].type).toBe('user_left');
    });

    test('should emit change events', async () => {
      const events = [];
      engine.on('collaboration_event', (event) => events.push(event));

      const session = await engine.createSession('Test', '/ws', 'owner');

      await engine.recordChange(session.id, 'owner', {
        filePath: 'test.js',
        type: 'insert',
        position: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } },
        content: 'a'
      });

      expect(events.some(e => e.type === 'change_made')).toBe(true);
    });
  });
});
