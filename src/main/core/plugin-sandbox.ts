/**
 * AgentPrime - Plugin Sandbox
 * Secure execution environment for plugins
 */

import type {
  PluginManifest,
  PluginContext,
  PluginSandbox,
  ValidationResult,
  IsolatedPlugin,
} from '../../types/plugin-api';
import { EventEmitter } from 'events';
import * as vm from 'vm';
import * as crypto from 'crypto';

interface PluginRuntime {
  sandbox: vm.Context;
  plugin: Record<string, any>;
}

export class SecurePluginSandbox extends EventEmitter implements PluginSandbox {
  private runtimes: Map<string, PluginRuntime> = new Map();

  async executeCode(code: string, context: PluginContext): Promise<any> {
    const runtime = this.createRuntime(code, context);
    return runtime.plugin;
  }

  async validateCode(code: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

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
      /new\s+Function/g,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    if (code.length > 1_000_000) {
      errors.push('Plugin code exceeds size limit');
    }

    const functionCount = (code.match(/function\s+\w+|class\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
    if (functionCount > 100) {
      warnings.push('Plugin contains many functions, may impact performance');
    }

    if (!code.includes('module.exports') && !code.includes('exports.') && !code.includes('export ')) {
      errors.push('Plugin must export an activate function');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async isolatePlugin(
    pluginId: string,
    _manifest: PluginManifest,
    code: string,
    context: PluginContext
  ): Promise<IsolatedPlugin> {
    const runtime = this.createRuntime(code, context);
    this.runtimes.set(pluginId, runtime);

    return {
      id: pluginId,
      context,
      execute: async (method: string, ...args: any[]) => {
        const activeRuntime = this.runtimes.get(pluginId);
        if (!activeRuntime) {
          throw new Error(`Plugin ${pluginId} context not found`);
        }

        const fn = activeRuntime.plugin?.[method];
        if (typeof fn !== 'function') {
          throw new Error(`Plugin method '${method}' is not defined`);
        }

        return await fn.apply(activeRuntime.plugin, args);
      },
      dispose: async () => {
        this.runtimes.delete(pluginId);
        this.emit('plugin_disposed', { pluginId });
      },
    };
  }

  private createRuntime(code: string, pluginContext: PluginContext): PluginRuntime {
    const module = { exports: {} as any };
    const exportsObject = module.exports;

    const sandboxObject: Record<string, any> = {
      console: {
        log: (...args: any[]) => this.safeLog('log', args),
        warn: (...args: any[]) => this.safeLog('warn', args),
        error: (...args: any[]) => this.safeLog('error', args),
        info: (...args: any[]) => this.safeLog('info', args),
      },
      context: pluginContext,
      setTimeout: (callback: Function, delay: number) => {
        return setTimeout(() => {
          try {
            callback();
          } catch (error: any) {
            this.emit('plugin_error', { error: error.message });
          }
        }, Math.min(delay, 30_000));
      },
      setInterval: (callback: Function, delay: number) => {
        return setInterval(() => {
          try {
            callback();
          } catch (error: any) {
            this.emit('plugin_error', { error: error.message });
          }
        }, Math.max(delay, 1_000));
      },
      clearTimeout,
      clearInterval,
      Buffer: {
        from: (data: any, encoding?: string) => {
          if (typeof data === 'string' && data.length > 10_000) {
            throw new Error('Buffer data too large');
          }
          return Buffer.from(data, encoding as BufferEncoding | undefined);
        },
        alloc: (size: number) => {
          if (size > 10_000) {
            throw new Error('Buffer size too large');
          }
          return Buffer.alloc(size);
        },
      },
      module,
      exports: exportsObject,
      require: this.createSafeRequire(),
      process: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        env: this.createSafeEnv(),
        nextTick: process.nextTick.bind(process),
        hrtime: process.hrtime.bind(process),
      },
      globalThis: undefined,
    };

    sandboxObject.globalThis = sandboxObject;

    const sandbox = vm.createContext(sandboxObject);
    const script = new vm.Script(code, {
      filename: 'plugin.js',
      displayErrors: true,
    } as vm.ScriptOptions);

    try {
      script.runInContext(sandbox, {
        timeout: 5_000,
        displayErrors: true,
        breakOnSigint: true,
      });
    } catch (error: any) {
      throw new Error(`Plugin execution failed: ${error.message}`);
    }

    const plugin = this.extractPluginExports(sandboxObject);
    if (!plugin || (typeof plugin !== 'object' && typeof plugin !== 'function')) {
      throw new Error('Plugin must export an object with callable methods');
    }

    return {
      sandbox,
      plugin,
    };
  }

  private extractPluginExports(sandboxObject: Record<string, any>): Record<string, any> {
    const moduleExports = sandboxObject.module?.exports;
    if (moduleExports && Object.keys(moduleExports).length > 0) {
      return moduleExports;
    }

    const exportsObject = sandboxObject.exports;
    if (exportsObject && Object.keys(exportsObject).length > 0) {
      return exportsObject;
    }

    return {};
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
      'path',
    ]);

    return (moduleId: string) => {
      if (!allowedModules.has(moduleId)) {
        throw new Error(`Module '${moduleId}' is not allowed in plugin sandbox`);
      }

      switch (moduleId) {
        case 'crypto':
          return {
            randomUUID: crypto.randomUUID,
            createHash: (algorithm: string) => {
              if (!['sha256', 'sha512', 'md5'].includes(algorithm)) {
                throw new Error(`Hash algorithm '${algorithm}' not allowed`);
              }
              return crypto.createHash(algorithm);
            },
          };
        case 'util':
          return {
            promisify: require('util').promisify,
            inspect: require('util').inspect,
          };
        default:
          return require(moduleId);
      }
    };
  }

  private createSafeEnv(): Record<string, string> {
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
    const message = args.map((arg) =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    const truncated = message.length > 1_000 ? `${message.slice(0, 1_000)}...` : message;
    this.emit('plugin_log', { level, message: truncated });
  }
}
