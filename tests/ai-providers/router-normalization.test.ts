import aiRouter from '../../src/main/ai-providers';

describe('AI provider normalization', () => {
  it('infers Ollama for cloud model ids', () => {
    expect(aiRouter.inferProviderForModel('minimax-m2.7:cloud', 'openai')).toBe('ollama');
    expect(aiRouter.inferProviderForModel('qwen3-coder-next:cloud', 'anthropic')).toBe('ollama');
  });

  it('preserves explicit provider families for hosted APIs', () => {
    expect(aiRouter.inferProviderForModel('gpt-5.4', 'ollama')).toBe('openai');
    expect(aiRouter.inferProviderForModel('gpt-5.5', 'ollama')).toBe('openai');
    expect(aiRouter.inferProviderForModel('claude-sonnet-4-6', 'openai')).toBe('anthropic');
    expect(aiRouter.inferProviderForModel('openrouter/meta-llama/llama-3.3-70b-instruct', 'ollama')).toBe('openrouter');
  });

  it('normalizes mismatched active provider selections', () => {
    aiRouter.setActiveProvider('openai', 'minimax-m2.7:cloud');

    expect(aiRouter.getActiveProvider().getInfo().name).toBe('ollama');
  });
});
