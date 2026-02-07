/**
 * AgentPrime - Codebase Embeddings
 * Semantic understanding of entire codebases for intelligent completions
 * Builds on ContextVectorStore for Cursor-level intelligence
 */

import { getContextVectorStore, ContextVectorStore } from './context-vector-store';
import { SemanticEmbeddings, embeddings } from '../search/embeddings';
import * as fs from 'fs';
import * as path from 'path';

interface CodebaseEmbedding {
  filePath: string;
  content: string;
  embedding: number[];
  metadata: {
    language: string;
    size: number;
    lines: number;
    symbols: string[];
    imports: string[];
    exports: string[];
    lastModified: number;
    complexity: number;
  };
}

interface SemanticFileResult {
  filePath: string;
  similarity: number;
  relevanceScore: number;
  content: string;
  metadata: CodebaseEmbedding['metadata'];
}

interface ContextQuery {
  query: string;
  language?: string;
  currentFile?: string;
  maxFiles?: number;
  contextWindow?: number; // Characters of context to include
}

export class CodebaseEmbeddings {
  private vectorStore: ContextVectorStore;
  private embeddings: SemanticEmbeddings;
  private codebaseEmbeddings: Map<string, CodebaseEmbedding> = new Map();
  private isInitialized: boolean = false;
  private workspacePath: string | null = null;

  constructor() {
    this.vectorStore = getContextVectorStore();
    this.embeddings = embeddings;
  }

  /**
   * Initialize codebase embeddings for a workspace
   */
  async initializeForWorkspace(workspacePath: string): Promise<void> {
    this.workspacePath = workspacePath;
    this.isInitialized = true;
    console.log(`[CodebaseEmbeddings] Initialized for workspace: ${workspacePath}`);
  }

