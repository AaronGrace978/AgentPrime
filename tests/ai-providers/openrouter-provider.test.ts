jest.mock('axios');
import axios from 'axios';

import { OpenRouterProvider } from '../../src/main/ai-providers/openrouter-provider';

describe('OpenRouterProvider getModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws authentication failures instead of silently returning fallback defaults', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            message: 'Invalid API key',
          },
        },
      },
      message: 'Request failed with status code 401',
    });

    const provider = new OpenRouterProvider({ apiKey: 'bad-key' });

    await expect(provider.getModels()).rejects.toThrow(
      'OpenRouter authentication failed: Invalid API key'
    );
  });

  it('returns annotated fallback models when the live catalog is temporarily unavailable', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce({
      message: 'socket hang up',
    });

    const provider = new OpenRouterProvider({ apiKey: 'test-key' });
    const models = await provider.getModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toMatchObject({
      provider: 'openrouter',
      catalogSource: 'fallback',
    });
    expect(models[0]?.catalogWarning).toContain('OpenRouter live model lookup is unavailable right now.');
    expect(models[0]?.catalogWarning).toContain('socket hang up');
  });
});
