/**
 * AgentPrime - Search Bridge
 * IPC bridge for semantic search functionality
 */

import { ipcRenderer } from 'electron';

export interface SearchAPI {
  embedQuery: (query: string) => Promise<number[]>;
  searchRelevantFiles: (query: string, topK?: number) => Promise<Array<{
    path: string;
    content: string;
    score: number;
  }>>;
}

const searchAPI: SearchAPI = {
  embedQuery: (query: string) => ipcRenderer.invoke('search:embed-query', query),

  searchRelevantFiles: (query: string, topK: number = 5) =>
    ipcRenderer.invoke('search:relevant-files', query, topK)
};

export default searchAPI;