  /**
   * Generate embeddings for multiple files
   */
  async generateEmbeddings(files: string[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    for (const filePath of files) {
      try {
        const embedding = await this.generateFileEmbedding(filePath);
        if (embedding) {
          results.set(filePath, embedding);

          // Store in vector store for semantic search
          await this.storeFileEmbedding(filePath, embedding);
        }
      } catch (error) {
        console.warn(`[CodebaseEmbeddings] Failed to embed ${filePath}:`, error);
      }
    }

    return results;
  }

  /**
   * Generate embedding for a single file
   */
  private async generateFileEmbedding(filePath: string): Promise<number[] | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const metadata = this.extractFileMetadata(filePath, content);

      // Create a rich text representation for embedding
      const embeddingText = this.createEmbeddingText(content, metadata);

      const embedding = await this.embeddings.embedText(embeddingText);

      // Cache the embedding
      const codebaseEmbedding: CodebaseEmbedding = {
        filePath,
        content,
        embedding,
        metadata
      };

      this.codebaseEmbeddings.set(filePath, codebaseEmbedding);

      return embedding;
    } catch (error) {
      console.warn(`[CodebaseEmbeddings] Error generating embedding for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Extract comprehensive metadata from a file
   */
  private extractFileMetadata(filePath: string, content: string): CodebaseEmbedding['metadata'] {
    const language = this.detectLanguage(filePath);
    const lines = content.split('\n').length;
    const size = Buffer.byteLength(content, 'utf-8');

    return {
      language,
      size,
      lines,
      symbols: this.extractSymbols(content, language),
      imports: this.extractImports(content, language),
      exports: this.extractExports(content, language),
      lastModified: fs.statSync(filePath).mtime.getTime(),
      complexity: this.calculateComplexity(content, language)
    };
  }

  /**
   * Create rich text representation for embedding
   */
  private createEmbeddingText(content: string, metadata: CodebaseEmbedding['metadata']): string {
    const parts = [
      `File: ${path.basename(metadata.language)}`,
      `Language: ${metadata.language}`,
      `Symbols: ${metadata.symbols.slice(0, 10).join(', ')}`,
      `Imports: ${metadata.imports.slice(0, 5).join(', ')}`,
      `Exports: ${metadata.exports.slice(0, 5).join(', ')}`,
      '',
      content.substring(0, 2000) // Limit content for embedding
    ];

    return parts.join('\n');
  }

  /**
   * Find similar files based on semantic query
   */
  async findSimilarFiles(query: string, limit: number = 10): Promise<SemanticFileResult[]> {
    if (!this.isInitialized) {
      return [];
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddings.embedText(query);
      const results: SemanticFileResult[] = [];

      // Calculate similarity with all embedded files
      for (const [filePath, embedding] of this.codebaseEmbeddings) {
        const similarity = this.embeddings.cosineSimilarity(queryEmbedding, embedding.embedding);

        // Calculate relevance score based on multiple factors
        const relevanceScore = this.calculateRelevanceScore(embedding, query, similarity);

        results.push({
          filePath,
          similarity,
          relevanceScore,
          content: embedding.content,
          metadata: embedding.metadata
        });
      }

      // Sort by relevance score and return top results
      return results
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

    } catch (error) {
      console.warn('[CodebaseEmbeddings] Error finding similar files:', error);
      return [];
    }
  }

  /**
   * Build intelligent context from relevant files
   */
  async buildIntelligentContext(
    query: string,
    files: string[],
    contextQuery: ContextQuery
  ): Promise<string> {
    const {
      maxFiles = 5,
      contextWindow = 4000,
      currentFile
    } = contextQuery;

    // Get semantically similar files
    const similarFiles = await this.findSimilarFiles(query, maxFiles * 2);

    // Prioritize files and build context
    const prioritizedFiles = this.prioritizeRelevantContent(similarFiles, currentFile);
    const selectedFiles = prioritizedFiles.slice(0, maxFiles);

    // Build compressed context
    const context = this.compressContext(selectedFiles, contextWindow);

    return context;
  }

  /**
   * Prioritize and filter relevant content
   */
  private prioritizeRelevantContent(
    files: SemanticFileResult[],
    currentFile?: string
  ): SemanticFileResult[] {
    return files
      .filter(file => file.relevanceScore > 0.3) // Filter low relevance
      .filter(file => file.filePath !== currentFile) // Exclude current file
      .sort((a, b) => {
        // Prioritize by multiple factors
        let scoreA = a.relevanceScore;
        let scoreB = b.relevanceScore;

        // Boost recently modified files
        const now = Date.now();
        const recencyA = Math.max(0, 1 - (now - a.metadata.lastModified) / (1000 * 60 * 60 * 24 * 30));
        const recencyB = Math.max(0, 1 - (now - b.metadata.lastModified) / (1000 * 60 * 60 * 24 * 30));
        scoreA += recencyA * 0.1;
        scoreB += recencyB * 0.1;

        // Boost files with imports/exports (more connected)
        scoreA += (a.metadata.imports.length + a.metadata.exports.length) * 0.05;
        scoreB += (b.metadata.imports.length + b.metadata.exports.length) * 0.05;

        return scoreB - scoreA;
      });
  }

  /**
   * Compress context to fit within token limits
   */
  private compressContext(files: SemanticFileResult[], maxLength: number): string {
    const contextParts: string[] = [];
    let currentLength = 0;

    for (const file of files) {
      const fileHeader = `// ${path.basename(file.filePath)} (${file.metadata.language})`;
      const content = this.extractRelevantContent(file.content, file.metadata);

      const fileContext = `${fileHeader}\n${content}\n`;
      const fileLength = fileContext.length;

      if (currentLength + fileLength > maxLength) {
        // Truncate content if needed
        const remainingLength = maxLength - currentLength - fileHeader.length - 10;
        if (remainingLength > 100) {
          const truncatedContent = content.substring(0, remainingLength) + '\n// ... (truncated)';
          contextParts.push(`${fileHeader}\n${truncatedContent}\n`);
        }
        break;
      }

      contextParts.push(fileContext);
      currentLength += fileLength;
    }

    return contextParts.join('\n');
  }

