export type OutputBudgetMode =
  | 'chat'
  | 'just_chat'
  | 'words_to_code'
  | 'agent'
  | 'specialist'
  | 'analysis'
  | 'pipeline'
  | 'provider_default';

function normalizeModel(model?: string): string {
  return (model || '').trim().toLowerCase();
}

export function isOllamaCloudModel(model?: string): boolean {
  const normalized = normalizeModel(model);
  return !!normalized && (normalized.includes(':cloud') || normalized.includes('-cloud'));
}

function isHighCapacityOllamaCloudModel(model?: string): boolean {
  const normalized = normalizeModel(model);
  return (
    normalized.includes('qwen3-coder-next') ||
    normalized.includes('qwen3-coder:480b') ||
    normalized.includes('deepseek-v3') ||
    normalized.includes('devstral-2:123b') ||
    normalized.includes('glm-5') ||
    normalized.includes('qwen3.5') ||
    normalized.includes('mistral-large-3')
  );
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
    const highCapacity = isHighCapacityOllamaCloudModel(normalized);
    switch (mode) {
      case 'words_to_code':
        return highCapacity ? 65536 : 49152;
      case 'agent':
      case 'specialist':
      case 'analysis':
        return highCapacity ? 32768 : 24576;
      case 'pipeline':
        return 24576;
      case 'provider_default':
      case 'chat':
      case 'just_chat':
      default:
        return 32768;
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
