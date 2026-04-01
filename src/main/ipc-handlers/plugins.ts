interface PluginDeps {
  ipcMain: any;
  getPluginManager?: () => any;
}

export function registerPluginHandlers(deps: PluginDeps): void {
  const { ipcMain, getPluginManager } = deps;

  ipcMain.handle('plugins:list', async () => {
    try {
      const manager = getPluginManager?.();
      return {
        success: true,
        plugins: manager?.listPlugins?.() || [],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to list plugins',
        plugins: [],
      };
    }
  });

  ipcMain.handle('plugins:reload', async (_event: any, pluginId: string) => {
    try {
      const manager = getPluginManager?.();
      if (!manager) {
        return { success: false, error: 'Plugin system unavailable' };
      }
      await manager.reloadPlugin(pluginId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to reload plugin' };
    }
  });

  ipcMain.handle('plugins:execute', async (_event: any, pluginId: string, command: string, payload?: any) => {
    try {
      const manager = getPluginManager?.();
      if (!manager) {
        return { success: false, error: 'Plugin system unavailable' };
      }
      const result = await manager.executePluginCommand(pluginId, command, payload);
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to execute plugin command' };
    }
  });
}
