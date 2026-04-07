import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getProjectRuntimeProfileSync } from '../src/main/agent/project-runtime';
import { ProjectDocumenter } from '../src/main/agent/project-documenter';
import { SpecializedAgentLoop } from '../src/main/agent/specialized-agent-loop';
import { ProjectBrowserTester } from '../src/main/agent/tools/projectTester';
import { ProjectRunner } from '../src/main/agent/tools/projectRunner';

jest.setTimeout(120000);

describe('Project runtime source of truth', () => {
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

  function createStaticSite(workspacePath: string): void {
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'static-site',
      scripts: { dev: 'npx serve .' },
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<!doctype html><html><body><h1>Static</h1></body></html>');
    fs.writeFileSync(path.join(workspacePath, 'styles.css'), 'body { font-family: sans-serif; }');
  }

  function createViteShape(workspacePath: string): void {
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'vite-site',
      scripts: { dev: 'vite --port 4173', build: 'vite build' },
      devDependencies: { vite: '^5.4.0' },
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'vite.config.ts'), 'export default {};');
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<!doctype html><script type="module" src="/src/main.js"></script>');
    fs.writeFileSync(path.join(workspacePath, 'src/main.js'), 'console.log("vite");');
  }

  function createNodeApp(workspacePath: string): void {
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'node-app',
      scripts: { start: 'node server.js', build: 'node build.js' },
    }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'server.js'), 'console.log("server");');
    fs.writeFileSync(path.join(workspacePath, 'build.js'), 'console.log("build");');
  }

  function createPythonApp(workspacePath: string): void {
    fs.writeFileSync(path.join(workspacePath, 'main.py'), 'print("python app")\n');
  }

  function createProjectLog(workspacePath: string, files: string[], prompt: string): string {
    return ProjectDocumenter.generateProjectLog({
      projectPath: workspacePath,
      projectName: path.basename(workspacePath),
      description: 'Runtime profile test fixture',
      files,
      technologies: [],
      buildHistory: [],
      originalPrompt: prompt,
      isUpdate: false,
    });
  }

  it('keeps static site classification aligned across runtime, runner, loop response, and docs', async () => {
    const workspacePath = createTempDir('agentprime-runtime-static-');
    createStaticSite(workspacePath);

    const profile = getProjectRuntimeProfileSync(workspacePath);
    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const response = (loop as any).buildResponse([], {
      isComplete: true,
      missingFiles: [],
      errors: [],
      createdFiles: [],
    });
    const log = createProjectLog(workspacePath, ['package.json', 'index.html', 'styles.css'], 'Build a static landing page');

    expect(profile.kind).toBe('static');
    expect(projectInfo.kind).toBe('static');
    expect(projectInfo.type).toBe('html');
    expect(response).toContain('`npm run dev`');
    expect(response).toContain('No Dependency Install Needed');
    expect(log).toContain('No package install is required');
    expect(log).toContain('npm run dev');
  });

  it('keeps vite classification aligned across runtime, runner, loop response, and docs', async () => {
    const workspacePath = createTempDir('agentprime-runtime-vite-');
    createViteShape(workspacePath);

    const profile = getProjectRuntimeProfileSync(workspacePath);
    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const response = (loop as any).buildResponse([], {
      isComplete: false,
      missingFiles: [],
      errors: ['Build failed'],
      createdFiles: [],
    });
    const log = createProjectLog(workspacePath, ['package.json', 'vite.config.ts', 'index.html', 'src/main.js'], 'Build a Vite app');

    expect(profile.kind).toBe('vite');
    expect(projectInfo.kind).toBe('vite');
    expect(projectInfo.startCommand).toBe('npm run dev');
    expect(projectInfo.buildCommand).toBe('npm run build');
    expect(response).toContain('`npm run dev`');
    expect(response).not.toContain('Open `index.html` in your browser');
    expect(log).toContain('npm run build');
    expect(log).toContain('npm run dev');
  });

  it('keeps node classification aligned across runtime, runner, loop response, and docs', async () => {
    const workspacePath = createTempDir('agentprime-runtime-node-');
    createNodeApp(workspacePath);

    const profile = getProjectRuntimeProfileSync(workspacePath);
    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const response = (loop as any).buildResponse([], {
      isComplete: false,
      missingFiles: [],
      errors: ['Run failed'],
      createdFiles: [],
    });
    const log = createProjectLog(workspacePath, ['package.json', 'server.js', 'build.js'], 'Build a Node server');

    expect(profile.kind).toBe('node');
    expect(projectInfo.kind).toBe('node');
    expect(projectInfo.startCommand).toBe('npm start');
    expect(projectInfo.buildCommand).toBe('npm run build');
    expect(response).toContain('`npm start`');
    expect(log).toContain('npm run build');
    expect(log).toContain('npm start');
  });

  it('keeps python classification aligned across runtime, runner, loop response, and docs', async () => {
    const workspacePath = createTempDir('agentprime-runtime-python-');
    createPythonApp(workspacePath);

    const profile = getProjectRuntimeProfileSync(workspacePath);
    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const loop = new SpecializedAgentLoop({ workspacePath } as any);
    const response = (loop as any).buildResponse([], {
      isComplete: false,
      missingFiles: [],
      errors: ['Run failed'],
      createdFiles: [],
    });
    const log = createProjectLog(workspacePath, ['main.py'], 'Build a Python script');

    expect(profile.kind).toBe('python');
    expect(projectInfo.kind).toBe('python');
    expect(projectInfo.startCommand).toContain('main.py');
    expect(response).toContain('main.py');
    expect(log).toContain('python main.py');
  });
});

