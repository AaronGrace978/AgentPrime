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

  it('preserves structured verification findings on staged review sessions', () => {
    const workspacePath = createTempDir('agentprime-review-verification-');
    const manager = new ReviewSessionManager();

    const session = manager.createSessionFromOperations(
      workspacePath,
      [
        {
          path: 'src/App.tsx',
          originalContent: '',
          newContent: 'export default function App() { return null; }',
          existed: false,
        },
      ],
      {
        status: 'failed',
        projectTypeLabel: 'Vite App',
        readinessSummary: 'Ready only after npm run build succeeds and npm run dev starts successfully.',
        buildCommand: 'npm run build',
        startCommand: 'npm run dev',
        issues: ['[build] src/App.tsx imports a missing module'],
        findings: [
          {
            stage: 'build',
            severity: 'error',
            summary: '[build] src/App.tsx imports a missing module',
            files: ['src/App.tsx'],
            command: 'npm run build',
          },
        ],
      }
    );

    expect(session?.initialVerification?.status).toBe('failed');
    expect(session?.initialVerification?.findings?.[0]).toMatchObject({
      stage: 'build',
      files: ['src/App.tsx'],
      command: 'npm run build',
    });
  });
});
