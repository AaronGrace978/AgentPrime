import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SpecializedAgentLoop } from '../src/main/agent/specialized-agent-loop';
import { TransactionManager } from '../src/main/core/transaction-manager';

describe('SpecializedAgentLoop verification', () => {
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

  it('flags missing relative module imports during verification', async () => {
    const workspacePath = createTempDir('agentprime-specialized-loop-');
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'broken-vite-app',
      scripts: { dev: 'vite' },
      devDependencies: { vite: '^5.4.0' }
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<script type="module" src="/src/main.js"></script>');
    fs.writeFileSync(path.join(workspacePath, 'src/main.js'), "import './style.css';\nconsole.log('hello');\n");

    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const verification = await (loop as any).verifyProject([]);

    expect(verification.isComplete).toBe(false);
    expect(verification.errors).toContain('src/main.js imports missing file: ./style.css');
    expect(verification.missingFiles).toContain('src/style.css');
  });

  it('gives bundler-safe run instructions instead of opening index.html', () => {
    const workspacePath = createTempDir('agentprime-specialized-response-');
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'bundled-app',
      scripts: { dev: 'vite', build: 'vite build' },
      devDependencies: { vite: '^5.4.0' }
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<div id="app"></div>');
    fs.writeFileSync(path.join(workspacePath, 'vite.config.js'), 'export default {};');

    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const response = (loop as any).buildResponse([], {
      isComplete: false,
      missingFiles: [],
      errors: ['src/main.js imports missing file: ./style.css'],
      createdFiles: []
    });

    expect(response).toContain('## ⚠️ Project Needs Fixes');
    expect(response).toContain('`npm run dev`');
    expect(response).not.toContain('Open `index.html` in your browser');
  });
});

describe('TransactionManager file snapshots', () => {
  it('records file changes from pre-write snapshots', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-transaction-'));
    const manager = new TransactionManager();
    const transaction = manager.startTransaction(workspacePath);

    await manager.recordFileChange('src/main.js', null, 'console.log("hi");', false);

    expect(transaction.getOperationCount()).toBe(1);

    fs.rmSync(workspacePath, { recursive: true, force: true });
  });
});