describe('Project runtime smoke matrix', () => {
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

  function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  }

  function createFakeVitePackage(workspacePath: string): void {
    const packageRoot = path.join(workspacePath, 'vendor', 'fake-vite');
    fs.mkdirSync(packageRoot, { recursive: true });
    writeJson(path.join(packageRoot, 'package.json'), {
      name: 'vite',
      version: '1.0.0',
      bin: {
        vite: 'index.js',
      },
    });
    fs.writeFileSync(path.join(packageRoot, 'index.js'), `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const args = process.argv.slice(2);
if (args.includes('build')) {
  const distDir = path.join(process.cwd(), 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><h1>built</h1>');
  console.log('fake vite build ok');
  process.exit(0);
}
const portIndex = args.findIndex((arg) => arg === '--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><h1>fake vite</h1>');
});
server.listen(port, '127.0.0.1', () => {
  console.log('Local: http://localhost:' + port);
});
`, 'utf-8');
  }

  function createLocalNodeDependency(workspacePath: string): void {
    const packageRoot = path.join(workspacePath, 'vendor', 'local-helper');
    fs.mkdirSync(packageRoot, { recursive: true });
    writeJson(path.join(packageRoot, 'package.json'), {
      name: 'local-helper',
      version: '1.0.0',
      main: 'index.js',
    });
    fs.writeFileSync(path.join(packageRoot, 'index.js'), 'module.exports = { message: "hello from helper" };\n');
  }

  it('verifies a static website fixture', async () => {
    const workspacePath = createTempDir('agentprime-smoke-static-');
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<!doctype html><html><body><h1>Static OK</h1></body></html>');

    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const validation = await ProjectRunner.validateProject(workspacePath, projectInfo);
    const runResult = await ProjectRunner.runProject(workspacePath, projectInfo, { probeOnly: true });

    expect(projectInfo.kind).toBe('static');
    expect(validation.valid).toBe(true);
    expect(runResult.success).toBe(true);
    expect(runResult.url).toContain('index.html');
  });

  it('verifies a browser-backed static fixture', async () => {
    const workspacePath = createTempDir('agentprime-smoke-browser-');
    fs.writeFileSync(path.join(workspacePath, 'index.html'), `<!doctype html>
<html>
  <body>
    <button id="launch">Launch</button>
    <script>
      const button = document.getElementById('launch');
      button?.addEventListener('click', () => {
        button.textContent = 'Launched';
      });
    </script>
  </body>
</html>`);

    const result = await new ProjectBrowserTester(workspacePath).test();

    expect(result.issues.some((issue) => issue.description.includes('Playwright not installed'))).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('verifies a Vite-style app fixture through install, build, and run', async () => {
    const workspacePath = createTempDir('agentprime-smoke-vite-');
    createFakeVitePackage(workspacePath);
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    writeJson(path.join(workspacePath, 'package.json'), {
      name: 'smoke-vite',
      private: true,
      scripts: {
        dev: 'vite --port 4173',
        build: 'vite build',
      },
      devDependencies: {
        vite: 'file:./vendor/fake-vite',
      },
    });
    fs.writeFileSync(path.join(workspacePath, 'vite.config.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<!doctype html><script type="module" src="/src/main.js"></script>');
    fs.writeFileSync(path.join(workspacePath, 'src', 'main.js'), 'console.log("vite smoke");\n');

    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const validation = await ProjectRunner.validateProject(workspacePath, projectInfo);
    const installResult = await ProjectRunner.installDependencies(workspacePath, projectInfo);
    const buildResult = await ProjectRunner.runBuild(workspacePath, projectInfo);
    const runResult = await ProjectRunner.runProject(workspacePath, projectInfo, { probeOnly: true });

    expect(projectInfo.kind).toBe('vite');
    expect(validation.valid).toBe(true);
    expect(installResult.success).toBe(true);
    expect(buildResult.success).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'dist', 'index.html'))).toBe(true);
    expect(runResult.success).toBe(true);
    expect(runResult.url).toContain('http://localhost:');
  });

  it('verifies a Node app fixture through install, build, and run', async () => {
    const workspacePath = createTempDir('agentprime-smoke-node-');
    const nodePort = await ProjectRunner.findAvailablePort(4321) || 4321;
    createLocalNodeDependency(workspacePath);
    writeJson(path.join(workspacePath, 'package.json'), {
      name: 'smoke-node',
      scripts: {
        start: 'node server.js',
        build: 'node build.js',
      },
      dependencies: {
        'local-helper': 'file:./vendor/local-helper',
      },
    });
    fs.writeFileSync(path.join(workspacePath, 'build.js'), `const fs = require('fs');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/build.txt', 'ok');
console.log('node build ok');
`, 'utf-8');
    fs.writeFileSync(path.join(workspacePath, 'server.js'), `const http = require('http');
const helper = require('local-helper');
const port = ${nodePort};
http.createServer((_req, res) => {
  res.end(helper.message);
}).listen(port, () => {
  console.log('http://localhost:' + port);
});
`, 'utf-8');

    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const validation = await ProjectRunner.validateProject(workspacePath, projectInfo);
    const installResult = await ProjectRunner.installDependencies(workspacePath, projectInfo);
    const buildResult = await ProjectRunner.runBuild(workspacePath, projectInfo);
    const runResult = await ProjectRunner.runProject(workspacePath, projectInfo, { probeOnly: true });

    expect(projectInfo.kind).toBe('node');
    expect(validation.valid).toBe(true);
    expect(installResult.success).toBe(true);
    expect(buildResult.success).toBe(true);
    expect(buildResult.output).toContain('node build ok');
    expect(runResult.success).toBe(true);
    expect(runResult.url).toContain(`http://localhost:${nodePort}`);
  });

  it('verifies a Python app fixture through run verification', async () => {
    const workspacePath = createTempDir('agentprime-smoke-python-');
    fs.writeFileSync(path.join(workspacePath, 'main.py'), 'print("python smoke ok")\n', 'utf-8');

    const projectInfo = await ProjectRunner.detectProject(workspacePath);
    const validation = await ProjectRunner.validateProject(workspacePath, projectInfo);
    const runResult = await ProjectRunner.runProject(workspacePath, projectInfo, { probeOnly: true });

    expect(projectInfo.kind).toBe('python');
    expect(validation.valid).toBe(true);
    expect(runResult.success).toBe(true);
    expect(runResult.output).toContain('python smoke ok');
  });
});

