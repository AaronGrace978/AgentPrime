export type OutputBudgetMode =
  | 'chat'
  | 'just_chat'
  | 'words_to_code'
  | 'agent'
  | 'specialist'
  | 'analysis'
  | 'pipeline'
  | 'provider_default';

export interface OllamaCloudOutputLimits {
  chatMaxTokens: number;
  justChatMaxTokens: number;
  wordsToCodeMaxTokens: number;
  agentMaxTokens: number;
  specialistMaxTokens: number;
  analysisMaxTokens: number;
  pipelineMaxTokens: number;
  providerDefaultMaxTokens: number;
}

export const DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS: OllamaCloudOutputLimits = {
  chatMaxTokens: 32768,
  justChatMaxTokens: 32768,
  wordsToCodeMaxTokens: 32768,
  agentMaxTokens: 32768,
  specialistMaxTokens: 32768,
  analysisMaxTokens: 32768,
  pipelineMaxTokens: 24576,
  providerDefaultMaxTokens: 32768
};

export const OLLAMA_CLOUD_MAX_TOKENS_CAP = 32768;

let runtimeOllamaCloudOutputLimits: OllamaCloudOutputLimits = { ...DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS };

function clampTokenBudget(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1024, Math.min(OLLAMA_CLOUD_MAX_TOKENS_CAP, Math.round(value / 1024) * 1024));
}

export function normalizeOllamaCloudOutputLimits(
  overrides?: Partial<OllamaCloudOutputLimits> | null
): OllamaCloudOutputLimits {
  return {
    chatMaxTokens: clampTokenBudget(overrides?.chatMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.chatMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.chatMaxTokens),
    justChatMaxTokens: clampTokenBudget(overrides?.justChatMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.justChatMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.justChatMaxTokens),
    wordsToCodeMaxTokens: clampTokenBudget(overrides?.wordsToCodeMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.wordsToCodeMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.wordsToCodeMaxTokens),
    agentMaxTokens: clampTokenBudget(overrides?.agentMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.agentMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.agentMaxTokens),
    specialistMaxTokens: clampTokenBudget(overrides?.specialistMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.specialistMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.specialistMaxTokens),
    analysisMaxTokens: clampTokenBudget(overrides?.analysisMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.analysisMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.analysisMaxTokens),
    pipelineMaxTokens: clampTokenBudget(overrides?.pipelineMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.pipelineMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.pipelineMaxTokens),
    providerDefaultMaxTokens: clampTokenBudget(overrides?.providerDefaultMaxTokens ?? DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.providerDefaultMaxTokens, DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS.providerDefaultMaxTokens)
  };
}

export function setOllamaCloudOutputLimits(overrides?: Partial<OllamaCloudOutputLimits> | null): OllamaCloudOutputLimits {
  runtimeOllamaCloudOutputLimits = normalizeOllamaCloudOutputLimits(overrides);
  return runtimeOllamaCloudOutputLimits;
}

export function getOllamaCloudOutputLimits(): OllamaCloudOutputLimits {
  return { ...runtimeOllamaCloudOutputLimits };
}

function normalizeModel(model?: string): string {
  return (model || '').trim().toLowerCase();
}

export function isOllamaCloudModel(model?: string): boolean {
  const normalized = normalizeModel(model);
  return !!normalized && (normalized.includes(':cloud') || normalized.includes('-cloud'));
}

function isAnthropicPremiumModel(model?: string): boolean {
  const normalized = normalizeModel(model);
  return normalized.includes('sonnet-4') || normalized.includes('opus-4');
}

function isAnthropicFastModel(model?: string): boolean {
  return normalizeModel(model).includes('haiku');
}

function isOpenAIPremiumModel(model?: string): boolean {
  const normalized = normalizeModel(model);
  return normalized.startsWith('gpt-5') || normalized.startsWith('gpt-4o');
}

export function getRecommendedMaxTokens(model?: string, mode: OutputBudgetMode = 'chat'): number {
  const normalized = normalizeModel(model);

  if (isOllamaCloudModel(normalized)) {
    switch (mode) {
      case 'words_to_code':
        return runtimeOllamaCloudOutputLimits.wordsToCodeMaxTokens;
      case 'agent':
        return runtimeOllamaCloudOutputLimits.agentMaxTokens;
      case 'specialist':
        return runtimeOllamaCloudOutputLimits.specialistMaxTokens;
      case 'analysis':
        return runtimeOllamaCloudOutputLimits.analysisMaxTokens;
      case 'pipeline':
        return runtimeOllamaCloudOutputLimits.pipelineMaxTokens;
      case 'provider_default':
        return runtimeOllamaCloudOutputLimits.providerDefaultMaxTokens;
      case 'chat':
        return runtimeOllamaCloudOutputLimits.chatMaxTokens;
      case 'just_chat':
        return runtimeOllamaCloudOutputLimits.justChatMaxTokens;
      default:
        return runtimeOllamaCloudOutputLimits.chatMaxTokens;
    }
  }

  if (normalized.startsWith('claude-') || normalized.startsWith('anthropic/')) {
    if (isAnthropicPremiumModel(normalized)) {
      return 16384;
    }
    if (isAnthropicFastModel(normalized)) {
      return 8192;
    }
    return 12288;
  }

  if (normalized.startsWith('gpt-') || normalized.startsWith('openai/')) {
    return isOpenAIPremiumModel(normalized) ? 16384 : 8192;
  }

  if (normalized.startsWith('ollama/')) {
    return 8192;
  }

  if (normalized) {
    return 8192;
  }

  return 4096;
}
