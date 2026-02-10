/**
 * Matrix Agent Mode IPC Handler
 * AI-powered computer control with safety confirmations
 * Enhanced Web Search with Tavily/Brave APIs, streaming, and conversation memory
 * Smart Mode integration for intent understanding and proactive enhancements
 * 
 * NOW WITH SMART SYSTEM DISCOVERY - Agent knows what's installed!
 */

import { IpcMain, WebContents, BrowserWindow, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { SystemExecutor, SystemAction } from '../system-executor';
import aiRouter from '../ai-providers';
import { WebSearchTool, WebFetchTool } from '../tools/web-search-tool';
import { 
  SmartIntentProcessor, 
  getSmartProcessor,
  getSystemPrompt,
  type IntelligenceLevel,
  type ConversationContext
} from '../smart-mode';
import { systemDiscovery } from '../system-discovery';
import { validateAction, type GuardianVerdict } from '../core/guardian';

// New Modules - LocalBrain, ActionEngine, Anticipator
import { getLocalBrain, initializeLocalBrain, classifyIntentFast } from '../modules/local-brain';
import { getActionEngine, initializeActionEngine } from '../modules/action-engine';
import { getAnticipator, initializeAnticipator } from '../modules/anticipator';

// Module instances
let localBrainInitialized = false;
let actionEngineInitialized = false;
let anticipatorInitialized = false;

// Matrix Mode Systems (lazy loaded)
let matrixModeInitPromise: Promise<void> | null = null;

// Actions that DON'T need Matrix Mode (fast path)
const SIMPLE_ACTIONS = new Set([
  // Basic actions - use system executor directly
  'launch_game', 'open_app', 'open_url', 'open_file', 'run_command',
  // Smart controller - uses robot.js directly
  'smart_click', 'smart_move_mouse', 'smart_move_mouse_circle', 'smart_move_mouse_direction', 'smart_drag', 'smart_scroll', 'smart_mouse_position',
  'smart_type', 'smart_hotkey', 'smart_screenshot', 'smart_focus_window', 
  'smart_get_windows', 'smart_window_info', 'smart_emergency_stop', 'smart_resume',
  // File operations - use fs directly
  'organize_folder', 'analyze_folder', 'move_file', 'copy_file', 'delete_file',
  'rename_file', 'create_folder', 'create_file', 'list_folder', 'batch_rename',
  // Clipboard
  'clipboard_read', 'clipboard_write',
  // Vault - uses its own storage
  'vault_unlock', 'vault_lock', 'vault_status', 'vault_list', 'vault_auto_fill', 'login',
  // DirectControl - native API integrations (calendar, email, notifications)
  'calendar_add_event', 'calendar_read', 'calendar_today',
  // Desktop Control - smart icon manipulation (no coordinates needed!)
  'desktop_list', 'desktop_move', 'desktop_find', 'desktop_arrange',
  'email_send', 'email_read', 'email_unread_count',
  'contacts_search', 'notification_show', 'reminder_create',
  'datetime_get', 'system_lock', 'volume_set', 'mute_toggle'
]);

function needsMatrixMode(action: string): boolean {
  return !SIMPLE_ACTIONS.has(action);
}

// Actions handled by executeMatrixModeAction (NOT SystemExecutor)
// These include Matrix Mode subsystems AND file/clipboard/web/project ops
const MATRIX_MODE_HANDLER_PREFIXES = [
  'memory_', 'scheduler_', 'message_', 'browser_', 'voice_', 'canvas_',
  'spotify_', 'notion_', 'hue_', 'github_', 'workflow_', 'node', 'system_'
];
const MATRIX_MODE_HANDLER_ACTIONS = new Set([
  // File operations (use fs directly, not SystemExecutor)
  'create_file', 'create_folder', 'list_folder', 'organize_folder', 'analyze_folder',
  'move_file', 'copy_file', 'delete_file', 'rename_file', 'batch_rename',
  // Clipboard
  'clipboard_read', 'clipboard_write', 'clipboard_history',
  // Web tools
  'web_search', 'web_fetch',
  // Document tools
  'read_document', 'search_documents',
  // Package managers
  'npm_install', 'pip_install',
  // Project management
  'create_project_plan', 'list_projects', 'get_project_progress',
]);

function isMatrixModeHandlerAction(action: string): boolean {
  return MATRIX_MODE_HANDLER_PREFIXES.some(p => action.startsWith(p)) || 
         MATRIX_MODE_HANDLER_ACTIONS.has(action);
}

async function ensureMatrixMode(): Promise<void> {
  if (matrixModeInitPromise) {
    return matrixModeInitPromise;
  }

  matrixModeInitPromise = (async () => {
    const { initializeMatrixMode, isMatrixModeInitialized } = await import('../matrix-mode');
    if (isMatrixModeInitialized()) {
      return;
    }

    await initializeMatrixMode({
      memory: { enabled: true },
      scheduler: { enabled: true },
      agents: { enabled: true },
      gateway: { enabled: false }, // Don't auto-start gateway
      browser: { enabled: true },
      voice: { enabled: false },
      canvas: { enabled: true },
      integrations: { enabled: true },
      automation: { enabled: true },
      nodes: { enabled: true }
    });

    console.log('[Matrix Agent] Matrix Mode systems initialized');
  })();

  try {
    await matrixModeInitPromise;
  } catch (error) {
    matrixModeInitPromise = null;
    throw error;
  }
}

function requireSubsystem<T>(value: T | null | undefined, name: string): T {
  if (!value) {
    throw new Error(`Matrix Mode ${name} is not initialized. Check setup and try again.`);
  }
  return value;
}

// Execute Matrix Mode actions
async function executeMatrixModeAction(action: string, params: any): Promise<{ success: boolean; message?: string; data?: any; error?: string }> {
  try {
    // Memory actions
    if (action === 'memory_search') {
      const { getMemorySearch } = await import('../matrix-mode/memory');
      const search = requireSubsystem(getMemorySearch(), 'memory');
      const results = await search.search(params.query, { limit: 5 });
      return { success: true, message: `Found ${results.length} relevant memories`, data: results };
    }

    // Scheduler actions
    if (action === 'scheduler_create') {
      const { getScheduler } = await import('../matrix-mode/scheduler');
      const scheduler = requireSubsystem(getScheduler(), 'scheduler');
      const task = scheduler.schedule(params.name, params.cron, { type: 'message', message: params.action || params.message });
      return { success: true, message: `Scheduled task "${params.name}"`, data: task };
    }
    if (action === 'scheduler_list') {
      const { getScheduler } = await import('../matrix-mode/scheduler');
      const scheduler = requireSubsystem(getScheduler(), 'scheduler');
      const tasks = scheduler.getAllTasks();
      return { success: true, message: `${tasks.length} scheduled tasks`, data: tasks.map(t => ({ id: t.id, name: t.name, cron: t.cronExpression, enabled: t.enabled })) };
    }
    if (action === 'scheduler_run') {
      const { getScheduler } = await import('../matrix-mode/scheduler');
      const scheduler = requireSubsystem(getScheduler(), 'scheduler');
      const result = await scheduler.runTask(params.taskId);
      return { success: true, message: 'Task executed', data: result };
    }
    if (action === 'scheduler_delete') {
      const { getScheduler } = await import('../matrix-mode/scheduler');
      const scheduler = requireSubsystem(getScheduler(), 'scheduler');
      scheduler.deleteTask(params.taskId);
      return { success: true, message: 'Task deleted' };
    }

    // System intel actions
    if (action === 'system_health_snapshot') {
      const { getSystemIntel } = await import('../matrix-mode/system-intel');
      const intel = requireSubsystem(getSystemIntel(), 'system-intel');
      const snapshot = await intel.getHealthSnapshot();
      return {
        success: true,
        message: `CPU ${snapshot.cpuUsagePercent}% | RAM ${snapshot.memory.usedPercent}%`,
        data: snapshot
      };
    }
    if (action === 'system_battery_health') {
      const { getSystemIntel } = await import('../matrix-mode/system-intel');
      const intel = requireSubsystem(getSystemIntel(), 'system-intel');
      const battery = intel.getBatteryHealth();
      return {
        success: true,
        message: battery.available ? `Battery ${battery.percent ?? 'unknown'}%` : 'Battery data unavailable on this system',
        data: battery
      };
    }
    if (action === 'system_disk_usage') {
      const { getSystemIntel } = await import('../matrix-mode/system-intel');
      const intel = requireSubsystem(getSystemIntel(), 'system-intel');
      const disks = intel.getDiskUsage();
      return { success: true, message: `${disks.length} disk(s) scanned`, data: disks };
    }
    if (action === 'system_watch_start') {
      const { getSystemIntel } = await import('../matrix-mode/system-intel');
      const intel = requireSubsystem(getSystemIntel(), 'system-intel');
      const status = intel.startTelemetryWatch({
        intervalMs: params.intervalMs,
        thresholds: params.thresholds
      });
      return { success: true, message: 'System telemetry watch started', data: status };
    }
    if (action === 'system_watch_stop') {
      const { getSystemIntel } = await import('../matrix-mode/system-intel');
      const intel = requireSubsystem(getSystemIntel(), 'system-intel');
      const status = intel.stopTelemetryWatch();
      return { success: true, message: 'System telemetry watch stopped', data: status };
    }
    if (action === 'system_watch_status') {
      const { getSystemIntel } = await import('../matrix-mode/system-intel');
      const intel = requireSubsystem(getSystemIntel(), 'system-intel');
      const status = intel.getWatchStatus();
      return { success: true, message: status.running ? 'Telemetry watch is running' : 'Telemetry watch is stopped', data: status };
    }

    // Browser actions
    if (action === 'browser_navigate') {
      const { getBrowserController } = await import('../matrix-mode/browser');
      const browser = requireSubsystem(getBrowserController(), 'browser');
      await browser.navigate(params.url);
      return { success: true, message: `Navigated to ${params.url}` };
    }
    if (action === 'browser_snapshot') {
      const { getBrowserController } = await import('../matrix-mode/browser');
      const browser = requireSubsystem(getBrowserController(), 'browser');
      const snapshot = await browser.takeAISnapshot();
      const elementList = snapshot.elements.slice(0, 20).map(e => 
        `${e.ref}: ${e.tag}${e.text ? ` "${e.text.substring(0, 30)}"` : ''}${e.name ? ` [${e.name}]` : ''}`
      ).join('\n');
      return { success: true, message: `Page: ${snapshot.title}\nElements:\n${elementList}`, data: snapshot };
    }
    if (action === 'browser_click') {
      const { getBrowserController } = await import('../matrix-mode/browser');
      const browser = requireSubsystem(getBrowserController(), 'browser');
      await browser.act(params.ref, 'click');
      return { success: true, message: `Clicked ${params.ref}` };
    }
    if (action === 'browser_type') {
      const { getBrowserController } = await import('../matrix-mode/browser');
      const browser = requireSubsystem(getBrowserController(), 'browser');
      await browser.act(params.ref, 'fill', params.text);
      return { success: true, message: `Typed in ${params.ref}` };
    }
    if (action === 'browser_screenshot') {
      const { getBrowserController } = await import('../matrix-mode/browser');
      const browser = requireSubsystem(getBrowserController(), 'browser');
      const screenshot = await browser.screenshot();
      return { success: true, message: 'Screenshot captured', data: screenshot?.toString('base64') };
    }

    // Voice actions
    if (action === 'voice_speak') {
      const { getVoiceSession } = await import('../matrix-mode/voice');
      const voice = requireSubsystem(getVoiceSession(), 'voice');
      await voice.speak(params.text);
      return { success: true, message: `Speaking: "${params.text}"` };
    }

    // Canvas actions
    if (action === 'canvas_show') {
      const { getCanvasManager } = await import('../matrix-mode/canvas');
      const canvas = requireSubsystem(getCanvasManager(), 'canvas');
      await canvas.show();
      return { success: true, message: 'Canvas shown' };
    }
    if (action === 'canvas_hide') {
      const { getCanvasManager } = await import('../matrix-mode/canvas');
      const canvas = requireSubsystem(getCanvasManager(), 'canvas');
      canvas.hide();
      return { success: true, message: 'Canvas hidden' };
    }
    if (action === 'canvas_render') {
      const { getCanvasManager } = await import('../matrix-mode/canvas');
      const canvas = requireSubsystem(getCanvasManager(), 'canvas');
      await canvas.render(params.components);
      return { success: true, message: 'Canvas rendered' };
    }

    // Integration actions - Spotify
    if (action.startsWith('spotify_')) {
      const { getIntegrationRegistry } = await import('../matrix-mode/integrations');
      const registry = requireSubsystem(getIntegrationRegistry(), 'integrations');
      const spotify = registry.get('spotify');
      if (!spotify) return { success: false, error: 'Spotify not connected. Connect it first in settings.' };

      const spotifyAction = action.replace('spotify_', '');
      const actions = spotify.getActions();
      const actionDef = actions.find(a => a.name === spotifyAction);
      if (!actionDef) return { success: false, error: `Unknown Spotify action: ${spotifyAction}` };

      const result = await actionDef.execute(params);
      return { success: true, message: `Spotify: ${spotifyAction}`, data: result };
    }

    // Integration actions - Notion
    if (action.startsWith('notion_')) {
      const { getIntegrationRegistry } = await import('../matrix-mode/integrations');
      const registry = requireSubsystem(getIntegrationRegistry(), 'integrations');
      const notion = registry.get('notion');
      if (!notion) return { success: false, error: 'Notion not connected. Connect it first in settings.' };

      if (action === 'notion_search') {
        const result = await (notion as any).search(params.query);
        return { success: true, message: `Found ${result.results?.length || 0} pages`, data: result };
      }
      if (action === 'notion_create') {
        const result = await (notion as any).createPage(params.title, params.content);
        return { success: true, message: `Created page: ${params.title}`, data: result };
      }
    }

    // Integration actions - Hue
    if (action === 'hue_lights') {
      const { getIntegrationRegistry } = await import('../matrix-mode/integrations');
      const registry = requireSubsystem(getIntegrationRegistry(), 'integrations');
      const hue = registry.get('hue');
      if (!hue) return { success: false, error: 'Philips Hue not connected. Connect it first in settings.' };

      if (params.action === 'on' || params.action === 'off') {
        await (hue as any).setAllLights({ on: params.action === 'on', brightness: params.brightness });
        return { success: true, message: `Lights turned ${params.action}` };
      }
      return { success: true, message: 'Lights controlled' };
    }

    // Integration actions - GitHub
    if (action.startsWith('github_')) {
      const { getIntegrationRegistry } = await import('../matrix-mode/integrations');
      const registry = requireSubsystem(getIntegrationRegistry(), 'integrations');
      const github = registry.get('github');
      if (!github) return { success: false, error: 'GitHub not connected. Connect it first in settings.' };

      if (action === 'github_issues') {
        const result = await (github as any).getIssues(params.owner, params.repo);
        return { success: true, message: `Found ${result.length} issues`, data: result };
      }
      if (action === 'github_create_issue') {
        const result = await (github as any).createIssue(params.owner, params.repo, params.title, params.body);
        return { success: true, message: `Created issue: ${params.title}`, data: result };
      }
    }

    // Workflow actions
    if (action === 'workflow_list') {
      const { getWorkflowEngine } = await import('../matrix-mode/automation');
      const engine = requireSubsystem(getWorkflowEngine(), 'automation');
      const workflows = engine.getAllWorkflows();
      return { success: true, message: `${workflows.length} workflows`, data: workflows.map(w => ({ id: w.id, name: w.name, enabled: w.enabled })) };
    }
    if (action === 'workflow_run') {
      const { getWorkflowEngine } = await import('../matrix-mode/automation');
      const engine = requireSubsystem(getWorkflowEngine(), 'automation');
      const execution = await engine.executeWorkflow(params.workflowId);
      return { success: true, message: `Workflow ${execution.status}`, data: execution };
    }

    // Node actions
    if (action === 'nodes_list') {
      const { getNodeManager } = await import('../matrix-mode/nodes');
      const nodes = requireSubsystem(getNodeManager(), 'nodes');
      const allNodes = nodes.getAllNodes();
      return { success: true, message: `${allNodes.length} nodes`, data: allNodes };
    }
    if (action === 'node_camera') {
      const { getNodeManager } = await import('../matrix-mode/nodes');
      const nodes = requireSubsystem(getNodeManager(), 'nodes');
      const options = params.facing ? { facing: params.facing as 'front' | 'back' } : undefined;
      const image = await nodes.captureCamera(params.nodeId, options);
      return { success: !!image, message: image ? 'Camera captured' : 'Failed', data: image?.toString('base64') };
    }
    if (action === 'node_location') {
      const { getNodeManager } = await import('../matrix-mode/nodes');
      const nodes = requireSubsystem(getNodeManager(), 'nodes');
      const location = await nodes.getLocation(params.nodeId);
      return { success: !!location, message: location ? `Location: ${location.latitude}, ${location.longitude}` : 'Failed', data: location };
    }
    if (action === 'node_notify') {
      const { getNodeManager } = await import('../matrix-mode/nodes');
      const nodes = requireSubsystem(getNodeManager(), 'nodes');
      const result = await nodes.sendNotification(params.nodeId, params.title, params.body);
      return { success: result, message: result ? 'Notification sent' : 'Failed' };
    }
    if (action === 'nodes_command') {
      const { getNodeManager } = await import('../matrix-mode/nodes');
      const nodes = requireSubsystem(getNodeManager(), 'nodes');
      const { nodeId, type: cmdType, params: cmdParams, timeout } = params;
      if (!nodeId || !cmdType) {
        return { success: false, error: 'nodeId and type required' };
      }
      try {
        const response = await nodes.sendCommand(nodeId, {
          type: cmdType,
          params: cmdParams || {},
          timeout
        });
        return {
          success: response.success,
          message: response.success ? 'Command executed' : (response.error || 'Failed'),
          data: response.data,
          error: response.error
        };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    if (action === 'node_screen') {
      const { getNodeManager } = await import('../matrix-mode/nodes');
      const nodes = requireSubsystem(getNodeManager(), 'nodes');
      const image = await nodes.captureScreen(params.nodeId);
      return { success: !!image, message: image ? 'Screen captured' : 'Failed', data: image?.toString('base64') };
    }
    if (action === 'node_canvas') {
      const { getNodeManager } = await import('../matrix-mode/nodes');
      const nodes = requireSubsystem(getNodeManager(), 'nodes');
      const result = await nodes.displayCanvas(params.nodeId, params.html ?? '');
      return { success: result, message: result ? 'Canvas displayed on node' : 'Failed' };
    }

    // File organization actions
    if (action === 'analyze_folder') {
      const { FileAnalyzerTool } = await import('../tools/file-organizer-tool');
      const analyzer = new FileAnalyzerTool();
      const result = await analyzer.execute({
        folderPath: params.path || params.folderPath,
        includeSubfolders: params.includeSubfolders ?? true,
        checkDuplicates: params.checkDuplicates ?? true
      });
      
      // Format summary
      const categories = Object.entries(result.categories)
        .map(([name, info]: [string, any]) => `${name}: ${info.count} files`)
        .join('\n');
      
      return { 
        success: true, 
        message: `Found ${result.totalFiles} files:\n${categories}\n${result.uncategorized.count} uncategorized`,
        data: result 
      };
    }

    if (action === 'organize_folder') {
      const { FileOrganizerTool } = await import('../tools/file-organizer-tool');
      const organizer = new FileOrganizerTool();
      const result = await organizer.execute({
        folderPath: params.path || params.folderPath,
        dryRun: params.dryRun ?? false, // Actually organize by default when explicitly called
        includeSubfolders: params.includeSubfolders ?? false,
        customRules: params.customRules
      });
      
      if (result.success) {
        const summary = result.movedFiles.length > 0 
          ? `Moved ${result.movedFiles.length} files into ${result.createdFolders.length} folders`
          : 'No files needed organizing';
        return { success: true, message: summary, data: result };
      } else {
        return { success: false, error: result.errors.join(', '), data: result };
      }
    }

    if (action === 'batch_rename') {
      const { FileRenameTool } = await import('../tools/file-organizer-tool');
      const renamer = new FileRenameTool();
      const result = await renamer.execute({
        folderPath: params.path || params.folderPath,
        pattern: params.pattern,
        filter: params.filter,
        dryRun: params.dryRun ?? false
      });
      
      return { 
        success: result.success, 
        message: result.renamed.length > 0 ? `Renamed ${result.renamed.length} files` : 'No files renamed',
        data: result 
      };
    }

    // ═══════════════════════════════════════════════════════════
    // FILE SYSTEM OPERATIONS
    // ═══════════════════════════════════════════════════════════
    
    if (action === 'move_file') {
      const { SystemActionExecutor } = await import('../core/system-action-executor');
      const { PathResolver } = await import('../core/path-resolver');
      const executor = new SystemActionExecutor(new PathResolver());
      const result = await executor.moveFile(params.source || params.from, params.destination || params.to, { 
        overwrite: params.overwrite ?? false 
      });
      return { success: result.success, message: result.message, data: result };
    }

    if (action === 'copy_file') {
      const { SystemActionExecutor } = await import('../core/system-action-executor');
      const { PathResolver } = await import('../core/path-resolver');
      const executor = new SystemActionExecutor(new PathResolver());
      const result = await executor.copyFile(params.source || params.from, params.destination || params.to, { 
        overwrite: params.overwrite ?? false 
      });
      return { success: result.success, message: result.message, data: result };
    }

    if (action === 'delete_file') {
      const { SystemActionExecutor } = await import('../core/system-action-executor');
      const { PathResolver } = await import('../core/path-resolver');
      const executor = new SystemActionExecutor(new PathResolver());
      const result = await executor.deleteFile(params.path || params.file, 
        params.useRecycleBin ?? true
      );
      return { success: result.success, message: result.message, data: result };
    }

    if (action === 'rename_file') {
      const { SystemActionExecutor } = await import('../core/system-action-executor');
      const { PathResolver } = await import('../core/path-resolver');
      const executor = new SystemActionExecutor(new PathResolver());
      const result = await executor.renameFile(params.path || params.file, params.newName);
      return { success: result.success, message: result.message, data: result };
    }

    if (action === 'create_folder') {
      const { SystemActionExecutor } = await import('../core/system-action-executor');
      const { PathResolver } = await import('../core/path-resolver');
      const executor = new SystemActionExecutor(new PathResolver());
      const result = await executor.createFolder(params.path || params.folder);
      return { success: result.success, message: result.message, data: result };
    }

    if (action === 'create_file') {
      const fs = await import('fs');
      const pathModule = await import('path');
      const filePath = params.path || params.file;
      const content = params.content || '';
      
      try {
        // Ensure directory exists
        const dir = pathModule.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Create file with optional content
        fs.writeFileSync(filePath, content, 'utf-8');
        return { 
          success: true, 
          message: `Created file: ${pathModule.basename(filePath)}`,
          data: { path: filePath, created: true }
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }

    if (action === 'open_file') {
      const { SystemActionExecutor } = await import('../core/system-action-executor');
      const { PathResolver } = await import('../core/path-resolver');
      const executor = new SystemActionExecutor(new PathResolver());
      const result = await executor.openFile(params.path || params.file);
      return { success: result.success, message: result.message, data: result };
    }

    if (action === 'list_folder') {
      const fs = await import('fs');
      const path = await import('path');
      const folderPath = params.path || params.folder;
      
      try {
        const items = fs.readdirSync(folderPath, { withFileTypes: true });
        const files = items.map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'folder' : 'file',
          path: path.join(folderPath, item.name)
        }));
        return { success: true, message: `${files.length} items`, data: files };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CLIPBOARD OPERATIONS
    // ═══════════════════════════════════════════════════════════

    if (action === 'clipboard_read') {
      const { ClipboardReadTool } = await import('../tools/clipboard-tool');
      const clipboard = new ClipboardReadTool();
      const result = await clipboard.execute({});
      return { success: true, message: 'Clipboard content read', data: result };
    }

    if (action === 'clipboard_write') {
      const { ClipboardWriteTool } = await import('../tools/clipboard-tool');
      const clipboard = new ClipboardWriteTool();
      const result = await clipboard.execute({ text: params.text || params.content });
      return { success: result.success, message: result.message || 'Clipboard updated', data: result };
    }

    if (action === 'clipboard_history') {
      const { ClipboardHistoryTool } = await import('../tools/clipboard-tool');
      const clipboard = new ClipboardHistoryTool();
      const result = await clipboard.execute({ limit: params.limit || 10 });
      return { success: true, message: `${result.length || 0} clipboard entries`, data: result };
    }

    // ═══════════════════════════════════════════════════════════
    // WEB SEARCH & FETCH
    // ═══════════════════════════════════════════════════════════

    if (action === 'web_search') {
      const { WebSearchTool } = await import('../tools/web-search-tool');
      const search = new WebSearchTool();
      const result = await search.execute({ 
        query: params.query, 
        maxResults: params.limit || 5 
      });
      return { success: true, message: `Found ${result.results?.length || 0} results`, data: result };
    }

    if (action === 'web_fetch') {
      const { WebFetchTool } = await import('../tools/web-search-tool');
      const fetcher = new WebFetchTool();
      const result = await fetcher.execute({ url: params.url });
      return { success: true, message: 'Page fetched', data: result };
    }

    // ═══════════════════════════════════════════════════════════
    // DOCUMENT READING
    // ═══════════════════════════════════════════════════════════

    if (action === 'read_document') {
      const { DocumentReaderTool } = await import('../tools/document-tool');
      const reader = new DocumentReaderTool();
      const result = await reader.execute({ filePath: params.path || params.file });
      return { success: result.success, message: result.success ? 'Document read' : 'Read failed', data: result };
    }

    if (action === 'search_documents') {
      const { DocumentSearchTool } = await import('../tools/document-tool');
      const searcher = new DocumentSearchTool();
      const result = await searcher.execute({ 
        query: params.query, 
        folderPath: params.folder || params.path,
        fileTypes: params.fileTypes || params.extensions
      });
      return { success: true, message: `Found ${result.totalMatches || 0} matches`, data: result };
    }

    // ═══════════════════════════════════════════════════════════
    // SHELL / COMMAND EXECUTION
    // ═══════════════════════════════════════════════════════════

    if (action === 'run_command') {
      const { spawn } = await import('child_process');
      const os = await import('os');
      const isWindows = os.platform() === 'win32';
      
      try {
        const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          const command = params.command;
          const cwd = params.cwd || process.cwd();
          const timeout = params.timeout || 30000;
          
          let child;
          
          if (isWindows) {
            // PERFORMANCE: Check if command needs PowerShell
            const needsPowerShell = command.toLowerCase().startsWith('powershell') || 
                                     command.includes('$') || 
                                     command.includes('Get-') ||
                                     command.includes('Set-');
            
            if (needsPowerShell) {
              // Use PowerShell with -NoProfile for speed
              const psCommand = command.toLowerCase().startsWith('powershell') 
                ? command 
                : `powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; ${command.replace(/"/g, '\\"')}"`;
              child = spawn('cmd.exe', ['/c', psCommand], { cwd, windowsHide: true });
            } else {
              // Use cmd.exe directly - MUCH faster, no PowerShell module loading
              child = spawn('cmd.exe', ['/c', command], { cwd, windowsHide: true });
            }
          } else {
            child = spawn('sh', ['-c', command], { cwd });
          }
          
          let stdout = '';
          let stderr = '';
          
          const timeoutId = setTimeout(() => {
            child.kill();
            reject(new Error(`Command timed out after ${timeout}ms`));
          }, timeout);
          
          child.stdout?.on('data', (data) => { stdout += data.toString(); });
          child.stderr?.on('data', (data) => { 
            // Filter out PowerShell CLIXML noise
            const text = data.toString();
            if (!text.includes('CLIXML') && !text.includes('Preparing modules')) {
              stderr += text;
            }
          });
          
          child.on('close', (code) => {
            clearTimeout(timeoutId);
            if (code === 0 || code === null) {
              resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
            } else {
              reject(new Error(stderr || `Command failed with code ${code}`));
            }
          });
          
          child.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
        });
        
        return { 
          success: true, 
          message: 'Command executed', 
          data: result 
        };
      } catch (error: any) {
        return { success: false, error: error.message, data: { stderr: error.message } };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // DEPENDENCY MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    if (action === 'npm_install') {
      const { NpmInstallTool } = await import('../tools/dependency-tool');
      const npm = new NpmInstallTool();
      const result = await npm.execute({ 
        packages: params.packages, 
        dev: params.dev ?? false,
        workingDir: params.cwd || params.workingDir
      });
      return { success: result.success, message: result.success ? 'Packages installed' : result.error, data: result };
    }

    if (action === 'pip_install') {
      const { PipInstallTool } = await import('../tools/dependency-tool');
      const pip = new PipInstallTool();
      const result = await pip.execute({ 
        packages: params.packages,
        workingDir: params.cwd || params.workingDir
      });
      return { success: result.success, message: result.success ? 'Packages installed' : result.error, data: result };
    }

    // ═══════════════════════════════════════════════════════════
    // PROJECT MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    if (action === 'create_project_plan') {
      const { CreateProjectPlanTool } = await import('../tools/chapter-tool');
      const planner = new CreateProjectPlanTool();
      const result = await planner.execute({
        name: params.name || params.projectName,
        description: params.description,
        complexity: params.complexity,
        projectType: params.projectType,
        tokenBudget: params.tokenBudget
      });
      return { success: result.success, message: result.summary || 'Project plan created', data: result };
    }

    if (action === 'list_projects') {
      const { ListProjectsTool } = await import('../tools/chapter-tool');
      const lister = new ListProjectsTool();
      const result = await lister.execute();
      return { success: true, message: `${result.projects?.length || 0} projects`, data: result };
    }

    if (action === 'get_project_progress') {
      const { GetProjectProgressTool } = await import('../tools/chapter-tool');
      const progress = new GetProjectProgressTool();
      const result = await progress.execute();
      return { success: true, message: result.summary || 'Progress retrieved', data: result };
    }

    return { success: false, error: `Unknown Matrix Mode action: ${action}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Safety classification
const SAFE_APPS = [
  // Browsers
  'chrome', 'firefox', 'edge', 'safari', 'brave', 'opera',
  // Development
  'vscode', 'cursor', 'sublime', 'notepad', 'notepad++', 'terminal', 'cmd', 'powershell',
  // Utilities
  'calculator', 'explorer', 'file explorer', 'finder', 'settings', 'task manager',
  // Communication
  'spotify', 'discord', 'slack', 'teams', 'zoom', 'telegram', 'whatsapp', 'signal', 'skype',
  // Gaming (read-only launchers)
  'steam', 'epic games', 'epic', 'gog galaxy', 'battle.net', 'blizzard', 'origin', 'ea', 'ubisoft', 'uplay', 'xbox',
  // Media
  'vlc', 'itunes', 'music', 'photos', 'obs',
  // Productivity
  'word', 'excel', 'powerpoint', 'outlook', 'onenote', 'notion', 'obsidian',
  // Graphics
  'figma', 'blender', 'gimp', 'paint',
  // Misc
  'snipping tool', 'snip', 'mail', 'calendar', 'clock', 'weather', 'maps'
];

// Safe action types that don't need confirmation
const SAFE_ACTION_TYPES = ['open_app', 'open_url', 'launch_game'];

const RISKY_ACTIONS = ['run_command', 'shutdown', 'open_file'];

interface PendingAction {
  id: string;
  action: SystemAction;
  explanation: string;
  riskLevel: 'safe' | 'moderate' | 'risky';
  resolve: (approved: boolean) => void;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

// Store pending actions waiting for confirmation with timestamps
interface PendingActionEntry extends PendingAction {
  createdAt: number;
  timeoutId?: NodeJS.Timeout;
}
const pendingActions = new Map<string, PendingActionEntry>();

// Pending actions configuration
const PENDING_ACTION_TIMEOUT = 60000; // 60 seconds default
const PENDING_ACTION_CLEANUP_INTERVAL = 30000; // Check every 30 seconds
let pendingActionsCleanupInterval: NodeJS.Timeout | null = null;

// Conversation history for context (per session)
let conversationHistory: ConversationMessage[] = [];
let maxConversationHistory = 10; // Default, can be configured
const HISTORY_PERSIST_DEBOUNCE_MS = 1000;
let historyPersistTimeout: NodeJS.Timeout | null = null;

// Configuration interface
interface MatrixAgentConfig {
  maxConversationHistory?: number;
  pendingActionTimeout?: number;
}

/**
 * Configure Matrix Agent settings
 */
function configureMatrixAgent(config: MatrixAgentConfig): void {
  if (config.maxConversationHistory !== undefined) {
    maxConversationHistory = Math.max(1, Math.min(100, config.maxConversationHistory));
    if (conversationHistory.length > maxConversationHistory) {
      conversationHistory = conversationHistory.slice(-maxConversationHistory);
    }
    scheduleHistoryPersist();
    console.log(`[Matrix Agent] Conversation history limit set to: ${maxConversationHistory}`);
  }
}

async function getHistoryFilePath(): Promise<string> {
  if (!app.isReady()) {
    await app.whenReady();
  }
  return path.join(app.getPath('userData'), 'matrix-agent-history.json');
}

function scheduleHistoryPersist(): void {
  if (historyPersistTimeout) {
    clearTimeout(historyPersistTimeout);
  }
  historyPersistTimeout = setTimeout(() => {
    historyPersistTimeout = null;
    void persistHistory();
  }, HISTORY_PERSIST_DEBOUNCE_MS);

  if (historyPersistTimeout.unref) {
    historyPersistTimeout.unref();
  }
}

async function persistHistory(): Promise<void> {
  try {
    const filePath = await getHistoryFilePath();
    const payload = {
      version: 1,
      updatedAt: Date.now(),
      maxConversationHistory,
      messages: conversationHistory
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Matrix Agent] Failed to persist history:', (error as Error).message);
  }
}

async function loadHistoryFromDisk(): Promise<void> {
  try {
    const filePath = await getHistoryFilePath();
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as {
      version?: number;
      messages?: ConversationMessage[];
    };
    if (Array.isArray(data.messages)) {
      conversationHistory = data.messages
        .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
        .map(m => ({
          role: m.role,
          content: m.content,
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now()
        }));

      if (conversationHistory.length > maxConversationHistory) {
        conversationHistory = conversationHistory.slice(-maxConversationHistory);
      }
    }
  } catch (error) {
    const message = (error as Error).message || '';
    if (!message.includes('ENOENT')) {
      console.warn('[Matrix Agent] Failed to load history:', message);
    }
  }
}

/**
 * Start the pending actions cleanup interval
 */
function startPendingActionsCleanup(): void {
  if (pendingActionsCleanupInterval) return;
  
  pendingActionsCleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, action] of pendingActions.entries()) {
      // Clean up actions older than timeout
      if (now - action.createdAt > PENDING_ACTION_TIMEOUT * 2) {
        // Clear any associated timeout
        if (action.timeoutId) {
          clearTimeout(action.timeoutId);
        }
        pendingActions.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Matrix Agent] Cleaned up ${cleaned} stale pending actions`);
    }
  }, PENDING_ACTION_CLEANUP_INTERVAL);
  
  // Don't prevent process exit
  if (pendingActionsCleanupInterval.unref) {
    pendingActionsCleanupInterval.unref();
  }
}

