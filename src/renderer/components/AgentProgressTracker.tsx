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

const STATUS_LABELS: Record<AgentStep['status'], string> = {
  pending: 'Queued',
  in_progress: 'In Progress',
  completed: 'Done',
  failed: 'Needs Attention',
  skipped: 'Skipped',
};

function mapAgentEventType(type?: string): AgentStep['type'] {
  const typeMap: Record<string, AgentStep['type']> = {
    read_file: 'file_read',
    write_file: 'file_write',
    patch_file: 'file_write',
    run_command: 'command',
    review_session: 'review',
    deterministic_scaffold: 'tool_call',
  };
  return typeMap[type || ''] || 'tool_call';
}

function formatSpecialistLabel(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

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
      setCurrentStep({
        id: `step-live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: mapAgentEventType(data?.type),
        status: 'in_progress',
        title: data?.title || 'Working on next step',
        description: formatSpecialistLabel(data?.specialist),
        startTime: Date.now(),
      });
    };

    const handleStepComplete = (data: any) => {
      const completedStep: AgentStep = {
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: mapAgentEventType(data?.type),
        status: data?.success ? 'completed' : 'failed',
        title: data?.title || 'Processing step',
        startTime: Date.now(),
        endTime: Date.now(),
        result: data?.result,
        error: data?.error
      };
      setSteps(prev => [...prev, completedStep]);
      setCurrentStep(null);
    };

    const handleFileModified = (data: any) => {
      setFilesModified(prev => {
        if (prev.includes(data.path)) return prev;
        return [...prev, data.path];
      });
    };

    const removeTaskStart = window.agentAPI?.onAgentTaskStart?.((_data) => {
      setCurrentStep({
        id: `step-${Date.now()}`,
        type: 'thinking',
        status: 'in_progress',
        title: 'Planning task...',
        startTime: Date.now()
      });
    });
    const removeStepStart = window.agentAPI?.onAgentStepStart?.(handleStepStart);
    const removeStepComplete = window.agentAPI?.onAgentStepComplete?.(handleStepComplete);
    const removeFileModified = window.agentAPI?.onAgentFileModified?.(handleFileModified);

    return () => {
      if (typeof removeTaskStart === 'function') removeTaskStart();
      if (typeof removeStepStart === 'function') removeStepStart();
      if (typeof removeStepComplete === 'function') removeStepComplete();
      if (typeof removeFileModified === 'function') removeFileModified();
    };
  }, []);

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

  const currentTaskPreview = currentTask.trim() || 'Preparing your workspace changes';
  const visibleSteps = [...steps].slice(-6).reverse();
  const visibleFiles = [...filesModified].slice(-6).reverse();
  const progressLabel =
    progressPercentage >= 92 ? 'Wrapping up' :
    progressPercentage >= 65 ? 'Making steady progress' :
    progressPercentage >= 30 ? 'Building project files' :
    'Preparing the first pass';
  const surfaceCard: React.CSSProperties = {
    background: 'linear-gradient(180deg, var(--prime-surface-elevated) 0%, var(--prime-surface) 100%)',
    border: '1px solid var(--prime-border)',
    borderRadius: '14px',
    boxShadow: 'var(--prime-shadow-sm)',
  };
  const actionButtonStyle = (variant: 'secondary' | 'danger'): React.CSSProperties => ({
    border: variant === 'danger' ? '1px solid rgba(239, 68, 68, 0.24)' : '1px solid var(--prime-border)',
    background: variant === 'danger' ? 'rgba(239, 68, 68, 0.10)' : 'var(--prime-surface-hover)',
    color: variant === 'danger' ? 'var(--prime-error)' : 'var(--prime-text-secondary)',
    borderRadius: '10px',
    padding: '7px 12px',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.18s var(--ease-out-expo)',
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      position: 'fixed',
      bottom: '88px',
      right: '20px',
      width: '380px',
      background: 'linear-gradient(180deg, var(--prime-surface-elevated) 0%, var(--prime-surface) 100%)',
      borderRadius: '20px',
      boxShadow: 'var(--prime-shadow-xl), 0 0 0 1px rgba(255, 255, 255, 0.04)',
      border: '1px solid var(--prime-border)',
      overflow: 'hidden',
      zIndex: 1000,
      fontFamily: 'inherit',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--prime-accent) 0%, #7c5cff 100%)',
        padding: '16px 18px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '14px',
        borderBottom: '1px solid rgba(255,255,255,0.14)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0, flex: 1 }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
              animation: isPaused ? 'none' : 'pulse 2s infinite'
            }}>
              <span style={{ fontSize: '13px' }}>AI</span>
            </div>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ color: 'white', fontWeight: 800, fontSize: '14px', letterSpacing: '-0.01em' }}>
                  {isPaused ? 'Agent Paused' : 'Agent Working'}
                </div>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 9px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: '10px',
                  fontWeight: 700,
                  backdropFilter: 'blur(6px)',
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '999px',
                    background: isPaused ? 'rgba(255,255,255,0.72)' : '#7ef7c4',
                    boxShadow: isPaused ? 'none' : '0 0 10px rgba(126, 247, 196, 0.8)',
                  }} />
                  {isPaused ? 'Paused' : 'Live'}
                </span>
              </div>
              <div style={{
                color: 'rgba(255, 255, 255, 0.84)',
                fontSize: '11px',
                lineHeight: 1.45,
                maxHeight: '34px',
                overflow: 'hidden',
              }}>
                {currentTaskPreview}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
            <span style={{
              padding: '5px 9px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.14)',
              color: 'white',
              fontSize: '10px',
              fontWeight: 700,
            }}>
              {formatTime(elapsedTime)}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {onPause && (
                <button
                  onClick={handlePause}
                  style={{
                    ...actionButtonStyle('secondary'),
                    background: 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'white',
                  }}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              )}
              <button
                onClick={onCancel}
                style={{
                  ...actionButtonStyle('danger'),
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: 'white',
                }}
              >
                Stop
              </button>
            </div>
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '10px',
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.12)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Progress
            </div>
            <div style={{ color: 'white', fontSize: '12px', fontWeight: 700, marginTop: '2px' }}>
              {progressLabel}
            </div>
          </div>
          <div style={{
            color: 'white',
            fontSize: '18px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}>
            {progressPercentage}%
          </div>
        </div>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--prime-surface)' }}>
        {/* Progress Bar */}
        <div style={{
          height: '8px',
          background: 'var(--prime-surface-hover)',
          borderRadius: '999px',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.04)',
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercentage}%`,
            background: 'linear-gradient(90deg, var(--prime-accent), var(--prime-success))',
            boxShadow: '0 0 20px var(--prime-accent-glow)',
            transition: 'width 0.5s ease'
          }} />
        </div>

        {/* Current Action */}
        <div style={{ ...surfaceCard, padding: '12px 14px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '12px',
              background: currentStep ? 'rgba(59, 130, 246, 0.12)' : 'var(--prime-surface-hover)',
              color: currentStep ? 'var(--prime-accent)' : 'var(--prime-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: currentStep ? 'inset 0 0 0 1px rgba(59, 130, 246, 0.14)' : 'none',
            }}>
              <span style={{ fontSize: '15px' }}>{currentStep ? STEP_ICONS[currentStep.type] : '…'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--prime-text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>
                Current step
              </div>
              <div style={{ color: 'var(--prime-text)', fontWeight: 700, fontSize: '13px' }}>
                {currentStep?.title || 'Preparing next action'}
              </div>
              <div style={{
                color: 'var(--prime-text-secondary)',
                fontSize: '11px',
                marginTop: '3px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '248px'
              }}>
                {currentStep?.description || 'Watching the agent as it plans, writes files, and runs checks.'}
              </div>
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 8px',
              borderRadius: '999px',
              background: currentStep ? 'rgba(59, 130, 246, 0.08)' : 'var(--prime-surface-hover)',
              color: currentStep ? 'var(--prime-accent)' : 'var(--prime-text-secondary)',
              fontSize: '10px',
              fontWeight: 700,
            }}>
              {currentStep && !isPaused && (
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  border: '2px solid var(--prime-accent)',
                  borderTopColor: 'transparent',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              {STATUS_LABELS[currentStep?.status || 'pending']}
            </div>
          </div>
        </div>

        {/* Detail content */}
        <div style={{
          maxHeight: showDetails ? '320px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.28s var(--ease-out-expo)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ ...surfaceCard, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                <div style={{ color: 'var(--prime-text)', fontSize: '12px', fontWeight: 800 }}>
                  Recent activity
                </div>
                <div style={{ color: 'var(--prime-text-muted)', fontSize: '10px', fontWeight: 700 }}>
                  {stepsCompleted} completed
                </div>
              </div>
              {visibleSteps.length === 0 ? (
                <div style={{ color: 'var(--prime-text-muted)', fontSize: '12px', textAlign: 'center', padding: '14px 0' }}>
                  Starting the first step...
                </div>
              ) : (
                visibleSteps.map((step, index) => (
                  <div
                    key={step.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '22px 1fr auto',
                      alignItems: 'start',
                      gap: '10px',
                      padding: index === visibleSteps.length - 1 ? '0' : '0 0 10px',
                      marginBottom: index === visibleSteps.length - 1 ? 0 : '10px',
                      borderBottom: index === visibleSteps.length - 1 ? 'none' : '1px solid var(--prime-border-light)',
                    }}
                  >
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '999px',
                      background: `${STATUS_COLORS[step.status]}18`,
                      color: STATUS_COLORS[step.status],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      boxShadow: `inset 0 0 0 1px ${STATUS_COLORS[step.status]}30`,
                    }}>
                      {step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : STEP_ICONS[step.type]}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        color: 'var(--prime-text)',
                        fontSize: '12px',
                        fontWeight: 700,
                        lineHeight: 1.35,
                      }}>
                        {step.title}
                      </div>
                      {step.error && (
                        <div style={{ color: 'var(--prime-error)', fontSize: '10px', marginTop: '4px', lineHeight: 1.4 }}>
                          {step.error}
                        </div>
                      )}
                    </div>
                    {step.endTime && step.startTime ? (
                      <div style={{ color: 'var(--prime-text-muted)', fontSize: '10px', fontWeight: 700 }}>
                        {((step.endTime - step.startTime) / 1000).toFixed(1)}s
                      </div>
                    ) : (
                      <div style={{ color: 'var(--prime-text-muted)', fontSize: '10px', fontWeight: 700 }}>
                        Live
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div style={{ ...surfaceCard, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                <div style={{ color: 'var(--prime-text)', fontSize: '12px', fontWeight: 800 }}>
                  Files touched
                </div>
                <div style={{ color: 'var(--prime-text-muted)', fontSize: '10px', fontWeight: 700 }}>
                  {filesModified.length} total
                </div>
              </div>
              {visibleFiles.length === 0 ? (
                <div style={{ color: 'var(--prime-text-muted)', fontSize: '11px' }}>
                  No file writes yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {visibleFiles.map((file, i) => (
                    <span
                      key={`${file}-${i}`}
                      style={{
                        background: 'rgba(16, 185, 129, 0.10)',
                        color: 'var(--prime-success)',
                        border: '1px solid rgba(16, 185, 129, 0.18)',
                        padding: '5px 8px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        maxWidth: '100%',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={file}
                    >
                      {file.split(/[\\/]/).pop()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Toggle Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--prime-surface-hover)',
            border: '1px solid var(--prime-border)',
            borderRadius: '12px',
            color: 'var(--prime-text-secondary)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          {showDetails ? 'Hide activity details' : 'Show activity details'}
        </button>
      </div>
      
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

