/**
 * AgentPrime - Plugin Sandbox
 * Secure execution environment for plugins
 */

import type {
  PluginManifest,
  PluginContext,
  PluginSandbox,
  ValidationResult,
  IsolatedPlugin
} from '../../types/plugin-api';
import { EventEmitter } from 'events';
import * as vm from 'vm';
import * as crypto from 'crypto';
import * as path from 'path';
import { enterpriseSecurity } from '../security/enterprise-security';

export class SecurePluginSandbox extends EventEmitter implements PluginSandbox {
  private contexts: Map<string, vm.Context> = new Map();
  private scripts: Map<string, vm.Script> = new Map();

  /**
   * Execute plugin code in a sandboxed environment
   */
  async executeCode(code: string, context: PluginContext): Promise<any> {
    // Create isolated context
    const sandbox = this.createSandbox(context);

    // Create script (timeout is applied at runtime, not script creation)
    const script = new vm.Script(code, {
      filename: 'plugin.js',
      displayErrors: true
    } as vm.ScriptOptions);

    try {
      // Execute in sandbox
      const result = script.runInContext(sandbox, {
        timeout: 5000,
        displayErrors: true,
        breakOnSigint: true
      });

      return result;
    } catch (error: any) {
      throw new Error(`Plugin execution failed: ${error.message}`);
    }
  }

