import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StateManager } from '../src/main/core/state-manager';

describe('StateManager', () => {
  const tempRoots: string[] = [];
  const managers: StateManager[] = [];

  afterEach(() => {
    while (managers.length > 0) {
      managers.pop()?.cleanup();
    }

    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot && fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(dir);
    return dir;
  }

  function createManager(prefix: string): { manager: StateManager; stateFile: string } {
    const workspace = createTempDir(prefix);
    const stateFile = path.join(workspace, 'state', 'agentprime-state.json');
    const manager = new StateManager(stateFile);
    managers.push(manager);
    return { manager, stateFile };
  }

  it('loads partial persisted state and merges missing statistics defaults', async () => {
    const { manager, stateFile } = createManager('agentprime-state-load-');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      sessions: {
        sessionA: {
          id: 'sessionA',
          messages: [{ role: 'user', content: 'hi', timestamp: 1 }],
          createdAt: 1,
          updatedAt: 2,
          metadata: {
            totalTokens: 10,
            totalCost: 1.25,
            messageCount: 1,
            lastActivity: 2,
          },
        },
      },
      settings: {
        theme: 'dark',
      },
      statistics: {
        totalSessions: 1,
        totalMessages: 1,
      },
    }, null, 2));

    await manager.loadState();

    expect(manager.getSessionIds()).toEqual(['sessionA']);
    expect(manager.getSession('sessionA')?.metadata.totalTokens).toBe(10);
    expect(manager.getSettings()).toEqual({ theme: 'dark' });
    expect(manager.getStatistics()).toMatchObject({
      totalSessions: 1,
      totalMessages: 1,
      totalTokens: 0,
      totalCost: 0,
    });
    expect(manager.getStatistics().lastCleanup).toEqual(expect.any(Number));
  });

  it('tracks messages, trims oversized sessions, and preserves system messages', () => {
    const { manager } = createManager('agentprime-state-trim-');
    (manager as any).maxMessagesPerSession = 3;

    const sessionId = manager.createSession('trim-session');
    manager.addMessage(sessionId, { role: 'system', content: 'system rule' });
    manager.addMessage(sessionId, { role: 'user', content: 'first', metadata: { tokens: 3, cost: 0.1 } });
    manager.addMessage(sessionId, { role: 'assistant', content: 'second', metadata: { tokens: 4, cost: 0.2 } });
    manager.addMessage(sessionId, { role: 'user', content: 'third', metadata: { tokens: 5, cost: 0.3 } });

    expect(manager.getMessages(sessionId).map((message) => message.content)).toEqual([
      'system rule',
      'second',
      'third',
    ]);
    expect(manager.getMessages(sessionId, 2).map((message) => message.content)).toEqual([
      'second',
      'third',
    ]);
    expect(manager.getSession(sessionId)?.metadata).toMatchObject({
      messageCount: 4,
      totalTokens: 12,
      totalCost: 0.6000000000000001,
    });
    expect(manager.getStatistics()).toMatchObject({
      totalSessions: 1,
      totalMessages: 4,
      totalTokens: 12,
      totalCost: 0.6000000000000001,
    });
  });

  it('persists sessions and settings to disk on forceSave', async () => {
    const { manager, stateFile } = createManager('agentprime-state-save-');
    const sessionId = manager.createSession('persisted-session');
    manager.updateSettings({ theme: 'light', fontSize: 14 });
    manager.addMessage(sessionId, { role: 'user', content: 'save me' });

    await manager.forceSave();

    const savedState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(savedState.settings).toEqual({ theme: 'light', fontSize: 14 });
    expect(savedState.sessions[sessionId].messages).toHaveLength(1);
    expect(manager.getSummary()).toMatchObject({
      sessions: 1,
      totalMessages: 1,
    });
  });

  it('handles missing sessions defensively', () => {
    const { manager } = createManager('agentprime-state-errors-');

    expect(manager.getSession('missing')).toBeNull();
    expect(manager.getMessages('missing')).toEqual([]);
    expect(manager.deleteSession('missing')).toBe(false);
    expect(() => manager.addMessage('missing', { role: 'user', content: 'hello' })).toThrow('Session missing not found');
    expect(() => manager.updateSessionMetadata('missing', { totalTokens: 4 })).toThrow('Session missing not found');
  });

  it('removes stale sessions and enforces the max session cap during cleanup', async () => {
    const { manager, stateFile } = createManager('agentprime-state-cleanup-');
    (manager as any).maxSessions = 1;

    const oldSession = manager.createSession('old-session');
    const inactiveSession = manager.createSession('inactive-session');
    const olderRecentSession = manager.createSession('older-recent-session');
    const newestSession = manager.createSession('newest-session');

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const sessions = (manager as any).state.sessions;

    sessions[oldSession].createdAt = now - (31 * day);
    sessions[oldSession].metadata.lastActivity = now - day;

    sessions[inactiveSession].createdAt = now - day;
    sessions[inactiveSession].metadata.lastActivity = now - (8 * day);

    sessions[olderRecentSession].createdAt = now - day;
    sessions[olderRecentSession].metadata.lastActivity = now - (2 * day);

    sessions[newestSession].createdAt = now - day;
    sessions[newestSession].metadata.lastActivity = now;

    await (manager as any).performCleanup();

    expect(manager.getSessionIds()).toEqual(['newest-session']);
    expect(manager.getStatistics().lastCleanup).toBeGreaterThan(0);
    expect(fs.existsSync(stateFile)).toBe(true);
  });

  it('clears background timers when cleaned up', () => {
    const { manager } = createManager('agentprime-state-timers-');

    expect((manager as any).autoSaveInterval).toBeTruthy();
    expect((manager as any).cleanupInterval).toBeTruthy();

    manager.cleanup();

    expect((manager as any).autoSaveInterval).toBeNull();
    expect((manager as any).cleanupInterval).toBeNull();
  });
});
