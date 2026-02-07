/**
 * AgentPrime Plugin System
 * 
 * Foundation for extensibility:
 * - Plugin discovery and loading
 * - Lifecycle management (activate/deactivate)
 * - Hook system for extending functionality
 * - Sandboxed execution
 * - Plugin configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as vm from 'vm';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';

// Plugin permission levels
export type PluginPermission = 'fs:read' | 'fs:write' | 'net' | 'env' | 'shell' | 'ai';

// Sandboxed plugin context
interface SandboxGlobals {
  console: Pick<Console, 'log' | 'warn' | 'error' | 'info'>;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  Promise: typeof Promise;
  JSON: typeof JSON;
  Math: typeof Math;
  Date: typeof Date;
  Array: typeof Array;
  Object: typeof Object;
  String: typeof String;
  Number: typeof Number;
  Boolean: typeof Boolean;
  Error: typeof Error;
  Map: typeof Map;
  Set: typeof Set;
  Buffer: typeof Buffer;
}

/**
 * Plugin metadata from plugin.json
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string; // Entry point file
  activationEvents?: string[]; // When to activate (e.g., 'onLanguage:python')
  contributes?: {
    commands?: Array<{
      id: string;
      title: string;
      category?: string;
    }>;
    themes?: Array<{
      id: string;
      label: string;
      path: string;
    }>;
    languages?: Array<{
      id: string;
      extensions: string[];
      configuration?: string;
    }>;
    snippets?: Array<{
      language: string;
      path: string;
    }>;
  };
  dependencies?: Record<string, string>;
  engines?: {
    agentprime: string;
  };
}

/**
 * Plugin instance
 */
export interface Plugin {
  manifest: PluginManifest;
  path: string;
  isActive: boolean;
  exports?: PluginExports;
  error?: Error;
}

/**
 * Plugin exports (what the plugin provides)
 */
export interface PluginExports {
  activate?: (context: PluginContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
  [key: string]: any;
}

/**
 * Context passed to plugins
 */
export interface PluginContext {
  pluginPath: string;
  storagePath: string;
  subscriptions: Disposable[];
  
  // APIs available to plugins
  commands: {
    registerCommand: (id: string, handler: (...args: any[]) => any) => Disposable;
    executeCommand: (id: string, ...args: any[]) => Promise<any>;
  };
  
  workspace: {
    getWorkspacePath: () => string | null;
    onDidOpenFile: (handler: (filePath: string) => void) => Disposable;
    onDidSaveFile: (handler: (filePath: string) => void) => Disposable;
  };
  
  editor: {
    getActiveFile: () => { path: string; content: string } | null;
    insertText: (text: string) => void;
    showInformationMessage: (message: string) => void;
    showErrorMessage: (message: string) => void;
  };
  
  ai: {
    chat: (prompt: string, context?: any) => Promise<string>;
    complete: (prefix: string, suffix?: string) => Promise<string>;
  };
}

/**
 * Disposable for cleanup
 */
export interface Disposable {
  dispose: () => void;
}

/**
 * Hook types for extending AgentPrime
 */
export type HookType = 
  | 'onFileOpen'
  | 'onFileSave'
  | 'onEditorChange'
  | 'onCommand'
  | 'onAIResponse'
  | 'onError'
  | 'onThemeChange'
  | 'onWorkspaceChange';

/**
 * Plugin Manager - Core of the plugin system
 */
export class PluginManager extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private hooks: Map<HookType, Set<(...args: any[]) => void>> = new Map();
  private commands: Map<string, (...args: any[]) => any> = new Map();
  private pluginsPath: string;
  private storagePath: string;

  constructor(pluginsPath: string, storagePath: string) {
    super();
    this.pluginsPath = pluginsPath;
    this.storagePath = storagePath;
    
    // Initialize hook maps
    const hookTypes: HookType[] = [
      'onFileOpen', 'onFileSave', 'onEditorChange', 'onCommand',
      'onAIResponse', 'onError', 'onThemeChange', 'onWorkspaceChange'
    ];
    
    for (const hook of hookTypes) {
      this.hooks.set(hook, new Set());
    }
  }

