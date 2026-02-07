/**
 * Model Router Tests - Comprehensive coverage for AI routing
 */

import { EnhancedModelRouter } from '../../src/main/core/enhanced-model-router';

describe('EnhancedModelRouter', () => {
  let router: EnhancedModelRouter;

  beforeEach(() => {
    router = new EnhancedModelRouter();
  });

  describe('Model Selection', () => {
    it('should select fast model for simple queries', async () => {
      const result = await router.selectModel('hello world', 'chat');
      expect(result.tier).toBe('fast');
    });

    it('should select deep model for complex queries', async () => {
      const result = await router.selectModel('implement a distributed caching system with redis', 'chat');
      expect(result.tier).toBe('deep');
    });

    it('should handle fallback when primary model unavailable', async () => {
      const result = await router.selectModelWithFallback('test query', 'chat');
      expect(result).toBeDefined();
      expect(result.model).toBeTruthy();
    });

    it('should respect user-specified model', async () => {
      const result = await router.selectModel('test', 'chat', { preferredModel: 'claude-sonnet-4-20250514' });
      expect(result.model).toContain('claude');
    });
  });

  describe('Performance Tracking', () => {
    it('should record response times', async () => {
      await router.recordPerformance('ollama', 'mistral:7b', 150, true);
      const metrics = router.getPerformanceMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should calculate average latency', async () => {
      await router.recordPerformance('ollama', 'mistral:7b', 100, true);
      await router.recordPerformance('ollama', 'mistral:7b', 200, true);
      const avg = router.getAverageLatency('ollama', 'mistral:7b');
      expect(avg).toBe(150);
    });

    it('should track P95 latency', async () => {
      for (let i = 0; i < 100; i++) {
        await router.recordPerformance('ollama', 'mistral:7b', i, true);
      }
      const p95 = router.getP95Latency('ollama', 'mistral:7b');
      expect(p95).toBeLessThanOrEqual(95);
    });
  });

  describe('Cost Optimization', () => {
    it('should prefer local models when available', async () => {
      const result = await router.selectCostEffectiveModel('simple task');
      expect(result.provider).toBe('ollama');
    });

    it('should calculate cost for cloud models', async () => {
      const cost = router.calculateCost('anthropic', 'claude-sonnet-4-20250514', 1000, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it('should track cumulative costs', async () => {
      await router.recordCost('anthropic', 'claude-sonnet-4-20250514', 0.05);
      const total = router.getTotalCost();
      expect(total).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe('Capability Matching', () => {
    it('should match task to model capabilities', async () => {
      const result = await router.matchCapabilities(['coding', 'debugging']);
      expect(result).toBeDefined();
      expect(result.capabilities).toContain('coding');
    });

    it('should handle missing capabilities gracefully', async () => {
      const result = await router.matchCapabilities(['nonexistent_capability']);
      expect(result).toBeDefined(); // Should fallback to general model
    });
  });

  describe('Error Handling', () => {
    it('should handle model timeout', async () => {
      const result = await router.selectModelWithTimeout('test', 'chat', 100);
      expect(result).toBeDefined();
    });

    it('should retry on failure', async () => {
      const result = await router.selectModelWithRetry('test', 'chat', 3);
      expect(result).toBeDefined();
    });

    it('should provide fallback on all failures', async () => {
      const result = await router.selectModelWithFallback('test', 'chat');
      expect(result).toBeDefined();
    });
  });
});

