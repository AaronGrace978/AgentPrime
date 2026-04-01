import type { PluginManager } from './plugin-api';

let pluginManagerInstance: PluginManager | null = null;

export function setPluginManager(instance: PluginManager | null): void {
  pluginManagerInstance = instance;
}

export function getPluginManager(): PluginManager | null {
  return pluginManagerInstance;
}
