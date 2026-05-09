import type { ModelInfo } from '../../types/ai-providers';
import { DEFAULT_MODEL_IDS } from '../../types/model-defaults';

const FALLBACK_MODELS: Record<string, Array<{ id: string; name: string }>> = {
  openai: [
    { id: DEFAULT_MODEL_IDS.openai, name: DEFAULT_MODEL_IDS.openai },
    { id: DEFAULT_MODEL_IDS.openaiFast, name: DEFAULT_MODEL_IDS.openaiFast },
    { id: 'gpt-4o', name: 'gpt-4o' },
    { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
  ],
  anthropic: [
    { id: DEFAULT_MODEL_IDS.anthropic, name: DEFAULT_MODEL_IDS.anthropic },
    { id: 'claude-opus-4-7', name: 'claude-opus-4-7' },
    { id: 'claude-3-5-haiku-20241022', name: 'claude-3-5-haiku-20241022' },
  ],
  ollama: [
    { id: DEFAULT_MODEL_IDS.ollamaChat, name: DEFAULT_MODEL_IDS.ollamaChat },
    { id: DEFAULT_MODEL_IDS.ollamaLongContext, name: DEFAULT_MODEL_IDS.ollamaLongContext },
    { id: DEFAULT_MODEL_IDS.ollamaAgent, name: DEFAULT_MODEL_IDS.ollamaAgent },
    { id: DEFAULT_MODEL_IDS.ollamaSpecialist, name: DEFAULT_MODEL_IDS.ollamaSpecialist },
  ],
  openrouter: [
    { id: DEFAULT_MODEL_IDS.openrouter, name: DEFAULT_MODEL_IDS.openrouter },
    { id: 'anthropic/claude-opus-4-7', name: 'anthropic/claude-opus-4-7' },
    { id: 'openai/gpt-5.4', name: 'openai/gpt-5.4' },
  ],
};

export function buildProviderModelLookupFallback(
  providerName: string,
  reason: string
): ModelInfo[] {
  const provider = providerName.trim().toLowerCase();
  const fallbackModels = FALLBACK_MODELS[provider] || [];
  const compactReason = reason.trim() || 'Live model lookup failed';
  const catalogWarning = `${providerName} live model lookup is unavailable right now. ${compactReason}`;

  return fallbackModels.map((model) => ({
    ...model,
    provider,
    catalogSource: 'fallback',
    catalogWarning,
  }));
}
