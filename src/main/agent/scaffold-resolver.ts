import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

import TemplateEngine from '../legacy/template-engine';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';
import { looksSimpleStaticWebsiteTask, stripNegatedIntentClauses } from './static-site-classifier';

interface TemplateDefinitionFile {
  template: string;
  path: string;
}

interface TemplateDefinition {
  files?: TemplateDefinitionFile[];
}

export interface ScaffoldFileChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  action: 'created' | 'modified';
  status: 'pending';
}

export interface ScaffoldCallbacks {
  onFileChange?: (change: ScaffoldFileChange) => void;
}

export interface ScaffoldTemplateResult {
  success: boolean;
  templateId?: string;
  projectPath: string;
  createdFiles: string[];
  dependenciesInstalled?: boolean;
  installOutput?: string;
  error?: string;
}

function looksIdeTask(task: string): boolean {
  const lower = task.toLowerCase();
  return (
    /\bide\b/.test(lower) ||
    lower.includes('code editor') ||
    lower.includes('coding tool') ||
    lower.includes('vs code') ||
    lower.includes('vscode') ||
    lower.includes('visual studio code')
  );
}

function looksVoxelGameTask(task: string): boolean {
  const lower = task.toLowerCase();
  return (
    lower.includes('minecraft') ||
    lower.includes('voxel') ||
    lower.includes('block world') ||
    lower.includes('block-world') ||
    lower.includes('blocky') ||
    lower.includes('break block') ||
    lower.includes('place block')
  );
}

const PROJECT_TYPE_TEMPLATE_MAP: Record<string, string> = {
  static_site: 'static-site',
  threejs_viewer: 'threejs-game',
  threejs_platformer: 'threejs-platformer',
  tauri: 'tauri-react',
  tauri_react: 'tauri-react',
  electron: 'electron-react',
  electron_react: 'electron-react',
  desktop: 'tauri-react',
  desktop_app: 'tauri-react',
  vue_vite: 'vue-vite',
};

const REQUIRED_TEMPLATE_OUTPUTS: Record<string, string[]> = {
  'static-site': ['index.html', 'styles.css', 'app.js'],
  'threejs-game': ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/game/Game.ts'],
  'threejs-platformer': ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/game/Game.ts'],
  'tauri-react': [
    'package.json',
    'index.html',
    'src/main.tsx',
    'src/App.tsx',
    'vite.config.ts',
    'src-tauri/Cargo.toml',
    'src-tauri/tauri.conf.json',
    'src-tauri/src/main.rs',
  ],
  'electron-react': [
    'package.json',
    'src/main/main.ts',
    'src/main/preload.ts',
    'src/renderer/index.html',
    'src/renderer/index.tsx',
    'src/renderer/App.tsx',
    'src/renderer/styles.css',
    'vite.config.ts',
  ],
  'vue-vite': ['package.json', 'index.html', 'src/main.ts', 'src/App.vue', 'vite.config.ts'],
};

