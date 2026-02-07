/**
 * Matrix Mode Memory System
 * Persistent memory for cross-session context and semantic search
 * 
 * Features:
 * - SQLite-based persistent storage (with in-memory fallback)
 * - Vector search for semantic recall
 * - Automatic context compaction when token limits approach
 * - Per-channel session isolation
 * - Multi-agent session management
 */

export * from './types';
export { MemoryStore, getMemoryStore } from './memory-store';
export { MemorySearch, getMemorySearch, EmbeddingProvider } from './memory-search';
export { MemoryCompaction, getMemoryCompaction, estimateTokens, CompactionStrategy } from './memory-compaction';
export { SessionManager, getSessionManager, SessionContext, AddMessageOptions } from './session-manager';

// Convenience initialization function
import { getMemoryStore } from './memory-store';
import { getSessionManager } from './session-manager';

export async function initializeMemorySystem(): Promise<{
  initialized: boolean;
  error?: string;
}> {
  try {
    const store = getMemoryStore();
    await store.initialize();
    
    const sessionManager = getSessionManager();
    await sessionManager.initialize();

    console.log('[MemorySystem] Initialized successfully');
    return { initialized: true };
  } catch (error: any) {
    console.error('[MemorySystem] Initialization failed:', error);
    return { initialized: false, error: error.message };
  }
}

// Cleanup function
export async function shutdownMemorySystem(): Promise<void> {
  try {
    const sessionManager = getSessionManager();
    await sessionManager.close();
    console.log('[MemorySystem] Shutdown complete');
  } catch (error) {
    console.error('[MemorySystem] Shutdown error:', error);
  }
}
