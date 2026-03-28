/**
 * Terminal — Full interactive terminal panel using xterm.js
 * 
 * Features:
 * - Multiple terminal tabs
 * - Auto-resize with fit addon
 * - Clickable links
 * - AI error detection with "Fix" button
 * - Workspace-aware default cwd
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface TerminalTab {
  id: string;
  title: string;
  xterm: XTerm;
  fitAddon: FitAddon;
}

interface DetectedError {
  type: string;
  message: string;
  line: string;
}

interface TerminalProps {
  onClose?: () => void;
  onFixError?: (error: DetectedError) => void;
}

const TerminalComponent: React.FC<TerminalProps> = ({ onClose, onFixError }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [detectedErrors, setDetectedErrors] = useState<DetectedError[]>([]);
  const tabsRef = useRef<TerminalTab[]>([]);

  tabsRef.current = tabs;

  const createTab = useCallback(async () => {
    try {
      const result = await (window as any).agentAPI.terminalCreate();
      if (!result.success) {
        console.error('Failed to create terminal:', result.error);
        return;
      }

      const xterm = new XTerm({
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
        theme: {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          selectionBackground: '#264f78',
          black: '#0d1117',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39d353',
          white: '#c9d1d9',
          brightBlack: '#484f58',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d364',
          brightWhite: '#f0f6fc',
        },
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      xterm.loadAddon(fitAddon);
      xterm.loadAddon(webLinksAddon);

      xterm.onData((data) => {
        (window as any).agentAPI.terminalInput({ id: result.id, data });
      });

      const tab: TerminalTab = {
        id: result.id,
        title: result.cwd?.split(/[/\\]/).pop() || 'Terminal',
        xterm,
        fitAddon,
      };

      setTabs(prev => [...prev, tab]);
      setActiveTabId(result.id);

    } catch (error) {
      console.error('Terminal creation error:', error);
    }
  }, []);

  useEffect(() => {
    createTab();

    const handleData = (_event: any, { id, data }: { id: string; data: string }) => {
      const tab = tabsRef.current.find(t => t.id === id);
      if (tab) {
        tab.xterm.write(data);
      }
    };

    const handleExit = (_event: any, { id }: { id: string }) => {
      setTabs(prev => {
        const filtered = prev.filter(t => t.id !== id);
        if (filtered.length > 0) {
          setActiveTabId(filtered[filtered.length - 1].id);
        } else {
          setActiveTabId(null);
        }
        return filtered;
      });
    };

    const handleErrorDetected = (_event: any, { id, errors }: { id: string; errors: DetectedError[] }) => {
      if (id === activeTabId || tabsRef.current.some(t => t.id === id)) {
        setDetectedErrors(prev => [...prev.slice(-4), ...errors]);
      }
    };

    (window as any).agentAPI.on('terminal:data', handleData);
    (window as any).agentAPI.on('terminal:exit', handleExit);
    (window as any).agentAPI.on('terminal:error-detected', handleErrorDetected);

    return () => {
      (window as any).agentAPI.removeListener('terminal:data');
      (window as any).agentAPI.removeListener('terminal:exit');
      (window as any).agentAPI.removeListener('terminal:error-detected');
      tabsRef.current.forEach(tab => {
        tab.xterm.dispose();
        (window as any).agentAPI.terminalKill(tab.id);
      });
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || !activeTabId) return;

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    containerRef.current.innerHTML = '';
    tab.xterm.open(containerRef.current);
    
    requestAnimationFrame(() => {
      try {
        tab.fitAddon.fit();
        const dims = tab.fitAddon.proposeDimensions();
        if (dims) {
          (window as any).agentAPI.terminalResize({
            id: tab.id,
            cols: dims.cols,
            rows: dims.rows,
          });
        }
      } catch (e) {
        // ignore fit errors
      }
      tab.xterm.focus();
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        tab.fitAddon.fit();
        const dims = tab.fitAddon.proposeDimensions();
        if (dims) {
          (window as any).agentAPI.terminalResize({
            id: tab.id,
            cols: dims.cols,
            rows: dims.rows,
          });
        }
      } catch (e) {
        // ignore
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [activeTabId, tabs]);

  const killTab = useCallback((id: string) => {
    (window as any).agentAPI.terminalKill(id);
    const tab = tabs.find(t => t.id === id);
    if (tab) tab.xterm.dispose();
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (id === activeTabId && filtered.length > 0) {
        setActiveTabId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  }, [tabs, activeTabId]);

  const dismissError = useCallback((index: number) => {
    setDetectedErrors(prev => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0d1117',
      borderTop: '1px solid var(--prime-border)',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--prime-surface)',
        borderBottom: '1px solid var(--prime-border)',
        height: '34px',
        padding: '0 4px',
        gap: '2px',
      }}>
        {tabs.map(tab => (
          <div key={tab.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            background: tab.id === activeTabId ? '#0d1117' : 'transparent',
            color: tab.id === activeTabId ? 'var(--prime-text)' : 'var(--prime-text-muted)',
            fontWeight: tab.id === activeTabId ? 600 : 400,
          }} onClick={() => setActiveTabId(tab.id)}>
            <span style={{ fontSize: '10px' }}>{'>'}_</span>
            <span>{tab.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); killTab(tab.id); }}
              style={{ cursor: 'pointer', opacity: 0.5, fontSize: '14px' }}
            >
              x
            </span>
          </div>
        ))}

        <button
          onClick={createTab}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--prime-text-muted)',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '2px 8px',
            borderRadius: '4px',
          }}
          title="New terminal"
        >
          +
        </button>

        <div style={{ flex: 1 }} />

        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--prime-text-muted)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '2px 8px',
            }}
          >
            x
          </button>
        )}
      </div>

      {/* Error detection banner */}
      {detectedErrors.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '6px 10px',
          background: 'rgba(255, 123, 114, 0.1)',
          borderBottom: '1px solid rgba(255, 123, 114, 0.2)',
        }}>
          {detectedErrors.slice(-3).map((err, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}>
              <span style={{ color: '#ff7b72', fontWeight: 600 }}>Error</span>
              <span style={{
                color: 'var(--prime-text-secondary)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}>
                {err.message}
              </span>
              {onFixError && (
                <button
                  onClick={() => onFixError(err)}
                  style={{
                    padding: '2px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '4px',
                    background: 'var(--prime-accent)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Fix
                </button>
              )}
              <button
                onClick={() => dismissError(i)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--prime-text-muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: '4px',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};

export default TerminalComponent;
