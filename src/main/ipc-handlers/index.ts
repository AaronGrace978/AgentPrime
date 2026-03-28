/**
 * AgentPrime - IPC Handlers Index
 * Central registration point for all IPC handlers
 * 
 * This module provides a clean way to organize IPC handlers into separate files.
 * Each handler module exports a register function that takes dependencies.
 */

import { register as registerFiles } from './files';
import { register as registerGit } from './git';
import { register as registerTemplates } from './templates';
import { register as registerCommands } from './commands';
import { register as registerScripts } from './scripts';
import { register as registerAnalysis } from './analysis';
import { register as registerSearch } from './search';
import { register as registerAgent } from './agent';
import { registerBrainHandlers } from './brain-handler';
import { registerFeedbackHandlers } from './feedback';
import { registerProjectRegistryHandlers } from './project-registry';
import { registerCompletionHandlers } from './completions';
import { registerTelemetryHandlers } from './telemetry';
import { registerTerminalHandlers } from './terminal';
import { registerProjectMemoryHandlers } from './project-memory';
import { registerDeployHandlers } from './deploy';
import { registerChatThreadHandlers } from './chat-threads';

interface HandlerDeps {
  ipcMain: any;
  dialog: any;
  mainWindow: () => any;
  getWorkspacePath: () => string | null;
  setWorkspacePath: (path: string) => void;
  getFocusedFolder?: () => string | null;
  setFocusedFolder?: (path: string | null) => void;
  templateEngine: any;
  getCurrentFile?: () => string | null;
  getCurrentFolder?: () => string | null;
  getMirrorMemory?: () => any;
  getPatternExtractor?: () => any;
  getIntelligenceExpansion?: () => any;
  getCodebaseIndexer?: () => any;
  getKnowledgeIngester?: () => any;
  getActivatePrime?: () => any;
  getActiveFilePath?: () => string | null;
  setActiveFilePath?: (filePath: string | null) => void;
  // Settings access for telemetry
  getSettings?: () => any;
  updateSettings?: (settings: any) => void;
  // Phase 2 components
  getCollaborationEngine?: () => any;
  getCloudSync?: () => any;
  getPluginManager?: () => any;
  getPluginMarketplace?: () => any;
  getEdgeDeploymentManager?: () => any;
  getDistributedCoordinator?: () => any;
  getScalingManager?: () => any;
  getMemoryOptimizer?: () => any;
}

/**
 * Register all IPC handlers
 */
export function registerAllHandlers(deps: HandlerDeps): void {
  registerFiles(deps);
  registerGit(deps);
  if (deps.templateEngine) {
    registerTemplates(deps);
  }
  registerCommands({
    ipcMain: deps.ipcMain,
    getWorkspacePath: deps.getWorkspacePath,
    getCurrentFile: deps.getCurrentFile || (() => null),
    getCurrentFolder: deps.getCurrentFolder || (() => null)
  });
  registerScripts({
    ipcMain: deps.ipcMain,
    mainWindow: deps.mainWindow,
    getWorkspacePath: deps.getWorkspacePath
  });
  registerAnalysis({
    ipcMain: deps.ipcMain,
    getWorkspacePath: deps.getWorkspacePath,
    getCodebaseIndexer: deps.getCodebaseIndexer,
    getActivatePrime: deps.getActivatePrime
  });
  registerSearch({
    ipcMain: deps.ipcMain,
    getWorkspacePath: deps.getWorkspacePath
  });
  registerAgent({
    ipcMain: deps.ipcMain,
    getWorkspacePath: deps.getWorkspacePath
  });
  
  // Register Python Brain handlers (connects to backend)
  registerBrainHandlers();
  
  // Register user feedback handlers (Phase 1 of Evolution Roadmap)
  registerFeedbackHandlers();
  
  // Register project registry handlers (project memory)
  registerProjectRegistryHandlers();

  // Register completion handlers (ghost text completions)
  registerCompletionHandlers({
    getWorkspacePath: deps.getWorkspacePath,
    getActiveFilePath: deps.getActiveFilePath,
    setActiveFilePath: deps.setActiveFilePath
  });

  // Register telemetry handlers
  if (deps.getSettings && deps.updateSettings) {
    registerTelemetryHandlers({
      getSettings: deps.getSettings,
      updateSettings: deps.updateSettings
    });
  }

  // Register terminal handlers (full PTY via node-pty)
  registerTerminalHandlers({
    ipcMain: deps.ipcMain,
    mainWindow: deps.mainWindow,
    getWorkspacePath: deps.getWorkspacePath
  });

  // Register project memory handlers (per-workspace intelligence)
  registerProjectMemoryHandlers({
    ipcMain: deps.ipcMain,
    getWorkspacePath: deps.getWorkspacePath
  });

  // Register deploy handlers (one-click deploy)
  registerDeployHandlers({
    ipcMain: deps.ipcMain,
    mainWindow: deps.mainWindow,
    getWorkspacePath: deps.getWorkspacePath
  });

  // Register durable chat threads
  registerChatThreadHandlers({
    ipcMain: deps.ipcMain,
    getWorkspacePath: deps.getWorkspacePath
  });

  console.log('✅ All modular IPC handlers registered');
  console.log('🧠 Python Brain handlers connected');
  console.log('📊 User feedback system active');
  console.log('✨ Ghost text completions ready');
  console.log('>_ Terminal PTY ready');
  console.log('📂 Project memory active');
  console.log('🚀 Deploy integrations loaded');
}

export { registerFiles as filesHandlers };
export { registerGit as gitHandlers };
export { registerTemplates as templatesHandlers };
export { registerCommands as commandsHandlers };
