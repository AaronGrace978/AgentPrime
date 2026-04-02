#!/usr/bin/env node

/**
 * Distribution preflight checks.
 * Fails fast when required Electron Builder resources are missing.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const skipPreflight = /^(1|true|yes|on)$/i.test(process.env.AGENTPRIME_SKIP_DIST_PREFLIGHT || '');
const autoBuildBackendDist = process.argv.includes('--build-backend') ||
  /^(1|true|yes|on)$/i.test(process.env.AGENTPRIME_BUILD_BACKEND_DIST || '');

if (skipPreflight) {
  console.log('[dist-preflight] Skipped (AGENTPRIME_SKIP_DIST_PREFLIGHT is set).');
  process.exit(0);
}

if (!fs.existsSync(packageJsonPath)) {
  console.error('[dist-preflight] package.json not found. Run this from project root.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const extraResources = packageJson?.build?.extraResources;

if (!Array.isArray(extraResources) || extraResources.length === 0) {
  console.log('[dist-preflight] No build.extraResources configured. Nothing to validate.');
  process.exit(0);
}

function hasAnyFile(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return true;
  if (!stats.isDirectory()) return false;

  const stack = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const resolved = path.join(current, entry.name);
      if (entry.isFile()) return true;
      if (entry.isDirectory()) stack.push(resolved);
    }
  }
  return false;
}

function normalizeFromPath(rawFrom) {
  return rawFrom.replace(/[\\/]+$/, '');
}

function toPortablePath(targetPath) {
  return targetPath.replace(/\\/g, '/');
}

function isBackendDistResource(fromPath) {
  const normalized = toPortablePath(fromPath).replace(/^\.\/+/, '');
  return normalized === 'backend/dist';
}

function commandExists(command) {
  const probeCmd = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probeCmd, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function runBuildCommand(command, args, cwd) {
  const printable = [command, ...args].join(' ');
  console.log(`[dist-preflight] Running: ${printable}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env }
  });
  return result.status === 0;
}

function tryBuildBackendDist() {
  const backendDir = path.join(root, 'backend');
  const backendSpec = path.join(backendDir, 'agentprime-backend.spec');
  const backendDist = path.join(backendDir, 'dist');

  if (!fs.existsSync(backendDir)) {
    return { success: false, reason: 'backend directory is missing.' };
  }
  if (!fs.existsSync(backendSpec)) {
    return { success: false, reason: 'backend/agentprime-backend.spec is missing.' };
  }
  if (hasAnyFile(backendDist)) {
    return { success: true, built: false, reason: 'backend/dist already contains files.' };
  }

  const attempts = [];
  if (commandExists('pyinstaller')) {
    attempts.push({
      label: 'pyinstaller',
      command: 'pyinstaller',
      args: ['agentprime-backend.spec']
    });
  }
  if (commandExists('python')) {
    attempts.push({
      label: 'python -m PyInstaller',
      command: 'python',
      args: ['-m', 'PyInstaller', 'agentprime-backend.spec']
    });
  }
  if (process.platform === 'win32' && commandExists('py')) {
    attempts.push({
      label: 'py -3 -m PyInstaller',
      command: 'py',
      args: ['-3', '-m', 'PyInstaller', 'agentprime-backend.spec']
    });
  }

  if (attempts.length === 0) {
    return {
      success: false,
      reason: 'No PyInstaller command found. Install pyinstaller or set AGENTPRIME_SKIP_DIST_PREFLIGHT=true.'
    };
  }

  for (const attempt of attempts) {
    console.log(`[dist-preflight] Attempting backend build via "${attempt.label}"...`);
    const ok = runBuildCommand(attempt.command, attempt.args, backendDir);
    if (ok && hasAnyFile(backendDist)) {
      return { success: true, built: true, reason: `Built backend/dist via ${attempt.label}.` };
    }
  }

  return {
    success: false,
    reason: 'Attempted backend build commands, but backend/dist is still missing or empty.'
  };
}

const failures = [];
let backendBuildAttempted = false;
let backendBuildResult = null;

for (const resource of extraResources) {
  if (!resource || typeof resource.from !== 'string') continue;

  const from = normalizeFromPath(resource.from);
  const absoluteFrom = path.resolve(root, from);
  const label = `extraResources.from="${resource.from}"`;
  const backendDistResource = isBackendDistResource(from);

  if ((!fs.existsSync(absoluteFrom) || !hasAnyFile(absoluteFrom)) && backendDistResource && autoBuildBackendDist) {
    if (!backendBuildAttempted) {
      backendBuildAttempted = true;
      backendBuildResult = tryBuildBackendDist();
      if (backendBuildResult.success) {
        console.log(`[dist-preflight] ${backendBuildResult.reason}`);
      } else {
        console.warn(`[dist-preflight] Backend auto-build failed: ${backendBuildResult.reason}`);
      }
    }
  }

  if (!fs.existsSync(absoluteFrom)) {
    failures.push({
      label,
      reason: `Path does not exist: ${from}`
    });
    continue;
  }

  if (!hasAnyFile(absoluteFrom)) {
    failures.push({
      label,
      reason: `Path is empty (no files found): ${from}`
    });
  }
}

if (failures.length > 0) {
  console.error(`[dist-preflight] Failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure.label}: ${failure.reason}`);
  }

  console.error('\n[dist-preflight] Suggested fixes:');
  console.error('  1) Ensure all resource folders in package.json > build.extraResources exist and contain files.');
  console.error('  2) Build backend artifacts first (example): cd backend && pyinstaller agentprime-backend.spec');
  console.error('  3) Auto-build backend during preflight: AGENTPRIME_BUILD_BACKEND_DIST=true npm run preflight:dist');
  console.error('  4) If intentionally skipping checks, set AGENTPRIME_SKIP_DIST_PREFLIGHT=true.');
  process.exit(1);
}

console.log(`[dist-preflight] OK. Validated ${extraResources.length} extra resource path(s).`);
