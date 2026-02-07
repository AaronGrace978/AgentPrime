/**
 * Mirror Knowledge Ingester
 * Fetches code examples from online sources and feeds them into the mirror system
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import https from 'https';
import http from 'http';
import { MirrorMemory } from './mirror-memory';
import { MirrorPatternExtractor } from './mirror-pattern-extractor';
import { getAdvancedLearningEngine } from './advanced-learning';

interface IngestionResult {
  success: boolean;
  fileName?: string;
  patternsExtracted?: number;
  error?: string;
  url?: string;
  sourceType?: string;
}

interface IngestionHistoryItem {
  url: string;
  sourceType: string;
  fileName: string;
  patternsExtracted: number;
  timestamp: number;
  success: boolean;
}

interface MultipleIngestionResult {
  success: boolean;
  results: IngestionResult[];
  totalPatternsExtracted: number;
  successfulIngestions: number;
  failedIngestions: number;
  error?: string;
}

export class MirrorKnowledgeIngester {
  private opusExamplesPath: string;
  private mirrorMemory: MirrorMemory;
  private patternExtractor: MirrorPatternExtractor;
  private ingestionHistory: IngestionHistoryItem[];
  private learningEngine = getAdvancedLearningEngine();

  constructor(
    opusExamplesPath: string,
    mirrorMemory: MirrorMemory,
    patternExtractor: MirrorPatternExtractor
  ) {
    this.opusExamplesPath = opusExamplesPath;
    this.mirrorMemory = mirrorMemory;
    this.patternExtractor = patternExtractor;
    this.ingestionHistory = [];
  }

  /**
   * Ingest knowledge from a URL (GitHub, Gist, raw code, etc.)
   */
  async ingestFromURL(url: string, options: any = {}): Promise<IngestionResult> {
    try {
      console.log(`📥 Fetching knowledge from: ${url}`);

      // Determine source type
      const sourceType = this.detectSourceType(url);

      let content = '';
      let metadata = {
        source: url,
        sourceType,
        fetchedAt: Date.now(),
        ...options.metadata
      };

      switch (sourceType) {
        case 'github_raw':
          content = await this.fetchGitHubRaw(url);
          break;
        case 'github_gist':
          content = await this.fetchGitHubGist(url);
          break;
        case 'github_repo_file':
          content = await this.fetchGitHubRepoFile(url);
          break;
        case 'github_repo':
          // For repository URLs, try to fetch README or provide helpful error
          return { 
            success: false, 
            error: 'Repository URL provided. Please provide a direct file URL (e.g., https://github.com/user/repo/blob/main/file.js) or use the GitHub API to fetch specific files.',
            url 
          };
        case 'direct_url':
          content = await this.fetchDirectURL(url);
          break;
        default:
          content = await this.fetchDirectURL(url);
      }

      if (!content || content.trim().length === 0) {
        return { success: false, error: 'No content fetched from URL', url };
      }

      // Save to examples directory
      const fileName = this.generateFileName(url, metadata);
      const filePath = path.join(this.opusExamplesPath, fileName);
      await fs.writeFile(filePath, content, 'utf-8');

      // Extract patterns with enhanced learning
      const patterns = await this.patternExtractor.extractPatterns(content, {
        ...metadata,
        fileName,
        filePath
      });

      // Validate patterns object
      if (!patterns || typeof patterns !== 'object') {
        return { success: false, error: 'Failed to extract patterns from content', url };
      }

      // Learn contextual patterns (language/project type specific)
      const language = this.detectLanguage(content, url);
      const projectType = this.detectProjectType(content, url);
      
      if (language) {
        await this.learningEngine.learnContextualPatterns(content, {
          language,
          projectType,
          framework: metadata.framework
        });
      }

      // Store patterns in mirror memory
      for (const category in patterns) {
        if (!patterns.hasOwnProperty(category)) continue;
        
        const categoryPatterns = patterns[category as keyof typeof patterns];
        if (!Array.isArray(categoryPatterns)) {
          console.warn(`Patterns for category "${category}" is not an array, skipping`);
          continue;
        }

        for (const pattern of categoryPatterns) {
          await this.mirrorMemory.storePattern({
            ...pattern,
            extractedFrom: url,
            sourceType,
            characteristics: {
              ...pattern.characteristics,
              language,
              projectType
            }
          }, this.mapCategory(category));
        }
      }

      // Record ingestion
      const patternsExtracted = Object.values(patterns).flat().length;
      const ingestion: IngestionHistoryItem = {
        url,
        sourceType,
        fileName,
        patternsExtracted,
        timestamp: Date.now(),
        success: true
      };
      this.ingestionHistory.push(ingestion);

      console.log(`✅ Ingested ${patternsExtracted} patterns from ${url}`);

      return {
        success: true,
        fileName,
        patternsExtracted,
        url,
        sourceType
      };
    } catch (error: any) {
      console.error(`❌ Failed to ingest from ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        url
      };
    }
  }

  /**
   * Ingest knowledge from multiple URLs
   */
  async ingestFromURLs(urls: string[], options: any = {}): Promise<MultipleIngestionResult> {
    const results: IngestionResult[] = [];
    let totalPatternsExtracted = 0;
    let successfulIngestions = 0;
    let failedIngestions = 0;

    console.log(`📥 Starting batch ingestion of ${urls.length} URLs`);

    for (const url of urls) {
      try {
        const result = await this.ingestFromURL(url, options);
        results.push(result);

        if (result.success) {
          successfulIngestions++;
          totalPatternsExtracted += result.patternsExtracted || 0;
        } else {
          failedIngestions++;
        }

        // Small delay to be respectful to servers
        await this.delay(1000);
      } catch (error: any) {
        failedIngestions++;
        results.push({
          success: false,
          error: error.message,
          url
        });
      }
    }

    console.log(`✅ Batch ingestion complete: ${successfulIngestions} successful, ${failedIngestions} failed`);

    return {
      success: successfulIngestions > 0,
      results,
      totalPatternsExtracted,
      successfulIngestions,
      failedIngestions
    };
  }

  /**
   * Ingest knowledge from direct content (paste/clipboard)
   */
  async ingestFromContent(content: string, metadata: any = {}): Promise<IngestionResult> {
    try {
      console.log(`📥 Ingesting knowledge from direct content`);

      if (!content || content.trim().length === 0) {
        return { success: false, error: 'No content provided' };
      }

      // Create metadata
      const fullMetadata = {
        source: 'direct_content',
        sourceType: 'direct',
        fetchedAt: Date.now(),
        ...metadata
      };

      // Save to examples directory
      const fileName = this.generateFileName('direct_content', fullMetadata);
      const filePath = path.join(this.opusExamplesPath, fileName);
      await fs.writeFile(filePath, content, 'utf-8');

      // Extract patterns
      const patterns = await this.patternExtractor.extractPatterns(content, {
        ...fullMetadata,
        fileName,
        filePath
      });

      // Validate patterns object
      if (!patterns || typeof patterns !== 'object') {
        return { success: false, error: 'Failed to extract patterns from content' };
      }

      // Store patterns in mirror memory
      for (const category in patterns) {
        if (!patterns.hasOwnProperty(category)) continue;
        
        const categoryPatterns = patterns[category as keyof typeof patterns];
        if (!Array.isArray(categoryPatterns)) {
          console.warn(`Patterns for category "${category}" is not an array, skipping`);
          continue;
        }

        for (const pattern of categoryPatterns) {
          await this.mirrorMemory.storePattern({
            ...pattern,
            extractedFrom: 'direct_content',
            sourceType: 'direct'
          }, this.mapCategory(category));
        }
      }

      // Record ingestion
      const patternsExtracted = Object.values(patterns).flat().length;
      const ingestion: IngestionHistoryItem = {
        url: 'direct_content',
        sourceType: 'direct',
        fileName,
        patternsExtracted,
        timestamp: Date.now(),
        success: true
      };
      this.ingestionHistory.push(ingestion);

      console.log(`✅ Ingested ${patternsExtracted} patterns from direct content`);

      return {
        success: true,
        fileName,
        patternsExtracted
      };
    } catch (error: any) {
      console.error('❌ Failed to ingest from content:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect source type from URL
   */
  private detectSourceType(url: string): string {
    if (url.includes('raw.githubusercontent.com')) {
      return 'github_raw';
    } else if (url.includes('gist.githubusercontent.com') || url.includes('gist.github.com')) {
      return 'github_gist';
    } else if (url.includes('github.com') && url.includes('/blob/')) {
      return 'github_repo_file';
    } else if (url.includes('github.com') && !url.includes('/blob/') && !url.includes('/tree/')) {
      // This is a repository URL, not a file URL
      // Try to fetch README or main files
      return 'github_repo';
    } else {
      return 'direct_url';
    }
  }

  /**
   * Fetch content from GitHub raw URL
   */
  private async fetchGitHubRaw(url: string): Promise<string> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mirror-Knowledge-Ingester/1.0',
        'Accept': 'text/plain, application/json'
      },
      timeout: 30000
    });

    return response.data;
  }

  /**
   * Fetch content from GitHub Gist
   */
  private async fetchGitHubGist(url: string): Promise<string> {
    let rawUrl = url;
    if (url.includes('gist.github.com') && !url.includes('raw')) {
      // Extract username and gist ID for proper raw URL
      const match = url.match(/gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/);
      if (match) {
        rawUrl = `https://gist.githubusercontent.com/${match[1]}/${match[2]}/raw`;
      }
    }

    return this.fetchGitHubRaw(rawUrl);
  }

  /**
   * Fetch content from GitHub repository file
   */
  private async fetchGitHubRepoFile(url: string): Promise<string> {
    // Convert blob URL to raw URL
    const rawUrl = url.replace('/blob/', '/raw/');
    return this.fetchGitHubRaw(rawUrl);
  }

  /**
   * Fetch content from direct URL
   */
  private async fetchDirectURL(url: string): Promise<string> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mirror-Knowledge-Ingester/1.0'
      },
      timeout: 30000
    });

    return response.data;
  }

  /**
   * Generate filename for ingested content
   */
  private generateFileName(source: string, metadata: any): string {
    const timestamp = Date.now();
    const sourceType = metadata.sourceType || 'unknown';

    // Extract meaningful name from URL or source
    let baseName = 'ingested';

    if (source.includes('github.com')) {
      const match = source.match(/github\.com\/([^\/]+)\/([^\/]+).*?\/([^\/]+)$/);
      if (match) {
        baseName = `${match[1]}_${match[2]}_${match[3]}`;
      }
    } else if (source.includes('http')) {
      const url = new URL(source);
      baseName = url.hostname.replace(/\./g, '_') + url.pathname.replace(/\//g, '_');
    }

    // Clean filename
    baseName = baseName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50);

    return `${sourceType}_${baseName}_${timestamp}.js`;
  }

  /**
   * Detect programming language from content or URL
   */
  private detectLanguage(content: string, url?: string): string | undefined {
    // Check file extension in URL (most reliable signal)
    if (url) {
      const extMatch = url.match(/\.(\w+)(?:[?#]|$)/);
      if (extMatch) {
        const ext = extMatch[1].toLowerCase();
        const langMap: Record<string, string> = {
          js: 'javascript', jsx: 'javascript', mjs: 'javascript',
          ts: 'typescript', tsx: 'typescript',
          py: 'python',
          java: 'java',
          cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
          c: 'c', h: 'c',
          rs: 'rust',
          go: 'go',
          rb: 'ruby',
          php: 'php',
          cs: 'csharp',
          swift: 'swift',
          kt: 'kotlin'
        };
        if (langMap[ext]) return langMap[ext];
      }
    }

    // Content-based detection with multiple signals (not just one keyword)
    // TypeScript indicators (strongest)
    if (/(?:interface|type)\s+\w+\s*[{=]/.test(content) || /:\s*(?:string|number|boolean|void)\b/.test(content)) {
      return 'typescript';
    }

    // Python indicators (def + colon, not just import)
    if (/\bdef\s+\w+\s*\([^)]*\)\s*(?:->|:)/.test(content) || /^\s*class\s+\w+\s*(?:\(|:)/m.test(content)) {
      return 'python';
    }

    // JavaScript indicators (multiple signals required)
    const jsSignals = [
      /\b(?:const|let|var)\s+\w+\s*=/.test(content),
      /\bfunction\s+\w+\s*\(/.test(content),
      /=>\s*[{\(]/.test(content),
      /\brequire\s*\(/.test(content),
      /\bmodule\.exports\b/.test(content)
    ].filter(Boolean).length;
    if (jsSignals >= 2) return 'javascript';

    // Java indicators
    if (/\bpublic\s+(?:class|static|void)\b/.test(content)) return 'java';

    // Rust indicators
    if (/\bfn\s+\w+\s*\(/.test(content) && /\blet\s+(?:mut\s+)?\w+/.test(content)) return 'rust';

    // Go indicators
    if (/\bfunc\s+\w+\s*\(/.test(content) && /\bpackage\s+\w+/.test(content)) return 'go';

    return undefined;
  }

  /**
   * Detect project type from content or URL
   */
  private detectProjectType(content: string, url?: string): string | undefined {
    const contentLower = content.toLowerCase();
    const urlLower = url?.toLowerCase() || '';

    if (contentLower.includes('react') || urlLower.includes('react')) return 'react';
    if (contentLower.includes('vue') || urlLower.includes('vue')) return 'vue';
    if (contentLower.includes('angular') || urlLower.includes('angular')) return 'angular';
    if (contentLower.includes('express') || urlLower.includes('express')) return 'express';
    if (contentLower.includes('fastapi') || urlLower.includes('fastapi')) return 'fastapi';
    if (contentLower.includes('flask') || urlLower.includes('flask')) return 'flask';
    if (contentLower.includes('django') || urlLower.includes('django')) return 'django';
    if (contentLower.includes('next') || urlLower.includes('next')) return 'nextjs';
    if (contentLower.includes('electron') || urlLower.includes('electron')) return 'electron';

    return undefined;
  }

  /**
   * Map category names to mirror memory categories
   */
  private mapCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      codeStructure: 'architectural',
      problemSolving: 'problemSolving',
      reasoning: 'reasoning',
      style: 'style',
      promptInterpretation: 'reasoning'
    };

    return categoryMap[category] || 'architectural';
  }

  /**
   * Get ingestion history
   */
  getIngestionHistory(limit: number = 50): IngestionHistoryItem[] {
    return this.ingestionHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get ingestion statistics
   */
  getIngestionStats(): {
    totalIngestions: number;
    successfulIngestions: number;
    failedIngestions: number;
    totalPatternsExtracted: number;
    averagePatternsPerIngestion: number;
    sourcesByType: Record<string, number>;
  } {
    const totalIngestions = this.ingestionHistory.length;
    const successfulIngestions = this.ingestionHistory.filter(h => h.success).length;
    const failedIngestions = totalIngestions - successfulIngestions;
    const totalPatternsExtracted = this.ingestionHistory
      .filter(h => h.success)
      .reduce((sum, h) => sum + h.patternsExtracted, 0);
    const averagePatternsPerIngestion = successfulIngestions > 0
      ? totalPatternsExtracted / successfulIngestions
      : 0;

    const sourcesByType: Record<string, number> = {};
    for (const item of this.ingestionHistory) {
      sourcesByType[item.sourceType] = (sourcesByType[item.sourceType] || 0) + 1;
    }

    return {
      totalIngestions,
      successfulIngestions,
      failedIngestions,
      totalPatternsExtracted,
      averagePatternsPerIngestion,
      sourcesByType
    };
  }

  /**
   * Clean up old ingested files
   */
  async cleanupOldIngestions(daysOld: number = 30): Promise<{ removed: number }> {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let removed = 0;

    // Remove old files
    try {
      const files = await fs.readdir(this.opusExamplesPath);
      for (const file of files) {
        if (file.startsWith('github_') || file.startsWith('direct_')) {
          const filePath = path.join(this.opusExamplesPath, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath);
            removed++;
          }
        }
      }
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }

    // Clean history
    this.ingestionHistory = this.ingestionHistory.filter(item =>
      item.timestamp > cutoffTime
    );

    return { removed };
  }

  /**
   * Search ingested content
   */
  async searchIngestedContent(query: string, limit: number = 20): Promise<Array<{
    fileName: string;
    content: string;
    patterns: any[];
    relevance: number;
  }>> {
    const results: Array<{
      fileName: string;
      content: string;
      patterns: any[];
      relevance: number;
    }> = [];

    try {
      const files = await fs.readdir(this.opusExamplesPath);
      const queryLower = query.toLowerCase();

      for (const file of files.slice(0, 100)) { // Limit for performance
        if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;

        try {
          const filePath = path.join(this.opusExamplesPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const contentLower = content.toLowerCase();

          // Calculate relevance
          let relevance = 0;
          const queryWords = queryLower.split(/\s+/);
          for (const word of queryWords) {
            if (word.length > 2) {
              const count = (contentLower.match(new RegExp(word, 'g')) || []).length;
              relevance += count;
            }
          }

          if (relevance > 0) {
            // Extract patterns for context
            const patterns = await this.patternExtractor.extractPatterns(content);

            results.push({
              fileName: file,
              content: content.substring(0, 1000), // Truncate for response
              patterns: Object.values(patterns).flat().slice(0, 5), // Top patterns
              relevance
            });
          }
        } catch (error) {
          // Skip problematic files
          continue;
        }
      }

      // Sort by relevance and limit results
      results.sort((a, b) => b.relevance - a.relevance);
      return results.slice(0, limit);
    } catch (error: any) {
      console.error('Error searching ingested content:', error);
      return [];
    }
  }

  /**
   * Small delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
