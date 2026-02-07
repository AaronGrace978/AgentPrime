import { ipcRenderer } from 'electron';

export interface AgentAPI {
  listFiles: (path: string) => Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }>;

  readFile: (path: string) => Promise<{
    success: boolean;
    data?: { content: string; path: string };
    error?: string;
  }>;

  writeFile: (path: string, content: string) => Promise<{
    success: boolean;
    data?: { path: string; written: boolean };
    error?: string;
  }>;

  applyDiff: (path: string, diff: string) => Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;

  // Dino Buddy reactions
  onDinoReaction?: (callback: (event: any, data: { expression: string; message: string }) => void) => void;

  // Git operations
  gitStage: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  gitUnstage: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  gitDiff: (filePath?: string) => Promise<{ success: boolean; diff?: string; error?: string }>;
  gitPush: () => Promise<{ success: boolean; error?: string }>;
  gitPull: () => Promise<{ success: boolean; error?: string }>;
  gitBranches: () => Promise<{ success: boolean; branches?: string[]; current?: string; error?: string }>;
  gitCheckout: (branch: string) => Promise<{ success: boolean; error?: string }>;
}

const agentAPI: AgentAPI = {
  listFiles: (path: string) => ipcRenderer.invoke('agent:list-files', path),

  readFile: (path: string) => ipcRenderer.invoke('agent:read-file', path),

  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke('agent:write-file', path, content),

  applyDiff: (path: string, diff: string) =>
    ipcRenderer.invoke('agent:apply-diff', path, diff),

  // Dino Buddy reaction listener
  onDinoReaction: (callback: (event: any, data: { expression: string; message: string }) => void) => {
    ipcRenderer.on('dino:reaction', callback);
  },

  // Git operations
  gitStage: (filePath: string) => ipcRenderer.invoke('git:stage', filePath),
  gitUnstage: (filePath: string) => ipcRenderer.invoke('git:unstage', filePath),
  gitDiff: (filePath?: string) => ipcRenderer.invoke('git:diff', filePath),
  gitPush: () => ipcRenderer.invoke('git:push'),
  gitPull: () => ipcRenderer.invoke('git:pull'),
  gitBranches: () => ipcRenderer.invoke('git:branches'),
  gitCheckout: (branch: string) => ipcRenderer.invoke('git:checkout', branch)
};

export default agentAPI;
