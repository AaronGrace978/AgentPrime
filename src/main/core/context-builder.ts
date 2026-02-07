/**
 * AgentPrime - Intelligent Context Builder
 * Automatically builds comprehensive context for AI conversations
 * Similar to Cursor's automatic codebase awareness
 */

import * as path from 'path';
import * as fs from 'fs';
import type { ChatContext, FolderContext } from '../../types';

interface QueryAnalysis {
  fileNames: string[];
  symbolNames: string[];
  folderPaths: string[];
  actionKeywords: string[];
  topics: string[];
}

interface RelevantFile {
  path: string;
  content: string;
  relevanceScore: number;
  reason: string;
}

interface ContextBuilderOptions {
  maxFiles?: number;
  maxTokens?: number;
  includeProjectStructure?: boolean;
  includeDependencies?: boolean;
}

export class IntelligentContextBuilder {
  private codebaseIndexer: any;
  private workspacePath: string | null;
  private focusedFolder: string | null;
  private options: Required<ContextBuilderOptions>;

  constructor(
    codebaseIndexer: any,
    workspacePath: string | null,
    focusedFolder: string | null = null,
    options: ContextBuilderOptions = {}
  ) {
    this.codebaseIndexer = codebaseIndexer;
    this.workspacePath = workspacePath;
    this.focusedFolder = focusedFolder;
    this.options = {
      maxFiles: options.maxFiles || 20,
      maxTokens: options.maxTokens || 50000,
      includeProjectStructure: options.includeProjectStructure !== false,
      includeDependencies: options.includeDependencies !== false
    };
  }

  /**
   * Build comprehensive context from user query
   */
  async buildContext(query: string, currentContext: Partial<ChatContext>): Promise<string> {
    const analysis = this.analyzeQuery(query);
    const relevantFiles = await this.findRelevantFiles(analysis, currentContext);
    const projectStructure = this.getProjectStructure();
    const folderContext = this.focusedFolder ? await this.getFocusedFolderContext() : null;

    return this.assembleContext({
      query,
      analysis,
      relevantFiles,
      projectStructure,
      folderContext,
      currentContext
    });
  }

  /**
   * Analyze user query to extract keywords, file names, symbols, etc.
   */
  private analyzeQuery(query: string): QueryAnalysis {
    const lowerQuery = query.toLowerCase();
    
    // Extract potential file names (common patterns)
    const fileNames: string[] = [];
    const filePatterns = [
      /(\w+\.(js|ts|tsx|jsx|py|go|rs|java|cpp|h|hpp|vue|svelte|html|css|json|yaml|yml|md|txt))/gi,
      /(?:file|filepath|path|in|from|to)\s+['"]?([\w\/\-\.]+)['"]?/gi,
      /([\w\/\-]+\.(js|ts|tsx|jsx|py|go|rs|java|cpp|h|hpp|vue|svelte|html|css|json|yaml|yml|md|txt))/gi
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const fileName = match[1] || match[0];
        if (fileName && !fileNames.includes(fileName)) {
          fileNames.push(fileName);
        }
      }
    }

    // Extract potential symbol names (functions, classes, variables)
    const symbolNames: string[] = [];
    const symbolPatterns = [
      /(?:function|class|const|let|var|def|fn)\s+(\w+)/gi,
      /(?:call|use|invoke|execute)\s+(\w+)/gi,
      /(?:the|this|that)\s+(\w+)\s+(?:function|class|method|component)/gi
    ];

    for (const pattern of symbolPatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const symbolName = match[1];
        if (symbolName && symbolName.length > 2 && !symbolNames.includes(symbolName)) {
          symbolNames.push(symbolName);
        }
      }
    }

    // Extract folder/directory references
    const folderPaths: string[] = [];
    const folderPatterns = [
      /(?:in|from|to|folder|directory|dir)\s+['"]?([\w\/\-\.]+)['"]?/gi,
      /([\w\/\-]+)\//g
    ];

    for (const pattern of folderPatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const folderPath = match[1];
        if (folderPath && !folderPath.includes('.') && !folderPaths.includes(folderPath)) {
          folderPaths.push(folderPath);
        }
      }
    }

