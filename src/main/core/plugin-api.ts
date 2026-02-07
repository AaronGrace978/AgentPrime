/**
 * AgentPrime - Plugin API
 * Extensible architecture for third-party integrations
 */

import type {
  PluginManifest,
  PluginContext,
  PluginHost,
  PluginSandbox,
  Extension,
  Disposable,
  ValidationResult,
  IsolatedPlugin
} from '../../types/plugin-api';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { enterpriseSecurity } from '../security/enterprise-security';

export class PluginManager extends EventEmitter implements PluginHost {
  private plugins: Map<string, PluginInstance> = new Map();
  private sandbox: PluginSandbox;
  private pluginStorage: Map<string, Map<string, any>> = new Map();

  constructor(sandbox: PluginSandbox) {
    super();
    this.sandbox = sandbox;
  }

  /**
   * Load and activate a plugin from its manifest
   */
  async loadPlugin(pluginPath: string): Promise<string> {
    // Read manifest
    const manifestPath = path.join(pluginPath, 'package.json');
    const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(manifestContent);

    // Validate manifest
    this.validateManifest(manifest);

    // Create plugin instance
    const pluginInstance: PluginInstance = {
      id: manifest.id,
      manifest,
      path: pluginPath,
      state: 'loaded',
      context: this.createPluginContext(manifest),
      isolatedPlugin: null
    };

    this.plugins.set(manifest.id, pluginInstance);

    // Check activation events
    if (this.shouldActivatePlugin(manifest)) {
      await this.activatePlugin(manifest.id);
    }

    this.emit('plugin_loaded', { pluginId: manifest.id, manifest });

    return manifest.id;
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (plugin.state === 'active') {
      return; // Already active
    }

    try {
      // Isolate the plugin for security
      plugin.isolatedPlugin = await this.sandbox.isolatePlugin(pluginId, plugin.manifest);

      // Load main module
      const mainPath = path.join(plugin.path, plugin.manifest.main);
      const mainCode = await fs.promises.readFile(mainPath, 'utf-8');

      // Validate and execute main module
      const validation = await this.sandbox.validateCode(mainCode);
      if (!validation.valid) {
        throw new Error(`Plugin validation failed: ${validation.errors.join(', ')}`);
      }

      // Execute activation function
      const activateFunction = await this.sandbox.executeCode(mainCode, plugin.context);
      if (typeof activateFunction !== 'function') {
        throw new Error('Plugin main module must export an activate function');
      }

      // Call activate function
      await plugin.isolatedPlugin.execute('activate', plugin.context);

      plugin.state = 'active';

      this.emit('plugin_activated', { pluginId, context: plugin.context });

    } catch (error: any) {
      plugin.state = 'error';
      this.emit('plugin_error', { pluginId, error: error.message });
      throw error;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return;
    }

    if (plugin.state === 'active' && plugin.isolatedPlugin) {
      try {
        await plugin.isolatedPlugin.execute('deactivate');
        await plugin.isolatedPlugin.dispose();
      } catch (error) {
        console.warn(`Error deactivating plugin ${pluginId}:`, error);
      }
    }

    // Dispose context
    plugin.context.subscriptions.forEach(sub => sub.dispose());
    plugin.context.subscriptions = [];

    plugin.state = 'inactive';
    plugin.isolatedPlugin = null;

    this.emit('plugin_deactivated', { pluginId });
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    await this.deactivatePlugin(pluginId);
    await this.activatePlugin(pluginId);
    this.emit('plugin_reloaded', { pluginId });
  }

  /**
   * Get plugin context
   */
  getPluginContext(pluginId: string): PluginContext | undefined {
    const plugin = this.plugins.get(pluginId);
    return plugin?.context;
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): Extension<any>[] {
    return Array.from(this.plugins.values()).map(plugin => ({
      id: plugin.id,
      extensionPath: plugin.path,
      isActive: plugin.state === 'active',
      packageJSON: plugin.manifest,
      exports: plugin.isolatedPlugin,
      activate: () => this.activatePlugin(plugin.id)
    }));
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Execute a command from a plugin
   */
  async executePluginCommand(pluginId: string, command: string, ...args: any[]): Promise<any> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.state !== 'active' || !plugin.isolatedPlugin) {
      throw new Error(`Plugin ${pluginId} is not active`);
    }

