/**
 * AgentPrime - Code Analysis IPC Handlers
 * Handles ESLint analysis for JavaScript/TypeScript files
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { IpcMain } from 'electron';
import * as os from 'os';
import { completionOptimizer } from '../core/completion-optimizer';

interface AnalysisHandlersDeps {
  ipcMain: IpcMain;
  getWorkspacePath: () => string | null;
  getCodebaseIndexer?: () => any;
  getActivatePrime?: () => any;
}

// Helper function for language detection
function getLanguageFromExt(ext: string): string {
  const langMap: Record<string, string> = {
    '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescriptreact',
    '.py': 'python', '.html': 'html', '.css': 'css', '.scss': 'scss', '.json': 'json',
    '.md': 'markdown', '.sql': 'sql', '.sh': 'shell', '.yaml': 'yaml', '.yml': 'yaml',
    '.go': 'go', '.rs': 'rust', '.java': 'java', '.c': 'c', '.cpp': 'cpp',
    '.h': 'c', '.hpp': 'cpp', '.vue': 'vue', '.svelte': 'svelte'
  };
  return langMap[ext.toLowerCase()] || 'text';
}

// Types for codebase examination
export interface CodebaseFileInfo {
  path: string;
  name: string;
  size: number;
  language: string;
  lines: number;
  content?: string;
}

export interface CodebaseSummary {
  root: string;
  totalFiles: number;
  totalSize: number;
  languages: Record<string, { count: number; files: CodebaseFileInfo[] }>;
  structure: {
    directories: string[];
    keyFiles: CodebaseFileInfo[];
  };
}

// Internal function for codebase examination (can be called from other handlers)
export async function examineCodebaseInternal(workspacePath: string, options: { maxFiles?: number; includeContent?: boolean } = {}): Promise<{ success: boolean; summary?: CodebaseSummary; error?: string }> {
  if (!workspacePath) {
    return { success: false, error: 'No workspace' };
  }

  const maxFiles = options.maxFiles || 100;
  const includeContent = options.includeContent || false;

  try {

    const summary: CodebaseSummary = {
      root: workspacePath,
      totalFiles: 0,
      totalSize: 0,
      languages: {},
      structure: {
        directories: [],
        keyFiles: []
      }
    };

    const ignorePatterns = [
      'node_modules', '__pycache__', 'venv', '.git', 'dist', 'build',
      '.next', '.nuxt', '.cache', 'coverage', '.idea', '.vscode'
    ];

    function shouldIgnore(filePath: string): boolean {
      const parts = filePath.split(/[/\\]/);
      return parts.some(part => 
        part.startsWith('.') || 
        ignorePatterns.includes(part) ||
        part === 'package-lock.json' ||
        part === 'yarn.lock'
      );
    }

    function scanDirectory(dirPath: string, relativePath: string = ''): void {
      if (summary.totalFiles >= maxFiles) return;

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (summary.totalFiles >= maxFiles) break;

          const fullPath = path.join(dirPath, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (shouldIgnore(relPath)) continue;

          if (entry.isDirectory()) {
            summary.structure.directories.push(relPath);
            scanDirectory(fullPath, relPath);
          } else {
            try {
              const stats = fs.statSync(fullPath);
              const ext = path.extname(entry.name);
              const language = getLanguageFromExt(ext);

              let content: string | undefined;
              let lines = 0;

              if (includeContent && stats.size < 100000) { // Only read files < 100KB
                try {
                  content = fs.readFileSync(fullPath, 'utf-8');
                  lines = content.split('\n').length;
                } catch {
                  // Skip binary files
                }
              } else {
                // Estimate lines from file size
                lines = Math.floor(stats.size / 50);
              }

              const fileInfo: CodebaseFileInfo = {
                path: relPath,
                name: entry.name,
                size: stats.size,
                language,
                lines
              };

              if (includeContent && content) {
                fileInfo.content = content.substring(0, 5000); // Limit content preview
              }

              if (!summary.languages[language]) {
                summary.languages[language] = { count: 0, files: [] };
              }

              summary.languages[language].count++;
              summary.languages[language].files.push(fileInfo);

              // Track key files (package.json, README, main entry points)
              if (['package.json', 'README.md', 'main.ts', 'main.js', 'index.ts', 'index.js', 
                   'app.py', 'main.py', 'Cargo.toml', 'go.mod'].includes(entry.name)) {
                summary.structure.keyFiles.push(fileInfo);
              }

              summary.totalFiles++;
              summary.totalSize += stats.size;
            } catch {
              // Skip files we can't read
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    scanDirectory(workspacePath);

    return {
      success: true,
      summary: {
        ...summary,
        languages: Object.entries(summary.languages)
          .sort(([, a], [, b]) => b.count - a.count)
          .reduce((acc, [lang, data]) => {
            acc[lang] = data;
            return acc;
            }, {} as Record<string, { count: number; files: CodebaseFileInfo[] }>)
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Register analysis-related IPC handlers
 */
