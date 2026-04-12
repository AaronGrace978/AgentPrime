import { buildAIHealthSummary } from '../../src/main/core/provider-health';
import type { AIRuntimeSnapshot, ProviderConnectionStatus } from '../../src/types/ai-providers';

const baseRuntime: AIRuntimeSnapshot = {
  requestedProvider: 'openrouter',
  requestedModel: 'anthropic/claude-sonnet-4',
  effectiveProvider: 'openrouter',
  effectiveModel: 'anthropic/claude-sonnet-4',
  displayProvider: 'OpenRouter',
  displayModel: 'Claude Sonnet 4',
  viaFallback: false,
  resolution: 'direct',
};

describe('buildAIHealthSummary', () => {
  it('includes the provider error when the connection check fails', () => {
    const providerStatus: ProviderConnectionStatus = {
      success: false,
      error: 'Invalid API key',
    };

    expect(buildAIHealthSummary(baseRuntime, providerStatus)).toEqual({
      provider: 'OpenRouter',
      model: 'Claude Sonnet 4',
      connected: false,
      reason: undefined,
      connectionError: 'Invalid API key',
      availableModels: undefined,
    });
  });

  it('includes the discovered model count on successful probes', () => {
    const providerStatus: ProviderConnectionStatus = {
      success: true,
      models: 128,
    };

    expect(buildAIHealthSummary({
      ...baseRuntime,
      reason: 'Using the configured provider directly.',
    }, providerStatus)).toEqual({
      provider: 'OpenRouter',
      model: 'Claude Sonnet 4',
      connected: true,
      reason: 'Using the configured provider directly.',
      connectionError: undefined,
      availableModels: 128,
    });
  });
});
