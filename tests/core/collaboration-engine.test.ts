/**
 * Collaboration Engine Tests - Real-time Editing
 */

import { CollaborationEngine } from '../../src/main/core/collaboration-engine';

describe('CollaborationEngine', () => {
  let engine: CollaborationEngine;

  beforeEach(() => {
    engine = new CollaborationEngine({
      enableRealTimeSync: true,
      conflictResolutionStrategy: 'manual'
    });
  });

  describe('Session Management', () => {
    it('should create collaboration session', async () => {
      const session = await engine.createSession('Test Session', '/workspace', 'user1');
      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
      expect(session.participants).toHaveLength(1);
    });

    it('should allow users to join session', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      await engine.joinSession(session.id, 'user2', 'User 2');
      
      const updated = await engine.getSession(session.id);
      expect(updated.participants).toHaveLength(2);
    });

    it('should enforce max participants limit', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1', {
        maxParticipants: 2
      });
      
      await engine.joinSession(session.id, 'user2', 'User 2');
      await expect(
        engine.joinSession(session.id, 'user3', 'User 3')
      ).rejects.toThrow();
    });

    it('should handle user leaving session', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      await engine.joinSession(session.id, 'user2', 'User 2');
      await engine.leaveSession(session.id, 'user2');
      
      const updated = await engine.getSession(session.id);
      expect(updated.participants).toHaveLength(1);
    });

    it('should cleanup expired sessions', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      // Simulate expired session
      session.lastActivity = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      
      await engine.cleanupExpiredSessions();
      await expect(engine.getSession(session.id)).rejects.toThrow();
    });
  });

  describe('Real-time Document Changes', () => {
    it('should record document changes', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      
      const change = await engine.recordChange(session.id, 'user1', {
        filePath: '/test.ts',
        changeType: 'insert',
        position: { line: 1, column: 0 },
        content: 'console.log("hello");'
      });
      
      expect(change).toBeDefined();
      expect(change.id).toBeTruthy();
    });

    it('should track document versions', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      
      const change1 = await engine.recordChange(session.id, 'user1', {
        filePath: '/test.ts',
        changeType: 'insert',
        position: { line: 1, column: 0 },
        content: 'line 1'
      });
      
      const change2 = await engine.recordChange(session.id, 'user1', {
        filePath: '/test.ts',
        changeType: 'insert',
        position: { line: 2, column: 0 },
        content: 'line 2'
      });
      
      expect(change2.version).toBeGreaterThan(change1.version);
    });

    it('should get pending changes', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      
      await engine.recordChange(session.id, 'user1', {
        filePath: '/test.ts',
        changeType: 'insert',
        position: { line: 1, column: 0 },
        content: 'test'
      });
      
      const pending = engine.getPendingChanges(session.id);
      expect(pending).toHaveLength(1);
    });

    it('should enforce edit permissions', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      await engine.joinSession(session.id, 'user2', 'User 2');
      
      // user2 doesn't have edit permission by default
      await expect(
        engine.recordChange(session.id, 'user2', {
          filePath: '/test.ts',
          changeType: 'insert',
          position: { line: 1, column: 0 },
          content: 'test'
        })
      ).rejects.toThrow();
    });
  });

  describe('Conflict Detection and Resolution', () => {
    it('should detect conflicting changes', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      await engine.joinSession(session.id, 'user2', 'User 2');
      
      // Grant edit permission
      session.permissions.canEdit.push('user2');
      
      // Simulate conflicting changes
      await engine.recordChange(session.id, 'user1', {
        filePath: '/test.ts',
        changeType: 'replace',
        position: { line: 1, column: 0 },
        content: 'version A'
      });
      
      await engine.recordChange(session.id, 'user2', {
        filePath: '/test.ts',
        changeType: 'replace',
        position: { line: 1, column: 0 },
        content: 'version B'
      });
      
      const conflicts = engine.getConflicts(session.id);
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('should resolve conflicts manually', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      const conflictId = 'conflict-1';
      
      await engine.resolveConflict(session.id, conflictId, {
        strategy: 'manual',
        resolution: 'keep-user1'
      });
      
      const conflict = engine.getConflict(conflictId);
      expect(conflict.resolved).toBe(true);
    });

    it('should auto-resolve with last-writer-wins', async () => {
      const engine = new CollaborationEngine({
        conflictResolutionStrategy: 'last-writer-wins'
      });
      
      const session = await engine.createSession('Test', '/workspace', 'user1');
      // Auto-resolution should happen automatically
      expect(session.settings.conflictResolution).toBe('last-writer-wins');
    });
  });

  describe('User Presence', () => {
    it('should track user presence', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      await engine.updatePresence(session.id, 'user1', {
        status: 'online',
        currentFile: '/test.ts',
        cursorPosition: { line: 10, column: 5 }
      });
      
      const presence = engine.getUserPresence(session.id, 'user1');
      expect(presence.currentFile).toBe('/test.ts');
    });

    it('should broadcast presence updates', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      const eventSpy = jest.fn();
      engine.on('presence_updated', eventSpy);
      
      await engine.updatePresence(session.id, 'user1', {
        status: 'typing',
        currentFile: '/test.ts'
      });
      
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency changes efficiently', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        await engine.recordChange(session.id, 'user1', {
          filePath: '/test.ts',
          changeType: 'insert',
          position: { line: i, column: 0 },
          content: `line ${i}`
        });
      }
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(5000); // Should complete in <5s
    });

    it('should maintain low latency for presence updates', async () => {
      const session = await engine.createSession('Test', '/workspace', 'user1');
      const startTime = Date.now();
      
      await engine.updatePresence(session.id, 'user1', {
        status: 'online',
        cursorPosition: { line: 1, column: 1 }
      });
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50); // <50ms for P95
    });
  });
});