export function detectCanonicalTemplateId(task: string, projectType?: string): string | null {
  const normalizedTask = normalizeTemplateDetectionTask(task);
  const lower = normalizedTask.toLowerCase();
  const isVoxelGameTask = looksVoxelGameTask(normalizedTask);
  const mentionsThreeJs = lower.includes('three.js') || lower.includes('threejs');
  const isPlatformerLikeTask =
    lower.includes('side scroller') ||
    lower.includes('sidescroller') ||
    lower.includes('platformer') ||
    lower.includes('runner') ||
    lower.includes('endless runner') ||
    lower.includes('jump') ||
    lower.includes('wasd') ||
    lower.includes('dino') ||
    lower.includes('dinosaur') ||
    lower.includes('t-rex') ||
    lower.includes('trex');
  const isThreeJsPlatformerTask = mentionsThreeJs && isPlatformerLikeTask;
  const normalizedType = (projectType || '').trim().toLowerCase();
  if (normalizedType === 'threejs_platformer' || (normalizedType === 'threejs_viewer' && isThreeJsPlatformerTask)) {
    return 'threejs-platformer';
  }
  if (normalizedType && PROJECT_TYPE_TEMPLATE_MAP[normalizedType]) {
    return PROJECT_TYPE_TEMPLATE_MAP[normalizedType];
  }
  const mentionsTauri = /\btauri\b/.test(lower);
  const mentionsElectron = /\belectron\b/.test(lower);
  const mentionsDesktopIdeLikeGoal =
    lower.includes('desktop app') ||
    lower.includes('desktop application') ||
    lower.includes('coding tool') ||
    lower.includes('code editor') ||
    lower.includes('vs code') ||
    lower.includes('vscode') ||
    lower.includes('visual studio code') ||
    lower.includes('proper ide') ||
    lower.includes('ide shell') ||
    /\bide\b/.test(lower);
  const mentionsDinoBuddyDesktopTheme =
    lower.includes('dino buddy') && (mentionsDesktopIdeLikeGoal || lower.includes('themed'));

  if (mentionsElectron) {
    return 'electron-react';
  }
  if (mentionsTauri || mentionsDesktopIdeLikeGoal || mentionsDinoBuddyDesktopTheme) {
    return 'tauri-react';
  }

  const mentionsBrowser = lower.includes('browser') || lower.includes('web') || lower.includes('vite');
  const mentionsGameLikeGoal =
    lower.includes('game') ||
    lower.includes('playable') ||
    lower.includes('arcade') ||
    lower.includes('canvas') ||
    lower.includes('simulator') ||
    lower.includes('flight') ||
    lower.includes('space') ||
    lower.includes('3d') ||
    lower.includes('side scroller') ||
    lower.includes('sidescroller') ||
    lower.includes('platformer') ||
    lower.includes('jump') ||
    lower.includes('wasd');

  if (isVoxelGameTask) {
    return 'threejs-game';
  }
  if (isThreeJsPlatformerTask || (isPlatformerLikeTask && mentionsGameLikeGoal)) {
    return 'threejs-platformer';
  }
  if (
    (mentionsThreeJs && (mentionsGameLikeGoal || mentionsBrowser)) ||
    (mentionsBrowser && mentionsGameLikeGoal)
  ) {
    return 'threejs-game';
  }

  const mentionsStaticSite =
    lower.includes('static site') ||
    lower.includes('static website') ||
    lower.includes('landing page') ||
    lower.includes('marketing page') ||
    lower.includes('portfolio site');
  if (mentionsStaticSite) {
    return 'static-site';
  }

  const mentionsVue = /\bvue\b/.test(lower);
  const mentionsStarterLikeGoal =
    lower.includes('starter') ||
    lower.includes('scaffold') ||
    lower.includes('template') ||
    lower.includes('landing page') ||
    lower.includes('dashboard') ||
    lower.includes('app');
  if ((mentionsVue && (lower.includes('vite') || mentionsStarterLikeGoal)) || lower.includes('vue vite')) {
    return 'vue-vite';
  }

  if (looksSimpleStaticWebsiteTask(normalizedTask)) {
    return 'static-site';
  }

  return null;
}

export function normalizeTemplateDetectionTask(task: string): string {
  const withoutContext = task
    .split(/\n## IDE_CONTEXT\b/i)[0]
    .split(/\n<!--\s*IDE_CONTEXT/i)[0]
    .split(/\n## TERMINAL_PARSER\b/i)[0]
    .trim();
  return stripNegatedIntentClauses(withoutContext).trim();
}

// File extensions that indicate the folder is a user media/document library,
// NOT a code workspace. If these dominate the target folder, we must refuse
// to scaffold — that's how a Vite app ended up inside a Screen Recordings
// folder.
const MEDIA_DUMP_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.tiff',
  '.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg',
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.zip', '.rar', '.7z',
]);

function looksLikeMediaDumpSync(workspacePath: string): boolean {
  try {
    const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
    const projectMarkers = new Set([
      'package.json', 'pyproject.toml', 'cargo.toml', 'go.mod',
      'pom.xml', 'build.gradle', 'gemfile', '.git',
      'tsconfig.json', 'composer.json', 'requirements.txt',
    ]);
    let mediaCount = 0;
    let fileCount = 0;
    for (const entry of entries) {
      const lowerName = entry.name.toLowerCase();
      if (projectMarkers.has(lowerName)) return false;
      if (!entry.isFile()) continue;
      fileCount++;
      const ext = path.extname(lowerName);
      if (MEDIA_DUMP_EXTENSIONS.has(ext)) mediaCount++;
    }
    // Refuse scaffold in any folder that's overwhelmingly media — even 5 files
    // is enough signal that this isn't meant to be a code workspace.
    return fileCount >= 5 && mediaCount / fileCount >= 0.6;
  } catch {
    return false;
  }
}

