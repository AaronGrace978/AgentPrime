/**
 * ActivatePrime Modules - Integration with AgentPrime
 * High-performance, Cursor-like AI assistance modules
 */

import EnhancedContextVectorStore from './context-vector-store';
import ContextCompressionEngine from './context-compression-engine';
import ContextAwarenessEngine from './context-awareness-engine';
import EnhancedModelRouter from './enhanced-model-router';
import CodebaseIntrospection from './codebase-introspection';

// Re-export classes
export {
  EnhancedContextVectorStore,
  ContextCompressionEngine,
  ContextAwarenessEngine,
  EnhancedModelRouter,
  CodebaseIntrospection
};

// Re-export types
export type {
  CodeChunk,
  ContextQuery,
  ContextResult
} from './context-vector-store';

export type {
  ConversationMessage,
  ConversationHistory,
  CompressionResult,
  EssentialElements
} from './context-compression-engine';

export type {
  UserContext,
  InteractionEvent,
  ContextAnalysis
} from './context-awareness-engine';

export type {
  ModelCapability,
  TaskAnalysis,
  RoutingDecision,
  PerformanceRecord
} from './enhanced-model-router';

export type {
  FileInfo,
  ModuleInfo,
  ArchitectureOverview,
  IntrospectionOptions
} from './codebase-introspection';

/**
 * ActivatePrime Integration Manager
 * Coordinates all modules for seamless Cursor-like functionality
 */
export class ActivatePrimeIntegration {
  private contextVectorStore?: EnhancedContextVectorStore;
  private contextCompressionEngine?: ContextCompressionEngine;
  private contextAwarenessEngine?: ContextAwarenessEngine;
  private enhancedModelRouter?: EnhancedModelRouter;
  private codebaseIntrospection?: CodebaseIntrospection;

  constructor(workspacePath?: string) {
    // Initialize modules as needed
    if (workspacePath) {
      this.initializeCodebaseIntrospection(workspacePath);
    }
  }

  /**
   * Initialize Context Vector Store for semantic search
   */
  initializeContextVectorStore(): void {
    this.contextVectorStore = new EnhancedContextVectorStore();
  }

  /**
   * Initialize Context Compression Engine
   */
  initializeContextCompressionEngine(): void {
    this.contextCompressionEngine = new ContextCompressionEngine();
  }

  /**
   * Initialize Context Awareness Engine
   */
  initializeContextAwarenessEngine(): void {
    this.contextAwarenessEngine = new ContextAwarenessEngine();
  }

  /**
   * Initialize Enhanced Model Router
   */
  initializeEnhancedModelRouter(): void {
    this.enhancedModelRouter = new EnhancedModelRouter();
  }

  /**
   * Initialize Codebase Introspection
   */
  initializeCodebaseIntrospection(workspacePath: string): void {
    this.codebaseIntrospection = new CodebaseIntrospection(workspacePath);
  }

  /**
   * Get all initialized modules
   */
  getModules() {
    return {
      contextVectorStore: this.contextVectorStore,
      contextCompressionEngine: this.contextCompressionEngine,
      contextAwarenessEngine: this.contextAwarenessEngine,
      enhancedModelRouter: this.enhancedModelRouter,
      codebaseIntrospection: this.codebaseIntrospection
    };
  }

  /**
   * Perform intelligent context building (Cursor-style)
   */
  async buildIntelligentContext(
    query: string,
    currentFiles: string[] = [],
    workspacePath?: string
  ): Promise<{
    relevantChunks: any[];
    compressedContext?: string;
    awareness?: any;
    routing?: any;
  }> {
    const results: any = {};

    // 1. Semantic search for relevant code chunks
    if (this.contextVectorStore) {
      const semanticResults = await this.contextVectorStore.recallDeepContext({
        query,
        semanticTags: ['code', 'implementation', 'api'],
        minQuoteConfidence: 0.7,
        contextDepthRange: [1, 3],
        topK: 5
      });
      results.relevantChunks = semanticResults;
    }

    // 2. Context awareness analysis
    if (this.contextAwarenessEngine) {
      const awareness = await this.contextAwarenessEngine.analyzeContext(query);
      results.awareness = awareness;
    }

    // 3. Context compression if needed
    if (this.contextCompressionEngine && results.relevantChunks) {
      // Simulate conversation history for compression
      const mockHistory = {
        sessionId: 'current',
        messages: [
          {
            role: 'user' as const,
            content: query,
            timestamp: new Date()
          }
        ],
        createdAt: new Date(),
        lastActivity: new Date()
      };

      const compression = await this.contextCompressionEngine.compressConversationHistory(
        'current',
        mockHistory
      );
      results.compressedContext = compression.summary;
    }

    // 4. Model routing decision
    if (this.enhancedModelRouter) {
      const routing = this.enhancedModelRouter.routeRequest(query);
      results.routing = routing;
    }

    return results;
  }

  /**
   * Analyze codebase architecture
   */
  async analyzeArchitecture(): Promise<import('./codebase-introspection').ArchitectureOverview | null> {
    if (!this.codebaseIntrospection) return null;
    return await this.codebaseIntrospection.getArchitectureOverview();
  }

  /**
   * Get integration status
   */
  getStatus(): {
    modules: Record<string, boolean>;
    stats: any;
  } {
    const modules = {
      contextVectorStore: !!this.contextVectorStore,
      contextCompressionEngine: !!this.contextCompressionEngine,
      contextAwarenessEngine: !!this.contextAwarenessEngine,
      enhancedModelRouter: !!this.enhancedModelRouter,
      codebaseIntrospection: !!this.codebaseIntrospection
    };

    const stats: any = {};

    if (this.contextVectorStore) {
      stats.contextVectorStore = this.contextVectorStore.getStats();
    }

    if (this.contextAwarenessEngine) {
      stats.contextAwarenessEngine = this.contextAwarenessEngine.getStats();
    }

    if (this.enhancedModelRouter) {
      stats.enhancedModelRouter = this.enhancedModelRouter.getStats();
    }

    if (this.codebaseIntrospection) {
      stats.codebaseIntrospection = this.codebaseIntrospection.getStats();
    }

    return { modules, stats };
  }
}

// Export singleton instance
export default new ActivatePrimeIntegration();
