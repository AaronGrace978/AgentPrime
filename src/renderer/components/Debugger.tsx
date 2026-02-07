/**
 * Debugger - Debugging support for AgentPrime
 * 
 * Features:
 * - Breakpoint management
 * - Variable inspection
 * - Call stack visualization
 * - Step through code
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  IconPlay,
  IconStop,
  IconChevronRight,
  IconChevronDown,
  IconCircle,
  IconTarget,
  IconRefresh,
  IconX,
  IconBug
} from './Icons';

// Breakpoint type
export interface Breakpoint {
  id: string;
  file: string;
  line: number;
  column?: number;
  enabled: boolean;
  condition?: string;
  hitCount?: number;
}

// Variable in debug scope
export interface DebugVariable {
  name: string;
  value: string;
  type: string;
  children?: DebugVariable[];
  expandable?: boolean;
}

// Debug state
export interface DebugState {
  status: 'stopped' | 'running' | 'paused' | 'stepping';
  currentFile?: string;
  currentLine?: number;
  callStack: CallStackFrame[];
  variables: {
    local: DebugVariable[];
    global: DebugVariable[];
    watch: DebugVariable[];
  };
}

// Call stack frame
export interface CallStackFrame {
  id: number;
  name: string;
  file: string;
  line: number;
  column?: number;
}

interface DebuggerProps {
  breakpoints: Breakpoint[];
  onBreakpointToggle: (file: string, line: number) => void;
  onBreakpointRemove: (id: string) => void;
  onBreakpointCondition: (id: string, condition: string) => void;
  debugState: DebugState;
  onStart: () => void;
  onStop: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
  onContinue: () => void;
  onAddWatch: (expression: string) => void;
  onRemoveWatch: (expression: string) => void;
}

const Debugger: React.FC<DebuggerProps> = ({
  breakpoints,
  onBreakpointToggle,
  onBreakpointRemove,
  onBreakpointCondition,
  debugState,
  onStart,
  onStop,
  onStepOver,
  onStepInto,
  onStepOut,
  onContinue,
  onAddWatch,
  onRemoveWatch
}) => {
  const [watchInput, setWatchInput] = useState('');
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'variables' | 'watch' | 'breakpoints' | 'callstack'>('variables');

  // Toggle variable expansion
  const toggleExpand = useCallback((path: string) => {
    setExpandedVars(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Add watch expression
  const handleAddWatch = useCallback(() => {
    if (watchInput.trim()) {
      onAddWatch(watchInput.trim());
      setWatchInput('');
    }
  }, [watchInput, onAddWatch]);

  // Render variable tree
  const renderVariable = (variable: DebugVariable, path: string = '', depth: number = 0) => {
    const fullPath = path ? `${path}.${variable.name}` : variable.name;
    const isExpanded = expandedVars.has(fullPath);
    const hasChildren = variable.expandable || (variable.children && variable.children.length > 0);

    return (
      <div key={fullPath} className="debug-variable" style={{ paddingLeft: depth * 16 }}>
        <div 
          className="variable-row"
          onClick={() => hasChildren && toggleExpand(fullPath)}
        >
          {hasChildren ? (
            <span className="variable-expand">
              {isExpanded ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
            </span>
          ) : (
            <span className="variable-expand-placeholder" />
          )}
          <span className="variable-name">{variable.name}</span>
          <span className="variable-separator">:</span>
          <span className={`variable-value type-${variable.type.toLowerCase()}`}>
            {variable.value}
          </span>
          <span className="variable-type">{variable.type}</span>
        </div>
        
        {isExpanded && variable.children && (
          <div className="variable-children">
            {variable.children.map(child => renderVariable(child, fullPath, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Get status indicator
  const getStatusIndicator = () => {
    switch (debugState.status) {
      case 'running':
        return <span className="debug-status running">Running</span>;
      case 'paused':
        return <span className="debug-status paused">Paused at line {debugState.currentLine}</span>;
      case 'stepping':
        return <span className="debug-status stepping">Stepping...</span>;
      default:
        return <span className="debug-status stopped">Stopped</span>;
    }
  };

  return (
    <div className="debugger">
      {/* Debug toolbar */}
      <div className="debug-toolbar">
        <div className="debug-controls">
          {debugState.status === 'stopped' ? (
            <button 
              className="debug-btn start" 
              onClick={onStart}
              title="Start Debugging (F5)"
            >
              <IconPlay size="sm" /> Start
            </button>
          ) : (
            <>
              <button 
                className="debug-btn stop" 
                onClick={onStop}
                title="Stop Debugging (Shift+F5)"
              >
                <IconStop size="sm" />
              </button>
              
              {debugState.status === 'paused' && (
                <>
                  <button 
                    className="debug-btn" 
                    onClick={onContinue}
                    title="Continue (F5)"
                  >
                    <IconPlay size="sm" />
                  </button>
                  <button 
                    className="debug-btn" 
                    onClick={onStepOver}
                    title="Step Over (F10)"
                  >
                    ⤵️
                  </button>
                  <button 
                    className="debug-btn" 
                    onClick={onStepInto}
                    title="Step Into (F11)"
                  >
                    ↓
                  </button>
                  <button 
                    className="debug-btn" 
                    onClick={onStepOut}
                    title="Step Out (Shift+F11)"
                  >
                    ↑
                  </button>
                </>
              )}
            </>
          )}
        </div>
        
        <div className="debug-status-bar">
          {getStatusIndicator()}
        </div>
      </div>

      {/* Debug tabs */}
      <div className="debug-tabs">
        <button 
          className={`debug-tab ${activeTab === 'variables' ? 'active' : ''}`}
          onClick={() => setActiveTab('variables')}
        >
          Variables
        </button>
        <button 
          className={`debug-tab ${activeTab === 'watch' ? 'active' : ''}`}
          onClick={() => setActiveTab('watch')}
        >
          Watch
        </button>
        <button 
          className={`debug-tab ${activeTab === 'callstack' ? 'active' : ''}`}
          onClick={() => setActiveTab('callstack')}
        >
          Call Stack
        </button>
        <button 
          className={`debug-tab ${activeTab === 'breakpoints' ? 'active' : ''}`}
          onClick={() => setActiveTab('breakpoints')}
        >
          Breakpoints ({breakpoints.length})
        </button>
      </div>

      {/* Tab content */}
      <div className="debug-content">
        {/* Variables tab */}
        {activeTab === 'variables' && (
          <div className="debug-variables">
            {debugState.status === 'paused' ? (
              <>
                <div className="variable-section">
                  <h5>Local</h5>
                  {debugState.variables.local.map(v => renderVariable(v))}
                </div>
                <div className="variable-section">
                  <h5>Global</h5>
                  {debugState.variables.global.map(v => renderVariable(v))}
                </div>
              </>
            ) : (
              <div className="debug-empty">
                <IconBug size="lg" />
                <p>Start debugging to inspect variables</p>
              </div>
            )}
          </div>
        )}

        {/* Watch tab */}
        {activeTab === 'watch' && (
          <div className="debug-watch">
            <div className="watch-input-row">
              <input
                type="text"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWatch()}
                placeholder="Add expression to watch..."
                className="watch-input"
              />
              <button className="watch-add-btn" onClick={handleAddWatch}>+</button>
            </div>
            
            {debugState.variables.watch.length > 0 ? (
              <div className="watch-list">
                {debugState.variables.watch.map((v, i) => (
                  <div key={i} className="watch-item">
                    {renderVariable(v)}
                    <button 
                      className="watch-remove" 
                      onClick={() => onRemoveWatch(v.name)}
                    >
                      <IconX size="xs" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="debug-empty-small">
                <p>No watch expressions</p>
              </div>
            )}
          </div>
        )}

        {/* Call stack tab */}
        {activeTab === 'callstack' && (
          <div className="debug-callstack">
            {debugState.callStack.length > 0 ? (
              debugState.callStack.map((frame, i) => (
                <div 
                  key={frame.id} 
                  className={`callstack-frame ${i === 0 ? 'current' : ''}`}
                >
                  <span className="frame-name">{frame.name}</span>
                  <span className="frame-location">
                    {frame.file.split(/[/\\]/).pop()}:{frame.line}
                  </span>
                </div>
              ))
            ) : (
              <div className="debug-empty">
                <p>No active call stack</p>
              </div>
            )}
          </div>
        )}

        {/* Breakpoints tab */}
        {activeTab === 'breakpoints' && (
          <div className="debug-breakpoints">
            {breakpoints.length > 0 ? (
              breakpoints.map(bp => (
                <div key={bp.id} className={`breakpoint-item ${bp.enabled ? '' : 'disabled'}`}>
                  <button 
                    className="breakpoint-toggle"
                    onClick={() => onBreakpointToggle(bp.file, bp.line)}
                  >
                    <IconCircle size="xs" className={bp.enabled ? 'bp-enabled' : 'bp-disabled'} />
                  </button>
                  <span className="breakpoint-location">
                    {bp.file.split(/[/\\]/).pop()}:{bp.line}
                  </span>
                  {bp.condition && (
                    <span className="breakpoint-condition" title={bp.condition}>
                      (condition)
                    </span>
                  )}
                  <button 
                    className="breakpoint-remove"
                    onClick={() => onBreakpointRemove(bp.id)}
                  >
                    <IconX size="xs" />
                  </button>
                </div>
              ))
            ) : (
              <div className="debug-empty">
                <IconTarget size="lg" />
                <p>Click in the gutter to add breakpoints</p>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .debugger {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-secondary);
        }
        
        .debug-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--spacing-sm) var(--spacing-md);
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-tertiary);
        }
        
        .debug-controls {
          display: flex;
          gap: var(--spacing-xs);
        }
        
        .debug-btn {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-sm);
          color: var(--text-primary);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .debug-btn:hover {
          background: var(--bg-hover);
        }
        
        .debug-btn.start {
          background: var(--success);
          color: white;
          border-color: var(--success);
        }
        
        .debug-btn.stop {
          background: var(--error);
          color: white;
          border-color: var(--error);
        }
        
        .debug-status-bar {
          font-size: 0.75rem;
        }
        
        .debug-status {
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
        }
        
        .debug-status.running { background: rgba(16, 185, 129, 0.2); color: var(--success); }
        .debug-status.paused { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
        .debug-status.stepping { background: rgba(59, 130, 246, 0.2); color: var(--info); }
        .debug-status.stopped { background: var(--bg-tertiary); color: var(--text-muted); }
        
        .debug-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-color);
        }
        
        .debug-tab {
          flex: 1;
          padding: var(--spacing-sm);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .debug-tab:hover {
          color: var(--text-primary);
        }
        
        .debug-tab.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }
        
        .debug-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--spacing-sm);
        }
        
        .debug-empty, .debug-empty-small {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-xl);
          color: var(--text-muted);
          text-align: center;
        }
        
        .debug-empty-small {
          padding: var(--spacing-md);
        }
        
        .variable-section h5 {
          margin: 0 0 var(--spacing-xs) 0;
          font-size: 0.7rem;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        
        .variable-row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 4px;
          border-radius: 2px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 0.75rem;
        }
        
        .variable-row:hover {
          background: var(--bg-hover);
        }
        
        .variable-expand-placeholder {
          width: 12px;
        }
        
        .variable-name {
          color: var(--text-primary);
          font-weight: 500;
        }
        
        .variable-separator {
          color: var(--text-muted);
        }
        
        .variable-value {
          flex: 1;
          color: var(--text-secondary);
        }
        
        .variable-value.type-string { color: #ce9178; }
        .variable-value.type-number { color: #b5cea8; }
        .variable-value.type-boolean { color: #569cd6; }
        .variable-value.type-object { color: #4ec9b0; }
        .variable-value.type-array { color: #4ec9b0; }
        .variable-value.type-function { color: #dcdcaa; }
        .variable-value.type-undefined { color: #808080; }
        .variable-value.type-null { color: #808080; }
        
        .variable-type {
          font-size: 0.65rem;
          color: var(--text-muted);
          opacity: 0.7;
        }
        
        .watch-input-row {
          display: flex;
          gap: var(--spacing-xs);
          margin-bottom: var(--spacing-sm);
        }
        
        .watch-input {
          flex: 1;
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-sm);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.75rem;
        }
        
        .watch-add-btn {
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--accent-primary);
          border: none;
          border-radius: var(--border-radius-sm);
          color: white;
          cursor: pointer;
        }
        
        .watch-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
        }
        
        .watch-item .debug-variable {
          flex: 1;
        }
        
        .watch-remove {
          padding: 2px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.1s;
        }
        
        .watch-item:hover .watch-remove {
          opacity: 1;
        }
        
        .callstack-frame {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-xs) var(--spacing-sm);
          border-radius: var(--border-radius-sm);
          cursor: pointer;
        }
        
        .callstack-frame:hover {
          background: var(--bg-hover);
        }
        
        .callstack-frame.current {
          background: rgba(59, 130, 246, 0.15);
          border-left: 2px solid var(--accent-primary);
        }
        
        .frame-name {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-primary);
        }
        
        .frame-location {
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        
        .breakpoint-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          padding: var(--spacing-xs) var(--spacing-sm);
          border-radius: var(--border-radius-sm);
        }
        
        .breakpoint-item:hover {
          background: var(--bg-hover);
        }
        
        .breakpoint-item.disabled {
          opacity: 0.5;
        }
        
        .breakpoint-toggle {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        
        .bp-enabled {
          color: var(--error);
        }
        
        .bp-disabled {
          color: var(--text-muted);
        }
        
        .breakpoint-location {
          flex: 1;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-primary);
        }
        
        .breakpoint-condition {
          font-size: 0.65rem;
          color: var(--text-muted);
        }
        
        .breakpoint-remove {
          padding: 2px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.1s;
        }
        
        .breakpoint-item:hover .breakpoint-remove {
          opacity: 1;
        }
      `}</style>
    </div>
  );
};

export default Debugger;

// Breakpoint manager hook
export function useBreakpoints() {
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);

  const addBreakpoint = useCallback((file: string, line: number) => {
    const id = `${file}:${line}`;
    setBreakpoints(prev => {
      if (prev.some(bp => bp.id === id)) {
        return prev;
      }
      return [...prev, { id, file, line, enabled: true }];
    });
  }, []);

  const removeBreakpoint = useCallback((id: string) => {
    setBreakpoints(prev => prev.filter(bp => bp.id !== id));
  }, []);

  const toggleBreakpoint = useCallback((file: string, line: number) => {
    const id = `${file}:${line}`;
    setBreakpoints(prev => {
      const existing = prev.find(bp => bp.id === id);
      if (existing) {
        // Toggle enabled state
        return prev.map(bp => bp.id === id ? { ...bp, enabled: !bp.enabled } : bp);
      } else {
        // Add new breakpoint
        return [...prev, { id, file, line, enabled: true }];
      }
    });
  }, []);

  const setCondition = useCallback((id: string, condition: string) => {
    setBreakpoints(prev => 
      prev.map(bp => bp.id === id ? { ...bp, condition } : bp)
    );
  }, []);

  const clearBreakpoints = useCallback(() => {
    setBreakpoints([]);
  }, []);

  const getBreakpointsForFile = useCallback((file: string) => {
    return breakpoints.filter(bp => bp.file === file);
  }, [breakpoints]);

  return {
    breakpoints,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    setCondition,
    clearBreakpoints,
    getBreakpointsForFile
  };
}

