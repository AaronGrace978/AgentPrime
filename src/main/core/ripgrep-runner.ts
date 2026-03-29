/**
 * Ripgrep search using @vscode/ripgrep (same stack as VS Code/Cursor), with PATH fallback.
 * Uses --json for reliable parsing on Windows (paths with colons).
 */

import { spawn } from 'child_process';
import * as fs from 'fs';

export interface RipgrepMatch {
  file: string;
  line: number;
  column: number;
  content: string;
}

export interface RipgrepSearchOptions {
  includePattern?: string;
  excludePattern?: string;
  maxResults?: number;
  timeoutMs?: number;
}

function resolveBundledRg(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@vscode/ripgrep') as { rgPath?: string };
    const p = mod?.rgPath;
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* package optional in some builds */
  }
  return null;
}

export function getRipgrepExecutable(): string {
  const bundled = resolveBundledRg();
  if (bundled) return bundled;
  return process.platform === 'win32' ? 'rg.exe' : 'rg';
}

interface RgJsonMatch {
  type: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
    submatches?: Array<{ start?: number }>;
  };
}

function parseRgJsonStdout(stdout: string, maxResults: number): RipgrepMatch[] {
  const matches: RipgrepMatch[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let msg: RgJsonMatch;
    try {
      msg = JSON.parse(line) as RgJsonMatch;
    } catch {
      continue;
    }
    if (msg.type !== 'match' || !msg.data) continue;
    const rel = msg.data.path?.text;
    if (!rel) continue;
    const lineNum = msg.data.line_number ?? 0;
    const rawLine = (msg.data.lines?.text ?? '').replace(/\n$/, '');
    const col =
      msg.data.submatches?.length && typeof msg.data.submatches[0]?.start === 'number'
        ? (msg.data.submatches[0].start as number) + 1
        : 1;
    matches.push({
      file: rel,
      line: lineNum,
      column: col,
      content: rawLine
    });
    if (matches.length >= maxResults) break;
  }
  return matches;
}

/**
 * Run ripgrep in workspace root; returns parsed matches (JSON Lines protocol).
 * Ripgrep exit code 1 means "no matches" (success).
 */
export function searchWithRipgrep(
  cwd: string,
  pattern: string,
  options: RipgrepSearchOptions = {}
): Promise<{
  success: boolean;
  matches: RipgrepMatch[];
  total: number;
  message?: string;
  usedBundledRg: boolean;
}> {
  const {
    includePattern,
    excludePattern,
    maxResults = 100,
    timeoutMs = 25_000
  } = options;

  const bundled = resolveBundledRg();
  const rgExe = getRipgrepExecutable();
  const usedBundledRg = !!bundled && rgExe === bundled;

  const args: string[] = ['--json', '--color', 'never', '--line-number', '-m', String(Math.max(1, maxResults))];

  if (includePattern) {
    args.push('--glob', includePattern);
  }
  if (excludePattern) {
    args.push('--glob', `!${excludePattern}`);
  }

  args.push('--', pattern, '.');

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: {
      success: boolean;
      matches: RipgrepMatch[];
      total: number;
      message?: string;
      usedBundledRg: boolean;
    }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const child = spawn(rgExe, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      const matches = parseRgJsonStdout(stdout, maxResults);
      done({
        success: true,
        matches,
        total: matches.length,
        message: 'Search timed out',
        usedBundledRg
      });
    }, timeoutMs);

    const finish = (code: number | null) => {
      clearTimeout(timer);
      const matches = parseRgJsonStdout(stdout, maxResults);

      if (code !== 0 && code !== 1 && matches.length === 0) {
        const hint = stderr.trim() || (code === 2 ? 'Invalid pattern or ripgrep error' : `exit ${code ?? 'unknown'}`);
        done({
          success: false,
          matches: [],
          total: 0,
          message: hint,
          usedBundledRg
        });
        return;
      }

      done({
        success: true,
        matches,
        total: matches.length,
        ...(matches.length >= maxResults ? { message: `Results limited to ${maxResults}` } : {}),
        usedBundledRg
      });
    };

    child.on('close', (code) => finish(code));
    child.on('error', () => {
      clearTimeout(timer);
      done({
        success: false,
        matches: [],
        total: 0,
        message:
          'Ripgrep not available. The app bundles @vscode/ripgrep; reinstall dependencies or add rg to PATH.',
        usedBundledRg: false
      });
    });
  });
}