    // Extract action keywords
    const actionKeywords: string[] = [];
    const actions = [
      'enhance', 'improve', 'refactor', 'add', 'create', 'update', 'fix', 'debug',
      'implement', 'modify', 'change', 'remove', 'delete', 'optimize', 'rewrite',
      'build', 'make', 'generate', 'write', 'edit'
    ];

    for (const action of actions) {
      if (lowerQuery.includes(action)) {
        actionKeywords.push(action);
      }
    }

    // Extract topics/themes
    const topics: string[] = [];
    const commonTopics = [
      'auth', 'authentication', 'login', 'user', 'api', 'database', 'db', 'model',
      'component', 'service', 'util', 'helper', 'config', 'setting', 'route',
      'middleware', 'handler', 'controller', 'view', 'template', 'style', 'css',
      'test', 'spec', 'validation', 'error', 'exception', 'logging', 'log'
    ];

    for (const topic of commonTopics) {
      if (lowerQuery.includes(topic)) {
        topics.push(topic);
      }
    }

    return {
      fileNames,
      symbolNames,
      folderPaths,
      actionKeywords,
      topics
    };
  }

  /**
   * Find relevant files based on query analysis
   * Now includes automatic file discovery via semantic search (no @mentions needed)
   */
  private async findRelevantFiles(
    analysis: QueryAnalysis,
    currentContext: Partial<ChatContext>
  ): Promise<RelevantFile[]> {
    const relevantFiles: Map<string, RelevantFile> = new Map();

    if (!this.codebaseIndexer) {
      return [];
    }

    // 0. SEMANTIC SEARCH - Automatic file discovery (Cursor-style, no @mentions needed)
    try {
      // Use semantic search to find relevant code chunks
      const semanticResults = this.codebaseIndexer.semanticSearch(
        analysis.topics.join(' ') + ' ' + analysis.actionKeywords.join(' ') + ' ' + 
        analysis.symbolNames.join(' '),
        10
      );

      for (const result of semanticResults) {
        if (result.filePath && !relevantFiles.has(result.filePath)) {
          const content = await this.readFileContent(result.filePath);
          if (content) {
            relevantFiles.set(result.filePath, {
              path: result.filePath,
              content,
              relevanceScore: Math.min(95, (result.score || result.similarity * 100)),
              reason: `Semantically relevant: ${result.name || 'code chunk'} (similarity: ${(result.similarity * 100).toFixed(0)}%)`
            });
          }
        }
      }
    } catch (error) {
      // Semantic search might not be available, continue with other methods
      console.warn('[ContextBuilder] Semantic search failed:', error);
    }

    // 1. Files explicitly mentioned in query
    for (const fileName of analysis.fileNames) {
      const files = this.codebaseIndexer.searchFiles(fileName, 5);
      for (const file of files) {
        if (!relevantFiles.has(file.path)) {
          const content = await this.readFileContent(file.path);
          if (content) {
            relevantFiles.set(file.path, {
              path: file.path,
              content,
              relevanceScore: 100,
              reason: `Mentioned in query: ${fileName}`
            });
          }
        }
      }
    }

    // 2. Symbols mentioned in query
    for (const symbolName of analysis.symbolNames) {
      const symbols = this.codebaseIndexer.searchSymbols(symbolName, 10);
      for (const symbol of symbols) {
        if (!relevantFiles.has(symbol.file)) {
          const content = await this.readFileContent(symbol.file);
          if (content) {
            relevantFiles.set(symbol.file, {
              path: symbol.file,
              content,
              relevanceScore: 90,
              reason: `Contains symbol: ${symbolName}`
            });
          }
        }
      }
    }

    // 3. Files matching topics/keywords
    for (const topic of analysis.topics) {
      const files = this.codebaseIndexer.searchFiles(topic, 5);
      for (const file of files) {
        if (!relevantFiles.has(file.path)) {
          const content = await this.readFileContent(file.path);
          if (content) {
            const existing = relevantFiles.get(file.path);
            const score = existing ? existing.relevanceScore + 20 : 70;
            relevantFiles.set(file.path, {
              path: file.path,
              content,
              relevanceScore: Math.min(score, 95),
              reason: existing ? `${existing.reason}, matches topic: ${topic}` : `Matches topic: ${topic}`
            });
          }
        }
      }
    }

    // 4. Files in focused folder
    if (this.focusedFolder) {
      const folderFiles = await this.getFilesInFolder(this.focusedFolder);
      for (const file of folderFiles) {
        if (!relevantFiles.has(file.path)) {
          const content = await this.readFileContent(file.path);
          if (content) {
            relevantFiles.set(file.path, {
              path: file.path,
              content,
              relevanceScore: 85,
              reason: `In focused folder: ${this.focusedFolder}`
            });
          }
        }
      }
    }

    // 5. Current file (if exists)
    if (currentContext.file_path && currentContext.file_content) {
      if (!relevantFiles.has(currentContext.file_path)) {
        relevantFiles.set(currentContext.file_path, {
          path: currentContext.file_path,
          content: currentContext.file_content,
          relevanceScore: 95,
          reason: 'Currently open file'
        });
      }
    }

    // 6. Related files via dependency graph (symbol relationships)
    if (currentContext.file_path && this.options.includeDependencies) {
      const relatedFiles = this.codebaseIndexer.getRelatedFiles(currentContext.file_path, 1);
      for (const relatedPath of relatedFiles.slice(0, 5)) {
        if (!relevantFiles.has(relatedPath)) {
          const content = await this.readFileContent(relatedPath);
          if (content) {
            // Check if files share symbols (higher relevance)
            const currentSymbols = this.codebaseIndexer.getFileSymbols(currentContext.file_path) as Array<{ name: string }>;
            const relatedSymbols = this.codebaseIndexer.getFileSymbols(relatedPath) as Array<{ name: string }>;
            const sharedSymbols = currentSymbols.filter((s: { name: string }) =>
              relatedSymbols.some((rs: { name: string }) => rs.name === s.name)
            );
            
            const score = sharedSymbols.length > 0 ? 75 : 60;
            relevantFiles.set(relatedPath, {
              path: relatedPath,
              content,
              relevanceScore: score,
              reason: sharedSymbols.length > 0 
                ? `Shares symbols with current file: ${sharedSymbols.map(s => s.name).join(', ')}`
                : `Related to current file: ${currentContext.file_path}`
            });
          }
        }
      }
    }

    // 7. Automatic discovery via query intent (no explicit mentions)
    // Find files that match the intent of the query even if not explicitly mentioned
    if (analysis.actionKeywords.length > 0 || analysis.topics.length > 0) {
      const queryTerms = [...analysis.actionKeywords, ...analysis.topics].join(' ');
      const intentFiles = this.codebaseIndexer.findFilesByQuery(queryTerms, 5);
      
      for (const file of intentFiles) {
        if (!relevantFiles.has(file.path)) {
          const content = await this.readFileContent(file.path);
          if (content) {
            relevantFiles.set(file.path, {
              path: file.path,
              content,
              relevanceScore: Math.min(85, file.score || 70),
              reason: `Matches query intent: ${queryTerms}`
            });
          }
        }
      }
    }

    // Sort by relevance score and limit
    const sortedFiles = Array.from(relevantFiles.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.options.maxFiles);

    return sortedFiles;
  }

  /**
   * Get project structure summary
   */
  private getProjectStructure(): string {
    if (!this.codebaseIndexer || !this.options.includeProjectStructure) {
      return '';
    }

    try {
      const stats = this.codebaseIndexer.getStats();
      const structure = this.codebaseIndexer.getProjectStructure();
      
      let structureText = `PROJECT STRUCTURE:\n`;
      structureText += `- Total Files: ${stats.files}\n`;
      structureText += `- Total Symbols: ${stats.symbols}\n`;
      
      if (stats.symbolTypes) {
        structureText += `- Symbol Types: `;
        const types = Object.entries(stats.symbolTypes)
          .map(([type, count]) => `${type}(${count})`)
          .join(', ');
        structureText += types + '\n';
      }

      // Add high-level directory structure
      structureText += `\nKey Directories:\n`;
      const dirs = this.getTopLevelDirs(structure);
      for (const dir of dirs.slice(0, 10)) {
        structureText += `- ${dir}\n`;
      }

      return structureText;
    } catch (e) {
      return '';
    }
  }

  /**
   * Get top-level directories from structure
   */
  private getTopLevelDirs(structure: any, prefix: string = ''): string[] {
    const dirs: string[] = [];
    
    for (const [key, value] of Object.entries(structure)) {
      if (value === 'file') {
        continue;
      }
      const fullPath = prefix ? `${prefix}/${key}` : key;
      dirs.push(fullPath);
      if (typeof value === 'object') {
        dirs.push(...this.getTopLevelDirs(value, fullPath));
      }
    }
    
    return dirs;
  }

  /**
   * Get focused folder context
   */
  private async getFocusedFolderContext(): Promise<string | null> {
    if (!this.focusedFolder || !this.workspacePath) {
      return null;
    }

    try {
      // This would be called via IPC in actual implementation
      // For now, return a placeholder
      return `FOCUSED FOLDER: ${this.focusedFolder}\n`;
    } catch (e) {
      return null;
    }
  }

  /**
   * Get files in a folder
   */
  private async getFilesInFolder(folderPath: string): Promise<Array<{ path: string }>> {
    if (!this.workspacePath) {
      return [];
    }

    try {
      const fullPath = path.join(this.workspacePath, folderPath);
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const files: Array<{ path: string }> = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const relativePath = path.relative(this.workspacePath, path.join(fullPath, entry.name))
            .replace(/\\/g, '/');
          files.push({ path: relativePath });
        }
      }

      return files;
    } catch (e) {
      return [];
    }
  }

  /**
   * Read file content with size limits
   */
  private async readFileContent(filePath: string): Promise<string | null> {
    if (!this.workspacePath) {
      return null;
    }

    try {
      const fullPath = path.join(this.workspacePath, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // Limit file size to prevent token overflow
      const maxSize = 10000; // ~2500 tokens
      return content.length > maxSize ? content.substring(0, maxSize) + '\n... (truncated)' : content;
    } catch (e) {
      return null;
    }
  }

  /**
   * Assemble final context string for AI prompt
   */
  private assembleContext(data: {
    query: string;
    analysis: QueryAnalysis;
    relevantFiles: RelevantFile[];
    projectStructure: string;
    folderContext: string | null;
    currentContext: Partial<ChatContext>;
  }): string {
    let context = '';

    // Project structure
    if (data.projectStructure) {
      context += data.projectStructure + '\n\n';
    }

    // Focused folder context
    if (data.folderContext) {
      context += data.folderContext + '\n';
    }

    // Current file context
    if (data.currentContext.file_path) {
      context += `CURRENT FILE: ${data.currentContext.file_path}\n`;
      if (data.currentContext.selected_text) {
        context += `SELECTED CODE:\n\`\`\`\n${data.currentContext.selected_text}\n\`\`\`\n\n`;
      }
    }

    // Relevant files discovered from query
    if (data.relevantFiles.length > 0) {
      context += `\n--- RELEVANT FILES FOR THIS QUERY (automatically discovered) ---\n\n`;
      
      for (const file of data.relevantFiles) {
        context += `📁 ${file.path} (${file.reason})\n`;
        context += `\`\`\`\n${file.content}\n\`\`\`\n\n`;
      }
    }

    // @mentioned files (explicitly mentioned by user)
    if (data.currentContext.mentioned_files && data.currentContext.mentioned_files.length > 0) {
      context += `\n--- EXPLICITLY REFERENCED FILES (@mentions) ---\n\n`;
      for (const file of data.currentContext.mentioned_files) {
        context += `📁 ${file.path}:\n\`\`\`\n${file.content.substring(0, 5000)}\n\`\`\`\n\n`;
      }
    }

    // @mentioned symbols
    if (data.currentContext.mentioned_symbols && data.currentContext.mentioned_symbols.length > 0) {
      context += `\n--- EXPLICITLY REFERENCED SYMBOLS (@mentions) ---\n\n`;
      for (const sym of data.currentContext.mentioned_symbols) {
        context += `🔹 ${sym.type} "${sym.name}" in ${sym.file}:${sym.line}:\n\`\`\`\n${sym.context}\n\`\`\`\n\n`;
      }
    }

    return context;
  }
}

