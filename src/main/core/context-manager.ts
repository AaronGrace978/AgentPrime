/**
 * AgentPrime - Context Manager
 * Intelligent context window management for AI completions
 * Optimizes context to maximize relevance while staying within token limits
 */

import { getCodebaseEmbeddings } from './codebase-embeddings';

interface ContextSegment {
  content: string;
  source: 'current-file' | 'semantic-file' | 'imports' | 'recent-edits' | 'visible-range';
  priority: number;
  relevance: number;
  tokens: number;
}

interface OptimizedContext {
  content: string;
  segments: ContextSegment[];
  totalTokens: number;
  compressionRatio: number;
}

export class ContextManager {
  private readonly MAX_TOKENS = 4000; // Conservative limit for most models
  private readonly MIN_SEGMENT_LENGTH = 50;
  private readonly MAX_SEGMENT_LENGTH = 1000;

  /**
   * Build intelligent context from query and available data
   */
  async buildIntelligentContext(
    query: string,
    files: string[],
    contextData: {
      currentFile?: string;
      recentEdits?: string[];
      visibleRange?: any;
      imports?: string[];
      semanticContext?: string;
    }
  ): Promise<OptimizedContext> {
    const segments: ContextSegment[] = [];

    // 1. Add semantic context from similar files (highest priority)
    if (contextData.semanticContext) {
      segments.push({
        content: contextData.semanticContext,
        source: 'semantic-file',
        priority: 10,
        relevance: 0.9,
        tokens: this.estimateTokens(contextData.semanticContext)
      });
    }

    // 2. Add current file context (high priority)
    if (contextData.currentFile && files.includes(contextData.currentFile)) {
      const currentFileContent = await this.getFileSnippet(contextData.currentFile, 1000);
      if (currentFileContent) {
        segments.push({
          content: currentFileContent,
          source: 'current-file',
          priority: 9,
          relevance: 0.8,
          tokens: this.estimateTokens(currentFileContent)
        });
      }
    }

    // 3. Add import statements (medium-high priority)
    if (contextData.imports && contextData.imports.length > 0) {
      const importsContent = contextData.imports.join('\n');
      segments.push({
        content: importsContent,
        source: 'imports',
        priority: 7,
        relevance: 0.7,
        tokens: this.estimateTokens(importsContent)
      });
    }

    // 4. Add recent edits (medium priority)
    if (contextData.recentEdits && contextData.recentEdits.length > 0) {
      const editsContent = contextData.recentEdits.join('\n');
      segments.push({
        content: editsContent,
        source: 'recent-edits',
        priority: 6,
        relevance: 0.6,
        tokens: this.estimateTokens(editsContent)
      });
    }

    // 5. Add visible range context (lower priority)
    if (contextData.visibleRange) {
      const visibleContent = await this.getVisibleRangeContent(contextData.currentFile, contextData.visibleRange);
      if (visibleContent) {
        segments.push({
          content: visibleContent,
          source: 'visible-range',
          priority: 4,
          relevance: 0.4,
          tokens: this.estimateTokens(visibleContent)
        });
      }
    }

    // Optimize and compress context
    const optimized = this.optimizeContext(segments, query);

    return optimized;
  }

  /**
   * Prioritize and filter relevant content segments
   */
  prioritizeRelevantContent(segments: ContextSegment[]): ContextSegment[] {
    return segments
      .filter(segment => segment.content.length >= this.MIN_SEGMENT_LENGTH)
      .sort((a, b) => {
        // Sort by weighted score: priority * relevance
        const scoreA = a.priority * a.relevance;
        const scoreB = b.priority * b.relevance;
        return scoreB - scoreA;
      });
  }

