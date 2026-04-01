import aiRouter from '../ai-providers';
import type { Settings } from '../../types';
import type { AIRuntimeResolution, AIRuntimeSnapshot } from '../../types/ai-providers';

interface RuntimeExecutionRecord {
  requestedProvider: string;
  requestedModel?: string;
  effectiveProvider: string;
  effectiveModel: string;
  executionProvider: string;
  executionModel?: string;
  viaFallback: boolean;
  resolution: AIRuntimeResolution;
  reason?: string;
  recordedAt: number;
}

let lastRuntimeExecution: RuntimeExecutionRecord | null = null;

function getLocalOllamaModel(settings: Partial<Settings> | null | undefined): string {
  return settings?.providers?.ollama?.model || settings?.activeModel || 'qwen2.5-coder:7b';
}

function providerHasCredentials(settings: Partial<Settings> | null | undefined, providerName: string): boolean {
  if (!providerName || providerName === 'ollama' || providerName === 'ollamaSecondary') {
    return true;
  }

  const providers = settings?.providers as Record<string, { apiKey?: string } | undefined> | undefined;
  return Boolean(providers?.[providerName]?.apiKey);
}

export function resolveEffectiveAIRuntime(
  settings: Partial<Settings> | null | undefined,
  requestedModel?: string | null,
  requestedProvider?: string | null
): AIRuntimeSnapshot {
  const ollamaModel = getLocalOllamaModel(settings);
  const requestedModelValue = requestedModel || settings?.activeModel || ollamaModel;
  const requestedProviderValue = requestedProvider || settings?.activeProvider || 'ollama';

  let effectiveProvider =
    aiRouter.inferProviderForModel(requestedModelValue, requestedProviderValue) ||
    requestedProviderValue ||
    'ollama';
  let effectiveModel = requestedModelValue || ollamaModel;
  let resolution: AIRuntimeResolution = 'direct';
  let reason: string | undefined;

  if (!effectiveModel) {
    effectiveProvider = 'ollama';
    effectiveModel = ollamaModel;
    resolution = 'demoted_to_ollama';
    reason = 'No active model was configured, so AgentPrime fell back to Ollama.';
  } else if (!providerHasCredentials(settings, effectiveProvider)) {
    effectiveProvider = 'ollama';
    effectiveModel = ollamaModel;
    resolution = 'demoted_to_ollama';
    reason = `${requestedProviderValue} is not configured, so AgentPrime fell back to Ollama.`;
  }

  const matchingExecution =
    lastRuntimeExecution &&
    lastRuntimeExecution.effectiveProvider === effectiveProvider &&
    lastRuntimeExecution.effectiveModel === effectiveModel
      ? lastRuntimeExecution
      : null;

  return {
    requestedProvider: requestedProviderValue,
    requestedModel: requestedModelValue,
    effectiveProvider,
    effectiveModel,
    executionProvider: matchingExecution?.executionProvider,
    executionModel: matchingExecution?.executionModel,
    displayProvider: matchingExecution?.executionProvider || effectiveProvider,
    displayModel: matchingExecution?.executionModel || effectiveModel,
    viaFallback: matchingExecution?.viaFallback || false,
    resolution: matchingExecution?.resolution || resolution,
    reason: matchingExecution?.reason || reason,
    lastExecutionAt: matchingExecution?.recordedAt,
  };
}

export function recordAIRuntimeExecution(params: {
  requestedProvider: string;
  requestedModel?: string;
  effectiveProvider?: string;
  effectiveModel?: string;
  executionProvider: string;
  executionModel?: string;
  viaFallback?: boolean;
  reason?: string;
}): AIRuntimeSnapshot {
  const effectiveProvider = params.effectiveProvider || params.requestedProvider || 'ollama';
  const effectiveModel = params.effectiveModel || params.requestedModel || params.executionModel || '';
  const viaFallback = Boolean(params.viaFallback);

  lastRuntimeExecution = {
    requestedProvider: params.requestedProvider,
    requestedModel: params.requestedModel,
    effectiveProvider,
    effectiveModel,
    executionProvider: params.executionProvider,
    executionModel: params.executionModel,
    viaFallback,
    resolution: viaFallback ? 'fallback_execution' : 'direct',
    reason: params.reason,
    recordedAt: Date.now(),
  };

  return {
    requestedProvider: lastRuntimeExecution.requestedProvider,
    requestedModel: lastRuntimeExecution.requestedModel || effectiveModel,
    effectiveProvider,
    effectiveModel,
    executionProvider: lastRuntimeExecution.executionProvider,
    executionModel: lastRuntimeExecution.executionModel,
    displayProvider: lastRuntimeExecution.executionProvider,
    displayModel: lastRuntimeExecution.executionModel || effectiveModel,
    viaFallback,
    resolution: lastRuntimeExecution.resolution,
    reason: lastRuntimeExecution.reason,
    lastExecutionAt: lastRuntimeExecution.recordedAt,
  };
}

export function getLastAIRuntimeExecution(): AIRuntimeSnapshot | null {
  if (!lastRuntimeExecution) {
    return null;
  }

  return {
    requestedProvider: lastRuntimeExecution.requestedProvider,
    requestedModel: lastRuntimeExecution.requestedModel || lastRuntimeExecution.effectiveModel,
    effectiveProvider: lastRuntimeExecution.effectiveProvider,
    effectiveModel: lastRuntimeExecution.effectiveModel,
    executionProvider: lastRuntimeExecution.executionProvider,
    executionModel: lastRuntimeExecution.executionModel,
    displayProvider: lastRuntimeExecution.executionProvider,
    displayModel: lastRuntimeExecution.executionModel || lastRuntimeExecution.effectiveModel,
    viaFallback: lastRuntimeExecution.viaFallback,
    resolution: lastRuntimeExecution.resolution,
    reason: lastRuntimeExecution.reason,
    lastExecutionAt: lastRuntimeExecution.recordedAt,
  };
}

export function resetAIRuntimeExecution(): void {
  lastRuntimeExecution = null;
}
