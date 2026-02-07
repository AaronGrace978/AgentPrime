/**
 * Matrix Mode Systems IPC Handler
 * Integrates all Matrix Mode capabilities with IPC communication
 * 
 * Systems:
 * - Memory: Persistent memory with vector search
 * - Scheduler: Cron jobs, webhooks, triggers
 * - Agents: Multi-agent routing and sub-agents
 * - Gateway: Multi-channel messaging
 * - Browser: Enhanced Playwright automation
 * - Voice: Wake word, STT, TTS
 * - Canvas: Visual workspace (A2UI)
 * - Integrations: Notion, Spotify, Hue, GitHub, etc.
 * - Automation: Workflow engine
 * - Nodes: Remote agent nodes
 */

import { IpcMain } from 'electron';

// Import Matrix Mode systems
import {
  initializeMatrixMode,
  shutdownMatrixMode,
  getMatrixMode,
  isMatrixModeInitialized,
  type MatrixModeConfig
} from '../matrix-mode';

// Import individual system functions for direct access
import { getSessionManager, getMemoryStore, getMemorySearch } from '../matrix-mode/memory';
import { getScheduler, CRON_PRESETS } from '../matrix-mode/scheduler';
import { getMultiAgentManager, getAgentRouter } from '../matrix-mode/agents';
import { getMessagingGateway, getChannelManager } from '../matrix-mode/gateway';
import { getBrowserController } from '../matrix-mode/browser';
import { getVoiceSession } from '../matrix-mode/voice';
import { getCanvasManager, type A2UIComponent } from '../matrix-mode/canvas';
import { getIntegrationRegistry } from '../matrix-mode/integrations';
import { getWorkflowEngine } from '../matrix-mode/automation';
import { getNodeManager } from '../matrix-mode/nodes';

interface MatrixModeSystemDeps {
  ipcMain: IpcMain;
  getSettings: () => any;
  mainWindow: () => any;
}

let initialized = false;