export function register(deps: AnalysisHandlersDeps): void {
  const { ipcMain, getWorkspacePath, getCodebaseIndexer, getActivatePrime } = deps;

  // Import completion optimizer for <100ms inline completions
  const { completionOptimizer } = require('../core/completion-optimizer');

  // Analyze code with ESLint
  ipcMain.handle('analyze:eslint', async (event, filePath: string, content: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { success: false, error: 'No workspace' };

    const fullPath = path.join(workspacePath, filePath);

    try {
      // Write content to temp file for analysis
      const tempFile = path.join(os.tmpdir(), `agentprime-temp-${Date.now()}${path.extname(fullPath)}`);
      fs.writeFileSync(tempFile, content);

      return new Promise((resolve) => {
        exec(`npx eslint "${tempFile}" --format json`, { cwd: path.dirname(fullPath) }, async (error, stdout) => {
          try {
            fs.unlinkSync(tempFile);
          } catch {}

          try {
            const results = JSON.parse(stdout);
            const issues = results[0]?.messages || [];
            resolve({
              success: true,
              issues: issues.map((m: any) => ({
                line: m.line,
                column: m.column,
                message: m.message,
                severity: m.severity === 2 ? 'error' : 'warning',
                ruleId: m.ruleId,
              })),
            });
          } catch {
            resolve({ success: true, issues: [] });
          }
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Semantic search using vector embeddings
  ipcMain.handle('semantic-search', async (event, query: string, limit: number = 10) => {
    try {
      const indexer = getCodebaseIndexer?.();
      if (!indexer) {
        return { success: false, error: 'Codebase indexer not available' };
      }

      const results = indexer.semanticSearch(query, limit);
      return { success: true, results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });


  // Get semantic context for intelligent completions
  ipcMain.handle('semantic-context', async (event, query: any) => {
    try {
      const { getCodebaseEmbeddings } = require('../core/codebase-embeddings');
      const embeddings = getCodebaseEmbeddings();

      const context = await embeddings.buildIntelligentContext(
        query.query,
        [], // Will be populated from workspace
        {
          currentFile: query.filePath,
          maxFiles: query.maxFiles || 3,
          contextWindow: query.contextWindow || 2000
        }
      );

      return context;
    } catch (error: any) {
      console.warn('[SemanticContext] Failed to build context:', error.message);
      return '';
    }
  });

  // Enhanced inline completion with AI and codebase context
  // Optimized for <100ms latency with smart caching and fast models
  ipcMain.handle('inline-completion', async (event, context: any) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { completion: null };
    }

    try {
      const beforeCursor = context.beforeCursor || context.beforeCursorOnLine || '';
      
      // Import AI router dynamically to avoid circular dependencies
      const aiRouter = require('../ai-providers').default;

      // Use completion optimizer for fast completions
      // The optimizer handles:
      // - Dedicated tiny local models (qwen2.5-coder:1.5b, etc.)
      // - Aggressive caching with smart invalidation
      // - Context reduction to last 200 chars
      // - Streaming for immediate partial results
      const onPartial = (partialCompletion: string): void => {
        // Stream partial results immediately to renderer
        // This allows showing completions as they're generated
        event.sender.send('inline-completion-partial', {
          completion: partialCompletion,
          filePath: context.filePath,
          lineNumber: context.lineNumber
        });
      };

      const result = await completionOptimizer.getCompletion(
        {
          filePath: context.filePath,
          language: context.language,
          beforeCursor: beforeCursor || context.beforeCursorFull || '',
          afterCursor: context.afterCursor,
          lineNumber: context.lineNumber
        },
        aiRouter,
        onPartial
      );

      return {
        completion: result.completion || null,
        fromCache: result.fromCache,
        latency: result.latency,
        model: result.model
      };
    } catch (error: any) {
      console.warn('[Analysis] Inline completion error:', error.message);
      return { completion: null };
    }
  });

  // Find similar code chunks
  ipcMain.handle('find-similar-code', async (event, codeSnippet: string, limit: number = 5) => {
    try {
      const indexer = getCodebaseIndexer?.();
      if (!indexer) {
        return { success: false, error: 'Codebase indexer not available' };
      }

      const results = indexer.findSimilarCode(codeSnippet, limit);
      return { success: true, results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // IPC handler wrapper
  ipcMain.handle('examine:codebase', async (event, options: { maxFiles?: number; includeContent?: boolean } = {}) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }
    return examineCodebaseInternal(workspacePath, options);
  });

  // Get completion cache statistics (for monitoring and debugging)
  ipcMain.handle('completion:cache-stats', async () => {
    try {
      const stats = completionOptimizer.getCacheStats();
      return { success: true, stats };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Invalidate completion cache (for testing or manual cache clearing)
  ipcMain.handle('completion:invalidate', async (event, filePath?: string) => {
    try {
      if (filePath) {
        completionOptimizer.invalidateFile(filePath);
        return { success: true, message: `Invalidated cache for ${filePath}` };
      } else {
        completionOptimizer.clearCache();
        return { success: true, message: 'Invalidated all cache entries' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Pre-warm completion model when editor gains focus
  ipcMain.handle('editor-focused', async () => {
    try {
      const aiRouter = require('../ai-providers').default;
      await completionOptimizer.preWarm(aiRouter);
      return { success: true };
    } catch (error: any) {
      console.warn('[Analysis] Failed to pre-warm completion model:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Find symbol definition - searches for where a symbol is defined
  // Supports both legacy (filePath, line, col) and new (params object) signatures
  ipcMain.handle('find-definition', async (event, params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => {
    const wsPath = params.workspacePath || getWorkspacePath();
    if (!wsPath) {
      return { success: false, error: 'No workspace', definitions: [] };
    }

    try {
      const symbolName = params.word;
      if (!symbolName) {
        return { success: false, error: 'No symbol provided', definitions: [] };
      }

      // Search for definitions in workspace
      const definitions = await findSymbolDefinitions(wsPath, symbolName);

      return { 
        success: true, 
        definitions,
        symbol: symbolName 
      };
    } catch (error: any) {
      return { success: false, error: error.message, definitions: [] };
    }
  });

  // Legacy handler for backwards compatibility
  ipcMain.handle('findDefinition', async (event, filePath: string, lineNumber: number, column: number) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const line = lines[lineNumber - 1] || '';
      
      const wordMatch = extractWordAtPosition(line, column);
      if (!wordMatch) {
        return { success: false, error: 'No symbol at position' };
      }

      const definitions = await findSymbolDefinitions(workspacePath, wordMatch.word);
      return { success: true, definitions, symbol: wordMatch.word };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Find all references to a symbol - new API
  ipcMain.handle('find-references', async (event, params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => {
    const wsPath = params.workspacePath || getWorkspacePath();
    if (!wsPath) {
      return { success: false, error: 'No workspace', references: [] };
    }

    try {
      const symbolName = params.word;
      if (!symbolName) {
        return { success: false, error: 'No symbol provided', references: [] };
      }

      // Search for references in workspace
      const references = await findSymbolReferences(wsPath, symbolName);

      return { 
        success: true, 
        references,
        symbol: symbolName 
      };
    } catch (error: any) {
      return { success: false, error: error.message, references: [] };
    }
  });

  // Legacy handler for backwards compatibility
  ipcMain.handle('findReferences', async (event, filePath: string, lineNumber: number, column: number) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const line = lines[lineNumber - 1] || '';
      
      const wordMatch = extractWordAtPosition(line, column);
      if (!wordMatch) {
        return { success: false, error: 'No symbol at position' };
      }

      const references = await findSymbolReferences(workspacePath, wordMatch.word);
      return { success: true, references, symbol: wordMatch.word };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ActivatePrime IPC Handlers - Cursor-like AI assistance
  ipcMain.handle('activateprime:get-status', async () => {
    const activatePrime = getActivatePrime?.();
    if (!activatePrime) {
      return { success: false, error: 'ActivatePrime not initialized' };
    }
    return { success: true, status: activatePrime.getStatus() };
  });

  ipcMain.handle('activateprime:build-context', async (event, query: string, currentFiles: string[] = []) => {
    const activatePrime = getActivatePrime?.();
    const workspacePath = getWorkspacePath();
    if (!activatePrime) {
      return { success: false, error: 'ActivatePrime not initialized' };
    }
    try {
      const context = await activatePrime.buildIntelligentContext(query, currentFiles, workspacePath || undefined);
      return { success: true, context };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('activateprime:analyze-architecture', async () => {
    const activatePrime = getActivatePrime?.();
    if (!activatePrime) {
      return { success: false, error: 'ActivatePrime not initialized' };
    }
    try {
      const architecture = await activatePrime.analyzeArchitecture();
      return { success: true, architecture };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('activateprime:route-request', async (event, query: string) => {
    const activatePrime = getActivatePrime?.();
    if (!activatePrime) {
      return { success: false, error: 'ActivatePrime not initialized' };
    }
    const modules = activatePrime.getModules();
    if (modules.enhancedModelRouter) {
      const routing = modules.enhancedModelRouter.routeRequest(query);
      return { success: true, routing };
    }
    return { success: false, error: 'Model router not initialized' };
  });
}

// Helper: Extract word at column position
function extractWordAtPosition(line: string, column: number): { word: string; start: number; end: number } | null {
  // Find word boundaries around column
  const wordPattern = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  let match;
  
  while ((match = wordPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    
    if (column >= start && column <= end) {
      return { word: match[0], start, end };
    }
  }
  
  return null;
}

// Helper: Find symbol definitions in workspace
async function findSymbolDefinitions(workspacePath: string, symbolName: string): Promise<any[]> {
  const definitions: any[] = [];
  
  const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '__pycache__', 'venv', '.next'];
  
  // Definition patterns for different languages
  const definitionPatterns = [
    // JavaScript/TypeScript
    new RegExp(`(function|const|let|var|class|interface|type|enum)\\s+${escapeRegex(symbolName)}\\b`),
    new RegExp(`${escapeRegex(symbolName)}\\s*[=:]\\s*(function|\\(|\\{|\\[|async|class)`),
    new RegExp(`(export\\s+)?(default\\s+)?(function|class|const|let|var)\\s+${escapeRegex(symbolName)}\\b`),
    // Python
    new RegExp(`(def|class)\\s+${escapeRegex(symbolName)}\\s*[\\(:]`),
    // Go/Rust
    new RegExp(`(func|fn|struct|type)\\s+${escapeRegex(symbolName)}\\b`),
  ];

  async function searchDirectory(dirPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          if (!ignorePatterns.some(p => entry.name === p || entry.name.startsWith('.'))) {
            await searchDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'].includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const pattern of definitionPatterns) {
                  if (pattern.test(line)) {
                    definitions.push({
                      name: symbolName,
                      type: 'definition',
                      file: fullPath,
                      line: i + 1,
                      column: line.indexOf(symbolName) + 1,
                      context: line.trim().substring(0, 100)
                    });
                    break; // Only add once per line
                  }
                }
              }
            } catch (e) {
              // Skip files that can't be read
            }
          }
        }
      }
    } catch (e) {
      // Skip directories that can't be read
    }
  }

  await searchDirectory(workspacePath);
  return definitions;
}

// Helper: Find symbol references in workspace
async function findSymbolReferences(workspacePath: string, symbolName: string): Promise<any[]> {
  const references: any[] = [];
  
  const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '__pycache__', 'venv', '.next'];
  const symbolPattern = new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'g');

  async function searchDirectory(dirPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          if (!ignorePatterns.some(p => entry.name === p || entry.name.startsWith('.'))) {
            await searchDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html'].includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let match;
                symbolPattern.lastIndex = 0; // Reset regex state
                
                while ((match = symbolPattern.exec(line)) !== null) {
                  references.push({
                    name: symbolName,
                    type: 'reference',
                    file: fullPath,
                    line: i + 1,
                    column: match.index + 1,
                    context: line.trim().substring(0, 100)
                  });
                }
              }
            } catch (e) {
              // Skip files that can't be read
            }
          }
        }
      }
    } catch (e) {
      // Skip directories that can't be read
    }
  }

  await searchDirectory(workspacePath);
  return references;
}

// Helper: Escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
