import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

import {
  bootstrapDeterministicScaffold,
  executeWithSpecialists,
  shouldSkipGenerativeSpecialistsAfterScaffold,
} from '../src/main/agent/specialized-agents';
import { detectCanonicalTemplateId, scaffoldProjectFromTemplate } from '../src/main/agent/scaffold-resolver';
import aiRouter from '../src/main/ai-providers';

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: { models: [{ name: 'test-model' }] } }),
}));

describe('deterministic Three.js bootstrap', () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-threejs-bootstrap-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    expect(
      detectCanonicalTemplateId('Build DinoPrime as a playable dinosaur runner game')
    ).toBe('threejs-platformer');
    expect(
      detectCanonicalTemplateId('Create a browser arcade game with canvas controls')
    ).toBe('threejs-game');
    expect(
      detectCanonicalTemplateId('Build me a Minecraft game with blocks I can place and break')
    ).toBe('threejs-game');
  });

  it('detects simple website and homepage wording as static-site template', () => {
    expect(detectCanonicalTemplateId('Build a simple website for my brand')).toBe('static-site');
    expect(detectCanonicalTemplateId('Create a homepage for my portfolio')).toBe('static-site');
  });

  it('detects desktop IDE-style prompts as the canonical Tauri React template', () => {
    expect(detectCanonicalTemplateId('Build a VS coding tool with a Dino Buddy themed IDE shell')).toBe(
      'tauri-react'
    );
    expect(detectCanonicalTemplateId('Create a Tauri desktop app for editing code')).toBe(
      'tauri-react'
    );
    expect(detectCanonicalTemplateId('Create an Electron IDE for editing code')).toBe(
      'electron-react'
    );
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

  it('scaffolds Tauri React desktop apps with src-tauri-owned config only', async () => {
    const scaffolded = await scaffoldProjectFromTemplate(
      workspacePath,
      'Build a proper IDE desktop app in Tauri',
      {
        projectName: 'AgentPrime Shell',
        runPostCreate: false,
      }
    );

    expect(scaffolded.success).toBe(true);
    expect(scaffolded.templateId).toBe('tauri-react');
    expect(scaffolded.createdFiles).toEqual(expect.arrayContaining([
      'package.json',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'vite.config.ts',
      'src-tauri/Cargo.toml',
      'src-tauri/tauri.conf.json',
      'src-tauri/src/main.rs',
    ]));
    expect(fs.existsSync(path.join(workspacePath, 'Cargo.toml'))).toBe(false);
    expect(fs.existsSync(path.join(workspacePath, 'src-tauri', 'Cargo.toml'))).toBe(true);

    const appTsx = fs.readFileSync(path.join(workspacePath, 'src', 'App.tsx'), 'utf-8');
    const syntaxCheck = ts.transpileModule(appTsx, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    expect(syntaxCheck.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it('scaffolds Electron IDE apps through the deterministic desktop template path', async () => {
    const scaffolded = await scaffoldProjectFromTemplate(
      workspacePath,
      'Build a proper Electron IDE desktop app for editing code',
      {
        projectName: 'Electron Shell',
        runPostCreate: false,
      }
    );

    expect(scaffolded.success).toBe(true);
    expect(scaffolded.templateId).toBe('electron-react');
    expect(scaffolded.createdFiles).toEqual(expect.arrayContaining([
      'package.json',
      'src/main/main.ts',
      'src/main/preload.ts',
      'src/renderer/App.tsx',
      'src/renderer/styles.css',
    ]));

    const appTsx = fs.readFileSync(path.join(workspacePath, 'src', 'renderer', 'App.tsx'), 'utf-8');
    expect(appTsx).toContain('Electron + React');
    expect(appTsx).toContain('Targeted Assistant');
    expect(appTsx).not.toContain('Tauri + React');
  });

  it('applies deterministic scaffold before AI planning in scaffold-only mode', async () => {
    const result = await executeWithSpecialists(
      'Build a proper IDE desktop app in Tauri',
      ['tool_orchestrator', 'javascript_specialist', 'pipeline_specialist'],
      {
        workspacePath,
        files: [],
        deterministicScaffoldOnly: true,
        planningMode: 'full',
      },
      'create'
    );

    expect(result.scaffoldApplied).toBe(true);
    expect(result.scaffoldTemplateId).toBe('tauri-react');
    expect(result.skippedGenerativePass).toBe(true);
    expect(result.executedTools.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(workspacePath, 'src-tauri', 'Cargo.toml'))).toBe(true);
  });

  it('skips the separate AI planning pass after applying a create-mode scaffold', async () => {
    const chatSpy = jest.spyOn(aiRouter, 'chat').mockResolvedValue({
      success: true,
      content: 'This planning call should be skipped',
    } as any);

    const result = await executeWithSpecialists(
      'Build a proper IDE desktop app in Tauri',
      [],
      {
        workspacePath,
        files: [],
        planningMode: 'full',
      },
      'create'
    );

    expect(result.scaffoldApplied).toBe(true);
    expect(result.scaffoldTemplateId).toBe('tauri-react');
    expect(chatSpy).not.toHaveBeenCalled();
  });

  it('skips planning after applying a create-mode Three.js canonical scaffold', async () => {
    const chatSpy = jest.spyOn(aiRouter, 'chat').mockResolvedValue({
      success: true,
      content: 'This planning call should be skipped',
    } as any);

    const result = await executeWithSpecialists(
      'Build a browser-based Three.js dogfighting game with Vite',
      ['tool_orchestrator', 'javascript_specialist'],
      {
        workspacePath,
        files: [],
        planningMode: 'full',
      },
      'create'
    );

    expect(result.scaffoldApplied).toBe(true);
    expect(result.scaffoldTemplateId).toBe('threejs-game');
    expect(result.skippedGenerativePass).toBe(true);
    expect(chatSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, 'src', 'game', 'Game.ts'))).toBe(true);
  });

  it('customizes Minecraft-style prompts into a deterministic voxel block world', async () => {
    const chatSpy = jest.spyOn(aiRouter, 'chat').mockResolvedValue({
      success: true,
      content: 'This planning call should be skipped',
    } as any);

    const result = await executeWithSpecialists(
      'Build me a Minecraft game with blocks I can place and break',
      ['tool_orchestrator', 'javascript_specialist', 'pipeline_specialist'],
      {
        workspacePath,
        files: [],
        planningMode: 'full',
      },
      'create'
    );

    expect(result.scaffoldApplied).toBe(true);
    expect(result.scaffoldTemplateId).toBe('threejs-game');
    expect(result.skippedGenerativePass).toBe(true);
    expect(chatSpy).not.toHaveBeenCalled();

    const appTsx = fs.readFileSync(path.join(workspacePath, 'src', 'App.tsx'), 'utf-8');
    const gameTs = fs.readFileSync(path.join(workspacePath, 'src', 'game', 'Game.ts'), 'utf-8');
    const worldTs = fs.readFileSync(path.join(workspacePath, 'src', 'game', 'world', 'World.ts'), 'utf-8');

    expect(appTsx).toContain('Minecraft-Style Voxel Starter');
    expect(appTsx).toContain('Left click - Break block');
    expect(gameTs).toContain('this.world.addBlock');
    expect(worldTs).toContain("type BlockType = 'grass' | 'dirt' | 'stone' | 'wood' | 'leaves'");

    const syntaxChecks = [appTsx, gameTs, worldTs].map((source) =>
      ts.transpileModule(source, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
        reportDiagnostics: true,
      })
    );
    expect(
      syntaxChecks.flatMap((check) =>
        check.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) || []
      )
    ).toEqual([]);
  });

  it('uses deterministic platformer scaffold for generic dino runner game prompts', async () => {
    const chatSpy = jest.spyOn(aiRouter, 'chat').mockResolvedValue({
      success: true,
      content: 'This planning call should be skipped',
    } as any);

    const result = await executeWithSpecialists(
      'Build DinoPrime as a playable dinosaur runner game',
      ['tool_orchestrator', 'javascript_specialist', 'pipeline_specialist'],
      {
        workspacePath,
        files: [],
        planningMode: 'full',
      },
      'create'
    );

    expect(result.scaffoldApplied).toBe(true);
    expect(result.scaffoldTemplateId).toBe('threejs-platformer');
    expect(result.skippedGenerativePass).toBe(true);
    expect(chatSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, 'src', 'game', 'Game.ts'))).toBe(true);
  });

  it('skips planning and structure orchestration for existing canonical Tauri scaffolds', async () => {
    const scaffolded = await scaffoldProjectFromTemplate(
      workspacePath,
      'Build a proper IDE desktop app in Tauri',
      {
        projectName: 'Existing Shell',
        runPostCreate: false,
      }
    );
    expect(scaffolded.success).toBe(true);

    const chatSpy = jest.spyOn(aiRouter, 'chat').mockResolvedValue({
      success: true,
      content: 'This planning/orchestrator call should be skipped',
    } as any);

    const result = await executeWithSpecialists(
      'Build a proper IDE desktop app in Tauri',
      ['tool_orchestrator'],
      {
        workspacePath,
        files: scaffolded.createdFiles,
        planningMode: 'full',
      },
      'enhance'
    );

    expect(result.scaffoldApplied).toBe(false);
    expect(result.executedTools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        specialist: 'deterministic_customizer',
        result: expect.objectContaining({
          path: 'src/App.tsx',
          customized: 'tauri-react',
        }),
      }),
    ]));
    expect(chatSpy).not.toHaveBeenCalled();
  });

  it('does not treat a Tauri scaffold as an existing Three.js template from shared Vite files', async () => {
    const scaffolded = await scaffoldProjectFromTemplate(
      workspacePath,
      'Build a proper IDE desktop app in Tauri',
      {
        projectName: 'Existing Shell',
        runPostCreate: false,
      }
    );
    expect(scaffolded.success).toBe(true);

    const chatSpy = jest.spyOn(aiRouter, 'chat').mockResolvedValue({
      success: true,
      content: 'No deterministic tool calls needed.',
    } as any);

    await executeWithSpecialists(
      'Build a browser-based Three.js dogfighting game with Vite',
      ['tool_orchestrator'],
      {
        workspacePath,
        files: scaffolded.createdFiles,
        planningMode: 'none',
      },
      'enhance'
    );

    expect(chatSpy).toHaveBeenCalled();
  });
});
