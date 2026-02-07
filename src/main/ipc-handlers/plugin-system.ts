/**
 * AgentPrime - Plugin System IPC Handlers
 * IPC handlers for plugin management and marketplace
 */

import { ipcMain } from 'electron';
import type { PluginManager } from '../core/plugin-api';
import type { PluginMarketplace } from '../core/plugin-marketplace';

export function registerPluginSystemHandlers(
  getPluginManager: () => PluginManager,
  getPluginMarketplace: () => PluginMarketplace
): void {
  const pluginManager = getPluginManager();
  const marketplace = getPluginMarketplace();

  // Plugin management
  ipcMain.handle('plugins:load-plugin', async (event, pluginPath: string) => {
    try {
      const pluginId = await pluginManager.loadPlugin(pluginPath);
      return { success: true, pluginId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugins:activate-plugin', async (event, pluginId: string) => {
    try {
      await pluginManager.activatePlugin(pluginId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugins:deactivate-plugin', async (event, pluginId: string) => {
    try {
      await pluginManager.deactivatePlugin(pluginId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugins:reload-plugin', async (event, pluginId: string) => {
    try {
      await pluginManager.reloadPlugin(pluginId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugins:get-installed-plugins', () => {
    try {
      const plugins = pluginManager.getLoadedPlugins();
      return { success: true, plugins };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugins:get-plugin-context', (event, pluginId: string) => {
    try {
      const context = pluginManager.getPluginContext(pluginId);
      return { success: true, context };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugins:execute-command', async (event, pluginId: string, command: string, ...args: any[]) => {
    try {
      const result = await pluginManager.executePluginCommand(pluginId, command, ...args);
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Plugin marketplace
  ipcMain.handle('marketplace:search-plugins', async (event, query: any) => {
    try {
      const results = await marketplace.searchPlugins(query);
      return { success: true, results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('marketplace:get-plugin', async (event, pluginId: string) => {
    try {
      const plugin = await marketplace.getPlugin(pluginId);
      return { success: true, plugin };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('marketplace:install-plugin', async (event, pluginId: string, version?: string) => {
    try {
      const installation = await marketplace.installPlugin(pluginId, version);
      return { success: true, installation };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('marketplace:uninstall-plugin', async (event, pluginId: string) => {
    try {
      await marketplace.uninstallPlugin(pluginId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('marketplace:update-plugin', async (event, pluginId: string) => {
    try {
      await marketplace.updatePlugin(pluginId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('marketplace:check-updates', async () => {
    try {
      const updates = await marketplace.checkForUpdates();
      return { success: true, updates };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('marketplace:get-stats', async () => {
    try {
      const stats = await marketplace.getStats();
      return { success: true, stats };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('marketplace:get-installed', () => {
    try {
      const plugins = marketplace.getInstalledPlugins();
      return { success: true, plugins };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Event forwarding
  pluginManager.on('plugin_loaded', (data) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('plugins:event', { type: 'plugin_loaded', ...data });
    });
  });

  pluginManager.on('plugin_activated', (data) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('plugins:event', { type: 'plugin_activated', ...data });
    });
  });

  marketplace.on('marketplace_event', (event) => {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('marketplace:event', event);
    });
  });

  console.log('🔌 Plugin system IPC handlers registered');
}

export function register(getPluginManager: () => PluginManager, getPluginMarketplace: () => PluginMarketplace): void {
  registerPluginSystemHandlers(getPluginManager, getPluginMarketplace);
}
