import { estimateModelCapability } from '../../src/renderer/components/AIChat/modelCapability';

describe('estimateModelCapability', () => {
  describe('tiny model edge cases', () => {
    it('scores very small parameter-count models low', () => {
      expect(estimateModelCapability('tinyllama:1.1b')).toBe(3);
      expect(estimateModelCapability('llama3.2:3b')).toBe(3);
    });

    it('caps nano/flash style models to at most mid-tier', () => {
      expect(estimateModelCapability('gpt-5.4-nano')).toBe(5);
      expect(estimateModelCapability('gemini-2.5-flash')).toBe(5);
    });
  });

  describe('large model edge cases', () => {
    it('scores frontier-scale models at the top of the range', () => {
      expect(estimateModelCapability('qwen3:405b')).toBe(10);
      expect(estimateModelCapability('llama3.1:671b-instruct')).toBe(10);
    });

    it('uses the largest matched size when multiple sizes exist', () => {
      expect(estimateModelCapability('mixtral-8x22b-176b')).toBe(8);
    });
  });

  describe('named model edge cases', () => {
    it('promotes known high-capability named models', () => {
      expect(estimateModelCapability('claude-opus-4-20250514')).toBe(9);
      expect(estimateModelCapability('mistral-large-3')).toBe(9);
    });

    it('promotes known general-purpose named models', () => {
      expect(estimateModelCapability('gpt-5')).toBe(7);
      expect(estimateModelCapability('deepseek-v3')).toBe(7);
    });

    it('is case-insensitive for model name matching', () => {
      expect(estimateModelCapability('CLAUDE-OPUS-4')).toBe(9);
    });
  });
});
