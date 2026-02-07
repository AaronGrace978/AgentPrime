/**
 * Performance Tracker - P95 Latency Monitoring
 * 
 * Tracks performance metrics with percentile calculations
 * Ensures P95 latency stays <50ms for critical operations
 */

export interface PerformanceMetrics {
  count: number;
  latest: number;
  min: number;
  max: number;
  average: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface AlertConfig {
  operation: string;
  threshold: number;
  percentile: number;
}

export class PerformanceTracker {
  private metrics: Map<string, number[]> = new Map();
  private windowSizes: Map<string, number> = new Map();
  private thresholds: Map<string, AlertConfig> = new Map();
  private alertCallbacks: Array<(alert: AlertConfig, value: number) => void> = [];

  /**
   * Record a latency measurement
   */
  recordLatency(operation: string, latency: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const measurements = this.metrics.get(operation)!;
    measurements.push(latency);

    // Maintain window size
    const windowSize = this.windowSizes.get(operation) || 1000;
    if (measurements.length > windowSize) {
      measurements.shift();
    }

    // Check thresholds
    this.checkThresholds(operation);
  }

  /**
   * Get metrics for an operation
   */
  getMetrics(operation: string): PerformanceMetrics {
    const measurements = this.metrics.get(operation) || [];
    
    if (measurements.length === 0) {
      return {
        count: 0,
        latest: 0,
        min: 0,
        max: 0,
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    
    return {
      count: measurements.length,
      latest: measurements[measurements.length - 1],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      average: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      p50: this.calculatePercentile(sorted, 50),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99)
    };
  }

  /**
   * Get specific percentile
   */
  getPercentile(operation: string, percentile: number): number {
    const measurements = this.metrics.get(operation) || [];
    if (measurements.length === 0) return 0;

    const sorted = [...measurements].sort((a, b) => a - b);
    return this.calculatePercentile(sorted, percentile);
  }

  /**
   * Get average latency
   */
  getAverage(operation: string): number {
    const measurements = this.metrics.get(operation) || [];
    if (measurements.length === 0) return 0;
    return measurements.reduce((a, b) => a + b, 0) / measurements.length;
  }

  /**
   * Set alert threshold
   */
  setThreshold(operation: string, threshold: number, percentile: number = 95): void {
    this.thresholds.set(operation, { operation, threshold, percentile });
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: AlertConfig, value: number) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Set window size for rolling metrics
   */
  setWindowSize(operation: string, size: number): void {
    this.windowSizes.set(operation, size);
  }

  /**
   * Clear metrics for an operation
   */
  clear(operation: string): void {
    this.metrics.delete(operation);
  }

  /**
   * Clear all metrics
   */
  clearAll(): void {
    this.metrics.clear();
  }

  /**
   * Get aggregate metrics across all operations
   */
  getAggregateMetrics(): {
    totalOperations: number;
    overallAverage: number;
    operations: Array<{ name: string; metrics: PerformanceMetrics }>;
  } {
    const operations: Array<{ name: string; metrics: PerformanceMetrics }> = [];
    let totalMeasurements = 0;
    let totalLatency = 0;

    for (const [operation, measurements] of this.metrics.entries()) {
      operations.push({
        name: operation,
        metrics: this.getMetrics(operation)
      });
      totalMeasurements += measurements.length;
      totalLatency += measurements.reduce((a, b) => a + b, 0);
    }

    return {
      totalOperations: operations.length,
      overallAverage: totalMeasurements > 0 ? totalLatency / totalMeasurements : 0,
      operations
    };
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    const data: Record<string, PerformanceMetrics> = {};
    
    for (const operation of this.metrics.keys()) {
      data[operation] = this.getMetrics(operation);
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Generate performance report
   */
  generateReport(operation: string): string {
    const metrics = this.getMetrics(operation);
    
    return `
Performance Report: ${operation}
================================
Count:      ${metrics.count}
Latest:     ${metrics.latest.toFixed(2)}ms
Average:    ${metrics.average.toFixed(2)}ms
Min:        ${metrics.min.toFixed(2)}ms
Max:        ${metrics.max.toFixed(2)}ms
P50:        ${metrics.p50.toFixed(2)}ms
P95:        ${metrics.p95.toFixed(2)}ms
P99:        ${metrics.p99.toFixed(2)}ms
================================
    `.trim();
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Check if any thresholds are exceeded
   */
  private checkThresholds(operation: string): void {
    const config = this.thresholds.get(operation);
    if (!config) return;

    const value = this.getPercentile(operation, config.percentile);
    
    if (value > config.threshold) {
      // Trigger alerts
      for (const callback of this.alertCallbacks) {
        callback(config, value);
      }
    }
  }
}

// Singleton instance
let performanceTracker: PerformanceTracker | null = null;

export function getPerformanceTracker(): PerformanceTracker {
  if (!performanceTracker) {
    performanceTracker = new PerformanceTracker();
    
    // Set default thresholds for critical operations
    performanceTracker.setThreshold('ai-completion', 50, 95);
    performanceTracker.setThreshold('collab-change', 50, 95);
    performanceTracker.setThreshold('file-read', 100, 95);
    performanceTracker.setThreshold('file-write', 200, 95);
  }
  
  return performanceTracker;
}

