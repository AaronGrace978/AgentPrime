/**
 * TaskRunner - npm/yarn script runner for AgentPrime
 * 
 * Features:
 * - Auto-detect package.json scripts
 * - Run/stop scripts
 * - View output in real-time
 * - Quick access to common tasks
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconPlay,
  IconStop,
  IconRefresh,
  IconTerminal,
  IconChevronDown,
  IconChevronRight,
  IconSpinner,
  IconSuccess,
  IconError,
  IconFile
} from './Icons';

interface Script {
  name: string;
  command: string;
  description?: string;
}

interface RunningScript {
  name: string;
  pid?: number;
  output: string[];
  startTime: Date;
  status: 'running' | 'success' | 'error';
}

interface TaskRunnerProps {
  workspacePath?: string;
  onClose?: () => void;
}

const TaskRunner: React.FC<TaskRunnerProps> = ({ workspacePath, onClose }) => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningScripts, setRunningScripts] = useState<Map<string, RunningScript>>(new Map());
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Load scripts from package.json
  const loadScripts = useCallback(async () => {
    if (!workspacePath) return;
    
    setLoading(true);
    try {
      // Read package.json
      const result = await window.agentAPI.readFile(`${workspacePath}/package.json`);
      if (result.content) {
        const pkg = JSON.parse(result.content);
        const pkgScripts: Script[] = [];
        
        if (pkg.scripts) {
          Object.entries(pkg.scripts).forEach(([name, command]) => {
            pkgScripts.push({
              name,
              command: command as string,
              description: getScriptDescription(name)
            });
          });
        }
        
        setScripts(pkgScripts);
      }
    } catch (error) {
      console.error('Failed to load package.json:', error);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  // Get friendly description for common script names
  const getScriptDescription = (name: string): string => {
    const descriptions: Record<string, string> = {
      start: 'Start the application',
      dev: 'Start development server',
      build: 'Build for production',
      test: 'Run tests',
      lint: 'Check code quality',
      format: 'Format code',
      watch: 'Watch for changes',
      serve: 'Serve the application',
      clean: 'Clean build files',
      deploy: 'Deploy to production',
      preview: 'Preview production build',
      typecheck: 'Check TypeScript types'
    };
    return descriptions[name] || '';
  };

  // Run a script
  const runScript = useCallback(async (script: Script) => {
    const scriptEntry: RunningScript = {
      name: script.name,
      output: [`> npm run ${script.name}\n`, `> ${script.command}\n\n`],
      startTime: new Date(),
      status: 'running'
    };
    
    setRunningScripts(prev => new Map(prev).set(script.name, scriptEntry));
    setExpandedScript(script.name);
    
    try {
      // Run the script
      const result = await window.agentAPI.agentRunCommand(
        `npm run ${script.name}`,
        workspacePath,
        300000 // 5 minute timeout
      );
      
      setRunningScripts(prev => {
        const updated = new Map(prev);
        const entry = updated.get(script.name);
        if (entry) {
          entry.output.push(result.stdout || '');
          if (result.stderr) {
            entry.output.push(`\n[stderr]\n${result.stderr}`);
          }
          entry.status = result.success ? 'success' : 'error';
          entry.output.push(`\n\n[Process exited with code ${result.exit_code || 0}]`);
        }
        return updated;
      });
    } catch (error: any) {
      setRunningScripts(prev => {
        const updated = new Map(prev);
        const entry = updated.get(script.name);
        if (entry) {
          entry.output.push(`\n[Error: ${error.message}]`);
          entry.status = 'error';
        }
        return updated;
      });
    }
  }, [workspacePath]);

  // Stop a running script
  const stopScript = useCallback(async (scriptName: string) => {
    const entry = runningScripts.get(scriptName);
    if (entry?.pid) {
      try {
        await window.agentAPI.agentRunCommand(`taskkill /PID ${entry.pid} /F`, undefined, 5000);
      } catch (error) {
        console.error('Failed to stop script:', error);
      }
    }
    
    setRunningScripts(prev => {
      const updated = new Map(prev);
      const e = updated.get(scriptName);
      if (e) {
        e.status = 'error';
        e.output.push('\n[Process terminated by user]');
      }
      return updated;
    });
  }, [runningScripts]);

  // Clear script output
  const clearOutput = useCallback((scriptName: string) => {
    setRunningScripts(prev => {
      const updated = new Map(prev);
      updated.delete(scriptName);
      return updated;
    });
    if (expandedScript === scriptName) {
      setExpandedScript(null);
    }
  }, [expandedScript]);

  // Load scripts on mount
  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  // Auto-scroll output
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runningScripts]);

  // Get script status icon
  const getStatusIcon = (status: RunningScript['status']) => {
    switch (status) {
      case 'running':
        return <IconSpinner size="sm" />;
      case 'success':
        return <IconSuccess size="sm" className="text-success" />;
      case 'error':
        return <IconError size="sm" className="text-error" />;
    }
  };

  // Common scripts to show first
  const commonScripts = ['dev', 'start', 'build', 'test', 'lint'];
  const sortedScripts = [...scripts].sort((a, b) => {
    const aIdx = commonScripts.indexOf(a.name);
    const bIdx = commonScripts.indexOf(b.name);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return a.name.localeCompare(b.name);
  });

  if (!workspacePath) {
    return (
      <div className="task-runner-empty">
        <IconTerminal size="xl" />
        <p>Open a workspace to see available scripts</p>
      </div>
    );
  }

  return (
    <div className="task-runner">
      <div className="task-runner-header">
        <h3><IconTerminal size="sm" /> npm Scripts</h3>
        <div className="task-runner-actions">
          <button 
            onClick={loadScripts} 
            disabled={loading}
            className="icon-btn"
            title="Refresh scripts"
          >
            {loading ? <IconSpinner size="sm" /> : <IconRefresh size="sm" />}
          </button>
        </div>
      </div>

      <div className="task-runner-content">
        {loading && scripts.length === 0 ? (
          <div className="task-runner-loading">
            <IconSpinner size="md" /> Loading scripts...
          </div>
        ) : scripts.length === 0 ? (
          <div className="task-runner-empty">
            <IconFile size="lg" />
            <p>No scripts found in package.json</p>
          </div>
        ) : (
          <div className="script-list">
            {sortedScripts.map(script => {
              const running = runningScripts.get(script.name);
              const isExpanded = expandedScript === script.name;
              
              return (
                <div key={script.name} className="script-item">
                  <div 
                    className={`script-header ${running ? running.status : ''}`}
                    onClick={() => setExpandedScript(isExpanded ? null : script.name)}
                  >
                    <span className="script-expand">
                      {isExpanded ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
                    </span>
                    
                    <div className="script-info">
                      <span className="script-name">{script.name}</span>
                      {script.description && (
                        <span className="script-description">{script.description}</span>
                      )}
                    </div>
                    
                    <div className="script-actions">
                      {running?.status === 'running' ? (
                        <>
                          {getStatusIcon(running.status)}
                          <button 
                            onClick={(e) => { e.stopPropagation(); stopScript(script.name); }}
                            className="icon-btn ap-btn-danger"
                            title="Stop"
                          >
                            <IconStop size="xs" />
                          </button>
                        </>
                      ) : (
                        <>
                          {running && getStatusIcon(running.status)}
                          <button 
                            onClick={(e) => { e.stopPropagation(); runScript(script); }}
                            className="icon-btn"
                            title="Run"
                          >
                            <IconPlay size="xs" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="script-details">
                      <div className="script-command">
                        <code>{script.command}</code>
                      </div>
                      
                      {running && (
                        <div className="script-output">
                          <pre>
                            {running.output.join('')}
                          </pre>
                          <div ref={outputEndRef} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .task-runner {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-secondary);
        }
        
        .task-runner-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--spacing-sm) var(--spacing-md);
          border-bottom: 1px solid var(--border-color);
        }
        
        .task-runner-header h3 {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          margin: 0;
          font-size: 0.9rem;
        }
        
        .task-runner-content {
          flex: 1;
          overflow-y: auto;
        }
        
        .task-runner-loading,
        .task-runner-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-md);
          padding: var(--spacing-xl);
          color: var(--text-muted);
        }
        
        .script-list {
          display: flex;
          flex-direction: column;
        }
        
        .script-item {
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .script-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-sm) var(--spacing-md);
          cursor: pointer;
          transition: background 0.1s;
        }
        
        .script-header:hover {
          background: var(--bg-hover);
        }
        
        .script-header.running {
          background: rgba(59, 130, 246, 0.1);
        }
        
        .script-header.success {
          background: rgba(16, 185, 129, 0.1);
        }
        
        .script-header.error {
          background: rgba(239, 68, 68, 0.1);
        }
        
        .script-expand {
          color: var(--text-muted);
        }
        
        .script-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .script-name {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--text-primary);
        }
        
        .script-description {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        
        .script-actions {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
        }
        
        .script-details {
          padding: var(--spacing-sm) var(--spacing-md);
          background: var(--bg-tertiary);
          border-top: 1px solid var(--border-subtle);
        }
        
        .script-command {
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--bg-primary);
          border-radius: var(--border-radius-sm);
          margin-bottom: var(--spacing-sm);
        }
        
        .script-command code {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        
        .script-output {
          max-height: 200px;
          overflow-y: auto;
          background: var(--bg-primary);
          border-radius: var(--border-radius-sm);
          border: 1px solid var(--border-color);
        }
        
        .script-output pre {
          margin: 0;
          padding: var(--spacing-sm);
          font-family: var(--font-mono);
          font-size: 0.7rem;
          line-height: 1.4;
          white-space: pre-wrap;
          word-break: break-all;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
};

export default TaskRunner;

