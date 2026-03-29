/**
 * Fast workspace file listing via tinyglobby (fdir) — used for agent context / indexing.
 */

import { globSync } from 'tinyglobby';
import * as path from 'path';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.cache/**',
  '**/release/**',
  '**/target/**',
  '**/.venv/**',
  '**/coverage/**'
];

const SOURCE_EXT = new Set([
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.mjs',
  '.cjs',
  '.html',
  '.css',
  '.scss',
  '.sass',
  '.json',
  '.md',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.cs',
  '.vue',
  '.svelte',
  '.yaml',
  '.yml'
]);

const ROOT_NAMES = new Set([
  'dockerfile',
  'makefile',
  'gemfile',
  'rakefile',
  'cargo.toml',
  'go.mod',
  'pyproject.toml'
]);

/**
 * List source-like files under workspace (relative POSIX paths). Caps count for safety.
 */
export function listWorkspaceSourceFilesSync(workspacePath: string, maxFiles = 4000): string[] {
  try {
    const raw = globSync('**/*', {
      cwd: workspacePath,
      dot: false,
      onlyFiles: true,
      ignore: DEFAULT_IGNORE
    });

    const out: string[] = [];
    for (const rel of raw) {
      const normalized = rel.replace(/\\/g, '/');
      const base = path.basename(normalized).toLowerCase();
      const ext = path.extname(normalized).toLowerCase();

      if (SOURCE_EXT.has(ext)) {
        out.push(normalized);
        continue;
      }
      if (!ext && ROOT_NAMES.has(base)) {
        out.push(normalized);
      }
    }

    return out.slice(0, maxFiles);
  } catch (e) {
    console.warn('[workspace-glob] glob failed:', e);
    return [];
  }
}
