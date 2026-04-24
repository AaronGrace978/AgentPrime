import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  type BrowserTestResult,
  formatBrowserTestResults,
  ProjectBrowserTester,
  testProjectInBrowser,
} from '../src/main/agent/tools/projectTester';

describe('ProjectBrowserTester helpers', () => {
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

  function createBaseResult(): BrowserTestResult {
    return {
      passed: true,
      score: 100,
      issues: [],
      suggestions: [],
      consoleErrors: [],
      consoleWarnings: [],
      testedElements: [],
    };
  }

  it('returns an informational result when no HTML files are present', async () => {
    const workspacePath = createTempDir('agentprime-browser-empty-');

    const result = await testProjectInBrowser(workspacePath);

    expect(result.passed).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'info',
      description: 'No HTML files found - skipping browser tests',
    }));
  });

  it('prioritizes index html files and ignores build artifacts while scanning', () => {
    const workspacePath = createTempDir('agentprime-browser-scan-');
    fs.mkdirSync(path.join(workspacePath, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'build'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, '.next', 'server', 'app'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, 'nested', 'page.html'), '<html></html>');
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(workspacePath, 'node_modules', 'ignore.html'), '<html></html>');
    fs.writeFileSync(path.join(workspacePath, 'build', 'ignore.html'), '<html></html>');
    fs.writeFileSync(path.join(workspacePath, '.next', 'server', 'app', 'ignore.html'), '<html></html>');

    const tester = new ProjectBrowserTester(workspacePath);
    const htmlFiles = (tester as any).findHtmlFiles();

    expect(path.basename(htmlFiles[0])).toBe('index.html');
    expect(htmlFiles.some((filePath: string) => filePath.includes('node_modules'))).toBe(false);
    expect(htmlFiles.some((filePath: string) => filePath.includes(`${path.sep}build${path.sep}`))).toBe(false);
    expect(htmlFiles.some((filePath: string) => filePath.includes(`${path.sep}.next${path.sep}`))).toBe(false);
  });

  it('detects vite and other bundler-managed projects from package metadata', () => {
    const viteWorkspace = createTempDir('agentprime-browser-vite-');
    fs.writeFileSync(path.join(viteWorkspace, 'package.json'), JSON.stringify({
      scripts: { dev: 'vite --host' },
      devDependencies: { vite: '^5.4.0' },
    }, null, 2));

    const webpackWorkspace = createTempDir('agentprime-browser-webpack-');
    fs.writeFileSync(path.join(webpackWorkspace, 'package.json'), JSON.stringify({
      devDependencies: { webpack: '^5.0.0' },
    }, null, 2));

    const viteTester = new ProjectBrowserTester(viteWorkspace);
    const webpackTester = new ProjectBrowserTester(webpackWorkspace);

    expect((viteTester as any).isViteProject()).toBe(true);
    expect((viteTester as any).isBundlerManagedProject()).toBe(true);
    expect((webpackTester as any).isViteProject()).toBe(false);
    expect((webpackTester as any).isBundlerManagedProject()).toBe(true);
  });

  it('flags static-analysis issues for unsafe script placement and missing assets', () => {
    const workspacePath = createTempDir('agentprime-browser-static-');
    const htmlPath = path.join(workspacePath, 'index.html');
    fs.writeFileSync(htmlPath, `<!doctype html>
<html>
  <head>
    <script src="./main.js"></script>
  </head>
  <body>
    <button onclick="launch()">Launch</button>
    <link rel="stylesheet" href="./missing.css" />
  </body>
</html>`);

    const tester = new ProjectBrowserTester(workspacePath);
    const result = (tester as any).staticHtmlAnalysis(createBaseResult(), [htmlPath]);

    expect(result.passed).toBe(false);
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.stringContaining('Found 1 buttons with inline onclick'),
      expect.stringContaining('Scripts in <head> without defer/async may block page load'),
    ]));
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'critical',
      description: expect.stringContaining('Referenced file not found: ./missing.css'),
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'critical',
      description: expect.stringContaining('Referenced file not found: ./main.js'),
    }));
  });

  it('resolves root-absolute asset references from the workspace root', () => {
    const workspacePath = createTempDir('agentprime-browser-root-assets-');
    const htmlPath = path.join(workspacePath, 'index.html');
    fs.writeFileSync(path.join(workspacePath, 'styles.css'), 'body { color: white; }');
    fs.writeFileSync(path.join(workspacePath, 'main.js'), 'console.log("ok");');
    fs.writeFileSync(htmlPath, `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <script src="/main.js"></script>
  </body>
</html>`);

    const tester = new ProjectBrowserTester(workspacePath);
    const result = (tester as any).staticHtmlAnalysis(createBaseResult(), [htmlPath]);

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports runtime server errors and formats readable failure output', () => {
    const workspacePath = createTempDir('agentprime-browser-runtime-');
    const tester = new ProjectBrowserTester(workspacePath);
    const result = createBaseResult();
    result.score = 95;
    result.consoleErrors.push('ReferenceError: launch is not defined');
    result.suggestions.push('Wire the click handler before rendering the button');
    result.testedElements.push({
      selector: 'button',
      description: 'Launch',
      clickable: false,
      visible: true,
      blocked: true,
      blockedBy: 'DIV#overlay.modal',
    });

    (tester as any).serverOutput = [
      'failed to resolve import "./missing.js"',
      'Internal Server Error: boom',
      'all good here',
    ].join('\n');
    (tester as any).reportServerRuntimeIssues(result);

    const output = formatBrowserTestResults({
      ...result,
      passed: false,
    });

    expect(result.issues).toHaveLength(2);
    expect(result.score).toBe(65);
    expect(output).toContain('BROWSER TESTS FAILED');
    expect(output).toContain('Console Errors');
    expect(output).toContain('Critical Issues');
    expect(output).toContain('Blocked UI Elements');
    expect(output).toContain('Suggestions');
    expect(output).toContain('DIV#overlay.modal');
  });

  it('captures startup diagnostics before falling back to static analysis', () => {
    const workspacePath = createTempDir('agentprime-browser-startup-failure-');
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
      scripts: { dev: 'vite' },
      devDependencies: { vite: '^5.4.0' },
    }, null, 2));

    const tester = new ProjectBrowserTester(workspacePath);
    const result = createBaseResult();
    (tester as any).serverOutput = 'failed to resolve import "./missing.js"\nstacktrace line';

    (tester as any).handleServerStartupFailure(result);

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        description: expect.stringContaining('Dev server reported runtime error'),
      }),
      expect.objectContaining({
        severity: 'warning',
        description: 'Could not start local server - falling back to static analysis',
      }),
    ]));
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.stringContaining('Server startup output: failed to resolve import'),
      expect.stringContaining('Bundler-managed projects need a clean dev server boot'),
    ]));
  });

  it('stops the spawned server and clears internal process state', async () => {
    const workspacePath = createTempDir('agentprime-browser-stop-');
    const tester = new ProjectBrowserTester(workspacePath);
    const fakeProcess = {
      kill: jest.fn(),
      stdout: {
        removeAllListeners: jest.fn(),
        destroy: jest.fn(),
      },
      stderr: {
        removeAllListeners: jest.fn(),
        destroy: jest.fn(),
      },
    };

    (tester as any).serverProcess = fakeProcess;
    (tester as any).serverPort = 4321;

    await (tester as any).stopServer();

    expect(fakeProcess.stdout.removeAllListeners).toHaveBeenCalled();
    expect(fakeProcess.stderr.removeAllListeners).toHaveBeenCalled();
    expect(fakeProcess.kill).toHaveBeenCalled();
    expect(fakeProcess.stdout.destroy).toHaveBeenCalled();
    expect(fakeProcess.stderr.destroy).toHaveBeenCalled();
    expect((tester as any).serverProcess).toBeNull();
    expect((tester as any).serverPort).toBe(0);
  });

  it('formats successful browser test output concisely', () => {
    const output = formatBrowserTestResults({
      passed: true,
      score: 92,
      issues: [],
      suggestions: [],
      consoleErrors: [],
      consoleWarnings: [],
      testedElements: [
        { selector: 'button', description: 'Launch', clickable: true, visible: true },
        { selector: 'a', description: 'Docs', clickable: true, visible: true },
      ],
    });

    expect(output).toContain('Browser tests passed');
    expect(output).toContain('Tested 2 interactive elements');
  });
});
