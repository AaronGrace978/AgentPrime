import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getLanguageDiagnostics } from '../src/main/language/typescript-diagnostics';

describe('multi-language diagnostics', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function makeWorkspace(): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-language-diagnostics-'));
    tempDirs.push(workspace);
    return workspace;
  }

  it('returns TypeScript semantic diagnostics for unsaved content', async () => {
    const workspace = makeWorkspace();
    const result = await getLanguageDiagnostics({
      filePath: 'src/app.ts',
      content: 'const answer: string = 42;\n',
      language: 'typescript',
      workspacePath: workspace,
    }, workspace);

    expect(result.success).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.ruleId === 'TS2322')).toBe(true);
  });

  it('returns JSON syntax diagnostics', async () => {
    const workspace = makeWorkspace();
    const result = await getLanguageDiagnostics({
      filePath: 'settings.json',
      content: '{ "enabled": }',
      language: 'json',
      workspacePath: workspace,
    }, workspace);

    expect(result.success).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].source).toBe('json');
  });

  it('returns CSS diagnostics', async () => {
    const workspace = makeWorkspace();
    const result = await getLanguageDiagnostics({
      filePath: 'styles.css',
      content: 'body { color: ; }',
      language: 'css',
      workspacePath: workspace,
    }, workspace);

    expect(result.success).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].source).toBe('css');
  });

  it('returns structural HTML diagnostics', async () => {
    const workspace = makeWorkspace();
    const result = await getLanguageDiagnostics({
      filePath: 'index.html',
      content: '<main><section></main>',
      language: 'html',
      workspacePath: workspace,
    }, workspace);

    expect(result.success).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.ruleId === 'HTMLTagMismatch')).toBe(true);
  });

  it('returns YAML diagnostics', async () => {
    const workspace = makeWorkspace();
    const result = await getLanguageDiagnostics({
      filePath: 'config.yaml',
      content: 'name: [unterminated',
      language: 'yaml',
      workspacePath: workspace,
    }, workspace);

    expect(result.success).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].source).toBe('yaml');
  });

  it('checks Python syntax when a local Python runtime is available', async () => {
    const workspace = makeWorkspace();
    const result = await getLanguageDiagnostics({
      filePath: 'main.py',
      content: 'def broken(:\n    pass\n',
      language: 'python',
      workspacePath: workspace,
    }, workspace);

    if (!result.success && /not recognized|ENOENT|unavailable/i.test(result.error || '')) {
      return;
    }

    expect(result.success).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].source).toBe('python');
  });
});
