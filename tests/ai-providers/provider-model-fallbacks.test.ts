import { buildProviderModelLookupFallback } from '../../src/main/ai-providers/provider-model-fallbacks';
import { OLLAMA_CLOUD_MODEL_OPTIONS } from '../../src/types/ollama-cloud-models';

describe('provider model lookup fallbacks', () => {
  it('returns a scoped fallback catalog with warning metadata for optional provider failures', () => {
    const models = buildProviderModelLookupFallback(
      'openai',
      'OpenAI authentication failed: account deactivated'
    );

    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toMatchObject({
      provider: 'openai',
      catalogSource: 'fallback',
    });
    expect(models[0].catalogWarning).toContain('openai live model lookup is unavailable right now.');
    expect(models[0].catalogWarning).toContain('account deactivated');
  });

  it('keeps Ollama fallback catalog aligned with cloud model ids', () => {
    const models = buildProviderModelLookupFallback('ollama', 'Ollama catalog unavailable');
    const modelIds = models.map((model) => model.id);

    for (const model of OLLAMA_CLOUD_MODEL_OPTIONS) {
      expect(modelIds).toContain(model.value);
    }
    expect(modelIds).not.toContain('gemma4');
  });
});
