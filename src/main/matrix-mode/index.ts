/**
 * Matrix Mode - Complete Feature System
 * AI-powered computer control with messaging, voice, automation, and integrations
 * 
 * Modules:
 * - Memory: Persistent memory with vector search
 * - Scheduler: Cron jobs, webhooks, and triggers  
 * - Agents: Multi-agent routing and sub-agents
 * - Gateway: Multi-channel messaging
 * - Channels: WhatsApp, Telegram, Discord, Slack, etc.
 * - Browser: Enhanced Playwright automation
 * - Voice: Wake word, STT, TTS
 * - Canvas: Visual workspace (A2UI)
 * - Integrations: 23 service integrations (productivity, media, smart home, dev, comms)
 * - Automation: Workflow engine with approvals
 * - Nodes: Remote agent nodes for mobile/IoT
 */

// Re-export all modules
export * from './memory';
export * from './scheduler';
export * from './agents';
export * from './gateway';
export * from './channels';
export * from './browser';
export * from './voice';
export * from './canvas';
export * from './integrations';
export * from './automation';
export * from './nodes';

// PERFORMANCE: All subsystem imports are now lazy-loaded inside initializeMatrixMode()
// Type-only imports for interface definitions (no runtime cost)
import type { Scheduler } from './scheduler';
import type { MultiAgentManager } from './agents';
import type { MessagingGateway } from './gateway';
import type { BrowserController } from './browser';
import type { VoiceSession } from './voice';
import type { CanvasManager } from './canvas';
import type { IntegrationRegistry } from './integrations';
import type { WorkflowEngine } from './automation';
import type { NodeManager } from './nodes';

export interface MatrixModeConfig {
  memory?: {
    enabled?: boolean;
    dbPath?: string;
  };
  scheduler?: {
    enabled?: boolean;
    webhookPort?: number;
  };
  agents?: {
    enabled?: boolean;
  };
  gateway?: {
    enabled?: boolean;
    port?: number;
  };
  channels?: {
    autoConnect?: boolean;
  };
  browser?: {
    enabled?: boolean;
    headless?: boolean;
  };
  voice?: {
    enabled?: boolean;
    wakeWord?: string;
  };
  canvas?: {
    enabled?: boolean;
  };
  integrations?: {
    enabled?: boolean;
    autoConnect?: string[];
  };
  automation?: {
    enabled?: boolean;
  };
  nodes?: {
    enabled?: boolean;
    port?: number;
  };
}

export interface MatrixModeInstance {
  scheduler: Scheduler | null;
  agents: MultiAgentManager | null;
  gateway: MessagingGateway | null;
  browser: BrowserController | null;
  voice: VoiceSession | null;
  canvas: CanvasManager | null;
  integrations: IntegrationRegistry | null;
  automation: WorkflowEngine | null;
  nodes: NodeManager | null;
  initialized: boolean;
}

let instance: MatrixModeInstance = {
  scheduler: null,
  agents: null,
  gateway: null,
  browser: null,
  voice: null,
  canvas: null,
  integrations: null,
  automation: null,
  nodes: null,
  initialized: false
};

/**
 * Initialize Matrix Mode with all systems
 * PERFORMANCE: All subsystems are lazy-loaded via dynamic imports
 */
