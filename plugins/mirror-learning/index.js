let pluginContext = null;

module.exports = {
  async activate(context) {
    pluginContext = context;
    const activations = (await context.storage.get('activations')) || 0;
    await context.storage.set('activations', activations + 1);
    return true;
  },

  async deactivate() {
    pluginContext = null;
  },

  async recordVerifiedRun(payload) {
    if (!pluginContext) {
      throw new Error('Mirror Learning plugin is not active');
    }

    const verifiedRuns = (await pluginContext.storage.get('verifiedRuns')) || 0;
    await pluginContext.storage.set('verifiedRuns', verifiedRuns + 1);

    return pluginContext.host.invoke('mirror-learning.recordVerifiedRun', payload);
  },

  async getStats() {
    if (!pluginContext) {
      return { active: false };
    }

    return {
      active: true,
      activations: (await pluginContext.storage.get('activations')) || 0,
      verifiedRuns: (await pluginContext.storage.get('verifiedRuns')) || 0,
      workspaceRoot: pluginContext.workspace.rootPath || null,
    };
  },
};