export function workspaceNeedsDeterministicScaffold(workspacePath: string): boolean {
  // Safety guard first: if the target is clearly a user's media/document
  // library, scaffolding is ALWAYS wrong regardless of how "empty" the source
  // listing looks.
  if (looksLikeMediaDumpSync(workspacePath)) {
    return false;
  }

  const existingFiles = listWorkspaceSourceFilesSync(workspacePath, 4000).filter((file) => {
    const normalized = file.replace(/\\/g, '/');
    return !normalized.includes('/node_modules/') && !normalized.startsWith('node_modules/');
  });

  const meaningfulFiles = existingFiles.filter((file) => {
    const base = path.basename(file).toLowerCase();
    return ![
      '.gitignore',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ].includes(base);
  });

  return meaningfulFiles.length <= 2;
}

export function getExistingTemplateOutputCollisions(
  templateId: string,
  workspacePath: string
): string[] {
  const preflight = preflightTemplate(templateId);
  if (!preflight.ok) {
    return [];
  }

  return preflight.outputPaths.filter((outputPath) =>
    fs.existsSync(path.join(workspacePath, outputPath))
  );
}

export function asksForTemplateOnlyScaffold(message: string): boolean {
  return /\b(starter|scaffold|template|boilerplate|skeleton)\b/i.test(message);
}

export function shouldUseDeterministicBootstrap(task: string, templateId: string): boolean {
  const normalizedTask = normalizeTemplateDetectionTask(task);
  if (templateId === 'static-site') {
    return asksForTemplateOnlyScaffold(normalizedTask);
  }
  return true;
}

export function validateScaffoldTemplateForTask(task: string, templateId: string): string | null {
  const normalizedTask = normalizeTemplateDetectionTask(task);
  const isGameTemplate = templateId === 'threejs-game' || templateId === 'threejs-platformer';
  if (isGameTemplate && looksSimpleStaticWebsiteTask(normalizedTask)) {
    return `Template "${templateId}" does not match the user's website/landing-page request.`;
  }
  return null;
}

/**
 * Whether specialized-agent runs should stop after deterministic template materialization.
 * Simple static-site prompts should stay on the fast scaffold/review path; broader app
 * requests continue into generative specialists for prompt-specific implementation.
 */
export function resolveDeterministicScaffoldOnlyFlag(options: {
  message: string;
  workspacePath: string;
  allowScaffold: boolean;
  explicitFromContext: boolean;
  allowTestCanonicalTemplates?: boolean;
}): boolean {
  if (!options.allowScaffold) {
    return false;
  }
  if (options.explicitFromContext) {
    return true;
  }
  if (!workspaceNeedsDeterministicScaffold(options.workspacePath)) {
    return false;
  }

  const templateId = detectCanonicalTemplateId(options.message);
  if (!templateId) {
    return false;
  }
  if (getExistingTemplateOutputCollisions(templateId, options.workspacePath).length > 0) {
    return false;
  }
  if (
    options.allowTestCanonicalTemplates === true &&
    process.env.NODE_ENV === 'test' &&
    Boolean(templateId)
  ) {
    return true;
  }
  const normalizedTask = normalizeTemplateDetectionTask(options.message);
  return (
    templateId === 'static-site' &&
    (asksForTemplateOnlyScaffold(normalizedTask) || looksSimpleStaticWebsiteTask(normalizedTask))
  );
}

