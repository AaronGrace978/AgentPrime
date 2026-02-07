/**
 * PerformanceMonitor - Performance tracking and visualization for AgentPrime
 * 
 * Features:
 * - Memory usage tracking
 * - CPU usage monitoring
 * - AI response latency
 * - Render performance
 * - Cache statistics
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconRefresh,
  IconTrash,
  IconChevronDown,
  IconChevronRight
} from './Icons';

// Performance metrics
interface PerformanceMetrics {
  // Memory
  heapUsed: number;
  heapTotal: number;
  heapLimit: number;
  
  // Timing
  pageLoadTime: number;
  domContentLoaded: number;
  
  // AI metrics
  aiResponseTimes: number[];
  avgAiResponseTime: number;
  lastAiResponseTime: number;
  
  // Cache
  cacheHitRate: number;
  cacheSize: number;
  
  // Render
  fps: number;
  renderCount: number;
  slowRenders: number;
}

interface PerformanceHistory {
  timestamp: number;
  heapUsed: number;
  fps: number;
}

interface PerformanceMonitorProps {
  isOpen?: boolean;
  position?: 'bottom-right' | 'bottom-left' | 'floating';
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isOpen: initialOpen = false,
  position = 'bottom-right'
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isMinimized, setIsMinimized] = useState(true);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    heapUsed: 0,
    heapTotal: 0,
    heapLimit: 0,
    pageLoadTime: 0,
    domContentLoaded: 0,
    aiResponseTimes: [],
    avgAiResponseTime: 0,
    lastAiResponseTime: 0,
    cacheHitRate: 0,
    cacheSize: 0,
    fps: 60,
    renderCount: 0,
    slowRenders: 0
  });
  const [history, setHistory] = useState<PerformanceHistory[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['memory', 'ai']));
  
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const renderCountRef = useRef(0);

  // Toggle section expansion
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  // Collect memory metrics
  const collectMemoryMetrics = useCallback(() => {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      return {
        heapUsed: memInfo.usedJSHeapSize,
        heapTotal: memInfo.totalJSHeapSize,
        heapLimit: memInfo.jsHeapSizeLimit
      };
    }
    return { heapUsed: 0, heapTotal: 0, heapLimit: 0 };
  }, []);

  // Collect timing metrics
  const collectTimingMetrics = useCallback(() => {
    const timing = performance.timing || {};
    return {
      pageLoadTime: timing.loadEventEnd - timing.navigationStart,
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart
    };
  }, []);

  // Calculate FPS
  const calculateFps = useCallback(() => {
    frameCountRef.current++;
    const now = performance.now();
    const elapsed = now - lastFrameTimeRef.current;
    
    if (elapsed >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
      return fps;
    }
    return metrics.fps;
  }, [metrics.fps]);

  // Update metrics
  const updateMetrics = useCallback(() => {
    const memoryMetrics = collectMemoryMetrics();
    const timingMetrics = collectTimingMetrics();
    const fps = calculateFps();
    
    renderCountRef.current++;
    
    setMetrics(prev => ({
      ...prev,
      ...memoryMetrics,
      ...timingMetrics,
      fps,
      renderCount: renderCountRef.current
    }));
    
    // Add to history (keep last 60 entries = 1 minute at 1/sec)
    setHistory(prev => {
      const newEntry: PerformanceHistory = {
        timestamp: Date.now(),
        heapUsed: memoryMetrics.heapUsed,
        fps
      };
      return [...prev.slice(-59), newEntry];
    });
  }, [collectMemoryMetrics, collectTimingMetrics, calculateFps]);

  // Fetch AI metrics from backend
  const fetchAiMetrics = useCallback(async () => {
    try {
      if (window.agentAPI?.invoke) {
        const result = await window.agentAPI.invoke('completion:cache-stats');
        if (result.success) {
          setMetrics(prev => ({
            ...prev,
            cacheHitRate: result.stats.hitRate * 100,
            cacheSize: result.stats.size
          }));
        }
      }
    } catch (error) {
      // Silently fail if API not available
    }
  }, []);

  // Record AI response time (can be called externally)
  const recordAiResponseTime = useCallback((time: number) => {
    setMetrics(prev => {
      const times = [...prev.aiResponseTimes, time].slice(-100); // Keep last 100
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return {
        ...prev,
        aiResponseTimes: times,
        avgAiResponseTime: avg,
        lastAiResponseTime: time
      };
    });
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    renderCountRef.current = 0;
    setMetrics(prev => ({
      ...prev,
      aiResponseTimes: [],
      avgAiResponseTime: 0,
      lastAiResponseTime: 0,
      renderCount: 0,
      slowRenders: 0
    }));
  }, []);

  // Force garbage collection (if available)
  const forceGc = useCallback(() => {
    if ((window as any).gc) {
      (window as any).gc();
      setTimeout(updateMetrics, 100);
    }
  }, [updateMetrics]);

  // Start monitoring
  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(updateMetrics, 1000);
    const aiInterval = setInterval(fetchAiMetrics, 5000);
    
    // Initial fetch
    updateMetrics();
    fetchAiMetrics();
    
    return () => {
      clearInterval(interval);
      clearInterval(aiInterval);
    };
  }, [isOpen, updateMetrics, fetchAiMetrics]);

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Format milliseconds
  const formatMs = (ms: number): string => {
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Get memory usage percentage
  const getMemoryPercentage = (): number => {
    if (metrics.heapLimit === 0) return 0;
    return (metrics.heapUsed / metrics.heapLimit) * 100;
  };

  // Get status color
  const getStatusColor = (value: number, thresholds: [number, number]): string => {
    if (value < thresholds[0]) return 'var(--success)';
    if (value < thresholds[1]) return 'var(--warning)';
    return 'var(--error)';
  };

  // Render mini sparkline
  const renderSparkline = (data: number[], color: string = 'var(--accent-primary)') => {
    if (data.length < 2) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    const width = 100;
    const height = 24;
    
    const points = data.map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <svg width={width} height={height} className="sparkline">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
        />
      </svg>
    );
  };

  if (!isOpen) {
    return (
      <button 
        className="perf-toggle-btn"
        onClick={() => setIsOpen(true)}
        title="Open Performance Monitor"
      >
        📊
      </button>
    );
  }

  const memoryPercent = getMemoryPercentage();

  return (
    <div className={`performance-monitor ${position} ${isMinimized ? 'minimized' : ''}`}>
      {/* Header */}
      <div className="perf-header" onClick={() => setIsMinimized(!isMinimized)}>
        <span className="perf-title">⚡ Performance</span>
        <div className="perf-quick-stats">
          <span style={{ color: getStatusColor(memoryPercent, [50, 80]) }}>
            {formatBytes(metrics.heapUsed)}
          </span>
          <span style={{ color: getStatusColor(100 - metrics.fps, [20, 40]) }}>
            {metrics.fps} FPS
          </span>
        </div>
        <div className="perf-controls">
          <button onClick={(e) => { e.stopPropagation(); clearHistory(); }} title="Clear">
            <IconTrash size="xs" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} title="Close">
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="perf-content">
          {/* Memory Section */}
          <div className="perf-section">
            <div 
              className="perf-section-header"
              onClick={() => toggleSection('memory')}
            >
              {expandedSections.has('memory') ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
              <span>Memory</span>
              <span className="perf-section-value">{formatBytes(metrics.heapUsed)}</span>
            </div>
            
            {expandedSections.has('memory') && (
              <div className="perf-section-content">
                <div className="perf-progress">
                  <div 
                    className="perf-progress-bar"
                    style={{ 
                      width: `${memoryPercent}%`,
                      backgroundColor: getStatusColor(memoryPercent, [50, 80])
                    }}
                  />
                </div>
                
                <div className="perf-stat-row">
                  <span>Heap Used</span>
                  <span>{formatBytes(metrics.heapUsed)}</span>
                </div>
                <div className="perf-stat-row">
                  <span>Heap Total</span>
                  <span>{formatBytes(metrics.heapTotal)}</span>
                </div>
                <div className="perf-stat-row">
                  <span>Heap Limit</span>
                  <span>{formatBytes(metrics.heapLimit)}</span>
                </div>
                
                {(window as any).gc && (
                  <button className="perf-action-btn" onClick={forceGc}>
                    <IconRefresh size="xs" /> Force GC
                  </button>
                )}
                
                {history.length > 1 && (
                  <div className="perf-chart">
                    {renderSparkline(history.map(h => h.heapUsed))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Section */}
          <div className="perf-section">
            <div 
              className="perf-section-header"
              onClick={() => toggleSection('ai')}
            >
              {expandedSections.has('ai') ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
              <span>AI Performance</span>
              <span className="perf-section-value">{formatMs(metrics.avgAiResponseTime)}</span>
            </div>
            
            {expandedSections.has('ai') && (
              <div className="perf-section-content">
                <div className="perf-stat-row">
                  <span>Avg Response</span>
                  <span style={{ color: getStatusColor(metrics.avgAiResponseTime, [100, 500]) }}>
                    {formatMs(metrics.avgAiResponseTime)}
                  </span>
                </div>
                <div className="perf-stat-row">
                  <span>Last Response</span>
                  <span>{formatMs(metrics.lastAiResponseTime)}</span>
                </div>
                <div className="perf-stat-row">
                  <span>Cache Hit Rate</span>
                  <span style={{ color: getStatusColor(100 - metrics.cacheHitRate, [30, 60]) }}>
                    {metrics.cacheHitRate.toFixed(1)}%
                  </span>
                </div>
                <div className="perf-stat-row">
                  <span>Cache Size</span>
                  <span>{metrics.cacheSize} entries</span>
                </div>
                
                {metrics.aiResponseTimes.length > 1 && (
                  <div className="perf-chart">
                    {renderSparkline(
                      metrics.aiResponseTimes,
                      getStatusColor(metrics.avgAiResponseTime, [100, 500])
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Render Section */}
          <div className="perf-section">
            <div 
              className="perf-section-header"
              onClick={() => toggleSection('render')}
            >
              {expandedSections.has('render') ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
              <span>Rendering</span>
              <span className="perf-section-value">{metrics.fps} FPS</span>
            </div>
            
            {expandedSections.has('render') && (
              <div className="perf-section-content">
                <div className="perf-stat-row">
                  <span>Frame Rate</span>
                  <span style={{ color: getStatusColor(60 - metrics.fps, [15, 30]) }}>
                    {metrics.fps} FPS
                  </span>
                </div>
                <div className="perf-stat-row">
                  <span>Render Count</span>
                  <span>{metrics.renderCount}</span>
                </div>
                <div className="perf-stat-row">
                  <span>Page Load</span>
                  <span>{formatMs(metrics.pageLoadTime)}</span>
                </div>
                <div className="perf-stat-row">
                  <span>DOM Ready</span>
                  <span>{formatMs(metrics.domContentLoaded)}</span>
                </div>
                
                {history.length > 1 && (
                  <div className="perf-chart">
                    {renderSparkline(
                      history.map(h => h.fps),
                      getStatusColor(60 - metrics.fps, [15, 30])
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .performance-monitor {
          position: fixed;
          z-index: 9999;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          font-size: 0.75rem;
          min-width: 240px;
          max-width: 300px;
        }
        
        .performance-monitor.bottom-right {
          bottom: 16px;
          right: 16px;
        }
        
        .performance-monitor.bottom-left {
          bottom: 16px;
          left: 16px;
        }
        
        .performance-monitor.minimized {
          max-width: 200px;
        }
        
        .perf-toggle-btn {
          position: fixed;
          bottom: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 50%;
          cursor: pointer;
          z-index: 9999;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .perf-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
        }
        
        .perf-title {
          font-weight: 600;
          font-size: 0.7rem;
        }
        
        .perf-quick-stats {
          flex: 1;
          display: flex;
          gap: var(--spacing-sm);
          justify-content: flex-end;
          font-family: var(--font-mono);
          font-size: 0.65rem;
        }
        
        .perf-controls {
          display: flex;
          gap: 2px;
        }
        
        .perf-controls button {
          padding: 2px 4px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.65rem;
        }
        
        .perf-controls button:hover {
          color: var(--text-primary);
        }
        
        .perf-content {
          max-height: 300px;
          overflow-y: auto;
        }
        
        .perf-section {
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .perf-section:last-child {
          border-bottom: none;
        }
        
        .perf-section-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          padding: var(--spacing-xs) var(--spacing-sm);
          cursor: pointer;
          font-weight: 500;
        }
        
        .perf-section-header:hover {
          background: var(--bg-hover);
        }
        
        .perf-section-value {
          margin-left: auto;
          font-family: var(--font-mono);
          font-size: 0.65rem;
          color: var(--text-secondary);
        }
        
        .perf-section-content {
          padding: var(--spacing-xs) var(--spacing-sm) var(--spacing-sm);
        }
        
        .perf-progress {
          height: 4px;
          background: var(--bg-tertiary);
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: var(--spacing-xs);
        }
        
        .perf-progress-bar {
          height: 100%;
          transition: width 0.3s, background-color 0.3s;
        }
        
        .perf-stat-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          color: var(--text-secondary);
        }
        
        .perf-stat-row span:last-child {
          font-family: var(--font-mono);
        }
        
        .perf-action-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: var(--spacing-xs);
          padding: 4px 8px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-sm);
          color: var(--text-secondary);
          font-size: 0.65rem;
          cursor: pointer;
        }
        
        .perf-action-btn:hover {
          background: var(--bg-hover);
        }
        
        .perf-chart {
          margin-top: var(--spacing-xs);
          padding: var(--spacing-xs);
          background: var(--bg-tertiary);
          border-radius: var(--border-radius-sm);
        }
        
        .sparkline {
          display: block;
          width: 100%;
        }
      `}</style>
    </div>
  );
};

export default PerformanceMonitor;

// Export performance recording function for external use
export const recordAiLatency = (latency: number) => {
  // Dispatch custom event for performance monitor
  window.dispatchEvent(new CustomEvent('ai-latency', { detail: { latency } }));
};

