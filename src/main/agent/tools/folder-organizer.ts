/**
 * Folder Organizer - first-class file-management capability for AgentPrime.
 *
 * Motivation: the agent historically treated ambiguous requests like
 * "organize please" as CREATE-mode scaffolds, which led to a Vite app being
 * dumped into a folder of screen recordings. This module gives the agent a
 * safe, purpose-built tool for folder organization so it never has to improvise.
 *
 * Guarantees:
 *   - Never deletes user files. Only moves.
 *   - Never escapes the target folder. All destinations live inside it.
 *   - Every move is recorded in `.agentprime-organize-log.json` so undo is O(1).
 *   - Filename collisions are resolved with " (1)", " (2)" suffixes — never overwrites.
 *   - Honors a dry-run preview mode so callers can show the plan before executing.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export type OrganizeStrategy = 'by-type' | 'by-date';

export interface OrganizeOptions {
  strategy?: OrganizeStrategy;
  /** If true, return the plan but do not move any files. */
  dryRun?: boolean;
  /** Skip files with these exact basenames (case-insensitive). */
  skipBasenames?: string[];
  /** Only operate on top-level files (default true). Subdirectories are left alone. */
  topLevelOnly?: boolean;
}

export interface OrganizeMove {
  from: string;
  to: string;
  category: string;
  sizeBytes: number;
}

export interface OrganizeResult {
  folderPath: string;
  strategy: OrganizeStrategy;
  dryRun: boolean;
  moves: OrganizeMove[];
  skipped: Array<{ path: string; reason: string }>;
  totalFiles: number;
  logPath: string | null;
}

export interface UndoResult {
  folderPath: string;
  restored: OrganizeMove[];
  missing: OrganizeMove[];
  logPath: string;
}

const ORGANIZE_LOG_FILE = '.agentprime-organize-log.json';

/**
 * Extension → category mapping. Kept explicit so behavior is predictable and
 * auditable; unknown extensions go to "Other".
 */
const CATEGORY_BY_EXT: Record<string, string> = {
  // Videos
  '.mp4': 'Videos', '.mov': 'Videos', '.avi': 'Videos', '.mkv': 'Videos',
  '.webm': 'Videos', '.wmv': 'Videos', '.flv': 'Videos', '.m4v': 'Videos',
  // Images
  '.jpg': 'Images', '.jpeg': 'Images', '.png': 'Images', '.gif': 'Images',
  '.bmp': 'Images', '.webp': 'Images', '.svg': 'Images', '.heic': 'Images',
  '.tiff': 'Images', '.tif': 'Images', '.ico': 'Images',
  // Audio
  '.mp3': 'Audio', '.wav': 'Audio', '.flac': 'Audio', '.ogg': 'Audio',
  '.m4a': 'Audio', '.aac': 'Audio', '.wma': 'Audio', '.opus': 'Audio',
  // Documents
  '.pdf': 'Documents', '.doc': 'Documents', '.docx': 'Documents',
  '.txt': 'Documents', '.md': 'Documents', '.rtf': 'Documents', '.odt': 'Documents',
  '.pages': 'Documents', '.tex': 'Documents',
  // Spreadsheets
  '.xls': 'Spreadsheets', '.xlsx': 'Spreadsheets', '.csv': 'Spreadsheets',
  '.numbers': 'Spreadsheets', '.ods': 'Spreadsheets', '.tsv': 'Spreadsheets',
  // Presentations
  '.ppt': 'Presentations', '.pptx': 'Presentations', '.key': 'Presentations',
  '.odp': 'Presentations',
  // Archives
  '.zip': 'Archives', '.tar': 'Archives', '.gz': 'Archives', '.rar': 'Archives',
  '.7z': 'Archives', '.bz2': 'Archives', '.xz': 'Archives',
  // Code / text data
  '.js': 'Code', '.ts': 'Code', '.jsx': 'Code', '.tsx': 'Code', '.py': 'Code',
  '.java': 'Code', '.c': 'Code', '.cpp': 'Code', '.cs': 'Code', '.rb': 'Code',
  '.go': 'Code', '.rs': 'Code', '.php': 'Code', '.swift': 'Code', '.kt': 'Code',
  '.html': 'Code', '.css': 'Code', '.scss': 'Code', '.json': 'Code', '.xml': 'Code',
  '.yml': 'Code', '.yaml': 'Code', '.sh': 'Code', '.ps1': 'Code', '.bat': 'Code',
  // Installers / binaries
  '.exe': 'Installers', '.msi': 'Installers', '.dmg': 'Installers',
  '.pkg': 'Installers', '.deb': 'Installers', '.rpm': 'Installers',
  '.apk': 'Installers',
  // Fonts
  '.ttf': 'Fonts', '.otf': 'Fonts', '.woff': 'Fonts', '.woff2': 'Fonts',
  // 3D / design
  '.psd': 'Design', '.ai': 'Design', '.fig': 'Design', '.sketch': 'Design',
  '.blend': 'Design', '.fbx': 'Design', '.obj': 'Design', '.gltf': 'Design',
};

function categorizeByExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return CATEGORY_BY_EXT[ext] || 'Other';
}

function categorizeByDate(mtimeMs: number): string {
  const d = new Date(mtimeMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}/${year}-${month}`;
}

async function resolveCollisionFreeName(destDir: string, desiredName: string): Promise<string> {
  let candidate = path.join(destDir, desiredName);
  if (!fsSync.existsSync(candidate)) return candidate;

  const ext = path.extname(desiredName);
  const base = desiredName.slice(0, desiredName.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    candidate = path.join(destDir, `${base} (${i})${ext}`);
    if (!fsSync.existsSync(candidate)) return candidate;
  }
  // Extremely unlikely fallback — keep it unique with a timestamp.
  return path.join(destDir, `${base}-${Date.now()}${ext}`);
}

/**
 * Organize a folder by moving top-level files into categorized subfolders.
 *
 * Safe by design:
 *   - Refuses to operate on paths that don't exist or aren't directories.
 *   - Only moves top-level files (existing subdirectories are left untouched).
 *   - Skips the log file itself and any hidden dotfiles.
 *   - Writes a machine-readable log so the move can be fully undone.
 */
export async function organizeFolder(
  folderPath: string,
  options: OrganizeOptions = {}
): Promise<OrganizeResult> {
  const absFolder = path.resolve(folderPath);
  const strategy: OrganizeStrategy = options.strategy || 'by-type';
  const dryRun = !!options.dryRun;
  const topLevelOnly = options.topLevelOnly !== false;
  const skipSet = new Set((options.skipBasenames || []).map((n) => n.toLowerCase()));

  const stat = await fs.stat(absFolder);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absFolder}`);
  }

  const entries = await fs.readdir(absFolder, { withFileTypes: true });
  const moves: OrganizeMove[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  let totalFiles = 0;

  for (const entry of entries) {
    const entryPath = path.join(absFolder, entry.name);

    if (entry.name.startsWith('.')) {
      skipped.push({ path: entryPath, reason: 'hidden file' });
      continue;
    }
    if (entry.name === ORGANIZE_LOG_FILE) {
      skipped.push({ path: entryPath, reason: 'organize log' });
      continue;
    }
    if (skipSet.has(entry.name.toLowerCase())) {
      skipped.push({ path: entryPath, reason: 'caller skip list' });
      continue;
    }

    if (entry.isDirectory()) {
      skipped.push({ path: entryPath, reason: 'existing subfolder (left untouched)' });
      if (!topLevelOnly) {
        // topLevelOnly === false is currently unused; reserved for a future
        // recursive mode. We intentionally do not recurse by default.
      }
      continue;
    }

    if (!entry.isFile()) {
      skipped.push({ path: entryPath, reason: 'not a regular file' });
      continue;
    }

    totalFiles++;
    let category: string;
    let fileStat: fsSync.Stats;
    try {
      fileStat = await fs.stat(entryPath);
    } catch (err: any) {
      skipped.push({ path: entryPath, reason: `stat failed: ${err?.message || err}` });
      continue;
    }

    if (strategy === 'by-date') {
      category = categorizeByDate(fileStat.mtimeMs);
    } else {
      category = categorizeByExt(entry.name);
    }

    const destDir = path.join(absFolder, category);
    if (!dryRun) {
      await fs.mkdir(destDir, { recursive: true });
    }

    const destPath = dryRun
      ? path.join(destDir, entry.name)
      : await resolveCollisionFreeName(destDir, entry.name);

    moves.push({
      from: entryPath,
      to: destPath,
      category,
      sizeBytes: fileStat.size,
    });

    if (!dryRun) {
      try {
        await fs.rename(entryPath, destPath);
      } catch (err: any) {
        // Cross-device fallback: copy + unlink.
        if (err?.code === 'EXDEV') {
          await fs.copyFile(entryPath, destPath);
          await fs.unlink(entryPath);
        } else {
          throw err;
        }
      }
    }
  }

  let logPath: string | null = null;
  if (!dryRun && moves.length > 0) {
    logPath = path.join(absFolder, ORGANIZE_LOG_FILE);
    const logPayload = {
      version: 1,
      folderPath: absFolder,
      strategy,
      timestamp: new Date().toISOString(),
      moves,
    };
    await fs.writeFile(logPath, JSON.stringify(logPayload, null, 2), 'utf-8');
  }

  return {
    folderPath: absFolder,
    strategy,
    dryRun,
    moves,
    skipped,
    totalFiles,
    logPath,
  };
}