function getTemplatesRoot(): string {
  if (app.isPackaged) {
    const resourcesPath = path.join(process.resourcesPath, 'templates');
    if (fs.existsSync(resourcesPath)) return resourcesPath;
    return path.join(path.dirname(process.execPath), 'templates');
  }

  const developmentCandidates = [
    path.join(process.cwd(), 'templates'),
    path.join(__dirname, '../../..', 'templates'),
  ];

  for (const candidate of developmentCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return developmentCandidates[0];
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function safeProjectName(workspacePath: string, projectName?: string): string {
  const trimmed = (projectName || '').trim();
  if (trimmed) {
    return trimmed;
  }

  return path.basename(workspacePath) || 'generated-app';
}

function buildTemplateVariables(
  workspacePath: string,
  task: string,
  projectName?: string
): { projectName: string; author: string; description: string } {
  const resolvedProjectName = safeProjectName(workspacePath, projectName);
  return {
    projectName: resolvedProjectName,
    author: 'Developer',
    description: task.split('\n')[0].trim() || `Generated project for ${resolvedProjectName}`,
  };
}

function renderTauriIdeApp(projectName: string, description: string): string {
  return `const explorerItems = [
  { name: 'src', kind: 'folder', depth: 0 },
  { name: 'main.tsx', kind: 'file', depth: 1 },
  { name: 'App.tsx', kind: 'file', depth: 1 },
  { name: 'styles.css', kind: 'file', depth: 1 },
  { name: 'src-tauri', kind: 'folder', depth: 0 },
  { name: 'main.rs', kind: 'file', depth: 1 },
  { name: 'tauri.conf.json', kind: 'file', depth: 1 },
];

const projectTitle = ${JSON.stringify(projectName)};
const projectDescription = ${JSON.stringify(description)};
const tabs = ['App.tsx', 'main.rs', 'tauri.conf.json'];

const codeLines = [
  'function DiamondPrimeIDE() {',
  '  const workspace = openWorkspace();',
  '  const agent = createTargetedAssistant(workspace);',
  '  return <StableShell agent={agent} />;',
  '}',
];

function App() {
  return (
    <div className="ide-shell">
      <aside className="activity-bar" aria-label="Primary activity">
        <div className="activity-logo">AP</div>
        <button className="activity-item active">Files</button>
        <button className="activity-item">Search</button>
        <button className="activity-item">Git</button>
        <button className="activity-item">Run</button>
      </aside>

      <aside className="side-panel">
        <div className="panel-header">
          <span>Explorer</span>
          <button>New</button>
        </div>
        <div className="workspace-name">{projectTitle}</div>
        <ul className="file-tree">
          {explorerItems.map((item) => (
            <li key={item.name} className={'tree-item depth-' + item.depth}>
              <span className="tree-icon">{item.kind === 'folder' ? 'dir' : 'file'}</span>
              {item.name}
            </li>
          ))}
        </ul>
      </aside>

      <main className="editor-workbench">
        <header className="title-bar">
          <div>
            <strong>{projectTitle}</strong>
            <span>{projectDescription}</span>
          </div>
          <div className="status-pill">Tauri + React</div>
        </header>

        <nav className="tab-row">
          {tabs.map((tab, index) => (
            <button key={tab} className={index === 0 ? 'tab active' : 'tab'}>{tab}</button>
          ))}
        </nav>

        <section className="editor-grid">
          <div className="code-editor">
            <div className="editor-toolbar">
              <span>src/App.tsx</span>
              <span>TypeScript React</span>
            </div>
            <pre>
              {codeLines.map((line, index) => (
                <code key={line}>
                  <span className="line-number">{index + 1}</span>
                  {line}
                  {'\\n'}
                </code>
              ))}
            </pre>
          </div>

          <aside className="assistant-panel">
            <h2>Targeted Assistant</h2>
            <p>AI stays in the side lane: propose patches, explain code, and repair verified issues.</p>
            <div className="assistant-card">Deterministic scaffold: ready</div>
            <div className="assistant-card">Rule-based repair: enabled</div>
            <div className="assistant-card">Review before apply: enabled</div>
          </aside>
        </section>

        <footer className="bottom-panel">
          <div className="terminal">
            <span className="prompt">$</span> npm run tauri:dev
          </div>
          <div className="status-bar">main | TypeScript | Tauri desktop shell</div>
        </footer>
      </main>
    </div>
  );
}

export default App;
`;
}

function renderElectronIdeApp(projectName: string, description: string): string {
  return renderTauriIdeApp(projectName, description)
    .replace(
      "  { name: 'src-tauri', kind: 'folder', depth: 0 },\n  { name: 'main.rs', kind: 'file', depth: 1 },\n  { name: 'tauri.conf.json', kind: 'file', depth: 1 },",
      "  { name: 'main', kind: 'folder', depth: 1 },\n  { name: 'main.ts', kind: 'file', depth: 2 },\n  { name: 'preload.ts', kind: 'file', depth: 2 },\n  { name: 'renderer', kind: 'folder', depth: 1 },\n  { name: 'App.tsx', kind: 'file', depth: 2 },"
    )
    .replace("const tabs = ['App.tsx', 'main.rs', 'tauri.conf.json'];", "const tabs = ['App.tsx', 'main.ts', 'preload.ts'];")
    .replace('Tauri + React', 'Electron + React')
    .replace('npm run tauri:dev', 'npm run dev')
    .replace('Tauri desktop shell', 'Electron desktop shell');
}

function renderTauriIdeStyles(): string {
  return `:root {
  color-scheme: dark;
  --bg: #0d1117;
  --panel: #161b22;
  --panel-strong: #1f2937;
  --border: #30363d;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #58a6ff;
  --accent-strong: #1f6feb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

button {
  border: 0;
  color: inherit;
  font: inherit;
}

.ide-shell {
  display: grid;
  grid-template-columns: 56px 260px 1fr;
  min-height: 100vh;
  background: linear-gradient(135deg, #0d1117 0%, #111827 100%);
}

.activity-bar,
.side-panel,
.assistant-panel,
.bottom-panel {
  border-color: var(--border);
}

.activity-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  padding: 14px 8px;
  background: #090d13;
  border-right: 1px solid var(--border);
}

.activity-logo {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-strong);
  font-weight: 800;
}

.activity-item {
  width: 40px;
  min-height: 40px;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.activity-item.active,
.activity-item:hover {
  background: rgba(88, 166, 255, 0.16);
  color: var(--text);
}

.side-panel {
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 16px;
}

.panel-header,
.title-bar,
.editor-toolbar,
.bottom-panel,
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-header button,
.tab,
.status-pill {
  border-radius: 8px;
  background: rgba(88, 166, 255, 0.12);
  color: var(--accent);
  padding: 6px 10px;
}

.workspace-name {
  margin: 20px 0 12px;
  font-weight: 700;
}

.file-tree {
  padding: 0;
  margin: 0;
  list-style: none;
}

.tree-item {
  display: flex;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  color: var(--muted);
}

.tree-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

.depth-1 {
  padding-left: 24px;
}

.depth-2 {
  padding-left: 40px;
}

.tree-icon {
  width: 32px;
  color: var(--accent);
  font-size: 11px;
}

.editor-workbench {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  min-width: 0;
}

.title-bar {
  padding: 16px 22px;
  border-bottom: 1px solid var(--border);
  background: rgba(13, 17, 23, 0.88);
}

.title-bar span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 13px;
}

.tab-row {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
  background: var(--panel);
}

.tab {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  background: transparent;
  color: var(--muted);
}

.tab.active {
  background: var(--bg);
  color: var(--text);
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  padding: 16px;
  min-height: 0;
}

.code-editor,
.assistant-panel {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(13, 17, 23, 0.82);
}

.editor-toolbar {
  padding: 12px 14px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

pre {
  margin: 0;
  padding: 18px 0;
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 14px;
  line-height: 1.8;
}

code {
  display: block;
  white-space: pre-wrap;
}

.line-number {
  display: inline-block;
  width: 48px;
  margin-right: 18px;
  color: #6e7681;
  text-align: right;
}

.assistant-panel {
  padding: 18px;
}

.assistant-panel h2 {
  margin: 0 0 8px;
}

.assistant-panel p {
  color: var(--muted);
  line-height: 1.5;
}

.assistant-card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-strong);
}

.bottom-panel {
  border-top: 1px solid var(--border);
  background: #090d13;
}

.terminal,
.status-bar {
  padding: 12px 16px;
  color: var(--muted);
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 13px;
}

.prompt {
  margin-right: 8px;
  color: var(--accent);
}

@media (max-width: 900px) {
  .ide-shell {
    grid-template-columns: 48px 1fr;
  }

  .side-panel {
    display: none;
  }

  .editor-grid {
    grid-template-columns: 1fr;
  }
}
`;
}

function renderVoxelGameApp(): string {
  return `import { useEffect, useRef } from 'react';
import { Game } from './game/Game';
import './styles.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Game(containerRef.current);
    gameRef.current = game;
    game.animate();

    return () => {
      game.dispose();
    };
  }, []);

  return (
    <div className="game-container">
      <div ref={containerRef} className="game-canvas" />
      <div className="crosshair">+</div>
      <div className="ui-overlay">
        <div className="instructions">
          <h2>Minecraft-Style Voxel Starter</h2>
          <p>WASD / arrows - Move</p>
          <p>Space / Shift - Fly up / down</p>
          <p>Mouse - Look around</p>
          <p>Left click - Break block</p>
          <p>Right click - Place grass block</p>
          <p>Click the world to lock pointer</p>
        </div>
      </div>
    </div>
  );
}

export default App;
`;
}

function renderVoxelGameWorld(): string {
  return `import * as THREE from 'three';

type BlockType = 'grass' | 'dirt' | 'stone' | 'wood' | 'leaves';

const BLOCK_SIZE = 4;

export class World {
  private blocks: THREE.Mesh[] = [];
  private materials: Record<BlockType, THREE.MeshLambertMaterial>;
  private geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

  constructor(private scene: THREE.Scene) {
    this.scene.background = new THREE.Color(0x86c5ff);
    this.scene.fog = new THREE.Fog(0x86c5ff, 80, 220);

    this.materials = {
      grass: new THREE.MeshLambertMaterial({ color: 0x4caf50 }),
      dirt: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
      stone: new THREE.MeshLambertMaterial({ color: 0x7d8791 }),
      wood: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
      leaves: new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
    };

    this.addLights();
    this.generateTerrain();
    this.generateTrees();
  }

  public getBlocks(): THREE.Mesh[] {
    return this.blocks;
  }

  public addBlock(position: THREE.Vector3, type: BlockType = 'grass'): void {
    const block = new THREE.Mesh(this.geometry, this.materials[type]);
    block.position.copy(this.snapToGrid(position));
    block.castShadow = true;
    block.receiveShadow = true;
    block.userData.blockType = type;
    this.blocks.push(block);
    this.scene.add(block);
  }

  public removeBlock(block: THREE.Object3D): void {
    const index = this.blocks.indexOf(block as THREE.Mesh);
    if (index < 0) return;

    this.blocks.splice(index, 1);
    this.scene.remove(block);
  }

  public getPlacementPosition(intersection: THREE.Intersection): THREE.Vector3 {
    const normal = intersection.face?.normal.clone() || new THREE.Vector3(0, 1, 0);
    normal.transformDirection(intersection.object.matrixWorld);
    return this.snapToGrid(intersection.object.position.clone().addScaledVector(normal, BLOCK_SIZE));
  }

  private addLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(48, 80, 32);
    sun.castShadow = true;
    this.scene.add(sun);
  }

  private generateTerrain(): void {
    for (let x = -10; x <= 10; x++) {
      for (let z = -10; z <= 10; z++) {
        const height = Math.floor(Math.sin(x * 0.45) * 1.5 + Math.cos(z * 0.35) * 1.5);
        this.addBlock(new THREE.Vector3(x * BLOCK_SIZE, height * BLOCK_SIZE, z * BLOCK_SIZE), 'grass');

        for (let y = height - 1; y >= height - 3; y--) {
          this.addBlock(new THREE.Vector3(x * BLOCK_SIZE, y * BLOCK_SIZE, z * BLOCK_SIZE), y < height - 2 ? 'stone' : 'dirt');
        }
      }
    }
  }

  private generateTrees(): void {
    const treePositions = [
      new THREE.Vector3(-24, 12, -16),
      new THREE.Vector3(20, 12, 24),
      new THREE.Vector3(32, 12, -28),
    ];

    for (const base of treePositions) {
      for (let i = 0; i < 4; i++) {
        this.addBlock(base.clone().add(new THREE.Vector3(0, i * BLOCK_SIZE, 0)), 'wood');
      }

      for (let x = -1; x <= 1; x++) {
        for (let y = 3; y <= 5; y++) {
          for (let z = -1; z <= 1; z++) {
            if (Math.abs(x) + Math.abs(z) + Math.max(0, y - 4) <= 3) {
              this.addBlock(base.clone().add(new THREE.Vector3(x * BLOCK_SIZE, y * BLOCK_SIZE, z * BLOCK_SIZE)), 'leaves');
            }
          }
        }
      }
    }
  }

  private snapToGrid(position: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      Math.round(position.x / BLOCK_SIZE) * BLOCK_SIZE,
      Math.round(position.y / BLOCK_SIZE) * BLOCK_SIZE,
      Math.round(position.z / BLOCK_SIZE) * BLOCK_SIZE
    );
  }
}
`;
}

function renderVoxelGameGame(): string {
  return `import * as THREE from 'three';
import { World } from './world/World';
import { Player } from './entities/Player';
import { Controls } from './utils/Controls';

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private player: Player;
  private controls: Controls;
  private clock: THREE.Clock;
  private raycaster = new THREE.Raycaster();
  private resizeHandler: () => void;
  private mouseHandler: (event: MouseEvent) => void;
  private contextMenuHandler: (event: MouseEvent) => void;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(12, 28, 44);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.world = new World(this.scene);
    this.player = new Player(this.camera);
    this.controls = new Controls(this.camera, this.player);
    this.clock = new THREE.Clock();

    this.resizeHandler = () => this.onWindowResize();
    this.mouseHandler = (event) => this.onMouseDown(event);
    this.contextMenuHandler = (event) => event.preventDefault();
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('mousedown', this.mouseHandler);
    window.addEventListener('contextmenu', this.contextMenuHandler);
  }

  public animate(): void {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.controls.update(delta);
    this.player.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.renderer.dispose();
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('mousedown', this.mouseHandler);
    window.removeEventListener('contextmenu', this.contextMenuHandler);
  }

  private onMouseDown(event: MouseEvent): void {
    if (document.pointerLockElement !== document.body) {
      document.body.requestPointerLock();
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = this.raycaster.intersectObjects(this.world.getBlocks(), false)[0];
    if (!hit || hit.distance > 70) return;

    if (event.button === 0) {
      this.world.removeBlock(hit.object);
    } else if (event.button === 2) {
      this.world.addBlock(this.world.getPlacementPosition(hit), 'grass');
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
`;
}

function renderVoxelGameStyles(): string {
  return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow: hidden;
  background: #86c5ff;
}

.game-container,
.game-canvas {
  width: 100vw;
  height: 100vh;
  position: relative;
}

.game-canvas {
  cursor: crosshair;
}

.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 200;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 26px;
  font-weight: 700;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.65);
  pointer-events: none;
}