export function register(deps: MatrixModeSystemDeps): void {
  const { ipcMain, getSettings, mainWindow } = deps;

  // ═══════════════════════════════════════════════════════════
  // CORE INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:initialize', async (event, config?: MatrixModeConfig) => {
    if (initialized) {
      return { success: true, message: 'Already initialized' };
    }

    try {
      const settings = getSettings();
      
      // Build config from settings
      const fullConfig: MatrixModeConfig = {
        memory: { enabled: true },
        scheduler: { enabled: true, webhookPort: settings?.matrixMode?.webhookPort || 18790 },
        agents: { enabled: true },
        gateway: { enabled: settings?.matrixMode?.gatewayEnabled !== false },
        browser: { enabled: true, headless: settings?.matrixMode?.browserHeadless ?? false },
        voice: { enabled: settings?.matrixMode?.voiceEnabled ?? false },
        canvas: { enabled: true },
        integrations: { enabled: true },
        automation: { enabled: true },
        nodes: { enabled: settings?.matrixMode?.nodesEnabled ?? false },
        ...config
      };

      await initializeMatrixMode(fullConfig);
      initialized = true;

      return { success: true, message: 'Matrix Mode initialized' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:shutdown', async () => {
    await shutdownMatrixMode();
    initialized = false;
    return { success: true };
  });

  ipcMain.handle('matrix-mode:status', async () => {
    const instance = getMatrixMode();
    return {
      initialized: instance.initialized,
      systems: {
        scheduler: !!instance.scheduler,
        agents: !!instance.agents,
        gateway: !!instance.gateway,
        browser: !!instance.browser,
        voice: !!instance.voice,
        canvas: !!instance.canvas,
        integrations: !!instance.integrations,
        automation: !!instance.automation,
        nodes: !!instance.nodes
      }
    };
  });

  // ═══════════════════════════════════════════════════════════
  // MEMORY SYSTEM
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:memory:search', async (event, query: string, options?: any) => {
    try {
      const search = getMemorySearch();
      const results = await search.search(query, options);
      return { success: true, results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:memory:get-session', async (event, channelId: string, channelType: string, userId?: string) => {
    try {
      const sessionManager = getSessionManager();
      const session = await sessionManager.getOrCreateSession(channelId, channelType, userId);
      return { success: true, session };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:memory:add-message', async (event, sessionId: string, role: string, content: string) => {
    try {
      const sessionManager = getSessionManager();
      const entry = await sessionManager.addMessage(sessionId, role as any, content);
      return { success: true, entry };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:memory:get-context', async (event, sessionId: string, message?: string) => {
    try {
      const sessionManager = getSessionManager();
      const context = await sessionManager.getSessionContext(sessionId, message);
      return { success: true, context };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════
  // SCHEDULER SYSTEM
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:scheduler:create-task', async (event, name: string, cronExpr: string, action: any) => {
    try {
      const scheduler = getScheduler();
      const task = scheduler.schedule(name, cronExpr, action);
      return { success: true, task };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:scheduler:list-tasks', async () => {
    try {
      const scheduler = getScheduler();
      const tasks = scheduler.getAllTasks();
      return { success: true, tasks };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:scheduler:run-task', async (event, taskId: string) => {
    try {
      const scheduler = getScheduler();
      const result = await scheduler.runTask(taskId);
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:scheduler:delete-task', async (event, taskId: string) => {
    try {
      const scheduler = getScheduler();
      scheduler.deleteTask(taskId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:scheduler:get-presets', async () => {
    return { success: true, presets: CRON_PRESETS };
  });

  // ═══════════════════════════════════════════════════════════
  // MESSAGING GATEWAY
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:messaging:add-channel', async (event, config: any) => {
    try {
      const gateway = getMessagingGateway();
      const channel = gateway.addChannel(config);
      return { success: true, channel };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:messaging:connect-channel', async (event, channelId: string) => {
    try {
      const gateway = getMessagingGateway();
      const connected = await gateway.connectChannel(channelId);
      return { success: connected };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:messaging:disconnect-channel', async (event, channelId: string) => {
    try {
      const gateway = getMessagingGateway();
      await gateway.disconnectChannel(channelId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:messaging:send', async (event, channelId: string, targetId: string, text: string) => {
    try {
      const gateway = getMessagingGateway();
      const result = await gateway.sendText(channelId, targetId, text);
      return { success: result.success, messageId: result.messageId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:messaging:get-channels', async () => {
    try {
      const gateway = getMessagingGateway();
      const states = gateway.getAllChannelStates();
      return { success: true, channels: states };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════
  // BROWSER AUTOMATION
  // ═══════════════════════════════════════════════════════════

  // Track browser initialization
  let browserInitialized = false;
  
  // Helper to ensure browser is initialized
  async function ensureBrowserInitialized() {
    const browser = getBrowserController();
    if (!browserInitialized) {
      await browser.initialize();
      browserInitialized = true;
      console.log('[BrowserIPC] Browser controller initialized');
    }
    return browser;
  }

  ipcMain.handle('matrix-mode:browser:start', async (event, profileId?: string) => {
    try {
      const browser = await ensureBrowserInitialized();
      await browser.startBrowser(profileId);
      return { success: true, message: 'Browser started' };
    } catch (error: any) {
      console.error('[BrowserIPC] Start error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:browser:navigate', async (event, url: string, profileId?: string) => {
    try {
      const browser = await ensureBrowserInitialized();
      await browser.navigate(url, profileId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:browser:snapshot', async (event, profileId?: string) => {
    try {
      const browser = await ensureBrowserInitialized();
      const snapshot = await browser.takeAISnapshot(profileId);
      return { success: true, snapshot };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:browser:act', async (event, ref: string, action: string, value?: string, profileId?: string) => {
    try {
      const browser = await ensureBrowserInitialized();
      const result = await browser.act(ref, action as any, value, profileId);
      return { success: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:browser:screenshot', async (event, profileId?: string, fullPage?: boolean) => {
    try {
      const browser = await ensureBrowserInitialized();
      const screenshot = await browser.screenshot(profileId, fullPage);
      return { success: true, screenshot: screenshot?.toString('base64') };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:browser:stop', async (event, profileId?: string) => {
    try {
      const browser = await ensureBrowserInitialized();
      await browser.stopBrowser(profileId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════
  // VOICE SYSTEM
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:voice:start-listening', async () => {
    try {
      const voice = getVoiceSession();
      voice.startWakeWordDetection();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:voice:stop-listening', async () => {
    try {
      const voice = getVoiceSession();
      voice.stopWakeWordDetection();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:voice:speak', async (event, text: string) => {
    try {
      const voice = getVoiceSession();
      await voice.speak(text);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:voice:trigger-wake', async () => {
    try {
      const voice = getVoiceSession();
      voice.triggerWakeWord();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════
  // CANVAS SYSTEM
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:canvas:show', async () => {
    try {
      const canvas = getCanvasManager();
      await canvas.show();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:canvas:hide', async () => {
    try {
      const canvas = getCanvasManager();
      canvas.hide();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:canvas:render', async (event, components: A2UIComponent[]) => {
    try {
      const canvas = getCanvasManager();
      await canvas.render(components);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:canvas:navigate', async (event, url: string) => {
    try {
      const canvas = getCanvasManager();
      await canvas.navigate(url);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════
  // INTEGRATIONS
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:integrations:list', async () => {
    try {
      const registry = getIntegrationRegistry();
      return { 
        success: true, 
        available: registry.getAvailableIntegrations(),
        connected: registry.getAll().map(i => ({ id: i.id, name: i.name, connected: i.isConnected() }))
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:integrations:connect', async (event, id: string, config: any) => {
    try {
      const registry = getIntegrationRegistry();
      const integration = await registry.createAndConnect({ id, ...config, enabled: true, createdAt: Date.now(), updatedAt: Date.now() });
      return { success: true, integration: { id: integration.id, name: integration.name } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:integrations:execute', async (event, integrationId: string, action: string, params: any) => {
    try {
      const registry = getIntegrationRegistry();
      const integration = registry.get(integrationId);
      if (!integration) throw new Error(`Integration not found: ${integrationId}`);
      
      const actions = integration.getActions();
      const actionDef = actions.find(a => a.name === action);
      if (!actionDef) throw new Error(`Action not found: ${action}`);
      
      const result = await actionDef.execute(params);
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:integrations:disconnect', async (event, integrationId: string) => {
    try {
      const registry = getIntegrationRegistry();
      await registry.disconnect(integrationId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════
  // WORKFLOW AUTOMATION
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:workflow:create', async (event, definition: any) => {
    try {
      const engine = getWorkflowEngine();
      const workflow = engine.createWorkflow(definition);
      return { success: true, workflow };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:workflow:list', async () => {
    try {
      const engine = getWorkflowEngine();
      const workflows = engine.getAllWorkflows();
      return { success: true, workflows };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:workflow:execute', async (event, workflowId: string, context?: any) => {
    try {
      const engine = getWorkflowEngine();
      const execution = await engine.executeWorkflow(workflowId, context);
      return { success: true, execution };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:workflow:get-approvals', async () => {
    try {
      const engine = getWorkflowEngine();
      const approvals = engine.getPendingApprovals();
      return { success: true, approvals };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:workflow:respond-approval', async (event, requestId: string, approved: boolean, response?: string) => {
    try {
      const engine = getWorkflowEngine();
      const result = engine.respondToApproval(requestId, approved, response);
      return { success: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ═══════════════════════════════════════════════════════════
  // NODE SYSTEM (Remote Agents)
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('matrix-mode:nodes:get-pairing-code', async () => {
    try {
      const nodes = getNodeManager();
      const pairing = nodes.generatePairingCode();
      return { success: true, pairing };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:nodes:list', async () => {
    try {
      const nodes = getNodeManager();
      const allNodes = nodes.getAllNodes();
      const connected = nodes.getConnectedNodes();
      return { 
        success: true, 
        nodes: allNodes,
        connectedCount: connected.length
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:nodes:send-command', async (event, nodeId: string, type: string, params: any) => {
    try {
      const nodes = getNodeManager();
      const result = await nodes.sendCommand(nodeId, { type, params });
      return { success: result.success, data: result.data, error: result.error };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:nodes:capture-camera', async (event, nodeId: string) => {
    try {
      const nodes = getNodeManager();
      const image = await nodes.captureCamera(nodeId);
      return { success: !!image, image: image?.toString('base64') };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:nodes:get-location', async (event, nodeId: string) => {
    try {
      const nodes = getNodeManager();
      const location = await nodes.getLocation(nodeId);
      return { success: !!location, location };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('matrix-mode:nodes:unpair', async (event, nodeId: string) => {
    try {
      const nodes = getNodeManager();
      const result = nodes.unpairNode(nodeId);
      return { success: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('✅ Matrix Mode Systems IPC handlers registered');
  console.log('   📝 Memory system (persistent, vector search)');
  console.log('   ⏰ Scheduler (cron, webhooks, triggers)');
  console.log('   🤖 Multi-agent routing');
  console.log('   💬 Messaging gateway (WhatsApp, Telegram, Discord, Slack)');
  console.log('   🌐 Browser automation (Playwright, AI snapshots)');
  console.log('   🎤 Voice (wake word, STT, TTS)');
  console.log('   🎨 Canvas (A2UI visual workspace)');
  console.log('   🔗 Integrations (Notion, Spotify, Hue, GitHub)');
  console.log('   ⚙️  Workflow automation');
  console.log('   📱 Remote nodes (mobile/IoT)');
}

export { register as registerMatrixModeSystems };
