import { OllamaProvider } from '../../src/main/ai-providers/ollama-provider';

describe('OllamaProvider cloud URL normalization', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes DeepSeek cloud models through the official Ollama Cloud host', () => {
    const provider = new OllamaProvider({
      model: 'deepseek-v4-pro:cloud',
      apiKey: 'test-key',
    });

    expect((provider as any).baseUrl).toBe('https://ollama.com');
  });

  it('rewrites the old DeepSeek cloud host to Ollama Cloud', () => {
    const provider = new OllamaProvider({
      model: 'deepseek-v4-pro:cloud',
      baseUrl: 'https://ollama.deepseek.com/',
      apiKey: 'test-key',
    });

    expect((provider as any).baseUrl).toBe('https://ollama.com');
  });

  it('rewrites the old api.ollama.com host to Ollama Cloud', () => {
    const provider = new OllamaProvider({
      model: 'kimi-k2.6:cloud',
      baseUrl: 'https://api.ollama.com/',
      apiKey: 'test-key',
    });

    expect((provider as any).baseUrl).toBe('https://ollama.com');
  });

  it('overrides a local base URL when a cloud model is requested at runtime', () => {
    const provider = new OllamaProvider({
      model: 'llama3.2',
      baseUrl: 'http://127.0.0.1:11434',
    });

    const context = (provider as any).resolveRequestContext('deepseek-v4-pro:cloud', 4096, false);

    expect(context.baseUrl).toBe('https://ollama.com');
    expect(context.requestUrl).toBe('https://ollama.com/api/chat');
    expect(context.isCloudModel).toBe(true);
    expect(context.isLocal).toBe(false);
  });

  it('strips cloud suffixes for direct Ollama Cloud API requests', () => {
    const provider = new OllamaProvider({
      model: 'llama3.2',
      baseUrl: 'https://ollama.com',
      apiKey: 'test-key',
    });

    const colonContext = (provider as any).resolveRequestContext('qwen3-coder-next:cloud', 4096, false);
    const dashContext = (provider as any).resolveRequestContext('gemma4-31b-cloud', 4096, false);

    expect(colonContext.apiModel).toBe('qwen3-coder-next');
    expect(dashContext.apiModel).toBe('gemma4-31b');
  });
});
