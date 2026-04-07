import {
  buildProviderApiKeyStatusSnapshot,
  resolveProviderApiKeySource,
  resolveProviderEnvironmentApiKey,
  sanitizeSettingsForRenderer,
} from '../../src/main/security/providerApiKeys';
import type { Settings } from '../../src/types';

describe('providerApiKeys helpers', () => {
  it('prefers the environment by default when both sources exist', () => {
    expect(resolveProviderApiKeySource('stored-key', 'env-key')).toBe('environment');
  });

  it('prefers secure storage when explicitly requested', () => {
    expect(resolveProviderApiKeySource('stored-key', 'env-key', 'secure-storage')).toBe('secure-storage');
  });

  it('resolves the secondary Ollama desktop key before the shared key', () => {
    const result = resolveProviderEnvironmentApiKey('ollamaSecondary', {
      OLLAMA_API_KEY: 'shared-key',
      OLLAMA_API_KEY_DESKTOP: 'desktop-key',
    });

    expect(result).toEqual({
      value: 'desktop-key',
      environmentVariable: 'OLLAMA_API_KEY_DESKTOP',
    });
  });

  it('sanitizes provider and web search secrets before returning settings to the renderer', () => {
    const settings = {
      theme: 'vs-dark',
      fontSize: 14,
      tabSize: 2,
      wordWrap: 'on',
      minimap: true,
      lineNumbers: 'on',
      autoSave: true,
      inlineCompletions: true,
      dinoBuddyMode: false,
      activeProvider: 'openai',
      activeModel: 'gpt-5.4',
      dualOllamaEnabled: false,
      dualModelEnabled: true,
      dualModelConfig: {
        fastModel: { provider: 'openai', model: 'gpt-5.4-mini', enabled: true },
        deepModel: { provider: 'anthropic', model: 'claude-sonnet-4-6', enabled: true },
        autoRoute: true,
        complexityThreshold: 6,
        deepModelTriggers: ['debug'],
        fastModelTriggers: ['quick'],
      },
      providers: {
        openai: {
          apiKey: 'sk-secret',
          model: 'gpt-5.4',
        },
        anthropic: {
          apiKey: 'sk-ant-secret',
          model: 'claude-sonnet-4-6',
        },
      },
      webSearch: {
        tavilyApiKey: 'tvly-secret',
        braveApiKey: 'brv-secret',
        enabled: true,
      },
    } as Settings;

    const sanitized = sanitizeSettingsForRenderer(settings);

    expect(sanitized.providers.openai?.apiKey).toBeUndefined();
    expect(sanitized.providers.anthropic?.apiKey).toBeUndefined();
    expect(sanitized.webSearch?.tavilyApiKey).toBeUndefined();
    expect(sanitized.webSearch?.braveApiKey).toBeUndefined();
    expect(sanitized.providers.openai?.model).toBe('gpt-5.4');
  });

  it('reports the active source using the stored preference', () => {
    const snapshot = buildProviderApiKeyStatusSnapshot({
      provider: 'openai',
      storedKey: 'stored-key',
      environmentKey: 'env-key',
      environmentVariable: 'OPENAI_API_KEY',
      preferredSource: 'secure-storage',
      storageBackend: 'keychain',
    });

    expect(snapshot.activeSource).toBe('secure-storage');
    expect(snapshot.hasStoredKey).toBe(true);
    expect(snapshot.hasEnvironmentKey).toBe(true);
  });
});
