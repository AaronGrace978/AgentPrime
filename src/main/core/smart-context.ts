/**
 * Smart Context Selection for AgentPrime
 * 
 * Intelligently selects relevant files/code for AI context based on:
 * - Current file imports/dependencies
 * - Recently modified files
 * - Files mentioned in the query
 * - Semantic similarity (if embeddings available)
 * - File relationships in the codebase graph
 */

import * as fs from 'fs';
import * as path from 'path';

interface ContextFile {
  path: string;
  content: string;
  relevance: number;
  reason: string;
}

interface SmartContextOptions {
  maxFiles?: number;
  maxTokens?: number;
  includeImports?: boolean;
  includeTests?: boolean;
  query?: string;
}

export class SmartContextSelector {
  private workspacePath: string;
  private recentFiles: Map<string, number> = new Map(); // path -> last access time
  private fileGraph: Map<string, Set<string>> = new Map(); // file -> imported files
  
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Get smart context for AI based on current file and query
   */
  async getSmartContext(
    currentFilePath: string,
    options: SmartContextOptions = {}
  ): Promise<ContextFile[]> {
    const {
      maxFiles = 10,
      maxTokens = 8000,
      includeImports = true,
      includeTests = false,
      query = ''
    } = options;

    const contextFiles: ContextFile[] = [];
    const seenPaths = new Set<string>();

    // 1. Always include current file with highest relevance
    if (currentFilePath && fs.existsSync(currentFilePath)) {
      try {
        const content = fs.readFileSync(currentFilePath, 'utf-8');
        contextFiles.push({
          path: currentFilePath,
          content,
          relevance: 1.0,
          reason: 'Current file'
        });
        seenPaths.add(currentFilePath);
      } catch (e) {
        // Skip if can't read
      }
    }

    // 2. Get imports/dependencies of current file
    if (includeImports && currentFilePath) {
      const imports = this.extractImports(currentFilePath);
      for (const importPath of imports) {
        if (seenPaths.has(importPath)) continue;
        
        try {
          const content = fs.readFileSync(importPath, 'utf-8');
          contextFiles.push({
            path: importPath,
            content,
            relevance: 0.8,
            reason: 'Imported by current file'
          });
          seenPaths.add(importPath);
        } catch (e) {
          // Skip if can't read
        }
      }
    }

    // 3. Find files mentioned in the query
    if (query) {
      const mentionedFiles = this.findMentionedFiles(query);
      for (const filePath of mentionedFiles) {
        if (seenPaths.has(filePath)) continue;
        
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          contextFiles.push({
            path: filePath,
            content,
            relevance: 0.9,
            reason: 'Mentioned in query'
          });
          seenPaths.add(filePath);
        } catch (e) {
          // Skip if can't read
        }
      }
    }