/**
 * Stop the pending actions cleanup interval
 */
function stopPendingActionsCleanup(): void {
  if (pendingActionsCleanupInterval) {
    clearInterval(pendingActionsCleanupInterval);
    pendingActionsCleanupInterval = null;
  }
  
  // Clear all pending actions and their timeouts
  for (const action of pendingActions.values()) {
    if (action.timeoutId) {
      clearTimeout(action.timeoutId);
    }
    action.resolve(false);
  }
  pendingActions.clear();
}

let systemExecutor: SystemExecutor | null = null;
let webSearchTool: WebSearchTool | null = null;
let webFetchTool: WebFetchTool | null = null;

function getExecutor(): SystemExecutor {
  if (!systemExecutor) {
    systemExecutor = new SystemExecutor();
  }
  return systemExecutor;
}

function getWebSearchTool(settings?: any): WebSearchTool {
  const tavilyKey = settings?.webSearch?.tavilyApiKey || process.env.TAVILY_API_KEY;
  const braveKey = settings?.webSearch?.braveApiKey || process.env.BRAVE_API_KEY;
  
  if (!webSearchTool) {
    webSearchTool = new WebSearchTool(tavilyKey, braveKey);
  } else {
    // Update API keys if settings changed
    webSearchTool.setApiKeys(tavilyKey, braveKey);
  }
  return webSearchTool;
}

