/**
 * AgentPrime - Semantic Context Builder
 * Automatically discovers and includes relevant code context
 */

interface SearchResult {
  path: string;
  content: string;
  score: number;
}

export class SemanticContextBuilder {
  private workspacePath: string | null = null;

  setWorkspacePath(path: string): void {
    this.workspacePath = path;
  }

  async buildContextWithSemanticSearch(message: string, maxFiles: number = 3): Promise<string> {
    if (!this.workspacePath) {
      return message;
    }

    try {
      // Search for relevant files
      const results = await this.searchRelevantFiles(message, maxFiles);

      if (results.length === 0) {
        return message;
      }

      // Build context string
      const contextParts: string[] = [];

      for (const result of results) {
        const relativePath = this.getRelativePath(result.path);
        contextParts.push(`\`\`\`${this.getLanguageFromPath(result.path)} ${relativePath}\n${result.content}\n\`\`\``);
      }

      // Prepend context to message
      const contextString = contextParts.join('\n\n');
      return `${contextString}\n\n${message}`;

    } catch (error) {
      console.warn('Failed to build semantic context:', error);
      return message; // Fall back to original message
    }
  }

  private async searchRelevantFiles(query: string, topK: number): Promise<SearchResult[]> {
    try {
      return await window.agentAPI.searchRelevantFiles(query, topK);
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  private getRelativePath(filePath: string): string {
    if (!this.workspacePath) return filePath;

    const relative = path.relative(this.workspacePath, filePath);
    return relative.startsWith('.') ? relative : `./${relative}`;
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.ts': return 'typescript';
      case '.tsx': return 'typescript';
      case '.js': return 'javascript';
      case '.jsx': return 'javascript';
      case '.html': return 'html';
      case '.css': return 'css';
      default: return 'text';
    }
  }
}

// Helper function for path operations (since we don't have Node.js path in renderer)
const path = {
  relative: (from: string, to: string): string => {
    // Normalize paths
    const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
    from = normalize(from);
    to = normalize(to);

    const fromParts = from.split('/').filter(p => p);
    const toParts = to.split('/').filter(p => p);

    // Find common prefix
    let commonLength = 0;
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    // Calculate relative path
    const upLevels = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);

    const relativeParts: string[] = [];
    for (let i = 0; i < upLevels; i++) {
      relativeParts.push('..');
    }

    relativeParts.push(...downParts);
    return relativeParts.length > 0 ? relativeParts.join('/') : '.';
  },

  extname: (filePath: string): string => {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot === -1 ? '' : filePath.slice(lastDot);
  }
};

// Singleton instance
export const semanticContextBuilder = new SemanticContextBuilder();