    // 4. Add recently modified files (they're likely relevant)
    const recentFiles = await this.getRecentlyModifiedFiles(5);
    for (const filePath of recentFiles) {
      if (seenPaths.has(filePath)) continue;
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        contextFiles.push({
          path: filePath,
          content,
          relevance: 0.6,
          reason: 'Recently modified'
        });
        seenPaths.add(filePath);
      } catch (e) {
        // Skip if can't read
      }
    }

    // 5. Find related files by name/type
    if (currentFilePath) {
      const relatedFiles = this.findRelatedFiles(currentFilePath);
      for (const filePath of relatedFiles) {
        if (seenPaths.has(filePath)) continue;
        
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          contextFiles.push({
            path: filePath,
            content,
            relevance: 0.5,
            reason: 'Related by name/type'
          });
          seenPaths.add(filePath);
        } catch (e) {
          // Skip if can't read
        }
      }
    }

    // Sort by relevance and limit
    contextFiles.sort((a, b) => b.relevance - a.relevance);
    
    // Token limiting
    let totalTokens = 0;
    const result: ContextFile[] = [];
    
    for (const file of contextFiles) {
      const tokens = this.estimateTokens(file.content);
      
      if (result.length >= maxFiles) break;
      if (totalTokens + tokens > maxTokens) {
        // Try to include a truncated version
        const remainingTokens = maxTokens - totalTokens;
        if (remainingTokens > 500) {
          file.content = this.truncateToTokens(file.content, remainingTokens);
          file.reason += ' (truncated)';
          result.push(file);
        }
        break;
      }
      
      totalTokens += tokens;
      result.push(file);
    }

    return result;
  }

  /**
   * Extract imports from a file
   */
  private extractImports(filePath: string): string[] {
    const imports: string[] = [];
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dir = path.dirname(filePath);
      
      if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
        // JavaScript/TypeScript imports
        const importRegex = /(?:import|require)\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(?:\{[^}]*\}|\w+))?\s*from\s*['"]([^'"]+)['"]/g;
        const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const resolved = this.resolveImportPath(match[1], dir);
          if (resolved) imports.push(resolved);
        }
        while ((match = requireRegex.exec(content)) !== null) {
          const resolved = this.resolveImportPath(match[1], dir);
          if (resolved) imports.push(resolved);
        }
      } else if (ext === '.py') {
        // Python imports
        const importRegex = /(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const resolved = this.resolvePythonImport(match[1], dir);
          if (resolved) imports.push(resolved);
        }
      }
    } catch (e) {
      // Skip if can't read
    }
    
    return imports;
  }

  /**
   * Resolve import path to actual file
   */
  private resolveImportPath(importPath: string, fromDir: string): string | null {
    // Skip node_modules and external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }
    
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    
    for (const ext of extensions) {
      // Try direct file
      let fullPath = path.resolve(fromDir, importPath + ext);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
      
      // Try index file
      fullPath = path.resolve(fromDir, importPath, 'index' + ext);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    
    return null;
  }

  /**
   * Resolve Python import to actual file
   */
  private resolvePythonImport(importPath: string, fromDir: string): string | null {
    const parts = importPath.split('.');
    
    // Try as file
    const filePath = path.join(fromDir, ...parts) + '.py';
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    
    // Try as package
    const pkgPath = path.join(fromDir, ...parts, '__init__.py');
    if (fs.existsSync(pkgPath)) {
      return pkgPath;
    }
    
    return null;
  }

  /**
   * Find files mentioned in query
   */
  private findMentionedFiles(query: string): string[] {
    const files: string[] = [];
    
    // Look for file patterns like "component.tsx" or "utils/helper.ts"
    const filePatterns = query.match(/[a-zA-Z0-9_\-\/]+\.[a-zA-Z]{2,5}/g) || [];
    
    for (const pattern of filePatterns) {
      const found = this.findFileByName(pattern);
      if (found) files.push(found);
    }
    
    return files;
  }

  /**
   * Find file by name in workspace
   */
  private findFileByName(fileName: string): string | null {
    const searchName = path.basename(fileName);
    
    const search = (dir: string): string | null => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
              const result = search(fullPath);
              if (result) return result;
            }
          } else if (entry.name === searchName) {
            return fullPath;
          }
        }
      } catch (e) {
        // Skip if can't read
      }
      
      return null;
    };
    
    return search(this.workspacePath);
  }

  /**
   * Get recently modified files
   */
  private async getRecentlyModifiedFiles(limit: number): Promise<string[]> {
    const files: Array<{ path: string; mtime: number }> = [];
    
    const collect = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            if (!['node_modules', '.git', 'dist', 'build', '__pycache__', 'venv'].includes(entry.name)) {
              collect(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'].includes(ext)) {
              try {
                const stat = fs.statSync(fullPath);
                files.push({ path: fullPath, mtime: stat.mtimeMs });
              } catch (e) {
                // Skip
              }
            }
          }
        }
      } catch (e) {
        // Skip
      }
    };
    
    collect(this.workspacePath);
    
    // Sort by modification time, most recent first
    files.sort((a, b) => b.mtime - a.mtime);
    
    return files.slice(0, limit).map(f => f.path);
  }

  /**
   * Find related files by name/type
   */
  private findRelatedFiles(filePath: string): string[] {
    const related: string[] = [];
    const baseName = path.basename(filePath, path.extname(filePath));
    const dir = path.dirname(filePath);
    
    // Look for related files like .test.ts, .spec.ts, .d.ts, etc.
    const patterns = [
      `${baseName}.test.ts`,
      `${baseName}.test.tsx`,
      `${baseName}.spec.ts`,
      `${baseName}.spec.tsx`,
      `${baseName}.d.ts`,
      `${baseName}.module.css`,
      `${baseName}.styles.ts`,
      `${baseName}.types.ts`,
    ];
    
    for (const pattern of patterns) {
      const testPath = path.join(dir, pattern);
      if (fs.existsSync(testPath)) {
        related.push(testPath);
      }
    }
    
    // Look for index file in same directory
    const indexPath = path.join(dir, 'index.ts');
    if (fs.existsSync(indexPath) && indexPath !== filePath) {
      related.push(indexPath);
    }
    
    return related;
  }

  /**
   * Estimate tokens in content (rough approximation)
   */
  private estimateTokens(content: string): number {
    // Rough estimate: 4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Truncate content to approximately N tokens
   */
  private truncateToTokens(content: string, tokens: number): string {
    const chars = tokens * 4;
    if (content.length <= chars) return content;
    
    // Try to cut at a natural boundary (newline)
    const cutPoint = content.lastIndexOf('\n', chars);
    if (cutPoint > chars * 0.7) {
      return content.substring(0, cutPoint) + '\n\n// ... truncated ...';
    }
    
    return content.substring(0, chars) + '\n\n// ... truncated ...';
  }

  /**
   * Track file access for recency
   */
  trackFileAccess(filePath: string): void {
    this.recentFiles.set(filePath, Date.now());
    
    // Keep only last 50 files
    if (this.recentFiles.size > 50) {
      const oldest = Array.from(this.recentFiles.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 10);
      
      for (const [path] of oldest) {
        this.recentFiles.delete(path);
      }
    }
  }
}

// Export singleton factory
let instance: SmartContextSelector | null = null;

export function getSmartContextSelector(workspacePath: string): SmartContextSelector {
  if (!instance || (instance as any).workspacePath !== workspacePath) {
    instance = new SmartContextSelector(workspacePath);
  }
  return instance;
}

export default SmartContextSelector;