  /**
   * Extract relevant content from a file (functions, classes, etc.)
   */
  private extractRelevantContent(content: string, metadata: CodebaseEmbedding['metadata']): string {
    const lines = content.split('\n');
    const relevantLines: string[] = [];

    // Extract function/class definitions and key statements
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Include function/class definitions
      if (line.match(/^(export\s+)?(function|class|interface|type|const|let|var)\s+/) ||
          line.match(/^(export\s+)?(async\s+)?function/) ||
          line.includes('=>') && line.includes('function')) {
        relevantLines.push(line);
      }
      // Include imports/exports
      else if (line.startsWith('import') || line.startsWith('export') || line.startsWith('from')) {
        relevantLines.push(line);
      }
      // Include comments (documentation)
      else if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        relevantLines.push(line);
      }
    }

    return relevantLines.slice(0, 20).join('\n'); // Limit to 20 relevant lines
  }

  /**
   * Calculate relevance score for a file
   */
  private calculateRelevanceScore(
    embedding: CodebaseEmbedding,
    query: string,
    similarity: number
  ): number {
    let score = similarity * 0.6; // Base similarity weight

    // Language relevance
    if (query.toLowerCase().includes(embedding.metadata.language.toLowerCase())) {
      score += 0.2;
    }

    // Symbol matching
    const queryWords = query.toLowerCase().split(/\s+/);
    const symbolMatches = embedding.metadata.symbols.filter(symbol =>
      queryWords.some(word => symbol.toLowerCase().includes(word))
    ).length;
    score += Math.min(symbolMatches * 0.1, 0.2);

    return Math.min(score, 1.0);
  }

  /**
   * Store file embedding in vector store for persistence
   */
  private async storeFileEmbedding(filePath: string, embedding: number[]): Promise<void> {
    const id = `file:${filePath}`;
    const content = `Code file: ${path.basename(filePath)}`;

    await this.vectorStore.storeEmbedding(id, content, {
      filePath,
      contextType: 'general',
      timestamp: Date.now()
    });
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.sql': 'sql'
    };

    return languageMap[ext] || 'unknown';
  }

  /**
   * Extract symbols (functions, classes, variables) from content
   */
  private extractSymbols(content: string, language: string): string[] {
    const symbols: string[] = [];

    // JavaScript/TypeScript patterns
    if (['javascript', 'typescript'].includes(language)) {
      const patterns = [
        /(?:export\s+)?(?:function|class|interface|type|enum)\s+(\w+)/g,
        /(?:export\s+)?const\s+(\w+)\s*=/g,
        /(?:export\s+)?let\s+(\w+)\s*=/g,
        /(?:export\s+)?var\s+(\w+)\s*=/g
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          symbols.push(match[1]);
        }
      }
    }

    // Python patterns
    else if (language === 'python') {
      const patterns = [
        /def\s+(\w+)\s*\(/g,
        /class\s+(\w+)/g,
        /(\w+)\s*=\s*lambda/g
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          symbols.push(match[1]);
        }
      }
    }

    return [...new Set(symbols)]; // Remove duplicates
  }

  /**
   * Extract imports from content
   */
  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];

    if (['javascript', 'typescript'].includes(language)) {
      const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    } else if (language === 'python') {
      const importRegex = /(?:(?:from\s+(\S+)\s+import)|(?:import\s+))(\S+)/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1] || match[2]);
      }
    }

    return imports;
  }

  /**
   * Extract exports from content
   */
  private extractExports(content: string, language: string): string[] {
    const exports: string[] = [];

    if (['javascript', 'typescript'].includes(language)) {
      const exportRegex = /export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    return exports;
  }

  /**
   * Calculate code complexity score
   */
  private calculateComplexity(content: string, language: string): number {
    let complexity = 0;

    // Count control structures
    const controlKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch'];
    for (const keyword of controlKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = content.match(regex);
      if (matches) {
        complexity += matches.length * 0.1;
      }
    }

    // Count functions/methods
    const functionMatches = content.match(/(?:function|def|class)\s+\w+/g);
    if (functionMatches) {
      complexity += functionMatches.length * 0.2;
    }

    // Length factor
    complexity += Math.min(content.length / 10000, 1.0);

    return Math.min(complexity, 1.0);
  }

  /**
   * Get statistics about the codebase embeddings
   */
  getStats(): any {
    return {
      initialized: this.isInitialized,
      workspacePath: this.workspacePath,
      totalFiles: this.codebaseEmbeddings.size,
      languages: this.getLanguageStats(),
      vectorStoreStats: this.vectorStore.getStats()
    };
  }

  /**
   * Get language distribution statistics
   */
  private getLanguageStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const embedding of this.codebaseEmbeddings.values()) {
      const lang = embedding.metadata.language;
      stats[lang] = (stats[lang] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear all embeddings
   */
  clear(): void {
    this.codebaseEmbeddings.clear();
    this.vectorStore.clear();
  }
}

// Singleton instance
let codebaseEmbeddingsInstance: CodebaseEmbeddings | null = null;

export function getCodebaseEmbeddings(): CodebaseEmbeddings {
  if (!codebaseEmbeddingsInstance) {
    codebaseEmbeddingsInstance = new CodebaseEmbeddings();
  }
  return codebaseEmbeddingsInstance;
}
