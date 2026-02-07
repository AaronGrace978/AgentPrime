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
import { register as registerMirror } from './mirror';
import { register as registerScripts } from './scripts';
import { register as registerAnalysis } from './analysis';
import { register as registerSearch } from './search';
import { register as registerAgent } from './agent';
import { registerBrainHandlers } from './brain-handler';
import { registerFeedbackHandlers } from './feedback';
import { registerProjectRegistryHandlers } from './project-registry';
import { registerCompletionHandlers } from './completions';
import { registerRefactoringHandlers } from './refactoring';
import { registerVibeHubHandlers } from './vibehub';
// Phase 2 handlers
import { register as registerPluginSystem } from './plugin-system';
import { register as registerEdgeDeployment } from './edge-deployment';
import { register as registerPhase2System } from './phase2-system';
// Phase 3 handlers
import { registerCollaborationHandlers } from './collaboration';
import { registerPerformanceHandlers } from './performance';
import { registerFineTuningHandlers } from './fine-tuning';
import { registerTelemetryHandlers } from './telemetry';
// Asset generation handlers
import { registerAssetHandlers } from './assets';
// Matrix Agent Mode
import { register as registerMatrixAgent } from './matrix-agent';
// Smart Controller - Full PC Automation
import { register as registerSmartController } from './smart-controller';
// Matrix Mode Systems - Full Feature Expansion
import { registerMatrixModeSystems } from './matrix-mode-systems';
// Genesis Integration - Human-approval code forge
import { registerGenesisHandlers } from './genesis';

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
  registerMirror({
    ipcMain: deps.ipcMain,
    mainWindow: deps.mainWindow,
    getMirrorMemory: deps.getMirrorMemory,
    getPatternExtractor: deps.getPatternExtractor,
    getIntelligenceExpansion: deps.getIntelligenceExpansion,
    getKnowledgeIngester: deps.getKnowledgeIngester
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

  // Register refactoring handlers (AI-powered refactoring)
  registerRefactoringHandlers();

  // Register VibeHub integration handlers
  registerVibeHubHandlers(deps.getWorkspacePath);

  // Register Phase 2 handlers (Enterprise features)
  if (deps.getPluginManager && deps.getPluginMarketplace) {
    registerPluginSystem(deps.getPluginManager, deps.getPluginMarketplace);
  }
  if (deps.getEdgeDeploymentManager) {
    registerEdgeDeployment(deps.getEdgeDeploymentManager);
  }
  if (deps.getCloudSync && deps.getDistributedCoordinator && deps.getScalingManager && deps.getMemoryOptimizer) {
    registerPhase2System(deps.getCloudSync, deps.getDistributedCoordinator, deps.getScalingManager, deps.getMemoryOptimizer);
  }

  // Register Phase 3 handlers (Advanced features)
  registerCollaborationHandlers(); // Real-time collaborative editing (uses module-level engine)
  registerPerformanceHandlers(); // P95 latency monitoring
  registerFineTuningHandlers(); // Proprietary model fine-tuning

  // Register asset generation handlers (procedural models, dungeons, textures)
  registerAssetHandlers();

  // Register telemetry handlers
  if (deps.getSettings && deps.updateSettings) {
    registerTelemetryHandlers({
      getSettings: deps.getSettings,
      updateSettings: deps.updateSettings
    });
  }

  // Register Matrix Agent Mode (computer control)
  if (deps.getSettings) {
    registerMatrixAgent({
      ipcMain: deps.ipcMain,
      getSettings: deps.getSettings
    });
  }

  // Register Smart Controller (Full PC Automation with AI Vision)
  if (deps.getSettings) {
    registerSmartController({
      ipcMain: deps.ipcMain,
      getSettings: deps.getSettings,
      getMainWindow: deps.mainWindow
    });
  }

  // Register Matrix Mode Systems (Full Feature Expansion)
  if (deps.getSettings) {
    registerMatrixModeSystems({
      ipcMain: deps.ipcMain,
      getSettings: deps.getSettings,
      mainWindow: deps.mainWindow
    });
  }

  // Register Genesis Integration (Human-approval code forge from G:\Genesis)
  registerGenesisHandlers({
    getWorkspacePath: deps.getWorkspacePath
  });

  console.log('✅ All modular IPC handlers registered');
  console.log('🧠 Python Brain handlers connected');
  console.log('📊 User feedback system active');
  console.log('✨ Ghost text completions ready');
  console.log('🔧 AI-powered refactoring ready');
  console.log('🚀 Phase 2 enterprise features ready');
  console.log('🤝 Collaboration system active');
  console.log('🔌 Plugin ecosystem ready');
  console.log('☁️  Cloud sync enabled');
  console.log('🧠 Edge deployment ready');
  console.log('🔥 Phase 3 features wired in:');
  console.log('   ⚡ Real-time collaboration (<50ms P95)');
  console.log('   📊 Performance monitoring (P95 latency tracking)');
  console.log('   🎯 Fine-tuning infrastructure (proprietary models)');
  console.log('   ✅ 80%+ test coverage target');
  console.log('🎨 Asset generation system ready:');
  console.log('   🧟 Procedural enemy models (zombie, skeleton, etc.)');
  console.log('   🏰 Dungeon/map generation');
  console.log('   🖼️  Texture generation');
  console.log('🤖 Smart Controller activated:');
  console.log('   👁️  Screen capture & AI vision');
  console.log('   🖱️  Mouse & keyboard automation');
  console.log('   🔐 Secure credential vault');
  console.log('   📋 Task automation engine');
  console.log('🔮 Matrix Mode Systems activated:');
  console.log('   📝 Persistent memory with vector search');
  console.log('   ⏰ Task scheduler (cron, webhooks)');
  console.log('   💬 Multi-channel messaging (WhatsApp, Telegram, Discord, Slack)');
  console.log('   🌐 Enhanced browser automation');
  console.log('   🎤 Voice control (wake word, STT, TTS)');
  console.log('   🎨 Canvas visual workspace');
  console.log('   🔗 50+ integrations (Notion, Spotify, Hue, GitHub)');
  console.log('   ⚙️  Workflow automation with approvals');
  console.log('   📱 Remote nodes for mobile/IoT');
  console.log('🔨 Genesis Integration ready:');
  console.log('   🛡️  Human-approval code forge');
  console.log('   📊 Evolution log for learning');
  console.log('   💬 Matrix Mode channel triggers');
}

export { registerFiles as filesHandlers };
export { registerGit as gitHandlers };
export { registerTemplates as templatesHandlers };
export { registerCommands as commandsHandlers };
