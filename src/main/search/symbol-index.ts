/**
 * Workspace symbol index from TypeScript AST (typescript package).
 * Complements embedding search: stable names, exports, classes, interfaces.
 */

import * as fs from 'fs';
import * as path from 'path';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';

export interface WorkspaceSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'method' | 'variable' | 'namespace' | 'other';
  file: string;
  line: number;
}

const MAX_FILES = 900;
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;

function loadTypescript(): typeof import('typescript') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('typescript') as typeof import('typescript');
  } catch {
    return null;
  }
}

function scriptKindForFile(fileName: string): import('typescript').ScriptKind {
  const ts = loadTypescript();
  if (!ts) return 3 as import('typescript').ScriptKind;
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  if (ext === '.mts' || ext === '.mjs') return ts.ScriptKind.TS;
  return ts.ScriptKind.TS;
}

function kindForNode(ts: typeof import('typescript'), node: import('typescript').Node): WorkspaceSymbol['kind'] {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type';
  if (ts.isEnumDeclaration(node)) return 'enum';
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return 'method';
  if (ts.isModuleDeclaration(node)) return 'namespace';
  if (ts.isVariableDeclaration(node)) return 'variable';
  return 'other';
}

function getName(ts: typeof import('typescript'), node: import('typescript').Node): string | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isModuleDeclaration(node)
  ) {
    const n = node.name;
    if (n && ts.isIdentifier(n)) return n.text;
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) return node.name.text;
    return null;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

function isExported(ts: typeof import('typescript'), node: import('typescript').Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return true;
  if (mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return true;

  if (ts.isVariableDeclaration(node)) {
    const list = node.parent;
    if (list && ts.isVariableDeclarationList(list)) {
      const stmt = list.parent;
      if (stmt && ts.isVariableStatement(stmt) && ts.canHaveModifiers(stmt)) {
        const sm = ts.getModifiers(stmt);
        return !!sm?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      }
    }
  }
  return false;
}

export class WorkspaceSymbolIndex {
  private symbols: WorkspaceSymbol[] = [];
  private buildPromise: Promise<void> | null = null;
  private dirty = false;

  constructor(private readonly workspacePath: string) {}

  get isEmpty(): boolean {
    return this.symbols.length === 0;
  }

  /**
   * Rebuild index from workspace (skips huge files; caps file count).
   */
  async rebuild(): Promise<void> {
    const ts = loadTypescript();
    if (!ts) {
      this.symbols = [];
      return;
    }

    const relFiles = listWorkspaceSourceFilesSync(this.workspacePath, 4000)
      .filter((f) => /\.(m|c)?[jt]sx?$/i.test(f))
      .slice(0, MAX_FILES);

    const next: WorkspaceSymbol[] = [];

    for (const rel of relFiles) {
      const full = path.join(this.workspacePath, rel);
      let st: fs.Stats;
      try {
        st = await fs.promises.stat(full);
      } catch {
        continue;
      }
      if (st.size > MAX_FILE_BYTES) continue;

      let text: string;
      try {
        text = await fs.promises.readFile(full, 'utf-8');
      } catch {
        continue;
      }

      const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true, scriptKindForFile(full));

      const visit = (node: import('typescript').Node) => {
        const name = getName(ts, node);
        if (name && name.length > 0 && isExported(ts, node)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          next.push({
            name,
            kind: kindForNode(ts, node),
            file: rel.replace(/\\/g, '/'),
            line: line + 1
          });
        }
        ts.forEachChild(node, visit);
      };

      visit(sf);
    }

    const dedupe = new Map<string, WorkspaceSymbol>();
    for (const s of next) {
      const key = `${s.file}:${s.line}:${s.name}:${s.kind}`;
      if (!dedupe.has(key)) dedupe.set(key, s);
    }
    this.symbols = [...dedupe.values()];
  }

  /**
   * Ensures a background rebuild has been requested; await first build.
   */
  ensureRebuilding(): void {
    if (this.symbols.length === 0 || this.dirty) {
      this.scheduleRebuild();
    }
  }

  scheduleRebuild(): void {
    this.dirty = true;
    if (!this.buildPromise) {
      this.buildPromise = this.runRebuildLoop();
    }
  }

  async refresh(): Promise<void> {
    this.scheduleRebuild();
    if (this.buildPromise) {
      await this.buildPromise;
    }
  }

  private async runRebuildLoop(): Promise<void> {
    try {
      do {
        this.dirty = false;
        await this.rebuild();
      } while (this.dirty);
    } catch {
      this.symbols = [];
    } finally {
      this.buildPromise = null;
    }
  }

  async whenReady(): Promise<void> {
    this.ensureRebuilding();
    if (this.buildPromise) {
      await this.buildPromise;
    }
  }

  /**
   * Filter symbols by name or path substring (case-insensitive).
   */
  search(query: string, max = 50): WorkspaceSymbol[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.symbols
      .filter((s) => s.name.toLowerCase().includes(q) || s.file.toLowerCase().includes(q))
      .slice(0, max);
  }

  listFilesWithSymbols(): string[] {
    return [...new Set(this.symbols.map((s) => s.file))];
  }
}

/** Wired from main when workspace opens; used by specialist tools. */
let agentSymbolIndex: WorkspaceSymbolIndex | null = null;

export function setWorkspaceSymbolIndexForAgents(idx: WorkspaceSymbolIndex | null): void {
  agentSymbolIndex = idx;
}

export function getWorkspaceSymbolIndexForAgents(): WorkspaceSymbolIndex | null {
  return agentSymbolIndex;
}

export function scheduleWorkspaceSymbolIndexRebuildForAgents(): void {
  agentSymbolIndex?.scheduleRebuild();
}
