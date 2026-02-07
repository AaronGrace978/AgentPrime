/**
 * Genesis IPC Handlers
 * ====================
 * 
 * Exposes Genesis functionality to the renderer process:
 * - Run Genesis proposals
 * - Approve/reject changes
 * - View evolution log
 * - Check Genesis availability
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import {
  GenesisBridge,
  GenesisConfig,
  GenesisResult,
  GenesisProposal,
  initializeGenesis,
  getGenesisBridge,
  isGenesisAvailable,
  formatProposalForChat
} from '../integrations/genesis';

// Default Genesis path - can be configured
const DEFAULT_GENESIS_PATH = 'G:\\Genesis';

let genesisBridge: GenesisBridge | null = null;

interface GenesisHandlerDeps {
  getWorkspacePath: () => string | null;
}

/**
 * Register Genesis IPC handlers
 */
export function registerGenesisHandlers(deps: GenesisHandlerDeps): void {
  const { getWorkspacePath } = deps;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize Genesis with custom config
   */
  ipcMain.handle('genesis:init', async (
    _event: IpcMainInvokeEvent,
    config?: Partial<GenesisConfig>
  ) => {
    try {
      const genesisPath = config?.genesisPath || DEFAULT_GENESIS_PATH;
      
      if (!fs.existsSync(genesisPath)) {
        return {
          success: false,
          error: `Genesis not found at: ${genesisPath}`
        };
      }

      const fullConfig: GenesisConfig = {
        genesisPath,
        defaultProjectPath: config?.defaultProjectPath || getWorkspacePath() || undefined,
        defaultLlm: config?.defaultLlm || 'anthropic:claude-sonnet-4-20250514',
        autoApproveLowRisk: config?.autoApproveLowRisk || false,
        allowedChannels: config?.allowedChannels || ['discord', 'slack', 'telegram']
      };

      genesisBridge = initializeGenesis(fullConfig);
      
      return {
        success: true,
        path: genesisPath
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  /**
   * Check if Genesis is available
   */
  ipcMain.handle('genesis:available', async () => {
    // Check if bridge is initialized
    if (genesisBridge) {
      return { available: true, initialized: true };
    }

    // Check if Genesis exists at default path
    const exists = fs.existsSync(DEFAULT_GENESIS_PATH) && 
                   fs.existsSync(path.join(DEFAULT_GENESIS_PATH, 'run.py'));
    
    return {
      available: exists,
      initialized: false,
      path: DEFAULT_GENESIS_PATH
    };
  });

  // ============================================================================
  // PROPOSALS
  // ============================================================================

  /**
   * Run Genesis to generate a proposal
   */
  ipcMain.handle('genesis:propose', async (
    _event: IpcMainInvokeEvent,
    goal: string,
    projectPath?: string,
    llmSpec?: string
  ): Promise<GenesisResult> => {
    if (!genesisBridge) {
      // Try to auto-initialize
      if (fs.existsSync(DEFAULT_GENESIS_PATH)) {
        genesisBridge = initializeGenesis({
          genesisPath: DEFAULT_GENESIS_PATH,
          defaultProjectPath: getWorkspacePath() || undefined
        });
      } else {
        return {
          success: false,
          error: 'Genesis not initialized. Call genesis:init first.'
        };
      }
    }

    const project = projectPath || getWorkspacePath();
    if (!project) {
      return {
        success: false,
        error: 'No project path specified and no workspace open'
      };
    }

    return genesisBridge.propose(goal, project, llmSpec);
  });

  /**
   * Send approval decision
   */
  ipcMain.handle('genesis:approve', async () => {
    if (!genesisBridge) {
      return { success: false, error: 'Genesis not initialized' };
    }
    genesisBridge.approve();
    return { success: true };
  });

  /**
   * Send rejection
   */
  ipcMain.handle('genesis:reject', async () => {
    if (!genesisBridge) {
      return { success: false, error: 'Genesis not initialized' };
    }
    genesisBridge.reject();
    return { success: true };
  });

  /**
   * Send modification request
   */
  ipcMain.handle('genesis:modify', async (
    _event: IpcMainInvokeEvent,
    feedback: string
  ) => {
    if (!genesisBridge) {
      return { success: false, error: 'Genesis not initialized' };
    }
    genesisBridge.modify(feedback);
    return { success: true };
  });

  /**
   * Cancel active Genesis process
   */
  ipcMain.handle('genesis:cancel', async () => {
    if (!genesisBridge) {
      return { success: false, error: 'Genesis not initialized' };
    }
    genesisBridge.cancel();
    return { success: true };
  });

  // ============================================================================
  // EVOLUTION LOG
  // ============================================================================

  /**
   * Get Genesis stats
   */
  ipcMain.handle('genesis:stats', async () => {
    if (!genesisBridge) {
      return { success: false, error: 'Genesis not initialized' };
    }
    
    const stats = await genesisBridge.getStats();
    return {
      success: true,
      stats
    };
  });

  /**
   * Get recent proposals from evolution log
   */
  ipcMain.handle('genesis:recent', async (
    _event: IpcMainInvokeEvent,
    limit?: number
  ) => {
    if (!genesisBridge) {
      return { success: false, error: 'Genesis not initialized' };
    }
    
    const proposals = await genesisBridge.getRecentProposals(limit || 10);
    return {
      success: true,
      proposals
    };
  });

  // ============================================================================
  // CHAT INTEGRATION
  // ============================================================================

  /**
   * Format proposal for display in chat
   */
  ipcMain.handle('genesis:format-for-chat', async (
    _event: IpcMainInvokeEvent,
    proposal: GenesisProposal
  ) => {
    return {
      success: true,
      formatted: formatProposalForChat(proposal)
    };
  });

  console.log('[Genesis] IPC handlers registered');
}

/**
 * Get the current Genesis bridge instance
 */
export function getRegisteredGenesisBridge(): GenesisBridge | null {
  return genesisBridge;
}

export default { registerGenesisHandlers, getRegisteredGenesisBridge };
