import React, { useState, useEffect } from 'react';

// @ts-ignore - window.agentAPI is injected by preload script
declare const window: any;

interface MirrorIntelligenceProps {
  expanded?: boolean;
  onToggle?: () => void;
  onPatternLearned?: (data: { pattern: string; category: string; intelligence: number }) => void;
}

interface MirrorPattern {
  id: string;
  description: string;
  category: string;
  confidence?: number;
  successRate?: number;
  type?: string;
}

interface MirrorMetrics {
  Q: number;
  R: number;
  E: number;
  intelligence?: number;
  currentIntelligence?: number;
}

const MirrorIntelligence: React.FC<MirrorIntelligenceProps> = ({
  expanded = false,
  onToggle,
  onPatternLearned
}) => {
  const [intelligence, setIntelligence] = useState(1.0);
  const [patterns, setPatterns] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [isLearning, setIsLearning] = useState(false);
  const [recentInsights, setRecentInsights] = useState<string[]>([]);
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestCode, setIngestCode] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showIngestPanel, setShowIngestPanel] = useState(false);
  const [allPatterns, setAllPatterns] = useState<MirrorPattern[]>([]);
  const [showPatterns, setShowPatterns] = useState(false);
  const [opusLoaded, setOpusLoaded] = useState(false);
  const [isLoadingOpus, setIsLoadingOpus] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isLearningActive, setIsLearningActive] = useState(false);
  const [lastLearnedPattern, setLastLearnedPattern] = useState<{ pattern: string; category: string } | null>(null);

  // Auto-init Opus patterns and load data on mount
  useEffect(() => {
    initOpusPatterns();
    loadMirrorData();
    const interval = setInterval(loadMirrorData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Listen for pattern learned events
  useEffect(() => {
    const agentAPI = (window as any).agentAPI;
    if (!agentAPI || !agentAPI.onMirrorPatternLearned) return;

    const handlePatternLearned = (data: { pattern: string; category: string; intelligence: number }) => {
      setIsLearningActive(true);
      setLastLearnedPattern({ pattern: data.pattern, category: data.category });
      setIntelligence(data.intelligence);

      // Call the callback prop for toast notifications
      onPatternLearned?.(data);

      // Reset learning indicator after 3 seconds
      setTimeout(() => {
        setIsLearningActive(false);
      }, 3000);

      // Refresh data to show new pattern
      loadMirrorData();
    };

    agentAPI.onMirrorPatternLearned(handlePatternLearned);

    return () => {
      if (agentAPI.removeMirrorPatternLearned) {
        agentAPI.removeMirrorPatternLearned();
      }
    };
  }, []);

  const initOpusPatterns = async () => {
    try {
      const agentAPI = (window as any).agentAPI;
      if (!agentAPI || !agentAPI.mirrorAutoInit) return;

      const result = await agentAPI.mirrorAutoInit();
      if (result && result.success) {
        setOpusLoaded(true);
        if (!result.alreadyLoaded) {
          console.log('[MirrorIntelligence] 🧠 Opus 4.5 patterns loaded!');
        }
        loadMirrorData(); // Refresh data
      }
    } catch (error) {
      console.log('[MirrorIntelligence] Opus auto-init not available:', error);
    }
  };

  const loadMirrorData = async () => {
    try {
      const agentAPI = (window as any).agentAPI;
      if (!agentAPI) return;

      // Get metrics
      if (agentAPI.mirrorGetMetrics) {
        const metricsResult = await agentAPI.mirrorGetMetrics();
        if (metricsResult && metricsResult.success && metricsResult.metrics) {
          const metrics: MirrorMetrics = metricsResult.metrics;
          setIntelligence(metrics.intelligence ?? metrics.currentIntelligence ?? 1.0);
        }
      }

      // Get patterns
      if (agentAPI.mirrorGetPatterns) {
        const patternsResult = await agentAPI.mirrorGetPatterns(null, 50);
        if (patternsResult && patternsResult.success && patternsResult.patterns) {
          const allPatternsList = patternsResult.patterns;
          setAllPatterns(allPatternsList);
          setPatterns(allPatternsList.length);
          
          // Count mistakes/anti-patterns
          const mistakeCount = allPatternsList.filter((p: MirrorPattern) => 
            p.type === 'anti-pattern' || 
            (p.successRate !== undefined && p.successRate < 0.3) ||
            p.description?.toLowerCase().includes('mistake') ||
            p.description?.toLowerCase().includes('avoid')
          ).length;
          setMistakes(mistakeCount);

          // Get recent insights (last 5 patterns)
          const recent = allPatternsList
            .slice(0, 5)
            .map((p: MirrorPattern) => {
              const icon = p.type === 'anti-pattern' ? '❌' : '✨';
              return `${icon} ${p.description || p.category}`;
            });
          setRecentInsights(recent);
        }
      }

      // Get status
      if (agentAPI.mirrorGetStatus) {
        const statusResult = await agentAPI.mirrorGetStatus();
        if (statusResult && statusResult.success) {
          setIsLearning(statusResult.isLearning || false);
        }
      }
    } catch (error) {
      console.log('[MirrorIntelligence] Error loading data:', error);
    }
  };

  const handleIngestUrl = async () => {
    if (!ingestUrl.trim()) {
      setIngestStatus({ type: 'error', message: 'Please enter a URL' });
      return;
    }

    setIsIngesting(true);
    setIngestStatus(null);

    try {
      const agentAPI = (window as any).agentAPI;
      if (!agentAPI || !agentAPI.mirrorIngestUrl) {
        throw new Error('Mirror ingestion not available');
      }

      const result = await agentAPI.mirrorIngestUrl(ingestUrl, {
        source: 'manual_ingestion',
        timestamp: new Date().toISOString()
      });

      if (result && result.success) {
        setIngestStatus({ 
          type: 'success', 
          message: `✅ Ingested ${result.patternsExtracted || 0} patterns from URL` 
        });
        setIngestUrl('');
        loadMirrorData(); // Refresh data
      } else {
        setIngestStatus({ 
          type: 'error', 
          message: result?.error || 'Failed to ingest URL' 
        });
      }
    } catch (error: any) {
      setIngestStatus({ 
        type: 'error', 
        message: error.message || 'Failed to ingest URL' 
      });
    } finally {
      setIsIngesting(false);
    }
  };

  const handleIngestCode = async () => {
    if (!ingestCode.trim()) {
      setIngestStatus({ type: 'error', message: 'Please paste some code' });
      return;
    }

    console.log('[MirrorIntelligence] 📋 Starting code ingestion...');
    console.log('[MirrorIntelligence] Code length:', ingestCode.length, 'chars');
    
    setIsIngesting(true);
    setIngestStatus(null);

    try {
      const agentAPI = (window as any).agentAPI;
      console.log('[MirrorIntelligence] agentAPI available:', !!agentAPI);
      console.log('[MirrorIntelligence] mirrorIngestContent available:', !!(agentAPI && agentAPI.mirrorIngestContent));
      
      if (!agentAPI || !agentAPI.mirrorIngestContent) {
        throw new Error('Mirror ingestion not available - agentAPI or mirrorIngestContent is missing');
      }

      const result = await agentAPI.mirrorIngestContent(ingestCode, {
        source: 'manual_paste',
        timestamp: new Date().toISOString()
      });
      
      console.log('[MirrorIntelligence] Ingestion result:', result);

      if (result && result.success) {
        setIngestStatus({ 
          type: 'success', 
          message: `✅ Ingested ${result.patternsExtracted || 0} patterns from code` 
        });
        setIngestCode('');
        loadMirrorData(); // Refresh data
      } else {
        setIngestStatus({ 
          type: 'error', 
          message: result?.error || 'Failed to ingest code' 
        });
      }
    } catch (error: any) {
      setIngestStatus({ 
        type: 'error', 
        message: error.message || 'Failed to ingest code' 
      });
    } finally {
      setIsIngesting(false);
    }
  };

  const handleClearAntiPatterns = async () => {
    if (!window.confirm('Clear all learned mistakes? This cannot be undone.')) {
      return;
    }

    setIsClearing(true);
    try {
      const agentAPI = (window as any).agentAPI;
      if (!agentAPI || !agentAPI.mirrorClearAntiPatterns) {
        throw new Error('Mirror clear not available');
      }

      const result = await agentAPI.mirrorClearAntiPatterns();
      if (result && result.success) {
        setIngestStatus({ 
          type: 'success', 
          message: '🗑️ Cleared all anti-patterns! Starting fresh.' 
        });
        setMistakes(0);
        loadMirrorData();
      } else {
        setIngestStatus({ 
          type: 'error', 
          message: result?.error || 'Failed to clear anti-patterns' 
        });
      }
    } catch (error: any) {
      setIngestStatus({ 
        type: 'error', 
        message: error.message || 'Failed to clear anti-patterns' 
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className={`mirror-intelligence ${expanded ? 'expanded' : ''}`}>
      <div className="mirror-header">
        <div className="mirror-title">
          <span className="mirror-icon">🧠</span>
          <h3>Mirror Intelligence</h3>
          {(isLearning || isLearningActive) && (
            <span className={`learning-indicator ${isLearningActive ? 'pulsing' : ''}`}>
              {isLearningActive ? '✨ Learning...' : 'Learning...'}
            </span>
          )}
        </div>
        {onToggle && (
          <button onClick={onToggle} className="mirror-toggle">
            {expanded ? '−' : '+'}
          </button>
        )}
      </div>

      <div className="mirror-metrics">
        <div className="metric intelligence">
          <div className="metric-icon">🚀</div>
          <div className="metric-content">
            <div className="metric-label">Intelligence</div>
            <div className="metric-value">{intelligence.toFixed(2)}</div>
            <div className="metric-trend">Growing ↑</div>
            {/* Intelligence Score Progress Bar */}
            <div className="intelligence-progress">
              <div 
                className="intelligence-progress-bar" 
                style={{ width: `${Math.min(intelligence * 10, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="metric patterns">
          <div className="metric-icon">📚</div>
          <div className="metric-content">
            <div className="metric-label">Patterns Learned</div>
            <div className="metric-value">{patterns}</div>
            <div className="metric-trend">Active</div>
          </div>
        </div>

        <div className="metric mistakes">
          <div className="metric-icon">🎓</div>
          <div className="metric-content">
            <div className="metric-label">Mistakes Learned</div>
            <div className="metric-value">{mistakes}</div>
            <div className="metric-trend">Avoiding</div>
          </div>
        </div>
      </div>

      {/* Last Learned Pattern Notification */}
      {lastLearnedPattern && isLearningActive && (
        <div className="pattern-learned-notification">
          <span className="pattern-learned-icon">✨</span>
          <div className="pattern-learned-content">
            <div className="pattern-learned-title">Learned: {lastLearnedPattern.pattern}</div>
            <div className="pattern-learned-category">{lastLearnedPattern.category}</div>
          </div>
        </div>
      )}

      <div className="mirror-insights">
        <h4>Recent Insights</h4>
        <div className="insights-list">
          {recentInsights.length > 0 ? (
            recentInsights.map((insight, index) => (
              <div key={index} className="insight-item">
                {insight}
              </div>
            ))
          ) : (
            <div className="insight-item empty">No insights yet. Start learning!</div>
          )}
        </div>
      </div>

      {/* Knowledge Ingestion Panel */}
      <div className="mirror-ingestion">
        <button 
          className="mirror-btn ingest-toggle"
          onClick={() => setShowIngestPanel(!showIngestPanel)}
        >
          {showIngestPanel ? '−' : '+'} Learn from Code
        </button>

        {showIngestPanel && (
          <div className="ingestion-panel">
            <div className="ingestion-section">
              <h5>📥 Ingest from GitHub/URL</h5>
              <div className="ingestion-form">
                <input
                  type="text"
                  className="ingestion-input"
                  placeholder="https://github.com/user/repo/blob/main/file.js or https://raw.githubusercontent.com/..."
                  value={ingestUrl}
                  onChange={(e) => setIngestUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleIngestUrl()}
                />
                <button 
                  className="ingestion-btn"
                  onClick={handleIngestUrl}
                  disabled={isIngesting}
                >
                  {isIngesting ? '⏳ Ingesting...' : '📥 Ingest URL'}
                </button>
              </div>
            </div>

            <div className="ingestion-section">
              <h5>📋 Paste Code Directly</h5>
              <div className="ingestion-form">
                <textarea
                  className="ingestion-textarea"
                  placeholder="Paste code here (JavaScript, TypeScript, Python, etc.)..."
                  value={ingestCode}
                  onChange={(e) => setIngestCode(e.target.value)}
                  rows={6}
                />
                <button 
                  className="ingestion-btn"
                  onClick={handleIngestCode}
                  disabled={isIngesting}
                >
                  {isIngesting ? '⏳ Ingesting...' : '📋 Ingest Code'}
                </button>
              </div>
            </div>

            {ingestStatus && (
              <div className={`ingestion-status ${ingestStatus.type}`}>
                {ingestStatus.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Opus Training Section */}
      <div className="opus-training-section">
        <div className="opus-header">
          <span className="opus-icon">🌟</span>
          <span className="opus-title">Opus 4.5 Training</span>
          {opusLoaded && <span className="opus-badge">Loaded</span>}
        </div>
        <p className="opus-description">
          Learn advanced reasoning, planning, and coding patterns from Claude Opus 4.5.
        </p>
        <button 
          className={`mirror-btn opus ${opusLoaded ? 'loaded' : ''}`}
          onClick={async () => {
            setIsLoadingOpus(true);
            try {
              const agentAPI = (window as any).agentAPI;
              if (agentAPI && agentAPI.mirrorIngestOpus) {
                const result = await agentAPI.mirrorIngestOpus();
                if (result && result.success) {
                  setOpusLoaded(true);
                  setIngestStatus({ 
                    type: 'success', 
                    message: `✨ Loaded ${result.patternsIngested} Opus patterns!` 
                  });
                  loadMirrorData();
                }
              }
            } catch (error: any) {
              setIngestStatus({ type: 'error', message: error.message });
            } finally {
              setIsLoadingOpus(false);
            }
          }}
          disabled={isLoadingOpus}
        >
          {isLoadingOpus ? '⏳ Loading...' : opusLoaded ? '✅ Opus Loaded' : '🧠 Learn from Opus 4.5'}
        </button>
      </div>

      <div className="mirror-actions">
        <button 
          className="mirror-btn explore"
          onClick={() => setShowPatterns(!showPatterns)}
        >
          🔍 {showPatterns ? 'Hide' : 'Explore'} Patterns
        </button>
        <button 
          className="mirror-btn refresh"
          onClick={loadMirrorData}
        >
          🔄 Refresh
        </button>
        {mistakes > 0 && (
          <button 
            className="mirror-btn clear-mistakes"
            onClick={handleClearAntiPatterns}
            disabled={isClearing}
            title="Clear learned mistakes to start fresh"
          >
            {isClearing ? '⏳' : '🗑️'} Clear Mistakes
          </button>
        )}
      </div>

      {/* Patterns List */}
      {showPatterns && (
        <div className="patterns-list">
          <h4>All Learned Patterns ({allPatterns.length})</h4>
          <div className="patterns-container">
            {allPatterns.length > 0 ? (
              allPatterns.map((pattern) => (
                <div 
                  key={pattern.id} 
                  className={`pattern-item ${pattern.type === 'anti-pattern' ? 'mistake' : ''}`}
                >
                  <div className="pattern-header">
                    <span className="pattern-icon">
                      {pattern.type === 'anti-pattern' ? '❌' : '✨'}
                    </span>
                    <span className="pattern-category">{pattern.category}</span>
                    {pattern.confidence && (
                      <span className="pattern-confidence">
                        {Math.round(pattern.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <div className="pattern-description">{pattern.description}</div>
                </div>
              ))
            ) : (
              <div className="pattern-item empty">No patterns learned yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MirrorIntelligence;