export async function initializeMatrixMode(config: MatrixModeConfig = {}): Promise<MatrixModeInstance> {
  if (instance.initialized) {
    console.log('[MatrixMode] Already initialized');
    return instance;
  }

  console.log('[MatrixMode] Initializing with lazy loading...');

  try {
    // Initialize memory system (foundation) - lazy import
    if (config.memory?.enabled !== false) {
      const { initializeMemorySystem } = await import('./memory');
      await initializeMemorySystem();
    }

    // Initialize scheduler - lazy import
    if (config.scheduler?.enabled !== false) {
      const { initializeScheduler } = await import('./scheduler');
      instance.scheduler = await initializeScheduler({
        enabled: true,
        webhookPort: config.scheduler?.webhookPort
      });
    }

    // Initialize multi-agent system - lazy import
    if (config.agents?.enabled !== false) {
      const { initializeMultiAgentSystem } = await import('./agents');
      instance.agents = await initializeMultiAgentSystem();
    }

    // Initialize messaging gateway - lazy import
    if (config.gateway?.enabled !== false) {
      const { initializeMessagingGateway } = await import('./gateway');
      const { registerAllChannelFactories } = await import('./channels');
      
      instance.gateway = await initializeMessagingGateway({
        port: config.gateway?.port || 18791
      });

      // Register channel factories
      registerAllChannelFactories(instance.gateway.getChannelManager());

      // Auto-connect channels if configured
      if (config.channels?.autoConnect) {
        await instance.gateway.connectAllChannels();
      }
    }

    // Initialize browser automation - lazy import
    if (config.browser?.enabled) {
      try {
        const { initializeBrowserController } = await import('./browser');
        instance.browser = await initializeBrowserController({
          headless: config.browser.headless ?? true
        });
        console.log('[MatrixMode] ✅ Browser controller initialized');
      } catch (browserError) {
        console.warn('[MatrixMode] Browser init failed (Playwright may not be installed):', browserError);
        // Non-fatal - browser is optional
      }
    }

    // Initialize voice system - lazy import
    if (config.voice?.enabled) {
      try {
        const { initializeVoiceSystem } = await import('./voice');
        const voiceSession = await initializeVoiceSystem({
          wakeWord: config.voice.wakeWord || 'hey matrix'
        });
        instance.voice = voiceSession;
        console.log('[MatrixMode] ✅ Voice system initialized');
      } catch (voiceError) {
        console.warn('[MatrixMode] Voice init failed:', voiceError);
        // Non-fatal - voice is optional
      }
    }

    // Initialize canvas (visual workspace) - lazy import
    if (config.canvas?.enabled) {
      try {
        const { getCanvasManager } = await import('./canvas');
        instance.canvas = getCanvasManager();
        console.log('[MatrixMode] ✅ Canvas manager initialized');
      } catch (canvasError) {
        console.warn('[MatrixMode] Canvas init failed:', canvasError);
      }
    }

    // Initialize integrations registry - lazy import
    if (config.integrations?.enabled) {
      try {
        const { getIntegrationRegistry } = await import('./integrations');
        instance.integrations = getIntegrationRegistry();
        // Auto-connect specified integrations
        if (config.integrations.autoConnect && config.integrations.autoConnect.length > 0) {
          for (const integrationId of config.integrations.autoConnect) {
            try {
              await instance.integrations.connect(integrationId);
            } catch (connectError) {
              console.warn(`[MatrixMode] Failed to auto-connect ${integrationId}:`, connectError);
            }
          }
        }
        console.log('[MatrixMode] ✅ Integration registry initialized');
      } catch (integrationsError) {
        console.warn('[MatrixMode] Integrations init failed:', integrationsError);
      }
    }

    // Initialize workflow automation - lazy import
    if (config.automation?.enabled) {
      try {
        const { initializeWorkflowEngine } = await import('./automation');
        instance.automation = await initializeWorkflowEngine();
        console.log('[MatrixMode] ✅ Workflow engine initialized');
      } catch (automationError) {
        console.warn('[MatrixMode] Workflow engine init failed:', automationError);
      }
    }

    // Initialize remote nodes - lazy import
    if (config.nodes?.enabled) {
      try {
        const { initializeNodeManager } = await import('./nodes');
        instance.nodes = await initializeNodeManager({
          port: config.nodes.port || 18792
        });
        console.log('[MatrixMode] ✅ Node manager initialized');
      } catch (nodesError) {
        console.warn('[MatrixMode] Node manager init failed:', nodesError);
      }
    }

    instance.initialized = true;
    console.log('[MatrixMode] Initialization complete');

  } catch (error) {
    console.error('[MatrixMode] Initialization failed:', error);
    throw error;
  }

  return instance;
}

/**
 * Shutdown Matrix Mode
 * Uses dynamic imports to only load modules that were initialized
 */
export async function shutdownMatrixMode(): Promise<void> {
  if (!instance.initialized) {
    return;
  }

  console.log('[MatrixMode] Shutting down...');

  try {
    // Shutdown nodes
    if (instance.nodes) {
      await instance.nodes.stop();
    }

    // Shutdown browser
    if (instance.browser) {
      await instance.browser.cleanup();
    }

    // Shutdown canvas
    if (instance.canvas) {
      instance.canvas.close();
    }

    // Shutdown integrations
    if (instance.integrations) {
      await instance.integrations.disconnectAll();
    }

    // Shutdown gateway and messaging - lazy imports
    if (instance.gateway) {
      const { shutdownMessagingGateway } = await import('./gateway');
      await shutdownMessagingGateway();
    }
    
    if (instance.scheduler) {
      const { shutdownScheduler } = await import('./scheduler');
      await shutdownScheduler();
    }
    
    // Memory system shutdown
    const { shutdownMemorySystem } = await import('./memory');
    await shutdownMemorySystem();

    instance = {
      scheduler: null,
      agents: null,
      gateway: null,
      browser: null,
      voice: null,
      canvas: null,
      integrations: null,
      automation: null,
      nodes: null,
      initialized: false
    };

    console.log('[MatrixMode] Shutdown complete');
  } catch (error) {
    console.error('[MatrixMode] Shutdown error:', error);
  }
}

/**
 * Get Matrix Mode instance
 */
export function getMatrixMode(): MatrixModeInstance {
  return instance;
}

/**
 * Check if Matrix Mode is initialized
 */
export function isMatrixModeInitialized(): boolean {
  return instance.initialized;
}

export default {
  initialize: initializeMatrixMode,
  shutdown: shutdownMatrixMode,
  getInstance: getMatrixMode,
  isInitialized: isMatrixModeInitialized
};
