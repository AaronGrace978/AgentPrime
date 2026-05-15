import { runStartupConfigPreflight } from '../../src/main/core/startup-config-preflight';
import type { FeatureFlags } from '../../src/main/core/feature-flags';
import type { Settings } from '../../src/types';

const baseFeatureFlags: FeatureFlags = {
  mirror: false,
  activatePrime: true,
  pythonBrain: false,
  inferenceServer: false,
  smartMode: false,
  consciousness: false,
  telemetry: true,
  codebaseIndexing: true,
};

const buildSettings = (overrides: Partial<Settings> = {}): Settings =>
  ({
    theme: 'dark',
    fontSize: 14,
    tabSize: 2,
    wordWrap: 'on',
    minimap: true,
    lineNumbers: 'on',
    autoSave: false,
    inlineCompletions: true,
    dinoBuddyMode: false,
    activeProvider: 'ollama',
    activeModel: 'llama3.2',
    dualOllamaEnabled: false,
    dualModelEnabled: false,
    dualModelConfig: {
      fastModel: { provider: 'ollama', model: 'llama3.2', enabled: true },
      deepModel: { provider: 'ollama', model: 'qwen3-coder-next:cloud', enabled: true },
      autoRoute: true,
      complexityThreshold: 5,
      deepModelTriggers: [],
      fastModelTriggers: [],
    },
    providers: {
      ollama: {
        baseUrl: 'http://127.0.0.1:11434',
        apiKey: '',
        model: 'llama3.2',
      },
    },
    ...overrides,
  }) as Settings;

describe('runStartupConfigPreflight', () => {
  it('warns when an active Ollama cloud model has no API key', () => {
    const report = runStartupConfigPreflight(
      buildSettings({ activeModel: 'deepseek-v4-pro:cloud' }),
      baseFeatureFlags,
      { log: false }
    );

    expect(report.issues.map((issue) => issue.code)).toContain('OLLAMA_CLOUD_KEY_MISSING');
  });

  it('warns when an Ollama model is stored with a provider prefix', () => {
    const report = runStartupConfigPreflight(
      buildSettings({ activeModel: 'ollama/qwen3-coder-next:cloud' }),
      baseFeatureFlags,
      { log: false }
    );

    expect(report.issues.map((issue) => issue.code)).toContain('OLLAMA_MODEL_PREFIXED');
  });

  it('reports legacy Ollama Cloud hosts with actionable issue codes', () => {
    const report = runStartupConfigPreflight(
      buildSettings({
        providers: {
          ollama: {
            baseUrl: 'https://api.ollama.com',
            apiKey: 'test-key',
            model: 'kimi-k2.6:cloud',
          },
        },
      }),
      baseFeatureFlags,
      { log: false }
    );

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OLLAMA_LEGACY_CLOUD_URL',
          severity: 'info',
        }),
      ])
    );
  });

  it('warns when settings still point at the retired DeepSeek cloud host', () => {
    const report = runStartupConfigPreflight(
      buildSettings({
        providers: {
          ollama: {
            baseUrl: 'https://ollama.deepseek.com',
            apiKey: 'test-key',
            model: 'deepseek-v4-pro:cloud',
          },
        },
      }),
      baseFeatureFlags,
      { log: false }
    );

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OLLAMA_DEEPSEEK_CLOUD_URL',
          severity: 'warn',
        }),
      ])
    );
  });
});