  /**
   * Compress context to fit within token limits
   */
  compressContext(context: string): string {
    // If within limits, return as-is
    if (this.estimateTokens(context) <= this.MAX_TOKENS) {
      return context;
    }

    // Apply compression strategies
    let compressed = context;

    // 1. Remove redundant whitespace
    compressed = compressed.replace(/\n\s*\n/g, '\n');

    // 2. Truncate long lines
    compressed = compressed.split('\n')
      .map(line => line.length > 120 ? line.substring(0, 120) + '...' : line)
      .join('\n');

    // 3. Remove comments (basic heuristic)
    compressed = compressed.replace(/^\s*\/\/.*$/gm, '');
    compressed = compressed.replace(/\/\*[\s\S]*?\*\//g, '');

    // 4. If still too long, truncate from the end
    while (this.estimateTokens(compressed) > this.MAX_TOKENS && compressed.length > 500) {
      compressed = compressed.substring(0, compressed.length * 0.9);
    }

    return compressed;
  }

  /**
   * Optimize context by selecting best segments and compressing
   */
  private optimizeContext(segments: ContextSegment[], query: string): OptimizedContext {
    // Prioritize segments
    const prioritized = this.prioritizeRelevantContent(segments);

    // Greedily select segments until token limit
    const selectedSegments: ContextSegment[] = [];
    let totalTokens = 0;

    for (const segment of prioritized) {
      if (totalTokens + segment.tokens <= this.MAX_TOKENS) {
        selectedSegments.push(segment);
        totalTokens += segment.tokens;
      } else {
        // Try to fit a compressed version
        const compressed = this.compressSegment(segment, this.MAX_TOKENS - totalTokens);
        if (compressed.tokens > 50) { // Only if meaningful
          selectedSegments.push(compressed);
          totalTokens += compressed.tokens;
        }
        break;
      }
    }

    // Build final context
    const contextParts = selectedSegments.map(segment => {
      const header = this.getSegmentHeader(segment);
      return `${header}\n${segment.content}\n`;
    });

    const finalContent = contextParts.join('\n---\n');
    const originalTokens = segments.reduce((sum, s) => sum + s.tokens, 0);
    const compressionRatio = originalTokens > 0 ? totalTokens / originalTokens : 1;

    return {
      content: finalContent,
      segments: selectedSegments,
      totalTokens,
      compressionRatio
    };
  }

  /**
   * Compress a single segment to fit within token limit
   */
  private compressSegment(segment: ContextSegment, maxTokens: number): ContextSegment {
    if (segment.tokens <= maxTokens) {
      return segment;
    }

    // Truncate content proportionally
    const ratio = maxTokens / segment.tokens;
    const newLength = Math.floor(segment.content.length * ratio);
    const compressedContent = segment.content.substring(0, newLength);

    // Try to cut at natural boundary
    const lastNewline = compressedContent.lastIndexOf('\n');
    const lastSpace = compressedContent.lastIndexOf(' ');

    let finalContent = compressedContent;
    if (lastNewline > compressedContent.length * 0.8) {
      finalContent = compressedContent.substring(0, lastNewline);
    } else if (lastSpace > compressedContent.length * 0.8) {
      finalContent = compressedContent.substring(0, lastSpace);
    }

    return {
      ...segment,
      content: finalContent + (finalContent.length < compressedContent.length ? '...' : ''),
      tokens: this.estimateTokens(finalContent)
    };
  }

  /**
   * Get header for context segment
   */
  private getSegmentHeader(segment: ContextSegment): string {
    const headers = {
      'current-file': 'Current File Context',
      'semantic-file': 'Related Code Context',
      'imports': 'Import Statements',
      'recent-edits': 'Recent Changes',
      'visible-range': 'Visible Code'
    };

    return `### ${headers[segment.source] || 'Context'}`;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token per 4 characters for code
    return Math.ceil(text.length / 4);
  }

  /**
   * Get file snippet around current position
   */
  private async getFileSnippet(filePath: string, maxLength: number): Promise<string | null> {
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) return null;

      const content = fs.readFileSync(filePath, 'utf-8');
      return content.length > maxLength
        ? content.substring(0, maxLength) + '\n... (truncated)'
        : content;
    } catch (error) {
      console.warn(`[ContextManager] Failed to read file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get visible range content
   */
  private async getVisibleRangeContent(filePath?: string, visibleRange?: any): Promise<string | null> {
    if (!filePath || !visibleRange) return null;

    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) return null;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const startLine = Math.max(0, visibleRange.startLineNumber - 1);
      const endLine = Math.min(lines.length, visibleRange.endLineNumber);

      const visibleContent = lines.slice(startLine, endLine).join('\n');
      return visibleContent.length > 500
        ? visibleContent.substring(0, 500) + '\n... (truncated)'
        : visibleContent;
    } catch (error) {
      console.warn(`[ContextManager] Failed to get visible range for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get context statistics
   */
  getStats(): any {
    return {
      maxTokens: this.MAX_TOKENS,
      minSegmentLength: this.MIN_SEGMENT_LENGTH,
      maxSegmentLength: this.MAX_SEGMENT_LENGTH
    };
  }
}

// Singleton instance
let contextManagerInstance: ContextManager | null = null;

export function getContextManager(): ContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ContextManager();
  }
  return contextManagerInstance;
}
