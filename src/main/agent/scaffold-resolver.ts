import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

import TemplateEngine from '../legacy/template-engine';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';

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

const PROJECT_TYPE_TEMPLATE_MAP: Record<string, string> = {
  static_site: 'static-site',
  threejs_viewer: 'threejs-game',
  vue_vite: 'vue-vite',
};

const REQUIRED_TEMPLATE_OUTPUTS: Record<string, string[]> = {
  'static-site': ['index.html', 'styles.css', 'app.js'],
  'threejs-game': ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/game/Game.ts'],
  'vue-vite': ['package.json', 'index.html', 'src/main.ts', 'src/App.vue', 'vite.config.ts'],
};

export function detectCanonicalTemplateId(task: string, projectType?: string): string | null {
  const normalizedType = (projectType || '').trim().toLowerCase();
  if (normalizedType && PROJECT_TYPE_TEMPLATE_MAP[normalizedType]) {
    return PROJECT_TYPE_TEMPLATE_MAP[normalizedType];
  }

  const lower = task.toLowerCase();
  const mentionsThreeJs = lower.includes('three.js') || lower.includes('threejs');
  const mentionsBrowser = lower.includes('browser') || lower.includes('web') || lower.includes('vite');
  const mentionsGameLikeGoal =
    lower.includes('game') ||
    lower.includes('simulator') ||
    lower.includes('flight') ||
    lower.includes('space') ||
    lower.includes('3d');

  if (mentionsThreeJs && (mentionsGameLikeGoal || mentionsBrowser)) {
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

  return null;
}

export function workspaceNeedsDeterministicScaffold(workspacePath: string): boolean {
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
