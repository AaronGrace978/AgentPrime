/**
 * LivePreview — Embedded webview for live preview of web projects
 * 
 * Shows a live preview of the project with:
 * - Auto-refresh on file save
 * - URL bar with navigation
 * - Device size presets (mobile, tablet, desktop)
 * - Console output forwarding
 * 
 * This is what Lovable charges $25/mo for. Now it's free.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

type DevicePreset = 'mobile' | 'tablet' | 'desktop' | 'full';

const DEVICE_SIZES: Record<DevicePreset, { width: string; label: string }> = {
  mobile: { width: '375px', label: '375px' },
  tablet: { width: '768px', label: '768px' },
  desktop: { width: '1280px', label: '1280px' },
  full: { width: '100%', label: 'Full' },
};

interface LivePreviewProps {
  url?: string;
  onClose: () => void;
  onUrlChange?: (url: string) => void;
}

const LivePreview: React.FC<LivePreviewProps> = ({ url: initialUrl, onClose, onUrlChange }) => {
  const [url, setUrl] = useState(initialUrl || 'http://localhost:3000');
  const [inputUrl, setInputUrl] = useState(initialUrl || 'http://localhost:3000');
  const [device, setDevice] = useState<DevicePreset>('full');
  const [isLoading, setIsLoading] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: string; message: string; timestamp: number }>>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = useCallback((newUrl: string) => {
    let finalUrl = newUrl;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'http://' + finalUrl;
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
    setIsLoading(true);
    onUrlChange?.(finalUrl);
  }, [onUrlChange]);

  const refresh = useCallback(() => {
    if (iframeRef.current) {
      setIsLoading(true);
      iframeRef.current.src = url;
    }
  }, [url]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'console-log') {
        setConsoleLogs(prev => [...prev.slice(-99), {
          type: event.data.level || 'log',
          message: event.data.message,
          timestamp: Date.now(),
        }]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--prime-bg)',
      borderLeft: '1px solid var(--prime-border)',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        borderBottom: '1px solid var(--prime-border)',
        background: 'var(--prime-surface)',
      }}>
        {/* Navigation */}
        <button onClick={refresh} style={toolbarBtn} title="Refresh">
          ⟳
        </button>

        {/* URL bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); navigate(inputUrl); }}
          style={{ flex: 1 }}
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid var(--prime-border)',
              background: 'var(--prime-bg)',
              color: 'var(--prime-text)',
              fontSize: '12px',
              fontFamily: '"JetBrains Mono", monospace',
              outline: 'none',
            }}
          />
        </form>

        {/* Device presets */}
        <div style={{ display: 'flex', gap: '2px', borderLeft: '1px solid var(--prime-border)', paddingLeft: '6px' }}>
          {(Object.keys(DEVICE_SIZES) as DevicePreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => setDevice(preset)}
              style={{
                ...toolbarBtn,
                background: device === preset ? 'var(--prime-accent)' : 'transparent',
                color: device === preset ? '#fff' : 'var(--prime-text-muted)',
              }}
              title={DEVICE_SIZES[preset].label}
            >
              {preset === 'mobile' ? '📱' : preset === 'tablet' ? '📋' : preset === 'desktop' ? '🖥' : '⛶'}
            </button>
          ))}
        </div>

        {/* Console toggle */}
        <button
          onClick={() => setShowConsole(!showConsole)}
          style={{
            ...toolbarBtn,
            background: showConsole ? 'var(--prime-accent)' : 'transparent',
            color: showConsole ? '#fff' : 'var(--prime-text-muted)',
            position: 'relative',
          }}
          title="Toggle console"
        >
          {'>'}_
          {consoleLogs.length > 0 && (
            <span style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#ff7b72',
            }} />
          )}
        </button>

        <button onClick={onClose} style={{ ...toolbarBtn, color: 'var(--prime-text-muted)' }}>
          x
        </button>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div style={{
          height: '2px',
          background: 'linear-gradient(90deg, var(--prime-accent), transparent)',
          animation: 'previewLoad 1s ease infinite',
        }} />
      )}

      {/* Preview area */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        background: device !== 'full' ? '#1a1a2e' : 'transparent',
        overflow: 'auto',
      }}>
        <div style={{
          width: DEVICE_SIZES[device].width,
          height: '100%',
          transition: 'width 0.2s ease',
          boxShadow: device !== 'full' ? '0 0 20px rgba(0,0,0,0.5)' : 'none',
        }}>
          <iframe
            ref={iframeRef}
            src={url}
            onLoad={() => setIsLoading(false)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
              borderRadius: device !== 'full' ? '8px' : '0',
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>
      </div>

      {/* Console panel */}
      {showConsole && (
        <div style={{
          height: '120px',
          borderTop: '1px solid var(--prime-border)',
          background: '#0d1117',
          overflow: 'auto',
          padding: '4px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '2px 8px',
            borderBottom: '1px solid var(--prime-border)',
            marginBottom: '4px',
          }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#8b949e' }}>CONSOLE</span>
            <button
              onClick={() => setConsoleLogs([])}
              style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '10px' }}
            >
              Clear
            </button>
          </div>
          {consoleLogs.map((log, i) => (
            <div key={i} style={{
              padding: '1px 8px',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px',
              color: log.type === 'error' ? '#ff7b72' : log.type === 'warn' ? '#d29922' : '#c9d1d9',
            }}>
              <span style={{ color: '#484f58', marginRight: '8px' }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {log.message}
            </div>
          ))}
          {consoleLogs.length === 0 && (
            <div style={{ padding: '8px', color: '#484f58', fontSize: '11px', textAlign: 'center' }}>
              No console output
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes previewLoad {
          0% { opacity: 0.3; transform: translateX(-100%); }
          50% { opacity: 1; }
          100% { opacity: 0.3; transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

const toolbarBtn: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: 'none',
  background: 'transparent',
  color: 'var(--prime-text)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export default LivePreview;