/**
 * Reverse the most recent `organizeFolder` operation by reading its log and
 * moving every file back to its original path. If a file was subsequently
 * deleted or moved, it's reported in `missing` instead of erroring out.
 */
export async function undoOrganize(folderPath: string): Promise<UndoResult> {
  const absFolder = path.resolve(folderPath);
  const logPath = path.join(absFolder, ORGANIZE_LOG_FILE);

  let raw: string;
  try {
    raw = await fs.readFile(logPath, 'utf-8');
  } catch {
    throw new Error(`No organize log found in ${absFolder}. Nothing to undo.`);
  }

  const parsed = JSON.parse(raw) as { moves: OrganizeMove[] };
  const restored: OrganizeMove[] = [];
  const missing: OrganizeMove[] = [];

  for (const move of parsed.moves) {
    try {
      await fs.access(move.to);
    } catch {
      missing.push(move);
      continue;
    }

    const restoreTarget = fsSync.existsSync(move.from)
      ? await resolveCollisionFreeName(path.dirname(move.from), path.basename(move.from))
      : move.from;

    await fs.mkdir(path.dirname(restoreTarget), { recursive: true });
    try {
      await fs.rename(move.to, restoreTarget);
      restored.push({ ...move, from: move.to, to: restoreTarget });
    } catch (err: any) {
      if (err?.code === 'EXDEV') {
        await fs.copyFile(move.to, restoreTarget);
        await fs.unlink(move.to);
        restored.push({ ...move, from: move.to, to: restoreTarget });
      } else {
        throw err;
      }
    }
  }

  // Best-effort cleanup of now-empty category subfolders we created.
  const categories = new Set(parsed.moves.map((m) => m.category.split('/')[0]));
  for (const cat of categories) {
    const dir = path.join(absFolder, cat);
    try {
      const remaining = await fs.readdir(dir);
      if (remaining.length === 0) {
        await fs.rmdir(dir);
      }
    } catch {
      // ignore — directory may still have user content
    }
  }

  await fs.unlink(logPath).catch(() => {});

  return { folderPath: absFolder, restored, missing, logPath };
}

/**
 * Heuristic: does this folder look like a media dump (user's personal files)
 * rather than a code project? Used as a safety guard before scaffolding.
 */
export async function looksLikeMediaDump(folderPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const projectMarkers = [
      'package.json', 'pyproject.toml', 'cargo.toml', 'go.mod',
      'pom.xml', 'build.gradle', 'gemfile', '.git',
      'tsconfig.json', 'composer.json', 'requirements.txt',
    ];
    const lowerNames = entries.map((e) => e.name.toLowerCase());
    const hasProjectMarker = projectMarkers.some((marker) => lowerNames.includes(marker));
    if (hasProjectMarker) return false;

    const mediaCategories = new Set(['Videos', 'Images', 'Audio', 'Documents']);
    let mediaCount = 0;
    let totalFiles = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      totalFiles++;
      if (mediaCategories.has(categorizeByExt(entry.name))) mediaCount++;
    }
    return totalFiles >= 5 && mediaCount / totalFiles >= 0.6;
  } catch {
    return false;
  }
}
