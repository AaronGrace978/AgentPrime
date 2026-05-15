import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { register } from '../src/main/ipc-handlers/files';

type Handler = (_event?: unknown, ...args: any[]) => any;

class FakeIpcMain {
  handlers = new Map<string, Handler>();

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }
}

describe('workspace IPC handlers', () => {
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

  function createHandlers(initialWorkspace: string | null = null): { ipcMain: FakeIpcMain; getWorkspace: () => string | null } {
    const ipcMain = new FakeIpcMain();
    let workspacePath = initialWorkspace;

    register({
      ipcMain: ipcMain as any,
      dialog: {} as any,
      mainWindow: () => null,
      getWorkspacePath: () => workspacePath,
      setWorkspacePath: (nextPath: string | null) => {
        workspacePath = nextPath;
      },
    });

    return {
      ipcMain,
      getWorkspace: () => workspacePath,
    };
  }

  it('clears a deleted workspace before serving the file tree', async () => {
    const workspacePath = createTempDir('agentprime-deleted-workspace-');
    const { ipcMain, getWorkspace } = createHandlers(workspacePath);
    fs.rmSync(workspacePath, { recursive: true, force: true });

    const result = await ipcMain.handlers.get('file:read-tree')?.({});

    expect(result).toEqual({ tree: [], root: null, error: 'No workspace' });
    expect(getWorkspace()).toBeNull();
  });

  it('rejects invalid workspace switches without storing the broken path', async () => {
    const missingWorkspace = path.join(os.tmpdir(), `agentprime-missing-${Date.now()}`);
    const { ipcMain, getWorkspace } = createHandlers();

    const result = await ipcMain.handlers.get('file:set-workspace')?.({}, missingWorkspace);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Workspace path does not exist');
    expect(getWorkspace()).toBeNull();
  });
});
