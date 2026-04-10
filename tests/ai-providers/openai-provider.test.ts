/**
 * OpenAI Provider Tests
 */

jest.mock('axios');
import axios from 'axios';

import { OpenAIProvider } from '../../src/main/ai-providers/openai-provider';

describe('OpenAIProvider getModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws authentication failures instead of returning fallback defaults', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            message: 'Incorrect API key provided',
          },
        },
      },
      message: 'Request failed with status code 401',
    });

    const provider = new OpenAIProvider({ apiKey: 'bad-key' });

    await expect(provider.getModels()).rejects.toThrow(
      'OpenAI authentication failed: Incorrect API key provided'
    );
  });

  it('returns live chat-capable OpenAI models when the API succeeds', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: {
        data: [
          { id: 'gpt-4o', owned_by: 'openai' },
          { id: 'text-davinci-instruct', owned_by: 'openai' },
          { id: 'gpt-5.4', owned_by: 'openai' },
        ],
      },
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const models = await provider.getModels();

    expect(models).toEqual([
      { id: 'gpt-5.4', name: 'gpt-5.4', provider: 'openai', owned_by: 'openai' },
      { id: 'gpt-4o', name: 'gpt-4o', provider: 'openai', owned_by: 'openai' },
    ]);
  });
});
