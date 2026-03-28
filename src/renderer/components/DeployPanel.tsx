/**
 * DeployPanel — One-click deploy to Vercel/Netlify
 * 
 * This is the feature that makes Lovable/Bolt charge $25/mo.
 * We do it for free.
 */

import React, { useState, useEffect, useCallback } from 'react';

interface DeployPanelProps {
  onClose: () => void;
}

type DeployState = 'idle' | 'deploying' | 'success' | 'error';

const DeployPanel: React.FC<DeployPanelProps> = ({ onClose }) => {
  const [status, setStatus] = useState<{ vercel: boolean; netlify: boolean }>({ vercel: false, netlify: false });
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deployOutput, setDeployOutput] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (window as any).agentAPI.deployStatus().then((s: any) => setStatus(s));

    const handleOutput = (_event: any, data: { text: string }) => {
      setDeployOutput(prev => [...prev, data.text]);
    };

    (window as any).agentAPI.on('deploy:output', handleOutput);
    return () => (window as any).agentAPI.removeListener('deploy:output');
  }, []);

  const deploy = useCallback(async (provider: string) => {
    setDeployState('deploying');
    setDeployOutput([]);
    setDeployUrl(null);
    setErrorMessage(null);

    try {
      const result = await (window as any).agentAPI.deploy(provider);
      if (result.success) {
        setDeployState('success');
        setDeployUrl(result.url || null);
      } else {
        setDeployState('error');
        setErrorMessage(result.error || 'Deploy failed');
      }
    } catch (e: any) {
      setDeployState('error');
      setErrorMessage(e.message);
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--prime-surface)',
      border: '1px solid var(--prime-border)',
      borderRadius: '10px',
      overflow: 'hidden',
      width: '400px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--prime-border)',
      }}>
        <span style={{ fontSize: '16px' }}>🚀</span>
        <span style={{ fontWeight: 600, fontSize: '14px', flex: 1 }}>Deploy</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--prime-text-muted)',
          cursor: 'pointer', fontSize: '16px',
        }}>x</button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {deployState === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', margin: 0 }}>
              Deploy your project with a single click.
            </p>

            <button
              onClick={() => deploy('vercel')}
              disabled={!status.vercel}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid var(--prime-border)',
                background: status.vercel ? '#000' : 'var(--prime-surface-hover)',
                color: status.vercel ? '#fff' : 'var(--prime-text-muted)',
                cursor: status.vercel ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '16px' }}>▲</span>
              Deploy to Vercel
              {!status.vercel && <span style={{ fontSize: '10px', marginLeft: 'auto' }}>npm i -g vercel</span>}
            </button>

            <button
              onClick={() => deploy('netlify')}
              disabled={!status.netlify}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid var(--prime-border)',
                background: status.netlify ? '#00ad9f' : 'var(--prime-surface-hover)',
                color: status.netlify ? '#fff' : 'var(--prime-text-muted)',
                cursor: status.netlify ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '16px' }}>◆</span>
              Deploy to Netlify
              {!status.netlify && <span style={{ fontSize: '10px', marginLeft: 'auto' }}>npm i -g netlify-cli</span>}
            </button>

            {!status.vercel && !status.netlify && (
              <div style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(210, 153, 34, 0.1)',
                border: '1px solid rgba(210, 153, 34, 0.2)',
                fontSize: '11px',
                color: '#d29922',
              }}>
                Install a deploy CLI to get started:
                <code style={{ display: 'block', marginTop: '4px', fontFamily: 'monospace' }}>
                  npm i -g vercel
                </code>
              </div>
            )}
          </div>
        )}

        {deployState === 'deploying' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '16px', height: '16px',
                border: '2px solid var(--prime-accent)',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'deploySpin 0.7s linear infinite',
              }} />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Deploying...</span>
            </div>
            <pre style={{
              margin: 0,
              padding: '8px',
              background: '#0d1117',
              borderRadius: '6px',
              fontSize: '10px',
              color: '#c9d1d9',
              maxHeight: '150px',
              overflow: 'auto',
              fontFamily: 'monospace',
            }}>
              {deployOutput.join('') || 'Starting deploy...'}
            </pre>
          </div>
        )}

        {deployState === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '32px' }}>🎉</div>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#3fb950' }}>Deployed!</span>
            {deployUrl && (
              <a
                href="#"
                onClick={() => (window as any).agentAPI.openExternal(deployUrl)}
                style={{
                  color: 'var(--prime-accent)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {deployUrl}
              </a>
            )}
            <button
              onClick={() => { setDeployState('idle'); setDeployOutput([]); }}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: '1px solid var(--prime-border)',
                background: 'transparent',
                color: 'var(--prime-text)',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Deploy Again
            </button>
          </div>
        )}

        {deployState === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ color: '#ff7b72', fontSize: '13px', fontWeight: 600 }}>Deploy Failed</div>
            <div style={{
              padding: '8px',
              borderRadius: '6px',
              background: 'rgba(255, 123, 114, 0.1)',
              fontSize: '12px',
              color: '#ffa198',
              fontFamily: 'monospace',
            }}>
              {errorMessage}
            </div>
            <button
              onClick={() => { setDeployState('idle'); setDeployOutput([]); }}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: '1px solid var(--prime-border)',
                background: 'transparent',
                color: 'var(--prime-text)',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes deploySpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DeployPanel;