  /**
   * Discover and load all plugins
   */
  async discoverPlugins(): Promise<void> {
    console.log(`[PluginManager] Discovering plugins in ${this.pluginsPath}`);
    
    if (!fs.existsSync(this.pluginsPath)) {
      fs.mkdirSync(this.pluginsPath, { recursive: true });
      console.log(`[PluginManager] Created plugins directory`);
      return;
    }

    const entries = fs.readdirSync(this.pluginsPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(this.pluginsPath, entry.name);
        await this.loadPlugin(pluginPath);
      }
    }

    console.log(`[PluginManager] Discovered ${this.plugins.size} plugins`);
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginPath: string): Promise<boolean> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[PluginManager] No plugin.json found in ${pluginPath}`);
      return false;
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);

      // Validate manifest
      if (!manifest.id || !manifest.name || !manifest.main) {
        console.error(`[PluginManager] Invalid manifest in ${pluginPath}`);
        return false;
      }

      // Check if already loaded
      if (this.plugins.has(manifest.id)) {
        console.warn(`[PluginManager] Plugin ${manifest.id} already loaded`);
        return false;
      }

      const plugin: Plugin = {
        manifest,
        path: pluginPath,
        isActive: false
      };

      this.plugins.set(manifest.id, plugin);
      console.log(`[PluginManager] Loaded plugin: ${manifest.name} v${manifest.version}`);
      
      this.emit('pluginLoaded', plugin);
      return true;
    } catch (error: any) {
      console.error(`[PluginManager] Failed to load plugin from ${pluginPath}:`, error.message);
      return false;
    }
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    
    if (!plugin) {
      console.error(`[PluginManager] Plugin ${pluginId} not found`);
      return false;
    }

    if (plugin.isActive) {
      console.warn(`[PluginManager] Plugin ${pluginId} already active`);
      return true;
    }

    try {
      const mainPath = path.join(plugin.path, plugin.manifest.main);
      
      if (!fs.existsSync(mainPath)) {
        throw new Error(`Main file not found: ${mainPath}`);
      }

      // Load plugin module
      const pluginModule = require(mainPath);
      plugin.exports = pluginModule;

      // Create plugin context
      const context = this.createPluginContext(plugin);

      // Call activate
      if (plugin.exports?.activate) {
        await plugin.exports.activate(context);
      }

      plugin.isActive = true;
      console.log(`[PluginManager] Activated plugin: ${plugin.manifest.name}`);
      
      this.emit('pluginActivated', plugin);
      return true;
    } catch (error: any) {
      plugin.error = error;
      console.error(`[PluginManager] Failed to activate ${pluginId}:`, error.message);
      return false;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    
    if (!plugin || !plugin.isActive) {
      return false;
    }

    try {
      if (plugin.exports?.deactivate) {
        await plugin.exports.deactivate();
      }

      plugin.isActive = false;
      console.log(`[PluginManager] Deactivated plugin: ${plugin.manifest.name}`);
      
      this.emit('pluginDeactivated', plugin);
      return true;
    } catch (error: any) {
      console.error(`[PluginManager] Failed to deactivate ${pluginId}:`, error.message);
      return false;
    }
  }

  /**
   * Create context for a plugin
   */
  private createPluginContext(plugin: Plugin): PluginContext {
    const pluginStoragePath = path.join(this.storagePath, plugin.manifest.id);
    
    if (!fs.existsSync(pluginStoragePath)) {
      fs.mkdirSync(pluginStoragePath, { recursive: true });
    }

    const subscriptions: Disposable[] = [];

    return {
      pluginPath: plugin.path,
      storagePath: pluginStoragePath,
      subscriptions,

      commands: {
        registerCommand: (id: string, handler: (...args: any[]) => any) => {
          const fullId = `${plugin.manifest.id}.${id}`;
          this.commands.set(fullId, handler);
          
          return {
            dispose: () => {
              this.commands.delete(fullId);
            }
          };
        },
        executeCommand: async (id: string, ...args: any[]) => {
          const handler = this.commands.get(id);
          if (handler) {
            return await handler(...args);
          }
          throw new Error(`Command not found: ${id}`);
        }
      },

      workspace: {
        getWorkspacePath: () => {
          // TODO: Get from main process
          return null;
        },
        onDidOpenFile: (handler) => {
          this.hooks.get('onFileOpen')?.add(handler);
          return {
            dispose: () => {
              this.hooks.get('onFileOpen')?.delete(handler);
            }
          };
        },
        onDidSaveFile: (handler) => {
          this.hooks.get('onFileSave')?.add(handler);
          return {
            dispose: () => {
              this.hooks.get('onFileSave')?.delete(handler);
            }
          };
        }
      },

      editor: {
        getActiveFile: () => {
          // TODO: Get from renderer
          return null;
        },
        insertText: (text: string) => {
          // TODO: Send to renderer
          this.emit('insertText', text);
        },
        showInformationMessage: (message: string) => {
          this.emit('showMessage', { type: 'info', message });
        },
        showErrorMessage: (message: string) => {
          this.emit('showMessage', { type: 'error', message });
        }
      },

      ai: {
        chat: async (prompt: string, context?: any) => {
          // TODO: Call AI provider
          return '';
        },
        complete: async (prefix: string, suffix?: string) => {
          // TODO: Call completion
          return '';
        }
      }
    };
  }

  /**
   * Execute hook handlers
   */
  executeHook(hookType: HookType, ...args: any[]): void {
    const handlers = this.hooks.get(hookType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[PluginManager] Hook ${hookType} error:`, error);
        }
      }
    }
  }

  /**
   * Get all plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get active plugins
   */
  getActivePlugins(): Plugin[] {
    return this.getPlugins().filter(p => p.isActive);
  }

  /**
   * Get plugin by ID
   */
  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Install plugin from path or URL
   */
  async installPlugin(source: string): Promise<boolean> {
    console.log(`[PluginManager] Installing plugin from ${source}`);
    
    try {
      let pluginPath: string;
      
      if (source.startsWith('http://') || source.startsWith('https://')) {
        // Download from URL
        pluginPath = await this.downloadAndExtractPlugin(source);
      } else if (source.endsWith('.zip') || source.endsWith('.tar.gz')) {
        // Local archive
        pluginPath = await this.extractPluginArchive(source);
      } else {
        // Local directory
        pluginPath = source;
      }
      
      // Load the plugin
      const success = await this.loadPlugin(pluginPath);
      
      if (success) {
        console.log(`[PluginManager] Plugin installed successfully`);
        this.emit('pluginInstalled', pluginPath);
      }
      
      return success;
    } catch (error: any) {
      console.error(`[PluginManager] Failed to install plugin:`, error.message);
      return false;
    }
  }

  /**
   * Download and extract plugin from URL
   */
  private async downloadAndExtractPlugin(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const tempFile = path.join(this.storagePath, `temp-plugin-${Date.now()}.zip`);
      
      const file = fs.createWriteStream(tempFile);
      
      protocol.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(tempFile);
            this.downloadAndExtractPlugin(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', async () => {
          file.close();
          
          try {
            const extractedPath = await this.extractPluginArchive(tempFile);
            fs.unlinkSync(tempFile); // Clean up temp file
            resolve(extractedPath);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', (error) => {
        fs.unlink(tempFile, () => {}); // Clean up on error
        reject(error);
      });
    });
  }

  /**
   * Extract plugin archive
   */
  private async extractPluginArchive(archivePath: string): Promise<string> {
    // Simple .zip extraction using Node.js built-ins
    // For production, use adm-zip or similar library
    const archiveName = path.basename(archivePath, path.extname(archivePath));
    const extractPath = path.join(this.pluginsPath, archiveName);
    
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    
    // For tar.gz files
    if (archivePath.endsWith('.tar.gz')) {
      return new Promise((resolve, reject) => {
        const input = fs.createReadStream(archivePath);
        const gunzip = zlib.createGunzip();
        
        // Note: Full tar extraction requires a tar library
        // This is a placeholder that creates the directory
        input.pipe(gunzip);
        
        gunzip.on('error', reject);
        gunzip.on('end', () => {
          console.log(`[PluginManager] Note: Full tar extraction requires tar library`);
          resolve(extractPath);
        });
      });
    }
    
    // For zip files - note: production should use adm-zip
    console.log(`[PluginManager] Note: Full zip extraction requires adm-zip library`);
    console.log(`[PluginManager] Plugin path created: ${extractPath}`);
    
    return extractPath;
  }

  /**
   * Uninstall plugin
   */
  async uninstallPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    // Deactivate first
    if (plugin.isActive) {
      await this.deactivatePlugin(pluginId);
    }

    // Remove from registry
    this.plugins.delete(pluginId);

    // Delete plugin files
    try {
      if (fs.existsSync(plugin.path)) {
        fs.rmSync(plugin.path, { recursive: true, force: true });
        console.log(`[PluginManager] Deleted plugin files: ${plugin.path}`);
      }
    } catch (error: any) {
      console.warn(`[PluginManager] Failed to delete plugin files:`, error.message);
    }

    // Delete plugin storage
    const storagePath = path.join(this.storagePath, pluginId);
    try {
      if (fs.existsSync(storagePath)) {
        fs.rmSync(storagePath, { recursive: true, force: true });
      }
    } catch (error: any) {
      console.warn(`[PluginManager] Failed to delete plugin storage:`, error.message);
    }

    this.emit('pluginUninstalled', pluginId);
    return true;
  }

  /**
   * Execute plugin code in a sandboxed VM
   */
  executeInSandbox<T>(code: string, globals: Partial<SandboxGlobals> = {}, timeout: number = 5000): T {
    // Create sandbox with limited globals
    const sandbox: SandboxGlobals = {
      console: {
        log: (...args: any[]) => console.log('[Plugin]', ...args),
        warn: (...args: any[]) => console.warn('[Plugin]', ...args),
        error: (...args: any[]) => console.error('[Plugin]', ...args),
        info: (...args: any[]) => console.info('[Plugin]', ...args),
      },
      setTimeout: (fn: Function, ms: number) => setTimeout(fn, Math.min(ms, timeout)),
      clearTimeout,
      setInterval: (fn: Function, ms: number) => setInterval(fn, Math.max(ms, 100)), // Min 100ms
      clearInterval,
      Promise,
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Error,
      Map,
      Set,
      Buffer,
      ...globals
    };
    
    const context = vm.createContext(sandbox);
    
    const script = new vm.Script(code, {
      timeout,
      filename: 'plugin-sandbox.js'
    });
    
    return script.runInContext(context, { timeout });
  }

  /**
   * Check plugin permissions
   */
  checkPluginPermissions(plugin: Plugin, required: PluginPermission[]): boolean {
    const manifest = plugin.manifest;
    const granted = (manifest as any).permissions || [];
    
    return required.every(perm => granted.includes(perm));
  }

  /**
   * Get plugin dependencies
   */
  resolveDependencies(pluginId: string): string[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.manifest.dependencies) return [];
    
    const deps: string[] = [];
    
    for (const depId of Object.keys(plugin.manifest.dependencies)) {
      if (!this.plugins.has(depId)) {
        deps.push(depId);
      }
    }
    
    return deps;
  }
}

// Singleton instance
let pluginManager: PluginManager | null = null;

export function getPluginManager(pluginsPath?: string, storagePath?: string): PluginManager {
  if (!pluginManager) {
    const defaultPluginsPath = path.join(process.cwd(), 'plugins');
    const defaultStoragePath = path.join(process.cwd(), 'data', 'plugin-storage');
    
    pluginManager = new PluginManager(
      pluginsPath || defaultPluginsPath,
      storagePath || defaultStoragePath
    );
  }
  return pluginManager;
}

export default PluginManager;

