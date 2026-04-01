import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReviewSessionManager } from '../src/main/agent/review-session-manager';

describe('ReviewSessionManager', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
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

  it('aggregates repeated file writes into a single staged change', () => {
    const workspacePath = createTempDir('agentprime-review-session-');
    const manager = new ReviewSessionManager();

    const session = manager.createSessionFromOperations(workspacePath, [
      {
        path: 'src/App.tsx',
        originalContent: 'old',
        newContent: 'middle',
        existed: true,
      },
      {
        path: 'src/App.tsx',
        originalContent: 'middle',
        newContent: 'final',
        existed: true,
      },
    ]);

    expect(session).toBeTruthy();
    expect(session?.changes).toHaveLength(1);
    expect(session?.changes[0]).toMatchObject({
      filePath: 'src/App.tsx',
      oldContent: 'old',
      newContent: 'final',
      action: 'modified',
      status: 'pending',
    });
  });

  it('applies only accepted staged changes', () => {
    const workspacePath = createTempDir('agentprime-review-apply-');
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, 'src', 'keep.ts'), 'before', 'utf-8');

    const manager = new ReviewSessionManager();
    const session = manager.createSessionFromOperations(workspacePath, [
      {
        path: 'src/keep.ts',
        originalContent: 'before',
        newContent: 'after',
        existed: true,
      },
      {
        path: 'src/new.ts',
        originalContent: null,
        newContent: 'created',
        existed: false,
      },
    ]);

    expect(session).toBeTruthy();
    manager.updateChangeStatus(session!.sessionId, 'src/keep.ts', 'accepted');
    manager.updateChangeStatus(session!.sessionId, 'src/new.ts', 'rejected');
    manager.applyAcceptedChanges(session!.sessionId);

    expect(fs.readFileSync(path.join(workspacePath, 'src', 'keep.ts'), 'utf-8')).toBe('after');
    expect(fs.existsSync(path.join(workspacePath, 'src', 'new.ts'))).toBe(false);
  });
});
