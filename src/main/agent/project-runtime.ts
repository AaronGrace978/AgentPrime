import * as fs from 'fs';
import * as path from 'path';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';

export type ProjectKind = 'static' | 'vite' | 'node' | 'python' | 'tauri' | 'unknown';
export type ProjectLegacyType = 'node' | 'python' | 'html' | 'tauri' | 'unknown';

export interface ProjectRuntimeProfile {
  workspacePath: string;
  files: string[];
  kind: ProjectKind;
  type: ProjectLegacyType;
  displayName: string;
  hasPackageJson: boolean;
  hasRequirements: boolean;
  hasIndexHtml: boolean;
  packageJson: any | null;
  scripts: Record<string, string>;
  nodeEntrypoint?: string;
  pythonEntrypoint?: string;
  hasVirtualEnv: boolean;
  virtualEnvPath?: string;
  install: {
    required: boolean;
    command: string | null;
    manager: 'npm' | 'pip' | 'none';
    reason: string;
  };
  run: {
    command: string | null;
    target: 'browser' | 'process' | 'manual' | 'none';
    reason: string;
  };
  build: {
    command: string | null;
    requiredForReady: boolean;
    reason: string;
  };
  readiness: {
    summary: string;
    requiresSuccessfulRun: boolean;
    requiresSuccessfulBuild: boolean;
    requiresOpen: boolean;
  };
}

const COMMON_NODE_ENTRYPOINTS = [
  'server.js',
  'server.ts',
  'app.js',
  'app.ts',
  'index.js',
  'index.ts',
];

const COMMON_PYTHON_ENTRYPOINTS = ['main.py', 'app.py'];

export function getProjectFilesSync(workspacePath: string): string[] {
  try {
    return listWorkspaceSourceFilesSync(workspacePath, 8000);
  } catch {
    return [];
  }
}

export function readPackageJsonSync(workspacePath: string): any | null {
  const packageJsonPath = path.join(workspacePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function normalizeScripts(packageJson: any | null): Record<string, string> {
  const scripts = packageJson?.scripts || {};
  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value === 'string' && value.trim()) {
      normalized[name] = value.trim();
    }
  }

  return normalized;
}

export function hasDeclaredNodeDependencies(packageJson: any | null): boolean {
  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };

  return Object.keys(deps).length > 0;
}

export function hasNonCommentRequirements(workspacePath: string): boolean {
  const requirementsPath = path.join(workspacePath, 'requirements.txt');
  if (!fs.existsSync(requirementsPath)) {
    return false;
  }

  try {
    const lines = fs
      .readFileSync(requirementsPath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    return lines.length > 0;
  } catch {
    return false;
  }
}

export function isTauriProject(workspacePath: string, packageJson: any | null, files?: string[]): boolean {
  const allFiles = files || getProjectFilesSync(workspacePath);
  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };

  const hasTauriDeps = Boolean(
    deps['@tauri-apps/api'] ||
      deps['@tauri-apps/cli'] ||
      deps['@tauri-apps/plugin-shell']
  );

  return hasTauriDeps && allFiles.some((file) => file.startsWith('src-tauri/'));
}

export function isViteProject(workspacePath: string, packageJson: any | null, files?: string[]): boolean {
  const allFiles = files || getProjectFilesSync(workspacePath);
  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };
  const scripts = normalizeScripts(packageJson);

  return Boolean(
    allFiles.includes('vite.config.ts') ||
      allFiles.includes('vite.config.js') ||
      deps.vite ||
      deps['@vitejs/plugin-react'] ||
      Object.values(scripts).some((script) => /\bvite\b/.test(script))
  );
}

export function findVirtualEnvPath(workspacePath: string): string | undefined {
  const candidates = ['venv', '.venv', 'env'];

  for (const candidate of candidates) {
    const candidatePath = path.join(workspacePath, candidate);
    try {
      if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isDirectory()) {
        continue;
      }

      const hasActivateScript =
        fs.existsSync(path.join(candidatePath, 'Scripts', 'activate')) ||
        fs.existsSync(path.join(candidatePath, 'Scripts', 'activate.bat')) ||
        fs.existsSync(path.join(candidatePath, 'bin', 'activate'));

      if (hasActivateScript) {
        return candidatePath;
      }
    } catch {
      // Ignore invalid virtualenv directories.
    }
  }

  return undefined;
}

