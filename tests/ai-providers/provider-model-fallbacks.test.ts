import { buildProviderModelLookupFallback } from '../../src/main/ai-providers/provider-model-fallbacks';

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
});
