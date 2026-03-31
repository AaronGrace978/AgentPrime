import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SpecializedAgentLoop } from '../src/main/agent/specialized-agent-loop';
import { TransactionManager } from '../src/main/core/transaction-manager';
import { ProjectDocumenter } from '../src/main/agent/project-documenter';
import { ProjectRunner } from '../src/main/agent/tools/projectRunner';

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

  it('flags invalid tsxx entrypoints in index.html', async () => {
    const workspacePath = createTempDir('agentprime-specialized-tsxx-');
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'broken-react-app',
      scripts: { dev: 'vite', build: 'vite build' },
      devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^5.0.0' }
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<script type="module" src="/src/main.tsxx"></script>');
    fs.writeFileSync(path.join(workspacePath, 'src/main.tsx'), "console.log('ok');");

    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const verification = await (loop as any).verifyProject([]);

    expect(verification.isComplete).toBe(false);
    expect(verification.errors).toContain('index.html references invalid script entry: /src/main.tsxx (.tsxx is not a valid TypeScript React extension)');
    expect(verification.missingFiles).toContain('src/main.tsx');
  });

  it('collects created files from direct, wrapped, and scaffold tool shapes', () => {
    const workspacePath = createTempDir('agentprime-specialized-created-files-');
    const loop = new SpecializedAgentLoop({ workspacePath } as any);

    const createdFiles = (loop as any).collectCreatedFilesFromExecutedTools([
      {
        toolCall: {
          name: 'write_file',
          arguments: { path: 'src/main.tsx' },
        },
        result: { action: 'write_file', path: 'src/main.tsx', success: true },
      },
      {
        toolCall: {
          function: {
            name: 'write_file',
            arguments: { path: 'src/App.tsx' },
          },
        },
        result: { action: 'write_file', path: 'src/App.tsx', success: true },
      },
      {
        toolCall: {
          name: 'scaffold_project',
          arguments: { project_type: 'threejs_viewer', project_name: 'demo' },
        },
        result: { action: 'scaffold_project', success: true, files: ['package.json', 'index.html'] },
      },
    ]);

    expect(createdFiles).toEqual(expect.arrayContaining(['src/main.tsx', 'src/App.tsx', 'package.json', 'index.html']));
  });

  it('surfaces rollback messaging when verification fails and changes were reverted', () => {
    const workspacePath = createTempDir('agentprime-specialized-rollback-msg-');
    const loop = new SpecializedAgentLoop({ workspacePath } as any);

    const response = (loop as any).buildResponse(
      ['src/main.tsx'],
      {
        isComplete: false,
        missingFiles: ['src/game/Game.ts'],
        errors: ['Build verification failed'],
        createdFiles: ['src/main.tsx'],
      },
      { rolledBack: true }
    );

    expect(response).toContain('### ↩️ Changes Reverted');
    expect(response).toContain('rolled back the generated changes');
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

describe('Project documentation and runner commands', () => {
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

  it('documents Vite projects with npm run dev', () => {
    const workspacePath = createTempDir('agentprime-project-docs-');
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'vite-app',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      devDependencies: { vite: '^5.4.0' }
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'vite.config.ts'), 'export default {};');

    const log = ProjectDocumenter.generateProjectLog({
      projectPath: workspacePath,
      projectName: 'vite-app',
      description: 'Test app',
      files: ['package.json', 'index.html', 'src/main.tsx', 'vite.config.ts'],
      technologies: ['TypeScript', 'React', 'Vite'],
      buildHistory: [],
      originalPrompt: 'Build a Vite app',
      isUpdate: false
    });

    expect(log).toContain('npm run dev');
    expect(log).not.toContain('npm start');
  });

  it('prefers npm run dev for bundler projects', async () => {
    const workspacePath = createTempDir('agentprime-project-runner-');
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'vite-app',
      scripts: { dev: 'vite', start: 'node server.js' },
      devDependencies: { vite: '^5.4.0' }
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'vite.config.ts'), 'export default {};');

    const projectInfo = await ProjectRunner.detectProject(workspacePath);

    expect(projectInfo.startCommand).toBe('npm run dev');
  });

  it('verifies build scripts before reporting success', async () => {
    const workspacePath = createTempDir('agentprime-build-verify-');
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'build-check',
      scripts: {
        build: 'node -e "console.log(\'build ok\')"'
      }
    }, null, 2));

    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const result = await (loop as any).buildProjectIfNeeded();

    expect(result.success).toBe(true);
    expect(result.output).toContain('build ok');
  });

  it('surfaces build failures for targeted retry passes', async () => {
    const workspacePath = createTempDir('agentprime-build-fail-');
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'build-fail',
      scripts: {
        build: 'node -e "console.error(\'boom\'); process.exit(1)"'
      }
    }, null, 2));

    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const result = await (loop as any).buildProjectIfNeeded();

    expect(result.success).toBe(false);
    expect(result.output).toContain('boom');
  });
});
