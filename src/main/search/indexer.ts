/**
 * AgentPrime - Codebase Indexer
 * Indexes codebase with semantic embeddings for automatic context discovery
 */

import * as fs from 'fs';
import * as path from 'path';
import { embeddings } from './embeddings';

interface CodeChunk {
  id: string;
  path: string;
  content: string;
  embedding: number[];
  startLine: number;
  endLine: number;
}

interface SearchResult {
  path: string;
  content: string;
  score: number;
}

/**
 * Checks if an error is caused by OneDrive Files On-Demand placeholders.
 * These are cloud-only stubs that look like real files to stat() but fail on read().
 */
function isOneDrivePlaceholderError(error: any): boolean {
  return error?.code === 'UNKNOWN' && error?.errno === -4094 && error?.syscall === 'read';
}

export class CodebaseIndexer {
  private chunks: CodeChunk[] = [];
  private isIndexing = false;
  private oneDriveSkipped = 0;
  private readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.html', '.css'];
  private readonly maxChunkSize = 500; // tokens
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB - skip files larger than this

  constructor(private workspacePath: string) {}

  async indexCodebase(): Promise<void> {
    if (this.isIndexing) return;

    this.isIndexing = true;
    this.chunks = [];
    this.oneDriveSkipped = 0;

    try {
      console.log(`[CodebaseIndexer] Starting indexing for workspace: ${this.workspacePath}`);
      await this.walkDirectory(this.workspacePath);
      console.log(`[CodebaseIndexer] Indexed ${this.chunks.length} code chunks from ${this.workspacePath}`);
      if (this.oneDriveSkipped > 0) {
        console.warn(`[CodebaseIndexer] ⚠️ Skipped ${this.oneDriveSkipped} OneDrive placeholder file(s) (not downloaded locally). Open them in Explorer or disable Files On-Demand to hydrate.`);
      }
    } catch (error) {
      console.error('[CodebaseIndexer] Failed to index codebase:', error);
    } finally {
      this.isIndexing = false;
    }
  }

  private async walkDirectory(dirPath: string): Promise<void> {
    let items: string[];
    try {
      items = await fs.promises.readdir(dirPath);
    } catch (error: any) {
      if (isOneDrivePlaceholderError(error)) {
        this.oneDriveSkipped++;
        return;
      }
      console.warn(`[CodebaseIndexer] Cannot read directory ${dirPath}:`, error.message);
      return;
    }

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch (error: any) {
        if (isOneDrivePlaceholderError(error)) {
          this.oneDriveSkipped++;
        }
        continue;
      }

      // Skip node_modules, dist, build directories
      if (stat.isDirectory() && !this.shouldSkipDirectory(item)) {
        await this.walkDirectory(fullPath);
      } else if (stat.isFile() && this.shouldIndexFile(item)) {
        await this.indexFile(fullPath);
      }
    }
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['node_modules', 'dist', 'build', '.git', '.vscode', '__pycache__', 'venv', 'env'];
    return skipDirs.includes(dirName);
  }

  private shouldIndexFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  private async indexFile(filePath: string): Promise<void> {
    try {
      // Check file size before reading to avoid memory issues with huge files
      const stat = await fs.promises.stat(filePath);
      if (stat.size > this.maxFileSize) {
        console.log(`[CodebaseIndexer] Skipping large file (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${filePath}`);
        return;
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const chunks = this.chunkContent(content, filePath);

      for (const chunk of chunks) {
        const embedding = await embeddings.embedText(chunk.content);
        this.chunks.push({
          id: `${filePath}:${chunk.startLine}-${chunk.endLine}`,
          path: filePath,
          content: chunk.content,
          embedding,
          startLine: chunk.startLine,
          endLine: chunk.endLine
        });
      }
    } catch (error: any) {
      if (isOneDrivePlaceholderError(error)) {
        this.oneDriveSkipped++;
        return;
      }
      console.warn(`[CodebaseIndexer] Failed to index ${path.basename(filePath)}: ${error.message}`);
    }
  }

  private chunkContent(content: string, filePath: string): Array<{ content: string; startLine: number; endLine: number }> {
    const lines = content.split('\n');
    const chunks: Array<{ content: string; startLine: number; endLine: number }> = [];

    let currentChunk = '';
    let currentStartLine = 1;
    let currentLineCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.estimateTokens(line);

      // Check if adding this line would exceed chunk size
      if (currentLineCount + lineTokens > this.maxChunkSize && currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          startLine: currentStartLine,
          endLine: i
        });

        currentChunk = '';
        currentStartLine = i + 1;
        currentLineCount = 0;
      }

      currentChunk += line + '\n';
      currentLineCount += lineTokens;
    }

    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        startLine: currentStartLine,
        endLine: lines.length
      });
    }

    return chunks;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for code
    return Math.ceil(text.length / 4);
  }

  async searchCodebase(query: string, topK: number = 5): Promise<SearchResult[]> {
    if (this.chunks.length === 0) {
      await this.indexCodebase();
    }

    const queryEmbedding = await embeddings.embedText(query);
    const results: SearchResult[] = [];

    for (const chunk of this.chunks) {
      const score = embeddings.cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score > 0.1) { // Minimum relevance threshold
        results.push({
          path: chunk.path,
          content: chunk.content,
          score
        });
      }
    }

    // Sort by score descending and return top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  getChunkCount(): number {
    return this.chunks.length;
  }

  async reindexFile(filePath: string): Promise<void> {
    // Remove existing chunks for this file
    this.chunks = this.chunks.filter(chunk => chunk.path !== filePath);

    // Re-index the file (use async access check)
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      await this.indexFile(filePath);
    } catch {
      // File doesn't exist or can't be read - skip silently
    }
  }
}
