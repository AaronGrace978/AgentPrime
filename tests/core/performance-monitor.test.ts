/**
 * Performance Monitor Tests - P95 Latency Tracking
 */

import { PerformanceTracker } from '../../src/main/core/performance-tracker';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker();
  });

  describe('Latency Tracking', () => {
    it('should record latency measurements', () => {
      tracker.recordLatency('ai-completion', 45);
      const metrics = tracker.getMetrics('ai-completion');
      expect(metrics.count).toBe(1);
      expect(metrics.latest).toBe(45);
    });

    it('should calculate P50 latency', () => {
      for (let i = 1; i <= 100; i++) {
        tracker.recordLatency('test', i);
      }
      const p50 = tracker.getPercentile('test', 50);
      expect(p50).toBeCloseTo(50, 5);
    });

    it('should calculate P95 latency', () => {
      for (let i = 1; i <= 100; i++) {
        tracker.recordLatency('test', i);
      }
      const p95 = tracker.getPercentile('test', 95);
      expect(p95).toBeCloseTo(95, 5);
    });

    it('should calculate P99 latency', () => {
      for (let i = 1; i <= 100; i++) {
        tracker.recordLatency('test', i);
      }
      const p99 = tracker.getPercentile('test', 99);
      expect(p99).toBeCloseTo(99, 5);
    });

    it('should track average latency', () => {
      tracker.recordLatency('test', 100);
      tracker.recordLatency('test', 200);
      const avg = tracker.getAverage('test');
      expect(avg).toBe(150);
    });

    it('should track min/max latency', () => {
      tracker.recordLatency('test', 50);
      tracker.recordLatency('test', 150);
      tracker.recordLatency('test', 100);
      const metrics = tracker.getMetrics('test');
      expect(metrics.min).toBe(50);
      expect(metrics.max).toBe(150);
    });
  });

  describe('Performance Alerts', () => {
    it('should trigger alert when P95 exceeds threshold', () => {
      const alertSpy = jest.fn();
      tracker.onAlert(alertSpy);
      
      tracker.setThreshold('ai-completion', 50, 95);
      for (let i = 1; i <= 100; i++) {
        tracker.recordLatency('ai-completion', i);
      }
      
      expect(alertSpy).toHaveBeenCalled();
    });

    it('should not trigger alert when within threshold', () => {
      const alertSpy = jest.fn();
      tracker.onAlert(alertSpy);
      
      tracker.setThreshold('ai-completion', 100, 95);
      for (let i = 1; i <= 50; i++) {
        tracker.recordLatency('ai-completion', i);
      }
      
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('Time Window Management', () => {
    it('should maintain rolling window of metrics', () => {
      tracker.setWindowSize('test', 10);
      for (let i = 1; i <= 20; i++) {
        tracker.recordLatency('test', i);
      }
      const metrics = tracker.getMetrics('test');
      expect(metrics.count).toBe(10); // Only last 10
    });

    it('should clear old metrics', () => {
      tracker.recordLatency('test', 100);
      tracker.clear('test');
      const metrics = tracker.getMetrics('test');
      expect(metrics.count).toBe(0);
    });
  });

  describe('Multi-Operation Tracking', () => {
    it('should track multiple operations independently', () => {
      tracker.recordLatency('completion', 50);
      tracker.recordLatency('chat', 100);
      
      expect(tracker.getMetrics('completion').latest).toBe(50);
      expect(tracker.getMetrics('chat').latest).toBe(100);
    });

    it('should provide aggregated metrics', () => {
      tracker.recordLatency('op1', 50);
      tracker.recordLatency('op2', 100);
      tracker.recordLatency('op3', 150);
      
      const aggregate = tracker.getAggregateMetrics();
      expect(aggregate.totalOperations).toBe(3);
      expect(aggregate.overallAverage).toBe(100);
    });
  });

  describe('Export and Reporting', () => {
    it('should export metrics as JSON', () => {
      tracker.recordLatency('test', 100);
      const json = tracker.exportMetrics();
      expect(json).toBeDefined();
      expect(JSON.parse(json)).toHaveProperty('test');
    });

    it('should generate performance report', () => {
      for (let i = 1; i <= 100; i++) {
        tracker.recordLatency('test', i);
      }
      const report = tracker.generateReport('test');
      expect(report).toContain('P95');
      expect(report).toContain('P99');
    });
  });
});