  /**
   * Validate plugin code for security issues
   */
  async validateCode(code: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      /require\s*\(\s*['"`]fs['"`]\s*\)/g,
      /require\s*\(\s*['"`]child_process['"`]\s*\)/g,
      /require\s*\(\s*['"`]http['"`]\s*\)/g,
      /require\s*\(\s*['"`]https['"`]\s*\)/g,
      /process\.exit/g,
      /global\./g,
      /__dirname/g,
      /__filename/g,
      /eval\s*\(/g,
      /Function\s*\(/g,
      /new\s+Function/g
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    // Check for excessive code length
    if (code.length > 1000000) { // 1MB limit
      errors.push('Plugin code exceeds size limit');
    }

    // Check for too many functions/classes
    const functionCount = (code.match(/function\s+\w+|class\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
    if (functionCount > 100) {
      warnings.push('Plugin contains many functions, may impact performance');
    }

    // Check for proper exports
    if (!code.includes('module.exports') && !code.includes('export')) {
      errors.push('Plugin must export an activate function');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create an isolated plugin instance
   */
  async isolatePlugin(pluginId: string, manifest: PluginManifest): Promise<IsolatedPlugin> {
    const context = this.createIsolatedContext(pluginId, manifest);

    return {
      id: pluginId,
      context,
      execute: async (method: string, ...args: any[]) => {
        const sandbox = this.contexts.get(pluginId);
        if (!sandbox) {
          throw new Error('Plugin context not found');
        }

        // Execute method in sandbox
        const script = new vm.Script(`plugin.${method}.apply(plugin, args)`, {
          filename: 'plugin-method.js',
          displayErrors: true
        } as vm.ScriptOptions);

        try {
          return await script.runInContext(sandbox, {
            timeout: 10000,
            displayErrors: true
          });
        } catch (error: any) {
          throw new Error(`Plugin method execution failed: ${error.message}`);
        }
      },
      dispose: async () => {
        this.contexts.delete(pluginId);
        this.scripts.delete(pluginId);
        this.emit('plugin_disposed', { pluginId });
      }
    };
  }

  // Private methods

  private createSandbox(pluginContext: PluginContext): vm.Context {
    // Create a restricted global object
    const sandbox = {
      // Safe globals
      console: {
        log: (...args: any[]) => this.safeLog('log', args),
        warn: (...args: any[]) => this.safeLog('warn', args),
        error: (...args: any[]) => this.safeLog('error', args),
        info: (...args: any[]) => this.safeLog('info', args)
      },

      // Plugin context
      context: pluginContext,

      // Safe versions of common APIs
      setTimeout: (callback: Function, delay: number) => {
        return setTimeout(() => {
          try {
            callback();
          } catch (error: any) {
            this.emit('plugin_error', { error: error.message });
          }
        }, Math.min(delay, 30000)); // Max 30 second delay
      },

      setInterval: (callback: Function, delay: number) => {
        return setInterval(() => {
          try {
            callback();
          } catch (error: any) {
            this.emit('plugin_error', { error: error.message });
          }
        }, Math.max(delay, 1000)); // Min 1 second interval
      },

      clearTimeout,
      clearInterval,

      // Safe buffer operations
      Buffer: {
        from: (data: any, encoding?: string) => {
          if (typeof data === 'string' && data.length > 10000) {
            throw new Error('Buffer data too large');
          }
          return Buffer.from(data, encoding as any);
        },
        alloc: (size: number) => {
          if (size > 10000) {
            throw new Error('Buffer size too large');
          }
          return Buffer.alloc(size);
        }
      },

      // Plugin API
      exports: {},
      module: { exports: {} },
      require: this.createSafeRequire(),

      // Restricted process object
      process: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        env: this.createSafeEnv(),
        nextTick: process.nextTick,
        hrtime: process.hrtime
      }
    };

    return vm.createContext(sandbox);
  }

  private createIsolatedContext(pluginId: string, manifest: PluginManifest): PluginContext {
    // Create a context with plugin-specific isolation
    const context: PluginContext = {
      subscriptions: [],
      workspace: {
        rootPath: process.cwd(),
        name: path.basename(process.cwd()),
        findFiles: async () => [],
        openTextDocument: async () => ({ uri: '', fileName: '', isDirty: false, languageId: '', getText: () => '', lineCount: 0, save: async () => false }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} })
      },
      commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: async <T>(): Promise<T> => undefined as unknown as T
      },
      window: {
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        createOutputChannel: () => ({
          name: '',
          append: () => {},
          appendLine: () => {},
          clear: () => {},
          show: () => {},
          hide: () => {},
          dispose: () => {}
        }),
        createStatusBarItem: () => ({
          text: '',
          show: () => {},
          hide: () => {},
          dispose: () => {}
        })
      },
      extensions: {
        getExtension: () => undefined,
        getExtensionContext: () => undefined
      },
      ai: {
        registerProvider: () => ({ dispose: () => {} }),
        chat: async () => ({ content: '' }),
        complete: async () => ({ text: '' })
      },
      storage: {
        get: async () => undefined,
        set: async () => {},
        delete: async () => {},
        keys: async () => []
      }
    };

    return context;
  }

  private createSafeRequire(): (module: string) => any {
    const allowedModules = new Set([
      'crypto',
      'util',
      'events',
      'stream',
      'zlib',
      'querystring',
      'url',
      'path'
    ]);

    return (moduleId: string) => {
      if (!allowedModules.has(moduleId)) {
        throw new Error(`Module '${moduleId}' is not allowed in plugin sandbox`);
      }

      // Return safe versions of modules
      switch (moduleId) {
        case 'crypto':
          return {
            randomUUID: crypto.randomUUID,
            createHash: (algorithm: string) => {
              if (!['sha256', 'sha512', 'md5'].includes(algorithm)) {
                throw new Error(`Hash algorithm '${algorithm}' not allowed`);
              }
              return crypto.createHash(algorithm);
            }
          };
        case 'util':
          return {
            promisify: require('util').promisify,
            inspect: require('util').inspect
          };
        default:
          return require(moduleId);
      }
    };
  }

  private createSafeEnv(): Record<string, string> {
    // Only expose safe environment variables
    const safeVars = ['NODE_ENV', 'LANG', 'TZ'];
    const env: Record<string, string> = {};

    for (const varName of safeVars) {
      if (process.env[varName]) {
        env[varName] = process.env[varName]!;
      }
    }

    return env;
  }

  private safeLog(level: string, args: any[]): void {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    // Limit log message length
    const truncated = message.length > 1000 ? message.slice(0, 1000) + '...' : message;

    this.emit('plugin_log', { level, message: truncated });
  }
}