.ui-overlay {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 100;
  pointer-events: none;
}

.instructions {
  max-width: 320px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 14px;
  background: rgba(12, 18, 28, 0.72);
  color: white;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10px);
}

.instructions h2 {
  margin-bottom: 10px;
  font-size: 18px;
}

.instructions p {
  margin: 6px 0;
  color: rgba(255, 255, 255, 0.86);
  font-size: 14px;
}
`;
}

export function applyDeterministicTemplateCustomization(
  workspacePath: string,
  task: string,
  templateId: string,
  options: {
    projectName?: string;
    callbacks?: ScaffoldCallbacks;
  } = {}
): string[] {
  const variables = buildTemplateVariables(workspacePath, task, options.projectName);
  const customFiles = looksIdeTask(task)
    ? templateId === 'tauri-react'
      ? new Map<string, string>([
          ['src/App.tsx', renderTauriIdeApp(variables.projectName, variables.description)],
          ['src/styles.css', renderTauriIdeStyles()],
        ])
      : templateId === 'electron-react'
        ? new Map<string, string>([
            ['src/renderer/App.tsx', renderElectronIdeApp(variables.projectName, variables.description)],
            ['src/renderer/styles.css', renderTauriIdeStyles()],
          ])
        : null
    : templateId === 'threejs-game' && looksVoxelGameTask(task)
      ? new Map<string, string>([
          ['src/App.tsx', renderVoxelGameApp()],
          ['src/styles.css', renderVoxelGameStyles()],
          ['src/game/Game.ts', renderVoxelGameGame()],
          ['src/game/world/World.ts', renderVoxelGameWorld()],
        ])
      : null;

  if (!customFiles) {
    return [];
  }

  const changedFiles: string[] = [];

  for (const [relativePath, content] of customFiles) {
    const absolutePath = path.join(workspacePath, relativePath);
    const existed = fs.existsSync(absolutePath);
    const oldContent = existed ? fs.readFileSync(absolutePath, 'utf-8') : '';

    if (oldContent === content) {
      continue;
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');
    changedFiles.push(relativePath);
    options.callbacks?.onFileChange?.({
      filePath: relativePath,
      oldContent,
      newContent: content,
      action: existed ? 'modified' : 'created',
      status: 'pending',
    });
  }

  return changedFiles;
}

function preflightTemplate(templateId: string): { ok: boolean; outputPaths: string[]; error?: string } {
  const templateRoot = path.join(getTemplatesRoot(), templateId);
  const templateJsonPath = path.join(templateRoot, 'template.json');

  if (!fs.existsSync(templateJsonPath)) {
    return {
      ok: false,
      outputPaths: [],
      error: `Template definition not found for '${templateId}' at ${templateJsonPath}`,
    };
  }

  let templateDef: TemplateDefinition;
  try {
    templateDef = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8')) as TemplateDefinition;
  } catch (error: any) {
    return {
      ok: false,
      outputPaths: [],
      error: `Failed to parse template '${templateId}': ${error.message}`,
    };
  }

  const files = (templateDef.files || []).map((file) => ({
    ...file,
    path: normalizeRelativePath(file.path),
  }));

  const missingSources = files
    .filter((file) => !fs.existsSync(path.join(templateRoot, file.template)))
    .map((file) => file.template);

  if (missingSources.length > 0) {
    return {
      ok: false,
      outputPaths: files.map((file) => file.path),
      error: `Template '${templateId}' is missing source files: ${missingSources.join(', ')}`,
    };
  }

  const requiredOutputs = REQUIRED_TEMPLATE_OUTPUTS[templateId] || [];
  const outputPaths = files.map((file) => file.path);
  const missingOutputs = requiredOutputs.filter((requiredPath) => !outputPaths.includes(requiredPath));
  if (missingOutputs.length > 0) {
    return {
      ok: false,
      outputPaths,
      error: `Template '${templateId}' is incomplete. Missing required outputs: ${missingOutputs.join(', ')}`,
    };
  }

  return { ok: true, outputPaths };
}

export async function scaffoldProjectFromTemplate(
  workspacePath: string,
  task: string,
  options: {
    projectType?: string;
    projectName?: string;
    runPostCreate?: boolean;
    callbacks?: ScaffoldCallbacks;
  } = {}
): Promise<ScaffoldTemplateResult> {
  const templateId = detectCanonicalTemplateId(task, options.projectType);
  if (!templateId) {
    return {
      success: false,
      projectPath: workspacePath,
      createdFiles: [],
      error: 'No canonical template available for this scaffold request',
    };
  }
  const mismatchReason = validateScaffoldTemplateForTask(task, templateId);
  if (mismatchReason) {
    return {
      success: false,
      templateId,
      projectPath: workspacePath,
      createdFiles: [],
      error: mismatchReason,
    };
  }

  const preflight = preflightTemplate(templateId);
  if (!preflight.ok) {
    return {
      success: false,
      templateId,
      projectPath: workspacePath,
      createdFiles: [],
      error: preflight.error,
    };
  }

  const snapshots = new Map<string, { existed: boolean; content: string }>();
  for (const outputPath of preflight.outputPaths) {
    const absolutePath = path.join(workspacePath, outputPath);
    if (!fs.existsSync(absolutePath)) {
      snapshots.set(outputPath, { existed: false, content: '' });
      continue;
    }

    snapshots.set(outputPath, {
      existed: true,
      content: fs.readFileSync(absolutePath, 'utf-8'),
    });
  }

  const templateEngine = new TemplateEngine(getTemplatesRoot());
  const materialized = await templateEngine.materializeProject({
    templateId,
    targetDir: workspacePath,
    variables: buildTemplateVariables(workspacePath, task, options.projectName),
    mode: 'in-place',
    runPostCreate: options.runPostCreate,
  });

  const createdFiles = materialized.filesCreated.map((file) => normalizeRelativePath(file));
  const customizedFiles = applyDeterministicTemplateCustomization(workspacePath, task, templateId, {
    projectName: options.projectName,
  });
  for (const customizedFile of customizedFiles) {
    if (!createdFiles.includes(customizedFile)) {
      createdFiles.push(customizedFile);
    }
  }
  for (const createdFile of createdFiles) {
    const absolutePath = path.join(workspacePath, createdFile);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const before = snapshots.get(createdFile) || { existed: false, content: '' };
    options.callbacks?.onFileChange?.({
      filePath: createdFile,
      oldContent: before.content,
      newContent: fs.readFileSync(absolutePath, 'utf-8'),
      action: before.existed ? 'modified' : 'created',
      status: 'pending',
    });
  }

  return {
    success: true,
    templateId,
    projectPath: materialized.projectPath,
    createdFiles,
    dependenciesInstalled: materialized.dependenciesInstalled,
    installOutput: materialized.installOutput,
  };
}
