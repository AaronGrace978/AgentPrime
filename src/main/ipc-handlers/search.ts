/**
 * AgentPrime - Search IPC Handlers
 * Handles semantic search functionality
 */

import { CodebaseIndexer } from '../search/indexer';
import { embeddings } from '../search/embeddings';
import type { IpcMainInvokeEvent } from 'electron';

interface HandlerDeps {
  ipcMain: any;
  getWorkspacePath: () => string | null;
  getCodebaseIndexer?: () => CodebaseIndexer | null;
}

let fallbackIndexer: CodebaseIndexer | null = null;
let fallbackWorkspacePath: string | null = null;

function getFallbackIndexer(workspacePath: string | null): CodebaseIndexer | null {
  if (!workspacePath) return null;

  if (!fallbackIndexer || fallbackWorkspacePath !== workspacePath) {
    fallbackIndexer = new CodebaseIndexer(workspacePath);
    fallbackWorkspacePath = workspacePath;
  }

  return fallbackIndexer;
}

export function register(deps: HandlerDeps): void {
  const { ipcMain, getWorkspacePath, getCodebaseIndexer } = deps;

  // Initialize embeddings on startup
  void embeddings.initialize();

  // Embed query
  ipcMain.handle('search:embed-query', async (_event: IpcMainInvokeEvent, query: string) => {
    try {
      const ready = await embeddings.initialize();
      if (!ready) {
        return [];
      }
      return await embeddings.embedText(query);
    } catch (error) {
      console.error('Embed query failed:', error);
      throw error;
    }
  });

  // Search relevant files
  ipcMain.handle('search:relevant-files', async (_event: IpcMainInvokeEvent, query: string, topK: number = 5) => {
    try {
      const workspacePath = getWorkspacePath();
      const sharedIndexer = getCodebaseIndexer?.() || null;
      const indexer = sharedIndexer || getFallbackIndexer(workspacePath);
      if (!indexer) {
        return [];
      }

      return await indexer.searchCodebase(query, topK);
    } catch (error) {
      console.error('Search relevant files failed:', error);
      throw error;
    }
  });
}
