/**
 * Bundler coherence: three/react + serve-only must fail validation and auto-fix to Vite
 */
import { validatePackageJson, autoFixPackageJsonScripts } from '../../src/main/agent/tool-validation';

describe('tool-validation bundler coherence', () => {
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
});