    return plugin.isolatedPlugin.execute(command, ...args);
  }

  // Private methods

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error('Plugin manifest must have id, name, and version');
    }

    if (!manifest.main) {
      throw new Error('Plugin manifest must specify a main entry point');
    }

    if (!manifest.engines?.agentprime) {
      throw new Error('Plugin manifest must specify AgentPrime engine compatibility');
    }
  }

  private shouldActivatePlugin(manifest: PluginManifest): boolean {
    // Check activation events
    if (!manifest.activationEvents) {
      return true; // Activate immediately if no specific events
    }

    // For now, activate on workspace open
    return manifest.activationEvents.includes('onStartup');
  }

  private createPluginContext(manifest: PluginManifest): PluginContext {
    const context: PluginContext = {
      subscriptions: [],
      workspace: this.createWorkspaceApi(),
      commands: this.createCommandsApi(manifest.id),
      window: this.createWindowApi(),
      extensions: this.createExtensionsApi(),
      ai: this.createAIApi(manifest.id),
      storage: this.createStorageApi(manifest.id)
    };

    return context;
  }

  private createWorkspaceApi() {
    return {
      rootPath: process.cwd(),
      name: path.basename(process.cwd()),
      findFiles: async (include: string, exclude?: string) => {
        // Simplified file finding - would use glob in production
        const results: string[] = [];
        const scanDir = async (dir: string) => {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && fullPath.includes(include)) {
              if (!exclude || !fullPath.includes(exclude)) {
                results.push(fullPath);
              }
            } else if (entry.isDirectory()) {
              await scanDir(fullPath);
            }
          }
        };
        await scanDir(process.cwd());
        return results;
      },
      openTextDocument: async (uri: string) => {
        const content = await fs.promises.readFile(uri, 'utf-8');
        return {
          uri,
          fileName: path.basename(uri),
          isDirty: false,
          languageId: this.detectLanguage(uri),
          getText: () => content,
          lineCount: content.split('\n').length,
          save: async () => true
        };
      },
      onDidChangeWorkspaceFolders: this.createEventEmitter()
    };
  }

  private createCommandsApi(pluginId: string) {
    return {
      registerCommand: (command: string, handler: (...args: any[]) => any) => {
        const fullCommand = `${pluginId}.${command}`;
        // Register command (would integrate with main command system)
        this.emit('command_registered', { pluginId, command: fullCommand, handler });

        return {
          dispose: () => {
            this.emit('command_unregistered', { pluginId, command: fullCommand });
          }
        };
      },
      executeCommand: async <T>(command: string, ...args: any[]): Promise<T> => {
        // Execute command (would route to appropriate handler)
        this.emit('command_executed', { command, args });
        return undefined as T;
      }
    };
  }

  private createWindowApi() {
    return {
      showInformationMessage: async (message: string, ...items: string[]) => {
        this.emit('show_message', { type: 'info', message, items });
        return items.length > 0 ? items[0] : undefined;
      },
      showWarningMessage: async (message: string, ...items: string[]) => {
        this.emit('show_message', { type: 'warning', message, items });
        return items.length > 0 ? items[0] : undefined;
      },
      showErrorMessage: async (message: string, ...items: string[]) => {
        this.emit('show_message', { type: 'error', message, items });
        return items.length > 0 ? items[0] : undefined;
      },
      createOutputChannel: (name: string) => {
        return {
          name,
          append: (value: string) => this.emit('output_append', { channel: name, value }),
          appendLine: (value: string) => this.emit('output_append', { channel: name, value: value + '\n' }),
          clear: () => this.emit('output_clear', { channel: name }),
          show: () => this.emit('output_show', { channel: name }),
          hide: () => this.emit('output_hide', { channel: name }),
          dispose: () => this.emit('output_dispose', { channel: name })
        };
      },
      createStatusBarItem: (alignment = 'right', priority = 0) => {
        const id = crypto.randomUUID();
        return {
          text: '',
          tooltip: undefined,
          command: undefined,
          color: undefined,
          backgroundColor: undefined,
          show: () => this.emit('status_bar_show', { id }),
          hide: () => this.emit('status_bar_hide', { id }),
          dispose: () => this.emit('status_bar_dispose', { id })
        };
      }
    };
  }

  private createExtensionsApi() {
    return {
      getExtension: (extensionId: string) => {
        const plugin = this.plugins.get(extensionId);
        if (!plugin) return undefined;

        return {
          id: plugin.id,
          extensionPath: plugin.path,
          isActive: plugin.state === 'active',
          packageJSON: plugin.manifest,
          exports: plugin.isolatedPlugin,
          activate: () => this.activatePlugin(extensionId)
        };
      },
      getExtensionContext: (extensionId: string) => {
        return this.getPluginContext(extensionId);
      }
    };
  }

  private createAIApi(pluginId: string) {
    return {
      registerProvider: (provider: any) => {
        this.emit('ai_provider_registered', { pluginId, provider });
        return {
          dispose: () => {
            this.emit('ai_provider_unregistered', { pluginId, providerId: provider.id });
          }
        };
      },
      chat: async (messages: any[], options?: any) => {
        // Route to AI system
        this.emit('ai_chat', { pluginId, messages, options });
        return { content: 'Mock AI response' };
      },
      complete: async (prompt: string, options?: any) => {
        // Route to AI system
        this.emit('ai_complete', { pluginId, prompt, options });
        return { text: 'Mock completion' };
      }
    };
  }

  private createStorageApi(pluginId: string) {
    const storage = this.pluginStorage.get(pluginId) || new Map();
    this.pluginStorage.set(pluginId, storage);

    return {
      get: async <T>(key: string): Promise<T | undefined> => {
        const encrypted = storage.get(key);
        if (!encrypted) return undefined;

        const decrypted = enterpriseSecurity.decrypt(Buffer.from(encrypted, 'base64'));
        return JSON.parse(decrypted.toString());
      },
      set: async (key: string, value: any): Promise<void> => {
        const serialized = JSON.stringify(value);
        const encrypted = enterpriseSecurity.encrypt(Buffer.from(serialized));
        storage.set(key, encrypted.toString('base64'));
      },
      delete: async (key: string): Promise<void> => {
        storage.delete(key);
      },
      keys: async (): Promise<string[]> => {
        return Array.from(storage.keys());
      }
    };
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.md': 'markdown'
    };
    return languageMap[ext] || 'plaintext';
  }

  private createEventEmitter<T = any>(): any {
    return (listener: (e: T) => any) => {
      // Simplified event emitter
      return {
        dispose: () => {
          // Remove listener
        }
      };
    };
  }
}

interface PluginInstance {
  id: string;
  manifest: PluginManifest;
  path: string;
  state: 'loaded' | 'active' | 'inactive' | 'error';
  context: PluginContext;
  isolatedPlugin: IsolatedPlugin | null;
}
