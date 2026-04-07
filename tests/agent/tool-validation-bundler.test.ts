/**
 * Bundler coherence: three/react + serve-only must fail validation and auto-fix to Vite
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  validatePackageJson,
  autoFixPackageJsonScripts,
  validateJavaScriptFile,
} from '../../src/main/agent/tool-validation';

describe('tool-validation bundler coherence', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  const makeTempWorkspace = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-bundler-'));
    tempDirs.push(dir);
    return dir;
  };

  it('rejects package.json with three but no bundler', () => {
    const bad = JSON.stringify({
      name: 't',
      version: '1.0.0',
      dependencies: { three: '^0.160.0' },
      devDependencies: { serve: '^14.0.0' },
      scripts: { start: 'npx serve', dev: 'npx serve' }
    });
    const v = validatePackageJson(bad);
    expect(v.valid).toBe(false);
    expect(v.error).toMatch(/vite|bundler/i);
  });

  it('autoFixPackageJsonScripts adds vite when browser npm deps present', () => {
    const bad = JSON.stringify({
      name: 't',
      version: '1.0.0',
      dependencies: { three: '^0.160.0' },
      devDependencies: { serve: '^14.0.0' },
      scripts: { start: 'npx serve', dev: 'npx serve' }
    });
    const fx = autoFixPackageJsonScripts(bad);
    expect(fx.fixed).toBe(true);
    const parsed = JSON.parse(fx.content);
    expect(parsed.devDependencies?.vite).toBeTruthy();
    expect(parsed.scripts.dev).toBe('vite');
    expect(parsed.scripts.start).toBe('vite');
    expect(parsed.scripts.build).toBe('vite build');
    expect(parsed.scripts.preview).toBe('vite preview');
  });

  it('treats a Vite-style src entry in index.html as bundler runtime hint', () => {
    const workspace = makeTempWorkspace();
    fs.writeFileSync(
      path.join(workspace, 'index.html'),
      '<!doctype html><html><body><script type="module" src="./src/main.tsx"></script></body></html>',
      'utf-8'
    );

    const validation = validateJavaScriptFile(
      `import './index.css';\nexport const app = true;`,
      'src/App.tsx',
      { workspacePath: workspace }
    );

    expect(validation.valid).toBe(true);
    expect(validation.warning).toBeUndefined();
  });

  it('warns about CSS imports without using CRITICAL severity text', () => {
    const validation = validateJavaScriptFile(
      `import './styles.css';\nconsole.log('hello');`,
      'app.js'
    );

    expect(validation.valid).toBe(true);
    expect(validation.warning).toContain('WARNING:');
    expect(validation.warning).not.toContain('CRITICAL:');
  });
});
