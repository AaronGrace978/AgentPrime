/**
 * AgentPrime - Agent Progress Tracker
 * 
 * Shows real-time progress of agent tasks with:
 * - Step-by-step progress visualization
 * - Current action being performed
 * - Files being created/modified
 * - Estimated completion
 * - Ability to pause/cancel
 * 
 * Makes the agent feel more transparent and trustworthy.
 */

import React, { useState, useEffect, useCallback } from 'react';

interface AgentStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'file_write' | 'file_read' | 'command' | 'review' | 'complete';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  title: string;
  description?: string;
  startTime?: number;
  endTime?: number;
  result?: string;
  error?: string;
}

interface AgentProgressTrackerProps {
  isRunning: boolean;
  currentTask: string;
  onCancel: () => void;
  onPause?: () => void;
}

const STEP_ICONS: Record<AgentStep['type'], string> = {
  thinking: '🧠',
  tool_call: '🔧',
  file_write: '📝',
  file_read: '📖',
  command: '⚡',
  review: '🔍',
  complete: '✅'
};

const STATUS_COLORS: Record<AgentStep['status'], string> = {
  pending: '#9ca3af',
  in_progress: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
  skipped: '#6b7280'
};

export const AgentProgressTracker: React.FC<AgentProgressTrackerProps> = ({
  isRunning,
  currentTask,
  onCancel,
  onPause
}) => {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [currentStep, setCurrentStep] = useState<AgentStep | null>(null);
  const [filesModified, setFilesModified] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  // Timer for elapsed time
  useEffect(() => {
    if (!isRunning || isPaused) return;
    
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  // Reset when new task starts
  useEffect(() => {
    if (isRunning && currentTask) {
      setSteps([]);
      setCurrentStep(null);
      setFilesModified([]);
      setElapsedTime(0);
      setIsPaused(false);
    }
  }, [currentTask, isRunning]);

  // Listen for agent progress events
  useEffect(() => {
    const handleStepStart = (data: any) => {
      const newStep: AgentStep = {
        id: `step-${Date.now()}`,
        type: data.type || 'thinking',
        status: 'in_progress',
        title: data.title || 'Processing...',
        description: data.description,
        startTime: Date.now()
      };
      
      setCurrentStep(newStep);
      setSteps(prev => [...prev, newStep]);
    };

    const handleStepComplete = (data: any) => {
      setSteps(prev => prev.map(step => {
        if (step.id === currentStep?.id) {
          return {
            ...step,
            status: data.success ? 'completed' : 'failed',
            endTime: Date.now(),
            result: data.result,
            error: data.error
          };
        }
        return step;
      }));
      
      setCurrentStep(null);
    };

    const handleFileModified = (data: any) => {
      setFilesModified(prev => {
        if (prev.includes(data.path)) return prev;
        return [...prev, data.path];
      });
    };


    // Register listeners (these would connect to IPC in real implementation)
    window.agentAPI?.onAgentTaskStart?.((data) => {
      // Task start - could update the current task if needed
    });
    window.agentAPI?.onAgentStepComplete?.(handleStepComplete);
    window.agentAPI?.onAgentFileModified?.(handleFileModified);

    return () => {
      window.agentAPI?.removeAgentListeners?.();
    };
  }, [currentStep]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Estimate progress based on completed steps (typical agent tasks take 5-15 steps)
  const stepsCompleted = steps.filter(s => s.status === 'completed').length;
  const progressPercentage = stepsCompleted > 0 
    ? Math.min(95, Math.round((stepsCompleted / Math.max(stepsCompleted + 2, 8)) * 100))
    : (elapsedTime > 3 ? 10 : 5); // Show small initial progress after 3s

  const handlePause = useCallback(() => {
    setIsPaused(!isPaused);
    onPause?.();
  }, [isPaused, onPause]);

  if (!isRunning) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      width: '360px',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      borderRadius: '16px',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      zIndex: 1000,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isPaused ? 'none' : 'pulse 2s infinite'
          }}>
            <span style={{ fontSize: '12px' }}>🤖</span>
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
              {isPaused ? 'Agent Paused' : 'Agent Working'}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '11px' }}>
              {formatTime(elapsedTime)}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '6px' }}>
          {onPause && (
            <button
              onClick={handlePause}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '500'
              }}
            >
              {isPaused ? '▶️ Resume' : '⏸ Pause'}
            </button>
          )}
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(239, 68, 68, 0.8)',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 10px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500'
            }}
          >
            ✕ Stop
          </button>
        </div>
      </div>
      
      {/* Progress Bar */}
      {progressPercentage !== null && (
        <div style={{
          height: '4px',
          background: '#e5e7eb'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercentage}%`,
            background: 'linear-gradient(90deg, #3b82f6, #10b981)',
            transition: 'width 0.5s ease'
          }} />
        </div>
      )}
      
      {/* Current Action */}
      {currentStep && (
        <div style={{
          padding: '12px 16px',
          background: '#f0f9ff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: STATUS_COLORS[currentStep.status],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 1.5s infinite'
          }}>
            <span style={{ fontSize: '14px' }}>{STEP_ICONS[currentStep.type]}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#1e40af', fontWeight: '600', fontSize: '13px' }}>
              {currentStep.title}
            </div>
            {currentStep.description && (
              <div style={{ 
                color: '#64748b', 
                fontSize: '11px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '240px'
              }}>
                {currentStep.description}
              </div>
            )}
          </div>
          <div style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: '2px solid #3b82f6',
            borderTopColor: 'transparent',
            animation: isPaused ? 'none' : 'spin 1s linear infinite'
          }} />
        </div>
      )}
      
      {/* Step History */}
      <div 
        style={{
          maxHeight: showDetails ? '200px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease'
        }}
      >
        <div style={{
          padding: '12px 16px',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {steps.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
              Starting...
            </div>
          ) : (
            steps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '8px 0',
                  borderBottom: index < steps.length - 1 ? '1px solid #f3f4f6' : 'none',
                  opacity: step.status === 'in_progress' ? 1 : 0.7
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: STATUS_COLORS[step.status],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {step.status === 'completed' ? (
                    <span style={{ color: 'white', fontSize: '10px' }}>✓</span>
                  ) : step.status === 'failed' ? (
                    <span style={{ color: 'white', fontSize: '10px' }}>✕</span>
                  ) : (
                    <span style={{ fontSize: '10px' }}>{STEP_ICONS[step.type]}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    color: '#374151', 
                    fontSize: '12px',
                    fontWeight: step.status === 'in_progress' ? '600' : '400'
                  }}>
                    {step.title}
                  </div>
                  {step.error && (
                    <div style={{ color: '#ef4444', fontSize: '10px', marginTop: '2px' }}>
                      {step.error}
                    </div>
                  )}
                </div>
                {step.endTime && step.startTime && (
                  <div style={{ color: '#9ca3af', fontSize: '10px' }}>
                    {((step.endTime - step.startTime) / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Files Modified */}
      {filesModified.length > 0 && (
        <div style={{
          padding: '8px 16px',
          background: '#f0fdf4',
          borderTop: '1px solid #e5e7eb'
        }}>
          <div style={{ color: '#15803d', fontSize: '11px', fontWeight: '600', marginBottom: '4px' }}>
            📁 Files Modified ({filesModified.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {filesModified.slice(0, 5).map((file, i) => (
              <span
                key={i}
                style={{
                  background: '#dcfce7',
                  color: '#166534',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px'
                }}
              >
                {file.split('/').pop()}
              </span>
            ))}
            {filesModified.length > 5 && (
              <span style={{ color: '#15803d', fontSize: '10px' }}>
                +{filesModified.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Toggle Details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          width: '100%',
          padding: '8px',
          background: '#f9fafb',
          border: 'none',
          borderTop: '1px solid #e5e7eb',
          color: '#6b7280',
          fontSize: '11px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px'
        }}
      >
        {showDetails ? '▲ Hide Details' : '▼ Show Details'}
      </button>
      
      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AgentProgressTracker;