export function findNodeEntrypoint(packageJson: any | null, files: string[]): string | undefined {
  const mainField = typeof packageJson?.main === 'string' ? packageJson.main.trim() : '';
  if (mainField) {
    const normalizedMain = mainField.replace(/\\/g, '/').replace(/^\.\//, '');
    if (files.includes(normalizedMain)) {
      return normalizedMain;
    }
  }

  return COMMON_NODE_ENTRYPOINTS.find((candidate) => files.includes(candidate));
}

export function findPythonEntrypoint(files: string[]): string | undefined {
  for (const candidate of COMMON_PYTHON_ENTRYPOINTS) {
    if (files.includes(candidate)) {
      return candidate;
    }
  }

  const rootPythonFile = files.find((file) => file.endsWith('.py') && !file.includes('/'));
  if (rootPythonFile) {
    return rootPythonFile;
  }

  return files.find((file) => file.endsWith('.py'));
}

export function getPreferredNodeRunCommand(
  packageJson: any | null,
  files: string[],
  options: { preferDev?: boolean } = {}
): string | null {
  const scripts = normalizeScripts(packageJson);

  if (options.preferDev && scripts.dev) {
    return 'npm run dev';
  }

  if (scripts.start) {
    return 'npm start';
  }

  if (scripts.dev) {
    return 'npm run dev';
  }

  const entrypoint = findNodeEntrypoint(packageJson, files);
  if (entrypoint) {
    return `node ${entrypoint}`;
  }

  return null;
}

export function getBuildCommand(packageJson: any | null): string | null {
  const scripts = normalizeScripts(packageJson);
  return scripts.build ? 'npm run build' : null;
}

function getReadinessSummary(kind: ProjectKind, runCommand: string | null, buildCommand: string | null): string {
  switch (kind) {
    case 'static':
      return 'Ready only after the static entrypoint can be opened successfully.';
    case 'vite':
      return `Ready only after ${buildCommand || 'the build'} succeeds and ${runCommand || 'the dev server'} starts successfully.`;
    case 'node':
      if (buildCommand) {
        return `Ready only after ${buildCommand} succeeds and ${runCommand || 'the runtime command'} executes successfully.`;
      }
      return `Ready only after ${runCommand || 'the runtime command'} executes successfully.`;
    case 'python':
      return `Ready only after ${runCommand || 'the Python entrypoint'} executes successfully.`;
    case 'tauri':
      return `Ready only after ${buildCommand || 'the build'} succeeds and ${runCommand || 'the Tauri dev command'} starts successfully.`;
    default:
      return 'Ready only after a concrete run, build, or open verification succeeds.';
  }
}

export function getProjectRuntimeProfileSync(workspacePath: string): ProjectRuntimeProfile {
  const files = getProjectFilesSync(workspacePath);
  const packageJson = readPackageJsonSync(workspacePath);
  const scripts = normalizeScripts(packageJson);
  const hasPackageJson = files.includes('package.json');
  const hasRequirements = files.includes('requirements.txt');
  const hasIndexHtml = files.some((file) => file === 'index.html' || file.endsWith('/index.html'));
  const hasPythonFiles = files.some((file) => file.endsWith('.py'));
  const hasFrontendAssets = files.some((file) =>
    file.endsWith('.css') ||
    file.endsWith('.html') ||
    /^src\/.+\.(js|jsx|ts|tsx)$/.test(file) ||
    /^public\/.+/.test(file)
  );
  const nodeEntrypoint = findNodeEntrypoint(packageJson, files);
  const pythonEntrypoint = findPythonEntrypoint(files);
  const virtualEnvPath = findVirtualEnvPath(workspacePath);
  const hasVirtualEnv = Boolean(virtualEnvPath);
  const nodeDependenciesRequired = hasDeclaredNodeDependencies(packageJson);
  const pythonDependenciesRequired = hasNonCommentRequirements(workspacePath);
  const tauri = hasPackageJson && isTauriProject(workspacePath, packageJson, files);
  const vite = hasPackageJson && !tauri && isViteProject(workspacePath, packageJson, files);
  const staticWithPackage =
    hasPackageJson &&
    !tauri &&
    !vite &&
    !nodeDependenciesRequired &&
    !nodeEntrypoint &&
    !hasPythonFiles &&
    hasFrontendAssets;

  let kind: ProjectKind = 'unknown';

  if (tauri) {
    kind = 'tauri';
  } else if (vite) {
    kind = 'vite';
  } else if (hasPackageJson && !staticWithPackage) {
    kind = 'node';
  } else if (hasPythonFiles || hasRequirements || files.includes('pyproject.toml')) {
    kind = 'python';
  } else if (hasIndexHtml || staticWithPackage) {
    kind = 'static';
  }

  const type: ProjectLegacyType =
    kind === 'static'
      ? 'html'
      : kind === 'python'
        ? 'python'
        : kind === 'tauri'
          ? 'tauri'
          : kind === 'vite' || kind === 'node'
            ? 'node'
            : 'unknown';

  let install: ProjectRuntimeProfile['install'];
  let run: ProjectRuntimeProfile['run'];
  let build: ProjectRuntimeProfile['build'];

  if (kind === 'tauri') {
    install = {
      required: nodeDependenciesRequired,
      command: nodeDependenciesRequired ? 'npm install' : null,
      manager: nodeDependenciesRequired ? 'npm' : 'none',
      reason: nodeDependenciesRequired
        ? 'Tauri apps need declared npm dependencies installed before the desktop/runtime commands work.'
        : 'No npm dependencies are declared.',
    };
    run = {
      command: scripts['tauri:dev'] ? 'npm run tauri:dev' : getPreferredNodeRunCommand(packageJson, files, { preferDev: true }),
      target: 'process',
      reason: 'Tauri apps are launched through the development command.',
    };
    build = {
      command: getBuildCommand(packageJson),
      requiredForReady: Boolean(getBuildCommand(packageJson)),
      reason: 'Tauri projects should pass their build before being reported as ready.',
    };
  } else if (kind === 'vite') {
    install = {
      required: nodeDependenciesRequired,
      command: nodeDependenciesRequired ? 'npm install' : null,
      manager: nodeDependenciesRequired ? 'npm' : 'none',
      reason: nodeDependenciesRequired
        ? 'Vite apps need their declared npm dependencies installed.'
        : 'No npm dependencies are declared.',
    };
    run = {
      command: getPreferredNodeRunCommand(packageJson, files, { preferDev: true }),
      target: 'process',
      reason: 'Vite apps are verified by starting the dev server.',
    };
    build = {
      command: getBuildCommand(packageJson),
      requiredForReady: Boolean(getBuildCommand(packageJson)),
      reason: 'Vite apps must build cleanly before they are considered ready.',
    };
  } else if (kind === 'node') {
    install = {
      required: nodeDependenciesRequired,
      command: nodeDependenciesRequired ? 'npm install' : null,
      manager: nodeDependenciesRequired ? 'npm' : 'none',
      reason: nodeDependenciesRequired
        ? 'This Node project declares npm dependencies that must be installed.'
        : 'This Node project does not declare npm dependencies.',
    };
    run = {
      command: getPreferredNodeRunCommand(packageJson, files),
      target: 'process',
      reason: 'Node projects are verified by running their start command or entrypoint.',
    };
    build = {
      command: getBuildCommand(packageJson),
      requiredForReady: Boolean(getBuildCommand(packageJson)),
      reason: buildRequiredReason(getBuildCommand(packageJson)),
    };
  } else if (kind === 'python') {
    const pythonExecutable =
      hasVirtualEnv && virtualEnvPath
        ? path.join(virtualEnvPath, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
        : 'python';

    install = {
      required: pythonDependenciesRequired,
      command: pythonDependenciesRequired ? 'pip install -r requirements.txt' : null,
      manager: pythonDependenciesRequired ? 'pip' : 'none',
      reason: pythonDependenciesRequired
        ? 'This Python project declares requirements that must be installed.'
        : 'No Python dependencies are declared in requirements.txt.',
    };
    run = {
      command: pythonEntrypoint ? `${pythonExecutable} ${pythonEntrypoint}` : null,
      target: 'process',
      reason: 'Python projects are verified by running their entrypoint.',
    };
    build = {
      command: null,
      requiredForReady: false,
      reason: 'Python app readiness is based on successful execution.',
    };
  } else if (kind === 'static') {
    const staticRunCommand = hasPackageJson ? getPreferredNodeRunCommand(packageJson, files, { preferDev: true }) : null;
    install = {
      required: false,
      command: null,
      manager: 'none',
      reason: 'Static sites do not require package installation unless they declare a real runtime dependency.',
    };
    run = {
      command: staticRunCommand,
      target: staticRunCommand ? 'process' : 'browser',
      reason: staticRunCommand
        ? 'This static site exposes an explicit script you can run.'
        : 'This static site is verified by opening index.html directly.',
    };
    build = {
      command: null,
      requiredForReady: false,
      reason: 'Static sites do not need a build step.',
    };
  } else {
    install = {
      required: false,
      command: null,
      manager: 'none',
      reason: 'No supported runtime or dependency manager was detected.',
    };
    run = {
      command: null,
      target: 'none',
      reason: 'No supported run command could be inferred.',
    };
    build = {
      command: null,
      requiredForReady: false,
      reason: 'No build command could be inferred.',
    };
  }

  return {
    workspacePath,
    files,
    kind,
    type,
    displayName: getProjectKindLabel(kind),
    hasPackageJson,
    hasRequirements,
    hasIndexHtml,
    packageJson,
    scripts,
    nodeEntrypoint,
    pythonEntrypoint,
    hasVirtualEnv,
    virtualEnvPath,
    install,
    run,
    build,
    readiness: {
      summary: getReadinessSummary(kind, run.command, build.command),
      requiresSuccessfulRun: kind === 'vite' || kind === 'node' || kind === 'python' || kind === 'tauri',
      requiresSuccessfulBuild: Boolean(build.command) && (kind === 'vite' || kind === 'node' || kind === 'tauri'),
      requiresOpen: kind === 'static',
    },
  };
}

function buildRequiredReason(buildCommand: string | null): string {
  return buildCommand
    ? 'This project exposes a build command, so readiness requires a successful build.'
    : 'No build script is configured.';
}

export function getProjectKindLabel(kind: ProjectKind): string {
  switch (kind) {
    case 'static':
      return 'Static Website';
    case 'vite':
      return 'Vite App';
    case 'node':
      return 'Node App';
    case 'python':
      return 'Python App';
    case 'tauri':
      return 'Tauri App';
    default:
      return 'Unknown Project';
  }
}

export function mapRuntimeKindToRegistryType(kind: ProjectKind): 'web' | 'node' | 'python' | 'other' {
  switch (kind) {
    case 'static':
    case 'vite':
      return 'web';
    case 'node':
      return 'node';
    case 'python':
      return 'python';
    default:
      return 'other';
  }
}