describe('ProjectRunner Python command quoting', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot && fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  function createWorkspaceWithSpaces(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const workspacePath = path.join(root, 'python workspace');
    fs.mkdirSync(workspacePath, { recursive: true });
    tempRoots.push(root);
    return workspacePath;
  }

  function writeExecutable(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, 0o755);
    }
  }

  it('quotes virtualenv start commands when the workspace path contains spaces', async () => {
    const workspacePath = createWorkspaceWithSpaces('agentprime-python-spaces-');
    const binDir = path.join(workspacePath, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin');
    const activateFile = path.join(binDir, process.platform === 'win32' ? 'activate.bat' : 'activate');
    const pythonExecutable = path.join(
      binDir,
      process.platform === 'win32' ? 'python.exe' : 'python'
    );

    fs.writeFileSync(path.join(workspacePath, 'main.py'), 'print("quoted start")\n', 'utf-8');
    writeExecutable(activateFile, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n');

    const projectInfo = await ProjectRunner.detectProject(workspacePath);

    expect(projectInfo.startCommand).toBe(`"${pythonExecutable}" "main.py"`);
  });

  it('quotes Python install commands when the interpreter path contains spaces', async () => {
    const workspacePath = createWorkspaceWithSpaces('agentprime-python-install-');
    const fakePythonPath = path.join(
      workspacePath,
      'bin with spaces',
      process.platform === 'win32' ? 'fake python.cmd' : 'fake-python'
    );

    fs.writeFileSync(path.join(workspacePath, 'main.py'), 'print("quoted install")\n', 'utf-8');
    fs.writeFileSync(path.join(workspacePath, 'requirements.txt'), 'requests==2.31.0\n', 'utf-8');
    writeExecutable(
      fakePythonPath,
      process.platform === 'win32'
        ? '@echo off\r\necho %*\r\nexit /b 0\r\n'
        : '#!/bin/sh\necho "$@"\n'
    );

    const installResult = await ProjectRunner.installDependencies(workspacePath, {
      type: 'python',
      kind: 'python',
      displayName: 'Python app',
      hasPackageJson: false,
      hasRequirements: true,
      hasIndexHtml: false,
      mainFile: 'main.py',
      requiresInstall: true,
      readinessSummary: 'quoted install',
      pythonPath: fakePythonPath,
      hasVirtualEnv: false,
      installCommand: 'pip install -r requirements.txt',
    } as any);

    expect(installResult.success).toBe(true);
    expect(installResult.output).toMatch(/-m pip install -r "?requirements\.txt"?/);
  });
});
