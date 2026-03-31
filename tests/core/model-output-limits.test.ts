import { getRecommendedMaxTokens, isOllamaCloudModel } from '../../src/main/core/model-output-limits';

describe('model output limits', () => {
  it('detects Ollama cloud models', () => {
    expect(isOllamaCloudModel('qwen3-coder-next:cloud')).toBe(true);
    expect(isOllamaCloudModel('deepseek-v3.1:671b-cloud')).toBe(true);
    expect(isOllamaCloudModel('qwen2.5-coder:32b')).toBe(false);
  });

  it('gives Ollama cloud higher chat and generation budgets', () => {
    expect(getRecommendedMaxTokens('qwen3-coder-next:cloud', 'chat')).toBe(32768);
    expect(getRecommendedMaxTokens('qwen3-coder-next:cloud', 'agent')).toBe(32768);
    expect(getRecommendedMaxTokens('qwen3-coder-next:cloud', 'words_to_code')).toBe(32768);
  });

  it('keeps non-cloud providers on conservative defaults', () => {
    expect(getRecommendedMaxTokens('claude-sonnet-4-6', 'chat')).toBe(16384);
    expect(getRecommendedMaxTokens('gpt-5.4-mini', 'chat')).toBe(16384);
    expect(getRecommendedMaxTokens('qwen2.5-coder:32b', 'chat')).toBe(8192);
  });
});