function getWebFetchTool(): WebFetchTool {
  if (!webFetchTool) {
    webFetchTool = new WebFetchTool();
  }
  return webFetchTool;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT DETECTION - Pattern matching to bypass AI for clear commands
// ═══════════════════════════════════════════════════════════════════════════

interface DetectedIntent {
  action: string;
  params: Record<string, any>;
  confidence: number;
  response: string;
}

/**
 * Generate quick responses for LocalBrain detected actions
 */
function getQuickResponse(action: string, params?: Record<string, any>): string {
  const responses: Record<string, string | ((p: any) => string)> = {
    // System controls
    'datetime_get': 'Checking the time...',
    'mute_toggle': 'Toggling mute!',
    'volume_set': (p) => `Setting volume to ${p?.level || 50}%`,
    'system_lock': 'Locking your PC...',
    'system_health_snapshot': 'Checking system health...',
    'system_battery_health': 'Checking battery health...',
    'system_disk_usage': 'Scanning disk usage...',
    'system_watch_start': 'Starting health monitoring...',
    'system_watch_stop': 'Stopping health monitoring...',
    'system_watch_status': 'Checking monitor status...',
    
    // Apps
    'open_app': (p) => `Opening ${p?.app || 'application'}...`,
    'launch_game': (p) => `Launching ${p?.target || 'game'}...`,
    
    // Calendar
    'calendar_today': 'Checking your calendar...',
    'calendar_add_event': (p) => `Adding "${p?.subject || 'event'}" to your calendar!`,
    
    // Email
    'email_unread_count': 'Checking your inbox...',
    'email_send': (p) => `Sending email to ${p?.to || 'recipient'}...`,
    
    // Reminders
    'reminder_create': (p) => `I'll remind you in ${p?.delay || 30} minutes!`,
    
    // Media
    'spotify_play': 'Playing music!',
    'spotify_pause': 'Pausing music...',
    'spotify_next': 'Skipping to next track...',
    
    // Smart home
    'hue_lights': (p) => `Turning lights ${p?.action || 'on'}...`,
    
    // Automation
    'smart_hotkey': 'Pressing keys...',
    'smart_scroll': (p) => `Scrolling ${p?.direction || 'down'}...`,
    
    // Files
    'organize_folder': (p) => `Organizing ${p?.path || 'folder'}...`
  };
  
  const generator = responses[action];
  if (typeof generator === 'function') {
    return generator(params);
  } else if (typeof generator === 'string') {
    return generator;
  }
  
  return 'On it!';
}

/**
 * Detect user intent from message patterns - bypasses AI for clear commands
 * Returns null if no clear intent detected (falls back to AI)
 */
function detectIntent(message: string): DetectedIntent | null {
  const msg = message.toLowerCase().trim();
  
  // ═══════════════════════════════════════════════════════════════
  // LOCALBRAIN FAST PATH - Use new intent classifier first
  // ═══════════════════════════════════════════════════════════════
  try {
    const localBrainResult = classifyIntentFast(msg);
    if (localBrainResult && localBrainResult.routing === 'fastpath' && localBrainResult.action) {
      console.log(`[Matrix Agent] LocalBrain FastPath: ${localBrainResult.action} (${(localBrainResult.confidence * 100).toFixed(0)}%)`);
      return {
        action: localBrainResult.action,
        params: localBrainResult.params || {},
        confidence: localBrainResult.confidence,
        response: getQuickResponse(localBrainResult.action, localBrainResult.params)
      };
    }
  } catch (e) {
    // LocalBrain failed, continue with legacy patterns
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FILE ORGANIZATION PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "C:\path\folder <- organize" or "organize C:\path\folder"
  // Also: "organize my Downloads", "clean up Desktop", "sort this folder"
  
  // Extract Windows path (C:\..., D:\..., etc.)
  const windowsPathMatch = message.match(/([A-Za-z]:\\[^"<>|*?\n]+)/i);
  const unixPathMatch = message.match(/(\/[^\s"<>|*?\n]+)/);
  const userFolderMatch = msg.match(/(?:my\s+)?(downloads|desktop|documents|pictures|videos|music)\s*(?:folder)?/i);
  
  const hasOrganizeKeyword = /\b(organize|sort|clean\s*up|tidy|categorize|arrange)\b/i.test(msg);
  const hasAnalyzeKeyword = /\b(analyze|scan|what'?s\s*in|list|show\s*contents?)\b/i.test(msg) && !hasOrganizeKeyword;
  
  if (hasOrganizeKeyword) {
    let targetPath: string | null = null;
    
    // Priority 1: Explicit Windows path
    if (windowsPathMatch) {
      targetPath = windowsPathMatch[1].trim().replace(/[<>"\s]+$/, ''); // Clean trailing chars
    }
    // Priority 2: Explicit Unix path  
    else if (unixPathMatch) {
      targetPath = unixPathMatch[1].trim();
    }
    // Priority 3: User folder shorthand (Downloads, Desktop, etc.)
    else if (userFolderMatch) {
      const folderName = userFolderMatch[1];
      const userHome = process.env.USERPROFILE || process.env.HOME || '';
      targetPath = require('path').join(userHome, folderName.charAt(0).toUpperCase() + folderName.slice(1).toLowerCase());
    }
    
    if (targetPath) {
      return {
        action: 'organize_folder',
        params: { path: targetPath },
        confidence: 0.95,
        response: `Organizing ${targetPath}! Files will be sorted into Images/, Documents/, Videos/, etc.`
      };
    }
  }
  
  // Analyze folder (without organizing)
  if (hasAnalyzeKeyword) {
    let targetPath: string | null = null;
    
    if (windowsPathMatch) {
      targetPath = windowsPathMatch[1].trim().replace(/[<>"\s]+$/, '');
    } else if (unixPathMatch) {
      targetPath = unixPathMatch[1].trim();
    } else if (userFolderMatch) {
      const folderName = userFolderMatch[1];
      const userHome = process.env.USERPROFILE || process.env.HOME || '';
      targetPath = require('path').join(userHome, folderName.charAt(0).toUpperCase() + folderName.slice(1).toLowerCase());
    }
    
    if (targetPath) {
      return {
        action: 'analyze_folder',
        params: { path: targetPath },
        confidence: 0.9,
        response: `Analyzing ${targetPath}...`
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FOLDER NAVIGATION PATTERNS (check BEFORE game launch)
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "find system32", "look for system32 folder", "open C:\Windows", "go to Downloads"
  // Handle requests to navigate to specific folders
  const folderNavKeywords = /\b(find|look\s*for|go\s*to|navigate\s*to|show\s*me|browse)\b/i;
  
  // Known system folders (with typo tolerance)
  const systemFolderMap: { [key: string]: string } = {
    'system32': 'C:\\Windows\\System32',
    'system 32': 'C:\\Windows\\System32',
    'sstem32': 'C:\\Windows\\System32',
    'sstem 32': 'C:\\Windows\\System32',
    'sys32': 'C:\\Windows\\System32',
    'windows folder': 'C:\\Windows',
    'program files': 'C:\\Program Files',
    'programfiles': 'C:\\Program Files',
    'program files x86': 'C:\\Program Files (x86)',
    'appdata': process.env.APPDATA || 'C:\\Users\\AppData',
    'temp folder': process.env.TEMP || 'C:\\Windows\\Temp',
  };
  
  // User folders
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const userFolderMap: { [key: string]: string } = {
    'downloads': require('path').join(userHome, 'Downloads'),
    'desktop': require('path').join(userHome, 'Desktop'),
    'documents': require('path').join(userHome, 'Documents'),
    'pictures': require('path').join(userHome, 'Pictures'),
    'videos': require('path').join(userHome, 'Videos'),
    'music': require('path').join(userHome, 'Music'),
  };
  
  // Check for folder navigation request
  if (folderNavKeywords.test(msg)) {
    // Check for explicit path first
    if (windowsPathMatch) {
      const folderPath = windowsPathMatch[1].trim().replace(/[<>"\s]+$/, '');
      return {
        action: 'open_file',
        params: { path: folderPath },
        confidence: 0.95,
        response: `Opening ${folderPath} in File Explorer!`
      };
    }
    
    // Check for system folders
    for (const [keyword, path] of Object.entries(systemFolderMap)) {
      if (msg.includes(keyword)) {
        return {
          action: 'open_file',
          params: { path },
          confidence: 0.9,
          response: `Opening ${path} in File Explorer!`
        };
      }
    }
    
    // Check for user folders
    for (const [keyword, path] of Object.entries(userFolderMap)) {
      if (msg.includes(keyword) && !hasOrganizeKeyword && !hasAnalyzeKeyword) {
        return {
          action: 'open_file',
          params: { path },
          confidence: 0.9,
          response: `Opening ${path} in File Explorer!`
        };
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // APP LAUNCH PATTERNS (check BEFORE game launch)
  // ═══════════════════════════════════════════════════════════════
  
  // File Explorer specific pattern
  // Catches: "open explorer", "launch file explorer", "windows explorer", typos like "exploerer"
  const explorerMatch = msg.match(/(?:open|launch|start|show|run)\s+(?:windows\s+)?(?:file\s+)?(?:explorer|exploerer|explor[eo]r|file\s*manager)/i) ||
                        msg.match(/(?:open|launch|start|show|run)\s+(?:my\s+)?(?:files?|folders?|file\s*system)/i);
  if (explorerMatch) {
    return {
      action: 'open_app',
      params: { app: 'explorer' },
      confidence: 0.95,
      response: `Opening File Explorer!`
    };
  }
  
  // General app launch pattern (simple apps at end of message)
  const appLaunchMatch = msg.match(/(?:open|launch|start)\s+(chrome|firefox|edge|safari|spotify|discord|slack|vscode|code|terminal|notepad|calculator|steam|explorer)$/i);
  if (appLaunchMatch) {
    return {
      action: 'open_app',
      params: { app: appLaunchMatch[1].toLowerCase() },
      confidence: 0.95,
      response: `Opening ${appLaunchMatch[1]}!`
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CALENDAR/EMAIL COMPLEX ACTIONS (fall through to AI)
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "add X to my calendar", "schedule X", "create event/meeting/appointment"
  // Pattern: "send email to X", "compose email", "write email about"
  // These require AI for proper extraction of dates, recipients, subjects, etc.
  const hasCalendarAction = /\b(add\s+.+?\s+to\s+(?:my\s+)?calendar|schedule\s+|create\s+(?:an?\s+)?(?:event|meeting|appointment|reminder)|calendar\s+(?:entry|event))/i.test(msg);
  const hasEmailAction = /\b(send\s+(?:an?\s+)?email|compose\s+(?:an?\s+)?(?:email|message)|write\s+(?:an?\s+)?email)/i.test(msg);
  
  if (hasCalendarAction || hasEmailAction) {
    // Let AI handle complex actions - it can issue multiple actions
    // including open_app + calendar/email operations
    return null;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // OFFICE/PRODUCTIVITY APP PATTERNS (simple open, no additional actions)
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "open outlook", "open up outlook", "launch word", etc.
  // Also supports natural "check outlook" phrasing by treating it as app-open.
  // Only matches simple "open/check X" without complex follow-up actions
  const officeApps = ['outlook', 'word', 'excel', 'powerpoint', 'onenote', 'teams', 'access', 'publisher'];
  const productivityApps = ['notion', 'obsidian', 'todoist', 'trello', 'asana', 'mail', 'calendar', 'notes'];
  const allProductivityApps = [...officeApps, ...productivityApps];
  
  const officeAppMatch = msg.match(new RegExp(`(?:open|launch|start|check)\\s+(?:up\\s+)?(?:my\\s+)?(${allProductivityApps.join('|')})\\b`, 'i'));
  if (officeAppMatch) {
    const appName = officeAppMatch[1].toLowerCase();
    const wantsEmailCount = appName === 'outlook' && /\b(unread|new)\s+emails?\b|\binbox\b|\bhow many\b/i.test(msg);
    if (wantsEmailCount) {
      return {
        action: 'email_unread_count',
        params: {},
        confidence: 0.93,
        response: 'Checking your inbox...'
      };
    }
    return {
      action: 'open_app',
      params: { app: appName },
      confidence: 0.95,
      response: `Opening ${appName.charAt(0).toUpperCase() + appName.slice(1)}!`
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // WEBSITE / URL PATTERNS (check BEFORE game launch to catch "open linkedin" etc.)
  // ═══════════════════════════════════════════════════════════════
  
  const WEBSITE_MAP: Record<string, string> = {
    'linkedin': 'https://www.linkedin.com',
    'youtube': 'https://www.youtube.com',
    'twitter': 'https://twitter.com',
    'x': 'https://x.com',
    'facebook': 'https://www.facebook.com',
    'instagram': 'https://www.instagram.com',
    'reddit': 'https://www.reddit.com',
    'github': 'https://github.com',
    'gmail': 'https://mail.google.com',
    'google': 'https://www.google.com',
    'amazon': 'https://www.amazon.com',
    'netflix': 'https://www.netflix.com',
    'twitch': 'https://www.twitch.tv',
    'tiktok': 'https://www.tiktok.com',
    'whatsapp web': 'https://web.whatsapp.com',
    'pinterest': 'https://www.pinterest.com',
    'stackoverflow': 'https://stackoverflow.com',
    'stack overflow': 'https://stackoverflow.com',
    'wikipedia': 'https://www.wikipedia.org',
    'chatgpt': 'https://chat.openai.com',
    'claude': 'https://claude.ai',
    'bing': 'https://www.bing.com',
    'yahoo': 'https://www.yahoo.com',
    'ebay': 'https://www.ebay.com',
    'hulu': 'https://www.hulu.com',
    'disney plus': 'https://www.disneyplus.com',
    'disney+': 'https://www.disneyplus.com',
    'crunchyroll': 'https://www.crunchyroll.com',
  };
  
  // Pattern: "open linkedin", "go to youtube", "open up reddit", "pull up gmail"
  const websiteOpenMatch = msg.match(/(?:open|go\s*to|pull\s*up|visit|browse|check|hop\s*on|get\s*on)\s+(?:up\s+)?(\w[\w\s+]*?)(?:\s+(?:real\s+quick|for\s+me|please|quick|now|rq))?(?:\s+.*)?$/i);
  if (websiteOpenMatch) {
    const siteName = websiteOpenMatch[1].trim().toLowerCase();
    const matchedUrl = WEBSITE_MAP[siteName];
    if (matchedUrl) {
      return {
        action: 'open_url',
        params: { url: matchedUrl },
        confidence: 0.95,
        response: `Opening ${siteName.charAt(0).toUpperCase() + siteName.slice(1)}! 🌐`
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // GAME LAUNCH PATTERNS (check AFTER app/folder/website patterns)
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "play ANY game", "pick a game", "choose a game for me", "play something"
  const pickAnyGameMatch = msg.match(/(?:play|launch|start)\s+(?:any|a|some)\s*(?:game|something)|(?:pick|choose|select)\s+(?:a\s+)?game|you\s+(?:pick|choose|decide)/i);
  if (pickAnyGameMatch) {
    // Get installed games and pick one
    const installedGames = systemDiscovery.getCapabilities().installedGames;
    if (installedGames.length > 0) {
      // Pick a random game from the installed list
      const randomIndex = Math.floor(Math.random() * Math.min(installedGames.length, 10));
      const selectedGame = installedGames[randomIndex];
      return {
        action: 'launch_game',
        params: { target: selectedGame.name },
        confidence: 0.95,
        response: `Let's play ${selectedGame.name}! 🎮`
      };
    }
  }
  
  // Pattern: "play X", "launch X", "start X game", "open X"
  // IMPORTANT: Only match if the game launch verb is near the START of the message
  // to avoid false positives like "hey open up linkedin real quick I need a post done"
  const gameLaunchMatch = msg.match(/^(?:(?:hey|yo|ok|okay|can you|please|could you|would you)\s+)?(?:play|launch|start|run|open)\s+(?:up\s+)?(.+?)(?:\s+game)?$/i);
  if (gameLaunchMatch) {
    const gameName = gameLaunchMatch[1].trim();
    // Exclude common non-game targets (includes typos and variations)
    const nonGameTargets = [
      'chrome', 'firefox', 'spotify', 'discord', 'slack', 'vscode', 'code', 
      'terminal', 'notepad', 'calculator', 'steam', 'edge', 'safari',
      // File explorer variations and typos
      'explorer', 'exploerer', 'explor', 'file manager', 'file explorer', 'windows explorer',
      'files', 'folders', 'file system', 'my files', 'my folders',
      // System folders (user likely wants to browse, not play)
      'system32', 'system 32', 'program files', 'windows', 'documents', 'downloads', 'desktop',
      // Office and productivity apps
      'outlook', 'word', 'excel', 'powerpoint', 'onenote', 'teams', 'access', 'publisher',
      'notion', 'obsidian', 'todoist', 'trello', 'asana', 'mail', 'calendar', 'notes',
      // Websites (handled by open_url, not launch_game)
      'linkedin', 'youtube', 'twitter', 'facebook', 'instagram', 'reddit', 'github',
      'gmail', 'google', 'amazon', 'netflix', 'twitch', 'tiktok', 'pinterest',
      'stackoverflow', 'wikipedia', 'chatgpt', 'bing', 'yahoo', 'ebay', 'hulu', 'crunchyroll'
    ];
    if (!nonGameTargets.some(app => gameName.toLowerCase().includes(app))) {
      // Check if it looks like a game name (more than one word or known game patterns)
      // Also reject if it contains conversational phrases that indicate this isn't just a game name
      const conversationalPhrases = /\b(i need|i want|real quick|for me|please|can you|could you|would you|right now|asap|help me)\b/i;
      const looksLikeGame = (gameName.includes(' ') || 
                            /\d/.test(gameName) || // Has numbers (e.g., "Elden Ring", "Left 4 Dead 2")
                            gameName.length > 6) &&  // Longer names more likely games
                            !conversationalPhrases.test(gameName); // But NOT conversational context
      
      if (looksLikeGame) {
        return {
          action: 'launch_game',
          params: { target: gameName },
          confidence: 0.85,
          response: `Launching ${gameName}!`
        };
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // URL PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  const urlMatch = message.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch && /\b(open|go\s*to|visit|browse)\b/i.test(msg)) {
    return {
      action: 'open_url',
      params: { url: urlMatch[1] },
      confidence: 0.95,
      response: `Opening ${urlMatch[1]}!`
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FILE CREATION PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "create a file called X in Y" or "create file X at Y"
  const hasCreateFileKeyword = /\b(create|make|new)\s+(a\s+)?file\b/i.test(msg);
  
  if (hasCreateFileKeyword && windowsPathMatch) {
    const basePath = windowsPathMatch[1].trim().replace(/[<>"\s]+$/, '');
    
    // Try to extract filename - look for "called X" or "named X"
    const filenameMatch = message.match(/(?:called|named)\s+["']?([^"'\n]+?)["']?\s*(?:please|thanks|$)/i) ||
                          message.match(/file\s+["']?([^"'\\/:\n]+?)["']?\s+(?:in|at|to)/i);
    
    if (filenameMatch) {
      let filename = filenameMatch[1].trim();
      // Add .txt if no extension
      if (!filename.includes('.')) {
        filename += '.txt';
      }
      const fullPath = require('path').join(basePath, filename);
      
      return {
        action: 'create_file',
        params: { path: fullPath, content: '' },
        confidence: 0.9,
        response: `Creating ${filename} in ${basePath}!`
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FASTPATH: CALENDAR PATTERNS (instant, no AI needed)
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "what's on my calendar today", "today's schedule", "my schedule"
  const todayCalendarMatch = msg.match(/(?:what'?s?\s+(?:on\s+)?(?:my\s+)?(?:calendar|schedule)\s*(?:today|for today)?|today'?s?\s+(?:calendar|schedule|events?)|my\s+(?:calendar|schedule)\s*(?:today)?$)/i);
  if (todayCalendarMatch) {
    return {
      action: 'calendar_today',
      params: {},
      confidence: 0.95,
      response: `Checking your schedule for today...`
    };
  }
  
  // Pattern: "add X to my calendar for DATE" with date/time extraction
  const addCalendarMatch = msg.match(/(?:add|put|schedule|create)\s+(.+?)\s+(?:to\s+(?:my\s+)?calendar|on\s+(?:my\s+)?calendar)\s*(?:for\s+)?(.+)?$/i) ||
                           msg.match(/(?:add|put|schedule|create)\s+(?:a\s+)?(?:calendar\s+)?(?:event|meeting|appointment)\s+(?:called\s+|named\s+|for\s+)?(.+?)(?:\s+(?:for|on|at)\s+(.+))?$/i);
  if (addCalendarMatch) {
    const subject = addCalendarMatch[1].trim();
    const dateTimeStr = addCalendarMatch[2]?.trim() || '';
    
    // Try to extract date and time
    let date: string | undefined;
    let time: string | undefined;
    
    // Check for time patterns
    const timeMatch = dateTimeStr.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (timeMatch) {
      time = timeMatch[1];
    }
    
    // Check for date patterns
    if (/today/i.test(dateTimeStr)) {
      date = 'today';
    } else if (/tomorrow/i.test(dateTimeStr)) {
      date = 'tomorrow';
    } else if (/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(dateTimeStr)) {
      date = dateTimeStr.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)?.[0];
    } else {
      // Try to extract date like "February 7th", "March 15"
      const dateMatch = dateTimeStr.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?)/i);
      if (dateMatch) {
        date = dateMatch[1];
      }
    }
    
    return {
      action: 'calendar_add_event',
      params: { subject, date, time },
      confidence: 0.90,
      response: `Adding "${subject}" to your calendar${date ? ` for ${date}` : ''}${time ? ` at ${time}` : ''}! 📅`
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FASTPATH: EMAIL PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "how many unread emails", "check my inbox", "any new emails"
  const unreadEmailMatch = msg.match(/(?:how\s+many\s+)?(?:unread\s+)?emails?|check\s+(?:my\s+)?inbox|(?:any|new)\s+emails?|inbox\s+status/i);
  if (unreadEmailMatch && !msg.includes('send') && !msg.includes('write') && !msg.includes('compose')) {
    return {
      action: 'email_unread_count',
      params: {},
      confidence: 0.85,
      response: `Checking your inbox...`
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FASTPATH: TIME/DATE PATTERNS (instant response)
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "what time is it", "what's the time", "current time"
  const timeMatch = msg.match(/(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:time|date)|(?:current|what)\s+(?:time|date)(?:\s+is\s+it)?|time\s*\?$|date\s*\?$)/i);
  if (timeMatch) {
    return {
      action: 'datetime_get',
      params: {},
      confidence: 0.98,
      response: `Let me check the time...`
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FASTPATH: REMINDER PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "remind me in X minutes/hours", "set a reminder for X"
  const reminderMatch = msg.match(/remind\s+me\s+(?:in\s+)?(\d+)\s*(min(?:ute)?s?|hours?|hrs?)\s*(?:to\s+)?(.+)?$/i) ||
                        msg.match(/set\s+(?:a\s+)?reminder\s+(?:for\s+)?(\d+)\s*(min(?:ute)?s?|hours?|hrs?)\s*(?:to\s+)?(.+)?$/i);
  if (reminderMatch) {
    const amount = parseInt(reminderMatch[1]);
    const unit = reminderMatch[2].toLowerCase();
    const message = reminderMatch[3]?.trim() || 'Reminder';
    
    // Convert to minutes
    let delay = amount;
    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      delay = amount * 60;
    }
    
    return {
      action: 'reminder_create',
      params: { title: 'Reminder', message, delay },
      confidence: 0.92,
      response: `Got it! I'll remind you in ${amount} ${unit}. ⏰`
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FASTPATH: SYSTEM CONTROLS
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern: "lock my computer", "lock screen", "lock pc"
  const lockMatch = msg.match(/lock\s+(?:my\s+)?(?:computer|screen|pc|workstation)/i);
  if (lockMatch) {
    return {
      action: 'system_lock',
      params: {},
      confidence: 0.95,
      response: `Locking your computer... 🔒`
    };
  }
  
  // Pattern: "mute", "unmute", "toggle mute"
  const muteMatch = msg.match(/^(?:mute|unmute|toggle\s+mute)$/i);
  if (muteMatch) {
    return {
      action: 'mute_toggle',
      params: {},
      confidence: 0.95,
      response: `Toggling mute... 🔇`
    };
  }
  
  // Pattern: "set volume to X", "volume X%"
  const volumeMatch = msg.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)(?:\s*%)?/i);
  if (volumeMatch) {
    const level = parseInt(volumeMatch[1]);
    return {
      action: 'volume_set',
      params: { level },
      confidence: 0.95,
      response: `Setting volume to ${level}%... 🔊`
    };
  }
  
  // No clear intent detected - fall back to AI
  return null;
}

/**
 * Add message to conversation history
 */
function addToHistory(role: 'user' | 'assistant', content: string): void {
  conversationHistory.push({ role, content, timestamp: Date.now() });
  
  // Trim history if too long
  if (conversationHistory.length > maxConversationHistory) {
    conversationHistory = conversationHistory.slice(-maxConversationHistory);
  }
  scheduleHistoryPersist();
}

/**
 * Clear conversation history
 */
function clearHistory(): void {
  conversationHistory = [];
  scheduleHistoryPersist();
}

/**
 * Get current history length
 */
function getHistoryLength(): number {
  return conversationHistory.length;
}

/**
 * Build context from conversation history for follow-up questions
 */
function buildConversationContext(): string {
  if (conversationHistory.length === 0) return '';
  
  const recentMessages = conversationHistory.slice(-6); // Last 6 messages
  return recentMessages.map(m => 
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 500)}`
  ).join('\n\n');
}

/**
 * Extract balanced JSON object from a string
 * Handles nested objects correctly by counting braces
 */
function extractBalancedJson(text: string): string | null {
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;
  
  let braceCount = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    
    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      
      if (braceCount === 0) {
        return text.substring(startIndex, i + 1);
      }
    }
  }
  
  return null;
}

// Smart Controller actions that are safe (read-only or low risk)
// EXPANDED: Most automation actions are safe - only credential-related are risky
const SAFE_SMART_ACTIONS = [
  'smart_screenshot', 'smart_mouse_position', 'smart_window_info', 'smart_get_windows',
  'vault_status', 'smart_scroll', 'smart_move_mouse', 'smart_move_mouse_circle', 'smart_move_mouse_direction', 'vault_lock',
  // These are now safe - they're just automation, not security-sensitive
  'smart_click', 'smart_focus_window', 'smart_type', 'smart_hotkey', 'smart_drag'
];

// Smart Controller actions that are risky - ONLY credential/security related
const RISKY_SMART_ACTIONS = [
  'login', 'vault_unlock', 'vault_auto_fill', 'smart_emergency_stop'
];

// Matrix Mode actions - safe (read-only or low-impact)
const SAFE_MATRIX_MODE_ACTIONS = [
  'memory_search', 'memory_recall', 'scheduler_list', 'scheduler_status',
  'integration_list', 'integration_status', 'browser_snapshot', 'browser_tabs',
  'canvas_show', 'canvas_hide', 'workflow_list', 'nodes_list', 'node_camera', 'node_screen', 'node_location', 'voice_speak',
  'system_health_snapshot', 'system_battery_health', 'system_disk_usage', 'system_watch_status',
  // Read-only file ops and safe operations
  'analyze_folder', 'list_folder', 'create_folder', 'clipboard_read', 'clipboard_write'
];

// Matrix Mode actions - moderate (state-changing but recoverable)
const MODERATE_MATRIX_MODE_ACTIONS = [
  'browser_navigate', 'browser_click', 'canvas_render', 'integration_execute',
  'scheduler_create', 'message_send', 'workflow_execute', 'node_notify', 'node_canvas',
  'system_watch_start', 'system_watch_stop',
  // File mutations that could cause data loss — elevated from safe
  'move_file', 'copy_file', 'organize_folder', 'batch_rename', 'rename_file', 'create_file'
];

// Matrix Mode actions - risky (destructive, irreversible, or remote execution)
const RISKY_MATRIX_MODE_ACTIONS = [
  'scheduler_delete', 'integration_connect', 'integration_disconnect',
  'nodes_command', 'workflow_delete',
  // Destructive file ops — elevated from safe
  'delete_file'
];

function classifyRisk(action: SystemAction | { action: string }): 'safe' | 'moderate' | 'risky' {
  if (RISKY_ACTIONS.includes(action.action)) {
    return 'risky';
  }
  
  // Smart Controller risky actions
  if (RISKY_SMART_ACTIONS.includes(action.action)) {
    return 'risky';
  }
  
  // Smart Controller safe actions
  if (SAFE_SMART_ACTIONS.includes(action.action)) {
    return 'safe';
  }
  
  // Matrix Mode safe actions
  if (SAFE_MATRIX_MODE_ACTIONS.includes(action.action)) {
    return 'safe';
  }
  
  // Matrix Mode moderate actions
  if (MODERATE_MATRIX_MODE_ACTIONS.includes(action.action)) {
    return 'moderate';
  }
  
  // Matrix Mode risky actions
  if (RISKY_MATRIX_MODE_ACTIONS.includes(action.action)) {
    return 'risky';
  }
  
  // Web search and fetch are safe - read-only operations
  if (action.action === 'web_search' || action.action === 'web_fetch') {
    return 'safe';
  }
  
  // Game launching is safe - just opens a game
  if (action.action === 'launch_game') {
    return 'safe';
  }
  
  if (action.action === 'open_app') {
    const appName = ((action as SystemAction).app || '').toLowerCase();
    if (SAFE_APPS.includes(appName)) {
      return 'safe';
    }
    return 'moderate';
  }
  
  if (action.action === 'open_url') {
    return 'safe';
  }
  
  // Smart click is moderate risk
  if (action.action === 'smart_click') {
    return 'moderate';
  }
  
  // Smart focus window is moderate
  if (action.action === 'smart_focus_window') {
    return 'moderate';
  }
  
  return 'moderate';
}

// System prompt for Matrix Agent - LEAN VERSION (intent detection handles common cases)
const MATRIX_AGENT_SYSTEM_PROMPT = `You're Matrix, the user's chill AI buddy with full PC control. Talk casually - you're friends, not a corporate bot.

VIBE: Be casual, use slang, match their energy. Say "yo", "nice", "gotcha", "bet", whatever feels natural. Use emojis sometimes. Be fun but still get shit done.

ACTIONS YOU CAN DO:
═════════════════
APPS/GAMES: launch_game(target), open_app(app), open_url(url), open_file(path), run_command(command)
CALENDAR: calendar_add_event(subject,date,time,location), calendar_read(start,end), calendar_today()
EMAIL: email_send(to,subject,body), email_read(folder,unreadOnly), email_unread_count()
CONTACTS: contacts_search(query)
NOTIFICATIONS: notification_show(title,message), reminder_create(title,message,time/delay,recurring)
SYSTEM: datetime_get(), system_lock(), volume_set(level), mute_toggle()
SYSTEM INTEL: system_health_snapshot(), system_battery_health(), system_disk_usage(), system_watch_start(intervalMs?,thresholds?), system_watch_stop(), system_watch_status()
MOUSE CURSOR (physical mouse pointer on screen):
  - smart_move_mouse(x,y) → move the MOUSE CURSOR to exact coordinates
  - smart_move_mouse_direction(direction,durationMs?,speed?) → move mouse continuously in a direction (left/right/up/down) for a duration. Use for "move right for 5 seconds", "slide left", "push up"
  - smart_move_mouse_circle(radius?,steps?,durationMs?) → move the mouse in a circle/wiggle pattern (ONLY for "wiggle", "circle", "spin", "shake", "jiggle")
  - smart_click(x,y,button) → click at coordinates
  - smart_scroll(direction,amount) → scroll up/down/left/right
  - smart_drag(x,y,target) → drag from one point to another
  IMPORTANT: "move my mouse right/left/up/down" = smart_move_mouse_direction. "wiggle/circle my mouse" = smart_move_mouse_circle. NEVER desktop_move (that's for icons).
KEYBOARD: smart_type(text), smart_hotkey(keys[])
SCREEN: smart_screenshot(quality), smart_focus_window(target), smart_get_windows(), smart_window_info()
DESKTOP ICONS (arrange icons on the desktop surface — NOT the mouse cursor):
  - desktop_list() → list desktop icons
  - desktop_move(icon,target,position) → move an ICON next to another icon. position: 'left'|'right'|'above'|'below'. NO COORDINATES.
  - desktop_find(name) → find an icon by name
  - desktop_arrange(arrangement) → arrange all icons
  IMPORTANT: desktop_move moves ICONS, not the mouse. "Move Freelancer next to Screenshot" = desktop_move. "Move my mouse" = smart_move_mouse.
FILES: organize_folder(path), analyze_folder(path), move_file(source,dest), copy_file(source,dest), delete_file(path), create_folder(path), create_file(path,content), list_folder(path), batch_rename(path,pattern)
  - For moving files on desktop: Use move_file(source,dest) with full paths, NOT smart_drag (which requires pixel coordinates)
  - smart_drag is ONLY for dragging UI elements when you have exact screen coordinates
BROWSER: browser_navigate(url), browser_snapshot(), browser_click(ref), browser_type(ref,text)
VAULT: vault_unlock(text), vault_lock(), vault_status(), vault_list(), vault_auto_fill(url), login(credentialId)
MEMORY: memory_search(query), memory_recall()
SCHEDULER: scheduler_create(name,cron,action), scheduler_list(), scheduler_run(taskId), scheduler_delete(taskId)
MESSAGING: message_send(channel,target,text)
VOICE: voice_speak(text)
CANVAS: canvas_show(), canvas_hide(), canvas_render(components)
INTEGRATIONS: spotify_play(query), spotify_pause(), spotify_next(), notion_search(query), notion_create(title,content), hue_lights(action,brightness,color), github_issues(owner,repo)
CLIPBOARD: clipboard_read(), clipboard_write(text)
WEB: web_search(query), web_fetch(url)
WORKFLOWS: workflow_create(name,steps), workflow_run(workflowId), workflow_list()
NODES (paired devices: phone, tablet, server — use nodes_list() first to get nodeId and capabilities):
  - nodes_list() → list paired nodes with id, name, capabilities (camera, screen, location, notifications, canvas, commands)
  - node_camera(nodeId) or node_camera(nodeId, { facing: "front"|"back" }) → capture photo from device camera
  - node_screen(nodeId) → capture screenshot from device screen
  - node_location(nodeId) → get device GPS (latitude, longitude)
  - node_notify(nodeId, title, body) → push notification to device
  - node_canvas(nodeId, html) → display HTML/content on device screen
  - nodes_command(nodeId, type, params) → raw command: type one of camera.capture, screen.capture, location.get, notification.send, canvas.display, shell.execute
  Chain of thought: 1) nodes_list to find nodeId and check capabilities 2) use the specific node_* action or nodes_command
SAFETY: smart_emergency_stop(), smart_resume()

RESPONSE FORMAT:
{"thinking":"quick plan","actions":[{"action":"name","params":{},"explanation":"what it does"}],"response":"casual message to user"}

RULES:
1. Just DO stuff - don't ask permission or over-explain
2. Use launch_game for games, open_app for apps
3. For direct app-open requests (e.g. "open outlook"), run open_app immediately; do NOT call smart_get_windows first unless user asks what is open
4. Chain actions together - open app, wait, type, etc.
5. Keep responses short and fun
6. Match the user's vibe - if they're hyped, be hyped back

EXAMPLES:
"Play Elden Ring" → {"actions":[{"action":"launch_game","params":{"target":"elden ring"}}],"response":"Launching!"}
"Play any game" → Pick first game from DETECTED GAMES list and use launch_game
"Pick a game for me" → Pick randomly from DETECTED GAMES list and use launch_game
"Open Chrome" → {"actions":[{"action":"open_app","params":{"app":"chrome"}}],"response":"Opening Chrome!"}
"Ctrl+S" → {"actions":[{"action":"smart_hotkey","params":{"keys":["ctrl","s"]}}],"response":"Saving!"}
"Scroll down" → {"actions":[{"action":"smart_scroll","params":{"direction":"down","amount":5}}],"response":"Scrolling!"}
"Move my mouse" → {"actions":[{"action":"smart_move_mouse_circle","params":{"radius":50,"steps":36,"durationMs":3000}}],"response":"Moving the mouse!"}
"Move my mouse to the right" → {"actions":[{"action":"smart_move_mouse_direction","params":{"direction":"right","durationMs":3000,"speed":200}}],"response":"Moving mouse to the right!"}
"Move my mouse right for 5 seconds" → {"actions":[{"action":"smart_move_mouse_direction","params":{"direction":"right","durationMs":5000,"speed":200}}],"response":"Moving mouse right for 5 seconds!"}
"Move my mouse left" → {"actions":[{"action":"smart_move_mouse_direction","params":{"direction":"left","durationMs":3000,"speed":200}}],"response":"Moving mouse left!"}
"Move my mouse slightly for 5 seconds" → {"actions":[{"action":"smart_move_mouse_circle","params":{"radius":20,"steps":36,"durationMs":5000}}],"response":"Moving the cursor for 5 seconds!"}
"Wiggle my mouse" → {"actions":[{"action":"smart_move_mouse_circle","params":{"radius":40,"steps":36,"durationMs":3000}}],"response":"Wiggling!"}
"Click at 500 300" → {"actions":[{"action":"smart_click","params":{"x":500,"y":300}}],"response":"Clicking!"}
⚠️ "move my mouse right/left/up/down" = smart_move_mouse_direction. "wiggle/circle my mouse" = smart_move_mouse_circle. "move Freelancer next to Screenshot" = desktop_move (ICON movement). NEVER confuse these.
"Turn on lights" → {"actions":[{"action":"hue_lights","params":{"action":"on"}}],"response":"Lights on!"}
"Add meeting to calendar for tomorrow at 2pm" → {"actions":[{"action":"calendar_add_event","params":{"subject":"meeting","date":"tomorrow","time":"2pm"}}],"response":"Added to your calendar!"}
"Drag Freelancer to the right of Screenshot file" → {"actions":[{"action":"desktop_move","params":{"icon":"Freelancer","target":"Screenshot","position":"right"}}],"response":"Moving Freelancer next to Screenshot!"}
"List desktop icons" → {"actions":[{"action":"desktop_list","params":{}}],"response":"Checking your desktop..."}
"Arrange desktop by name" → {"actions":[{"action":"desktop_arrange","params":{"arrangement":"by-name"}}],"response":"Organizing your desktop!"}
"What's on my schedule today?" → {"actions":[{"action":"calendar_today","params":{}}],"response":"Checking your calendar..."}
"Send email to john@example.com about the project" → {"actions":[{"action":"email_send","params":{"to":"john@example.com","subject":"About the project","body":"..."}}],"response":"Email sent!"}
"How many unread emails?" → {"actions":[{"action":"email_unread_count","params":{}}],"response":"Checking inbox..."}
"Remind me in 30 minutes to take a break" → {"actions":[{"action":"reminder_create","params":{"title":"Break time","message":"Take a break!","delay":30}}],"response":"I'll remind you!"}
"What time is it?" → {"actions":[{"action":"datetime_get","params":{}}],"response":"..."}
NODES: "Take a photo with my phone" → 1) nodes_list to get nodeId 2) node_camera(nodeId). "Where's my phone?" → nodes_list then node_location(nodeId). "Show this on my tablet" → node_canvas(nodeId, html). "Screenshot my phone" → node_screen(nodeId). "Remind me on my watch" → node_notify(nodeId, title, body).

IMPORTANT FOR "pick any game" REQUESTS:
When user asks you to pick/choose a game, LOOK at the DETECTED GAMES list provided and pick one using launch_game!
Do NOT say "I don't know what games you have" - the list is provided to you!`;

// Generate current date string for web search context
function getCurrentDateContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return now.toLocaleDateString('en-US', options);
}

function getCurrentYear(): number {
  return new Date().getFullYear();
}

// System prompt for Matrix Agent WITH web search capability
const MATRIX_AGENT_WEB_SEARCH_PROMPT = `You're Matrix, the user's chill AI buddy. You can control their PC AND search the web. Talk casually - you're friends, not a robot. Use slang, emojis, match their energy.

CURRENT DATE: ${getCurrentDateContext()}
CURRENT YEAR: ${getCurrentYear()}

IMPORTANT: When searching for current information (news, events, schedules, etc.), ALWAYS include the current year (${getCurrentYear()}) in your search query to get up-to-date results!

AVAILABLE ACTIONS:
- web_search: Search the web for information (params: query - the search query, maxResults - optional, default 5)
- web_fetch: Fetch and read content from a specific URL (params: url - the URL to fetch)
- open_app: Open an application (params: app - name of app like "chrome", "spotify", "vscode", "calculator", "steam")
- launch_game: Launch a game directly via Steam (params: target - game name like "left 4 dead 2", "cs2", "elden ring", etc.)
- open_url: Open a URL in the default browser (params: url - the URL to open)
- run_command: Run a shell command (params: command - the command to execute) [REQUIRES CONFIRMATION]
- open_file: Open a file with its default application (params: path - file path) [REQUIRES CONFIRMATION]

GAME LAUNCHING: Use launch_game for Steam games. Supports 150+ popular games including:
- FPS: "left 4 dead 2", "l4d2", "cs2", "apex legends", "helldivers 2", "deep rock galactic"
- Action/RPG: "elden ring", "cyberpunk 2077", "baldurs gate 3", "bg3", "skyrim"
- Multiplayer: "dota 2", "rocket league", "phasmophobia", "lethal company", "among us"

RESPONSE FORMAT:
Respond with JSON in this format:
{
  "thinking": "Brief explanation of what you understood and plan to do",
  "actions": [
    {
      "action": "action_name",
      "params": { "key": "value" },
      "explanation": "What this action does in plain English"
    }
  ],
  "response": "A friendly message to the user"
}

WHEN TO USE WEB SEARCH:
- When the user asks a question that requires current/external information
- When asked about topics you don't have knowledge about
- When asked "what is", "how to", "who is", "when did", etc.
- When asked about current events, news, weather, prices, schedules, etc.

RULES:
1. For questions, use web_search FIRST to find information, then provide a helpful answer
2. ALWAYS include the current year (${getCurrentYear()}) in searches about current events, schedules, or recent information
3. You can search multiple times if needed for complex questions
4. Use web_fetch to read full articles when search snippets aren't enough
5. Always cite sources when providing information from the web
6. For computer control actions, explain what you're about to do
7. Common app names: chrome, firefox, edge, safari, vscode, notepad, calculator, terminal, spotify, discord, slack

EXAMPLES:
User: "What's the latest news about AI?"
Response: { "thinking": "User wants current AI news, I'll search with the current year", "actions": [{"action": "web_search", "params": {"query": "latest AI news ${getCurrentYear()}"}, "explanation": "Searching for current AI news"}], "response": "Let me search for the latest AI news..." }

User: "Who won the Super Bowl?"
Response: { "thinking": "User wants sports info, searching with current year", "actions": [{"action": "web_search", "params": {"query": "Super Bowl ${getCurrentYear()} winner"}, "explanation": "Searching for Super Bowl winner"}], "response": "Searching for the latest Super Bowl winner..." }

User: "When do the Patriots play next?"
Response: { "thinking": "User wants current schedule info, need to search with current date", "actions": [{"action": "web_search", "params": {"query": "New England Patriots next game ${getCurrentDateContext().split(',')[1]?.trim() || getCurrentYear()}"}, "explanation": "Searching for Patriots schedule"}], "response": "Let me find the Patriots' upcoming game..." }

User: "Open Chrome and search for Python tutorials"
Response: { "thinking": "User wants Chrome opened AND to search for tutorials", "actions": [{"action": "open_app", "params": {"app": "chrome"}, "explanation": "Opening Chrome"}, {"action": "open_url", "params": {"url": "https://www.google.com/search?q=Python+tutorials"}, "explanation": "Going to Google search for Python tutorials"}], "response": "Opening Chrome and searching for Python tutorials!" }`;

interface MatrixAgentDeps {
  ipcMain: IpcMain;
  getSettings: () => any;
}

export function register(deps: MatrixAgentDeps): void {
  const { ipcMain, getSettings } = deps;

  // Initialize system discovery on startup - scan for installed games/apps
  console.log('[Matrix Agent] Initializing system discovery...');
  void loadHistoryFromDisk();
  systemDiscovery.initialize().then((capabilities) => {
    console.log(`[Matrix Agent] System scan complete: ${capabilities.installedGames.length} games, ${capabilities.installedApps.length} apps detected`);
  }).catch((error) => {
    console.warn('[Matrix Agent] System discovery failed:', error.message);
  });

  // Initialize new modules (LocalBrain, ActionEngine, Anticipator)
  console.log('[Matrix Agent] Initializing intelligence modules...');
  
  // LocalBrain - fast local intent classification
  initializeLocalBrain({ model: 'phi3', fallbackModel: 'llama3.2' }).then((brain) => {
    localBrainInitialized = true;
    brain.getStatus().then(status => {
      console.log(`[Matrix Agent] LocalBrain ready: ${status.available ? 'Ollama available' : 'FastPath only'}`);
    });
  }).catch((error) => {
    console.warn('[Matrix Agent] LocalBrain init failed (FastPath still works):', error.message);
  });

  // ActionEngine - parallel action execution
  const actionEngine = getActionEngine({ maxConcurrent: 5 });
  actionEngine.setExecutor(async (action, params) => {
    // Route through the existing system executor
    const result = await executeMatrixModeAction(action, params);
    return result;
  });
  actionEngineInitialized = true;
  console.log('[Matrix Agent] ActionEngine ready');

  // Anticipator - pattern learning
  initializeAnticipator().then((anticipator) => {
    anticipatorInitialized = true;
    const status = anticipator.getStatus();
    console.log(`[Matrix Agent] Anticipator ready: ${status.patternsCount} patterns loaded`);
  }).catch((error) => {
    console.warn('[Matrix Agent] Anticipator init failed:', error.message);
  });

  // Get system capabilities (for UI or debugging)
  ipcMain.handle('matrix-agent:get-system-info', async () => {
    const capabilities = systemDiscovery.getCapabilities();
    return {
      initialized: capabilities.initialized,
      steamInstalled: capabilities.steamInstalled,
      gameCount: capabilities.installedGames.length,
      appCount: capabilities.installedApps.length,
      games: capabilities.installedGames.slice(0, 50).map(g => ({ name: g.name, appId: g.appId })),
      apps: capabilities.installedApps.map(a => ({ name: a.name, type: a.type })),
      summary: systemDiscovery.getSystemSummary()
    };
  });

  // Rescan system (if user installs new games)
  ipcMain.handle('matrix-agent:rescan-system', async () => {
    const capabilities = await systemDiscovery.initialize();
    return {
      success: true,
      gameCount: capabilities.installedGames.length,
      appCount: capabilities.installedApps.length,
      games: capabilities.installedGames.map(g => ({ name: g.name, appId: g.appId }))
    };
  });

  // Add a Steam library path
  ipcMain.handle('matrix-agent:add-steam-path', async (event, libraryPath: string) => {
    if (!libraryPath || typeof libraryPath !== 'string') {
      return { success: false, error: 'Invalid path' };
    }
    
    systemDiscovery.addSteamLibraryPath(libraryPath.trim());
    
    // Rescan after adding
    const capabilities = await systemDiscovery.initialize();
    return {
      success: true,
      message: `Added Steam library path: ${libraryPath}`,
      gameCount: capabilities.installedGames.length,
      games: capabilities.installedGames.map(g => ({ name: g.name, appId: g.appId }))
    };
  });

  // Set multiple Steam library paths
  ipcMain.handle('matrix-agent:set-steam-paths', async (event, paths: string[]) => {
    if (!Array.isArray(paths)) {
      return { success: false, error: 'Invalid paths array' };
    }
    
    systemDiscovery.setSteamLibraryPaths(paths);
    
    // Rescan after setting
    const capabilities = await systemDiscovery.initialize();
    return {
      success: true,
      message: `Set ${paths.length} Steam library paths`,
      gameCount: capabilities.installedGames.length,
      games: capabilities.installedGames.map(g => ({ name: g.name, appId: g.appId }))
    };
  });

  // Get current Steam paths
  ipcMain.handle('matrix-agent:get-steam-paths', async () => {
    return systemDiscovery.getSteamPaths();
  });

  // Clear conversation history
  ipcMain.handle('matrix-agent:clear-history', async () => {
    clearHistory();
    return { success: true };
  });

  // Execute a Matrix Agent command
  ipcMain.handle('matrix-agent:execute', async (
    event, 
    message: string, 
    safetyMode: 'confirm-all' | 'smart' | 'speed' | 'off', 
    webSearchEnabled: boolean = false,
    intelligenceLevel: IntelligenceLevel = 'smart'
  ) => {
    const webContents = event.sender;
    
    try {
      // ═══════════════════════════════════════════════════════════════
      // DIRECT ACTION EXECUTION - Check if user sent raw JSON action
      // ═══════════════════════════════════════════════════════════════
      const trimmedMessage = message.trim();
      if (trimmedMessage.startsWith('{') && trimmedMessage.includes('"action"')) {
        try {
          const directAction = JSON.parse(trimmedMessage);
          if (directAction.action && typeof directAction.action === 'string') {
            console.log(`[Matrix Agent] Direct action detected: ${directAction.action}`);
            
            // Notify user we're executing directly
            webContents.send('matrix-agent:event', {
              type: 'direct-action',
              action: directAction.action,
              params: directAction.params
            });
            
            // Execute the action - route to correct executor
            let result: { success: boolean; message?: string; data?: any; error?: string };
            
            if (isMatrixModeHandlerAction(directAction.action)) {
              // Actions handled by executeMatrixModeAction (file ops, clipboard, web, integrations, etc.)
              if (needsMatrixMode(directAction.action)) {
                await ensureMatrixMode();
              }
              result = await executeMatrixModeAction(directAction.action, directAction.params || {});
            } else {
              // System actions → SystemExecutor (launch_game, open_app, open_url, smart_*, etc.)
              const executor = getExecutor();
              const systemAction: SystemAction = {
                action: directAction.action,
                ...directAction.params
              };
              try {
                const execResult = await executor.execute(systemAction);
                result = { success: execResult.success, message: execResult.message, data: execResult.result };
              } catch (execError: any) {
                result = { success: false, error: execError.message };
              }
            }
            
            // Send result back
            webContents.send('matrix-agent:event', {
              type: 'action-complete',
              action: directAction.action,
              result
            });
            
            // Add to history
            addToHistory('user', message);
            const responseMsg = result.success 
              ? `✅ ${directAction.action}: ${result.message || 'Completed successfully'}`
              : `❌ ${directAction.action}: ${result.error || 'Failed'}`;
            addToHistory('assistant', responseMsg);
            
            return {
              success: true,
              directExecution: true,
              action: directAction.action,
              result
            };
          }
        } catch (parseError) {
          // Not valid JSON, continue with normal AI processing
          console.log('[Matrix Agent] Message looks like JSON but failed to parse, using AI');
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // INTENT DETECTION - Fast-path for clear patterns (bypasses AI)
      // ═══════════════════════════════════════════════════════════════
      const detectedIntent = detectIntent(trimmedMessage);
      if (detectedIntent) {
        console.log(`[Matrix Agent] Intent detected: ${detectedIntent.action} (confidence: ${detectedIntent.confidence})`);
        
        // Notify user we're executing directly
        webContents.send('matrix-agent:event', {
          type: 'intent-detected',
          action: detectedIntent.action,
          params: detectedIntent.params,
          confidence: detectedIntent.confidence
        });
        
        // Execute the action - route to correct executor based on action type
        let result: { success: boolean; message?: string; data?: any; error?: string };
        
        if (isMatrixModeHandlerAction(detectedIntent.action)) {
          // Actions handled by executeMatrixModeAction (file ops, clipboard, web, integrations, etc.)
          if (needsMatrixMode(detectedIntent.action)) {
            await ensureMatrixMode();
          }
          result = await executeMatrixModeAction(detectedIntent.action, detectedIntent.params);
        } else {
          // System actions → SystemExecutor (launch_game, open_app, open_url, smart_*, etc.)
          const executor = getExecutor();
          const systemAction: SystemAction = {
            action: detectedIntent.action,
            ...detectedIntent.params
          };
          try {
            const execResult = await executor.execute(systemAction);
            result = { success: execResult.success, message: execResult.message, data: execResult.result };
          } catch (execError: any) {
            result = { success: false, error: execError.message };
          }
        }
        
        // Send result back
        webContents.send('matrix-agent:event', {
          type: 'action-complete',
          action: detectedIntent.action,
          result
        });
        
        // Add to history
        addToHistory('user', message);
        const responseMsg = result.success 
          ? `✅ ${detectedIntent.response || result.message || 'Done!'}`
          : `❌ ${detectedIntent.action}: ${result.error || 'Failed'}`;
        addToHistory('assistant', responseMsg);
        
        return {
          success: true,
          intentDetection: true,
          action: detectedIntent.action,
          result,
          response: detectedIntent.response
        };
      }
      
      // ═══════════════════════════════════════════════════════════════
      // NORMAL AI PROCESSING
      // ═══════════════════════════════════════════════════════════════
      
      // Get AI settings - use the user's chosen provider and model (including Ollama Cloud)
      const settings = getSettings();
      const activeProvider = settings?.activeProvider || 'ollama';
      const activeModel = settings?.activeModel ?? undefined;
      
      // Respect user's choice: Matrix uses whatever provider/model is selected in Settings.
      // Ollama Cloud, Anthropic, OpenAI, OpenRouter all work.
      aiRouter.setActiveProvider(activeProvider, activeModel);
      console.log(`[Matrix Agent] Using provider: ${activeProvider}, model: ${activeModel || 'default'}`);
      
      // Add user message to conversation history
      addToHistory('user', message);
      
      // Build conversation context for Smart Mode processing
      const smartContext: ConversationContext = {
        history: conversationHistory.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }))
      };
      
      // Process through Smart Mode for Smart/Genius levels
      let processedMessage = message;
      let smartModeInfo: { applied: number; suggested: number } | null = null;
      
      if (intelligenceLevel !== 'basic') {
        try {
          const smartProcessor = getSmartProcessor();
          const smartResult = await smartProcessor.process(message, intelligenceLevel, smartContext);
          
          if (smartResult.success) {
            processedMessage = smartResult.enhancementResult.enhancedPrompt;
            smartModeInfo = {
              applied: smartResult.enhancementResult.appliedEnhancements.length,
              suggested: smartResult.enhancementResult.suggestedEnhancements.length
            };
            
            console.log(`[Matrix Agent] Smart Mode (${intelligenceLevel}): Applied ${smartModeInfo.applied} enhancements`);
            
            // Send enhancement info to renderer
            if (smartModeInfo.applied > 0) {
              webContents.send('matrix-agent:event', {
                type: 'smart-mode-enhancements',
                intelligenceLevel,
                applied: smartResult.enhancementResult.appliedEnhancements,
                suggested: smartResult.enhancementResult.suggestedEnhancements
              });
            }
          }
        } catch (smartError: any) {
          console.warn('[Matrix Agent] Smart Mode processing failed, using original message:', smartError.message);
          // Continue with original message on error
        }
      }
      
      // Build context string for follow-up questions
      const conversationContextStr = buildConversationContext();
      const contextualMessage = conversationContextStr 
        ? `Previous conversation:\n${conversationContextStr}\n\nCurrent message: ${processedMessage}`
        : processedMessage;
      
      // Choose system prompt based on intelligence level and web search mode
      let systemPrompt = getSystemPrompt(intelligenceLevel, webSearchEnabled);
      
      // SMART: Inject system knowledge - tell the AI what's actually installed
      const systemKnowledge = systemDiscovery.getSystemSummary();
      const installedGames = systemDiscovery.getCapabilities().installedGames;
      
      if (systemKnowledge && installedGames.length > 0) {
        // Get game names for the AI to pick from
        const gameList = installedGames.slice(0, 25).map(g => g.name).join(', ');
        
        systemPrompt += `\n\n═══════════════════════════════════════════════════════════════
🎮 YOUR INSTALLED GAMES (use these for "pick any game" requests):
═══════════════════════════════════════════════════════════════
${gameList}

When user says "play any game" or "pick a game", PICK ONE FROM THIS LIST and use launch_game!
Example: If user says "play any game you want", respond with:
{"actions":[{"action":"launch_game","params":{"target":"${installedGames[0]?.name || 'game name'}"}}],"response":"Let's play ${installedGames[0]?.name || 'this game'}!"}

For specific game requests, also use launch_game. It works for ANY Steam game.`;
      } else if (systemKnowledge) {
        systemPrompt += `\n\n${systemKnowledge}

Use launch_game for ANY game - it will search Steam automatically.`;
      } else {
        // Even with no detected games, still tell the AI to use launch_game
        systemPrompt += `\n\n═══════════════════════════════════════════════════════════════
⚠️ NO GAMES DETECTED - But launch_game still works!
═══════════════════════════════════════════════════════════════
Steam game detection may not have found all games, but launch_game 
will STILL work - it searches Steam automatically. ALWAYS use it!`;
      }
      
      // Call AI with system prompt and context
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: contextualMessage }
      ];

      let fullResponse = '';
      let lastStreamEmit = 0;
      let receivedFirstChunk = false;

      // ═══════════════════════════════════════════════════════════════
      // PRE-FLIGHT CHECK - Verify AI provider is available
      // ═══════════════════════════════════════════════════════════════
      try {
        const providerTest = await Promise.race([
          aiRouter.testProvider(activeProvider),
          new Promise<{ success: false; error: string }>((resolve) => {
            setTimeout(() => resolve({ success: false, error: 'Provider connection check timed out' }), 5000);
          })
        ]);
        
        if (!providerTest.success) {
          console.warn(`[Matrix Agent] Provider ${activeProvider} not available:`, providerTest.error);
          
          // Send helpful error message to UI
          let errorMsg: string;
          if (activeProvider === 'ollama') {
            errorMsg = `❌ Ollama connection failed!\n\n` +
              `Check:\n` +
              `• Local: Is Ollama running? (ollama serve)\n` +
              `• Cloud: Ollama Cloud API key set in Settings?\n` +
              `• Endpoint/URL correct in Settings → AI Providers?\n\n` +
              `Go to Settings → AI Providers to configure.`;
          } else {
            errorMsg = `❌ ${activeProvider} provider is not configured.\n\nCheck your API key in Settings.`;
          }
          
          webContents.send('matrix-agent:event', {
            type: 'error',
            error: errorMsg
          });
          return { success: false, error: errorMsg };
        }
      } catch (prefightError: any) {
        console.warn('[Matrix Agent] Pre-flight check failed:', prefightError.message);
        // Continue anyway - the stream might still work
      }

      // Notify UI that streaming has started (reduces perceived "Processing request..." wait)
      webContents.send('matrix-agent:event', { type: 'agent-stream-start' });

      // ═══════════════════════════════════════════════════════════════
      // AI STREAM WITH TIMEOUT - Prevents stuck "Processing request..."
      // ═══════════════════════════════════════════════════════════════
      const STREAM_START_TIMEOUT = 45000; // 45 seconds to get first chunk
      const STREAM_TOTAL_TIMEOUT = 180000; // 3 minutes total timeout

      const streamPromise = aiRouter.stream(messages, (chunk) => {
        if (chunk.content) {
          receivedFirstChunk = true;
          fullResponse += chunk.content;
          // Emit stream chunks to UI (throttle to ~100ms to avoid IPC flood)
          const now = Date.now();
          if (now - lastStreamEmit > 100 || fullResponse.length < 80) {
            lastStreamEmit = now;
            webContents.send('matrix-agent:event', {
              type: 'agent-stream',
              chunk: chunk.content,
              fullText: fullResponse
            });
          }
        }
      }, { model: activeModel, maxTokens: 2048 });

      // Create timeout that gives feedback if no response received
      const startTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          if (!receivedFirstChunk) {
            reject(new Error(
              '⏱️ AI response timed out. The model may be:\n' +
              '• Loading (large models take time on first request)\n' +
              '• Unavailable (check if Ollama is running: ollama serve)\n' +
              '• Overloaded (try a smaller/faster model)\n\n' +
              'Check your AI provider settings or try again.'
            ));
          }
        }, STREAM_START_TIMEOUT);
      });

      const totalTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('⏱️ Response generation took too long. Try a simpler request or faster model.'));
        }, STREAM_TOTAL_TIMEOUT);
      });

      try {
        // Race between stream and timeouts
        await Promise.race([streamPromise, startTimeoutPromise, totalTimeoutPromise]);
      } catch (streamError: any) {
        // Send error to UI immediately
        console.error('[Matrix Agent] Stream error:', streamError.message);
        webContents.send('matrix-agent:event', {
          type: 'error',
          error: streamError.message
        });
        return { success: false, error: streamError.message };
      }

      // Send final stream state in case last chunk wasn't emitted
      webContents.send('matrix-agent:event', {
        type: 'agent-stream',
        chunk: '',
        fullText: fullResponse
      });

      // ═══════════════════════════════════════════════════════════════
      // EMPTY RESPONSE CHECK - Handle case where AI returns nothing
      // ═══════════════════════════════════════════════════════════════
      if (!fullResponse || fullResponse.trim().length === 0) {
        console.warn('[Matrix Agent] Received empty response from AI');
        const emptyErrorMsg = 'The AI model returned an empty response. This might indicate:\n' +
          '• The model is overloaded - try again in a moment\n' +
          '• The request was too complex - try a simpler command\n' +
          '• Check if your AI provider is working correctly in Settings';
        
        webContents.send('matrix-agent:event', {
          type: 'response',
          content: emptyErrorMsg,
          actions: []
        });
        return { success: true, response: emptyErrorMsg };
      }

      // Parse the AI response
      let parsed;
      try {
        // Try to extract JSON from response - find balanced braces
        const jsonMatch = extractBalancedJson(fullResponse);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        // If parsing fails, just send the text response
        addToHistory('assistant', fullResponse);
        webContents.send('matrix-agent:event', {
          type: 'response',
          content: fullResponse,
          actions: []
        });
        return { success: true, response: fullResponse };
      }

      // ═══ CHAIN OF THOUGHT — Surface thinking to UI and preserve in history ═══
      const thinkingText = parsed.thinking || null;
      const responseText = parsed.response || parsed.thinking || 'Processing...';
      
      // Send thinking step first (if AI provided reasoning)
      if (thinkingText && parsed.response) {
        webContents.send('matrix-agent:event', {
          type: 'thinking',
          content: thinkingText
        });
      }
      
      // Send main response
      webContents.send('matrix-agent:event', {
        type: 'response',
        content: responseText,
        thinking: thinkingText,
        actions: parsed.actions || []
      });

      // Process actions - collect results to feed back to AI for follow-up reasoning
      const actions = parsed.actions || [];
      const actionResults: Array<{ action: string; success: boolean; result?: any; error?: string }> = [];
      for (const actionData of actions) {
        const actionId = `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const systemAction: SystemAction = {
          action: actionData.action,
          ...actionData.params
        };
        
        // ═══ GUARDIAN — Validate action before anything else ═══
        const guardianVerdict: GuardianVerdict = validateAction(actionData.action, actionData.params);
        
        if (!guardianVerdict.allowed) {
          // Guardian blocked this action — send rejection to renderer
          webContents.send('matrix-agent:event', {
            type: 'action-result',
            actionId,
            success: false,
            error: guardianVerdict.reason
          });
          actionResults.push({
            action: actionData.action,
            success: false,
            error: guardianVerdict.reason
          });
          continue;
        }
        
        // Apply sanitized params if Guardian cleaned them
        if (guardianVerdict.sanitizedParams) {
          Object.assign(actionData.params, guardianVerdict.sanitizedParams);
          Object.assign(systemAction, guardianVerdict.sanitizedParams);
        }

        const riskLevel = classifyRisk(systemAction);
        // Safety modes:
        // - 'confirm-all': confirm every action
        // - 'smart': confirm risky + moderate actions (default)
        // - 'speed': only confirm risky actions (faster!)
        // - 'off': no confirmations (but Guardian minimum floor still applies!)
        let needsConfirm = false;
        if (safetyMode === 'confirm-all') {
          needsConfirm = true;
        } else if (safetyMode === 'off') {
          // Guardian minimum safety floor — even 'off' can't bypass these
          needsConfirm = guardianVerdict.requiresConfirmation;
        } else if (safetyMode === 'speed') {
          needsConfirm = riskLevel === 'risky' || guardianVerdict.requiresConfirmation;
        } else { // 'smart' (default)
          needsConfirm = riskLevel === 'risky' || riskLevel === 'moderate' || guardianVerdict.requiresConfirmation;
        }

        // Send action request to renderer
        webContents.send('matrix-agent:event', {
          type: 'action-request',
          actionId,
          action: actionData.action,
          params: actionData.params,
          explanation: actionData.explanation,
          riskLevel,
          needsConfirm
        });

        if (needsConfirm) {
          // Wait for user confirmation with proper cleanup
          const approved = await new Promise<boolean>((resolve) => {
            // Create timeout that will be cleaned up properly
            const timeoutId = setTimeout(() => {
              const pending = pendingActions.get(actionId);
              if (pending) {
                pendingActions.delete(actionId);
                console.log(`[Matrix Agent] Action ${actionId} timed out waiting for confirmation`);
                resolve(false);
              }
            }, PENDING_ACTION_TIMEOUT);
            
            // Store the pending action with cleanup info
            pendingActions.set(actionId, {
              id: actionId,
              action: systemAction,
              explanation: actionData.explanation,
              riskLevel,
              resolve: (result: boolean) => {
                // Clear the timeout when resolved
                clearTimeout(timeoutId);
                resolve(result);
              },
              createdAt: Date.now(),
              timeoutId
            });
          });

          if (!approved) {
            webContents.send('matrix-agent:event', {
              type: 'action-result',
              actionId,
              success: false,
              error: 'Action rejected by user'
            });
            continue;
          }
        }

        // Execute the action
        try {
          // Handle web search and web fetch specially
          if (actionData.action === 'web_search') {
            // Validate search query parameter
            if (!actionData.params?.query || typeof actionData.params.query !== 'string' || actionData.params.query.trim() === '') {
              throw new Error('Invalid or missing search query parameter');
            }
            
            const searchTool = getWebSearchTool(settings);
            const searchStartTime = Date.now();
            
            const searchResult = await searchTool.execute({
              query: actionData.params.query.trim(),
              maxResults: actionData.params.maxResults || 5
            });
            
            const searchDuration = Date.now() - searchStartTime;
            const isCached = searchResult.cached || false;
            
            webContents.send('matrix-agent:event', {
              type: 'action-result',
              actionId,
              success: true,
              result: `Found ${searchResult.results.length} results${isCached ? ' (cached)' : ''} in ${searchDuration}ms`,
              searchResults: searchResult.results
            });
            
            // If Tavily provided a direct answer, use it (much faster!)
            if (searchResult.answer && searchResult.answer.length > 20) {
              console.log('[Matrix Agent] Using Tavily direct answer');
              
              const answer = searchResult.answer;
              addToHistory('assistant', answer);
              
              webContents.send('matrix-agent:event', {
                type: 'web-search-answer',
                answer,
                sources: searchResult.results.slice(0, 3).map(r => ({ title: r.title, url: r.url })),
                fromCache: isCached,
                searchTime: searchDuration
              });
            } else {
              // Build search summary for AI to synthesize
              const searchSummary = searchResult.results.map((r, i) => 
                `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`
              ).join('\n\n');
              
              // Get conversation context for better answers
              const recentContext = buildConversationContext();
              
              // Get AI to summarize the results with STREAMING
              const summaryMessages = [
                { 
                  role: 'system' as const, 
                  content: `You are a helpful assistant. Based on the search results provided, give a concise, informative answer to the user's question. 
IMPORTANT RULES:
- Keep your response under 300 words
- Be direct and factual
- Cite sources when relevant
- If results are empty or unhelpful, say so honestly and suggest alternatives
- NEVER repeat phrases or sentences
- Do not include promotional content or spam` 
                },
                { 
                  role: 'user' as const, 
                  content: searchResult.results.length > 0 
                    ? `${recentContext ? `Context:\n${recentContext}\n\n` : ''}Original question: "${message}"\n\nSearch results:\n${searchSummary}\n\nPlease provide a helpful answer based on these results.`
                    : `Original question: "${message}"\n\nUnfortunately, the search didn't return useful results. Please let the user know and suggest how they might find the information.`
                }
              ];
              
              let summaryResponse = '';
              const maxResponseLength = 3000;
              let lastStreamTime = Date.now();
              let streamBuffer = '';
              const SUMMARIZATION_TIMEOUT = 30000; // 30 second timeout for AI summarization
              
              // Stream the response to the UI for better UX with timeout
              const streamPromise = aiRouter.stream(summaryMessages, (chunk) => {
                if (chunk.content && summaryResponse.length < maxResponseLength) {
                  summaryResponse += chunk.content;
                  streamBuffer += chunk.content;
                  
                  // Send streaming updates every 100ms or when buffer is large enough
                  const now = Date.now();
                  if (now - lastStreamTime > 100 || streamBuffer.length > 50) {
                    webContents.send('matrix-agent:event', {
                      type: 'web-search-stream',
                      chunk: streamBuffer,
                      fullText: summaryResponse
                    });
                    streamBuffer = '';
                    lastStreamTime = now;
                  }
                }
              }, { model: activeModel, maxTokens: 512 });
              
              const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error('AI summarization timeout')), SUMMARIZATION_TIMEOUT);
              });
              
              try {
                await Promise.race([streamPromise, timeoutPromise]);
              } catch (timeoutError: any) {
                console.warn('[Matrix Agent] AI summarization timed out:', timeoutError.message);
                if (summaryResponse.length === 0) {
                  // If we got nothing, provide a fallback
                  summaryResponse = `Search found ${searchResult.results.length} results for "${actionData.params.query}". ` +
                    `The AI summarization timed out, but you can view the sources below for more information.`;
                }
                // Otherwise, use what we have so far
              }
              
              // Truncate if too long and detect repetition
              if (summaryResponse.length > maxResponseLength) {
                summaryResponse = summaryResponse.substring(0, maxResponseLength) + '...';
              }
              
              // Detect and fix repetitive content
              const words = summaryResponse.split(/\s+/);
              if (words.length > 20) {
                const phrases = new Map<string, number>();
                for (let i = 0; i < words.length - 3; i++) {
                  const phrase = words.slice(i, i + 3).join(' ');
                  phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
                }
                for (const [phrase, count] of phrases) {
                  if (count > 3) {
                    console.warn('[Matrix Agent] Detected repetitive output, truncating');
                    const firstIndex = summaryResponse.indexOf(phrase);
                    if (firstIndex > 100) {
                      summaryResponse = summaryResponse.substring(0, firstIndex + phrase.length) + 
                        '\n\n[Response truncated due to repetition. Please try again.]';
                    }
                    break;
                  }
                }
              }
              
              // Add to conversation history
              addToHistory('assistant', summaryResponse);
              
              // Send the final summarized answer
              webContents.send('matrix-agent:event', {
                type: 'web-search-answer',
                answer: summaryResponse,
                sources: searchResult.results.slice(0, 3).map(r => ({ title: r.title, url: r.url })),
                fromCache: isCached,
                searchTime: searchDuration
              });
            }
          } else if (actionData.action === 'web_fetch') {
            const fetchTool = getWebFetchTool();
            const fetchResult = await fetchTool.execute({
              url: actionData.params.url
            });
            
            webContents.send('matrix-agent:event', {
              type: 'action-result',
              actionId,
              success: true,
              result: `Fetched: ${fetchResult.title}`,
              fetchedContent: {
                title: fetchResult.title,
                url: fetchResult.url,
                content: fetchResult.content.substring(0, 2000) // Limit content shown
              }
            });
          } else if (isMatrixModeHandlerAction(actionData.action)) {
            // Matrix Mode / file ops / clipboard / integrations (only init if needed)
            if (needsMatrixMode(actionData.action)) {
              await ensureMatrixMode();
            }
            const result = await executeMatrixModeAction(actionData.action, actionData.params);
            
            // Record action for Anticipator (learning)
            if (result.success && anticipatorInitialized) {
              try {
                getAnticipator().recordAction(actionData.action, actionData.params, true);
              } catch (e) {
                // Silent - don't break action flow
              }
            }
            
            webContents.send('matrix-agent:event', {
              type: 'action-result',
              actionId,
              success: result.success,
              result: result.message || result.data,
              error: result.success ? undefined : result.error
            });
          } else {
            // Regular system actions
            const executor = getExecutor();
            let result;
            try {
              result = await executor.execute(systemAction);
              
              // Log failures for debugging
              if (!result.success) {
                console.error(`[Matrix Agent] Action failed: ${actionData.action}`, {
                  params: actionData.params,
                  error: result.message
                });
              }
            } catch (execError: any) {
              console.error(`[Matrix Agent] Action execution error: ${actionData.action}`, execError);
              result = {
                success: false,
                message: `Execution error: ${execError.message || 'Unknown error'}`
              };
            }
            
            // Record action for Anticipator (learning) - only on success
            if (result.success && anticipatorInitialized) {
              try {
                getAnticipator().recordAction(actionData.action, actionData.params, true);
              } catch (e) {
                // Silent - don't break action flow
              }
            }
            
            // Store result for potential feedback to AI
            actionResults.push({
              action: actionData.action,
              success: result.success,
              result: result.success ? result.message : undefined,
              error: result.success ? undefined : (result.message || 'Action failed')
            });
            
            webContents.send('matrix-agent:event', {
              type: 'action-result',
              actionId,
              success: result.success,
              result: result.success ? result.message : undefined,
              error: result.success ? undefined : (result.message || 'Action failed')
            });
          }
        } catch (execError: any) {
          // Store error result
          actionResults.push({
            action: actionData.action,
            success: false,
            error: execError.message
          });
          webContents.send('matrix-agent:event', {
            type: 'action-result',
            actionId,
            success: false,
            error: execError.message
          });
        }
      }

      // ═══ CHAIN OF THOUGHT — Feed action results back to AI for follow-up ═══
      // If actions had failures or produced data the user should know about,
      // give the AI a chance to reason about the outcomes and respond naturally.
      const hasFailures = actionResults.some(r => !r.success);
      const hasDataResults = actionResults.some(r => r.success && r.result);
      
      if (actionResults.length > 0 && (hasFailures || hasDataResults)) {
        try {
          const resultsSummary = actionResults.map(r => 
            r.success 
              ? `✅ ${r.action}: ${r.result || 'OK'}` 
              : `❌ ${r.action}: ${r.error || 'Failed'}`
          ).join('\n');
          
          const followUpPrompt = hasFailures
            ? `Some actions had issues. Here are the results:\n${resultsSummary}\n\nBriefly tell the user what happened and suggest a fix if needed. Keep it casual and short.`
            : `Actions completed. Here are the results:\n${resultsSummary}\n\nBriefly summarize what happened for the user. Keep it casual and short — don't repeat yourself if you already told them.`;
          
          // Add original response to history before follow-up
          const fullAssistantMsg = thinkingText && parsed.response
            ? `[Thinking: ${thinkingText}] ${parsed.response}`
            : responseText;
          addToHistory('assistant', fullAssistantMsg);
          
          // Build follow-up messages with conversation context
          const followUpMessages = [
            { role: 'system' as const, content: `You're Matrix, the user's chill AI buddy. Briefly summarize action results for the user. Keep it casual, short, and helpful. Don't use JSON — just talk naturally.` },
            { role: 'user' as const, content: followUpPrompt }
          ];
          
          let followUpResponse = '';
          await aiRouter.stream(followUpMessages, (chunk: any) => {
            const text = typeof chunk === 'string' ? chunk : chunk?.content || '';
            if (text) {
              followUpResponse += text;
              webContents.send('matrix-agent:event', {
                type: 'stream-chunk',
                content: text
              });
            }
          }, { model: activeModel });
          
          // Extract just the text (follow-up should be plain text, not JSON)
          const followUpText = followUpResponse.replace(/```[\s\S]*?```/g, '').trim();
          if (followUpText) {
            // Try to parse as JSON in case model wraps it
            let displayText = followUpText;
            try {
              const followUpJson = JSON.parse(extractBalancedJson(followUpText) || '{}');
              displayText = followUpJson.response || followUpJson.thinking || followUpText;
            } catch { /* use raw text */ }
            
            webContents.send('matrix-agent:event', {
              type: 'follow-up',
              content: displayText,
              actionResults
            });
            addToHistory('assistant', displayText);
          }
        } catch (followUpError: any) {
          // Follow-up reasoning failed — not critical, log and move on
          console.warn('[Matrix Agent] Follow-up reasoning failed:', followUpError.message);
        }
      } else {
        // No follow-up needed — just add the response to history
        const fullAssistantMsg = thinkingText && parsed.response
          ? `[Thinking: ${thinkingText}] ${parsed.response}`
          : responseText;
        addToHistory('assistant', fullAssistantMsg);
      }

      return { success: true, response: parsed.response };
      
    } catch (error: any) {
      console.error('[Matrix Agent] Error:', error);
      
      webContents.send('matrix-agent:event', {
        type: 'error',
        error: error.message
      });
      
      return { success: false, error: error.message };
    }
  });

  // Confirm or reject an action
  ipcMain.handle('matrix-agent:confirm', async (event, actionId: string, approved: boolean) => {
    const pending = pendingActions.get(actionId);
    if (pending) {
      pending.resolve(approved);
      pendingActions.delete(actionId);
      return { success: true };
    }
    return { success: false, error: 'Action not found or already processed' };
  });

  // Cancel all pending actions
  ipcMain.handle('matrix-agent:cancel', async () => {
    for (const [id, pending] of pendingActions) {
      // Clear the timeout before resolving
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pending.resolve(false);
    }
    pendingActions.clear();
    return { success: true };
  });

  // Configure Matrix Agent
  ipcMain.handle('matrix-agent:configure', async (event, config: MatrixAgentConfig) => {
    configureMatrixAgent(config);
    return { 
      success: true,
      config: {
        maxConversationHistory: maxConversationHistory,
        pendingActionTimeout: PENDING_ACTION_TIMEOUT
      }
    };
  });

  // Get current configuration
  ipcMain.handle('matrix-agent:get-config', async () => {
    return {
      maxConversationHistory: maxConversationHistory,
      pendingActionTimeout: PENDING_ACTION_TIMEOUT,
      pendingActionsCount: pendingActions.size,
      historyLength: getHistoryLength()
    };
  });

  // Get pending actions status
  ipcMain.handle('matrix-agent:get-pending', async () => {
    const pending: Array<{ id: string; action: string; createdAt: number; riskLevel: string }> = [];
    for (const [id, action] of pendingActions) {
      pending.push({
        id,
        action: action.action.action,
        createdAt: action.createdAt,
        riskLevel: action.riskLevel
      });
    }
    return { pending, count: pending.length };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW MODULE HANDLERS - LocalBrain, ActionEngine, Anticipator
  // ═══════════════════════════════════════════════════════════════════════════

  // Get module status
  ipcMain.handle('matrix-agent:get-module-status', async () => {
    const localBrain = getLocalBrain();
    const actionEngine = getActionEngine();
    const anticipator = getAnticipator();
    
    return {
      localBrain: localBrainInitialized ? await localBrain.getStatus() : { available: false },
      actionEngine: actionEngineInitialized ? actionEngine.getStatus() : { available: false },
      anticipator: anticipatorInitialized ? anticipator.getStatus() : { enabled: false, patternsCount: 0 }
    };
  });

  // Get predictions from Anticipator
  ipcMain.handle('matrix-agent:get-predictions', async () => {
    if (!anticipatorInitialized) {
      return { predictions: [], suggestions: [] };
    }
    
    const anticipator = getAnticipator();
    const predictions = anticipator.predict();
    const suggestions = anticipator.getSuggestions();
    
    return { predictions: predictions.predictions, suggestions };
  });

  // Get action queue status
  ipcMain.handle('matrix-agent:get-action-queue', async () => {
    if (!actionEngineInitialized) {
      return { queue: [], running: [], stats: {} };
    }
    
    const engine = getActionEngine();
    return {
      queue: engine.getQueue(),
      running: engine.getRunning(),
      stats: engine.getStatus()
    };
  });

  // Queue action for parallel execution
  ipcMain.handle('matrix-agent:queue-action', async (event, action: string, params: Record<string, any>, priority?: string) => {
    if (!actionEngineInitialized) {
      return { success: false, error: 'ActionEngine not initialized' };
    }
    
    const engine = getActionEngine();
    const id = engine.enqueue(action, params, { priority: (priority as any) || 'normal' });
    return { success: true, id };
  });

  // Queue multiple actions in parallel
  ipcMain.handle('matrix-agent:queue-parallel', async (event, actions: Array<{ action: string; params?: Record<string, any> }>) => {
    if (!actionEngineInitialized) {
      return { success: false, error: 'ActionEngine not initialized' };
    }
    
    const engine = getActionEngine();
    const ids = engine.queueParallel(actions);
    return { success: true, ids };
  });

  // Clear Anticipator patterns
  ipcMain.handle('matrix-agent:clear-patterns', async () => {
    if (!anticipatorInitialized) {
      return { success: false };
    }
    
    const anticipator = getAnticipator();
    anticipator.clearPatterns();
    return { success: true };
  });

  // Start the cleanup interval
  startPendingActionsCleanup();

  console.log('✅ Matrix Agent IPC handlers registered (with Smart Mode + Intelligence Modules)');
}
