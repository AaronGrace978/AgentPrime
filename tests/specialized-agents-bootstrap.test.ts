import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  bootstrapDeterministicScaffold,
  shouldSkipGenerativeSpecialistsAfterScaffold,
} from '../src/main/agent/specialized-agents';
import { detectCanonicalTemplateId, scaffoldProjectFromTemplate } from '../src/main/agent/scaffold-resolver';

describe('deterministic Three.js bootstrap', () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-threejs-bootstrap-'));
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('creates a buildable baseline scaffold for near-empty Three.js game workspaces', async () => {
    const bootstrapped = await bootstrapDeterministicScaffold(
      workspacePath,
      'Build me a three.js flight simulator please'
    );

    expect(bootstrapped.length).toBeGreaterThan(5);
    expect(fs.existsSync(path.join(workspacePath, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'src', 'main.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'src', 'App.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'src', 'game', 'Game.ts'))).toBe(true);

    const packageJson = JSON.parse(fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8'));
    expect(packageJson.dependencies.three).toBeDefined();

    const indexHtml = fs.readFileSync(path.join(workspacePath, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('./src/main.tsx');
  });

  it('detects canonical scaffold templates for browser three.js game requests', () => {
    expect(
      detectCanonicalTemplateId('Create a browser-based Three.js dogfighting game with Vite')
    ).toBe('threejs-game');
  });

  it('detects side scroller platformer prompts as canonical Three.js game scaffolds', () => {
    expect(
      detectCanonicalTemplateId('Build a Three.js side scroller with WASD movement and jump physics')
    ).toBe('threejs-platformer');
  });

  it('detects simple website and homepage wording as static-site template', () => {
    expect(detectCanonicalTemplateId('Build a simple website for my brand')).toBe('static-site');
    expect(detectCanonicalTemplateId('Create a homepage for my portfolio')).toBe('static-site');
  });

  it('continues into generative specialists after static-site scaffold unless scaffold-only is explicit', () => {
    expect(
      shouldSkipGenerativeSpecialistsAfterScaffold({
        scaffoldApplied: true,
        deterministicScaffoldOnly: false,
      })
    ).toBe(false);

    expect(
      shouldSkipGenerativeSpecialistsAfterScaffold({
        scaffoldApplied: true,
        deterministicScaffoldOnly: true,
      })
    ).toBe(true);
  });

  it('scaffolds explicit threejs_viewer requests through the canonical template path', async () => {
    const scaffolded = await scaffoldProjectFromTemplate(workspacePath, 'Create a 3D browser game', {
      projectType: 'threejs_viewer',
      projectName: 'Flight Deck',
      runPostCreate: false,
    });

    expect(scaffolded.success).toBe(true);
    expect(scaffolded.templateId).toBe('threejs-game');
    expect(scaffolded.createdFiles).toEqual(expect.arrayContaining([
      'package.json',
      'index.html',
      'src/main.tsx',
      'src/game/Game.ts',
    ]));
  });

  it('prefers the platformer template for side scroller prompts even when projectType is generic threejs_viewer', async () => {
    const scaffolded = await scaffoldProjectFromTemplate(
      workspacePath,
      'Build a Three.js side scroller with WASD movement and jump physics',
      {
        projectType: 'threejs_viewer',
        projectName: 'Bell Hop',
        runPostCreate: false,
      }
    );

    expect(scaffolded.success).toBe(true);
    expect(scaffolded.templateId).toBe('threejs-platformer');

    const readme = fs.readFileSync(path.join(workspacePath, 'README.md'), 'utf-8');
    expect(readme).toContain('side-scrolling platformer');
  });
});
