/**
 * StatusBar — active model + model power meter (theme-aware)
 */

import React from 'react';
import { estimateModelCapability } from '../modelCapability';
import type { ChatMode } from '../types';

interface StatusBarProps {
  currentModel: string;
  chatMode?: ChatMode;
}

export const StatusBar: React.FC<StatusBarProps> = ({ currentModel, chatMode }) => {
  if (!currentModel) return null;

  const power = estimateModelCapability(currentModel);
  const isDino = chatMode === 'dino';

  const activeDotColor =
    power >= 7 ? 'var(--prime-purple)' : power >= 4 ? 'var(--prime-amber)' : 'var(--prime-success)';
  const inactiveDot = 'var(--prime-border)';

  const chipStyle: React.CSSProperties = {
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    background: 'var(--prime-surface-hover)',
    padding: '3px 10px',
    borderRadius: 'var(--prime-radius-sm)',
    color: 'var(--prime-text)',
    border: isDino ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--prime-border)',
    fontSize: '11px',
    fontWeight: 500,
    maxWidth: 'min(340px, 52vw)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      className="chat-runtime-status-bar"
      style={{
        padding: '6px 18px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '11px',
        color: 'var(--prime-text-secondary)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 600, color: 'var(--prime-text-secondary)' }}>Active:</span>
      <span style={chipStyle} title={currentModel}>
        {currentModel}
      </span>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        title={`Estimated model capability ${power}/10 (from the active model name). Changes when you switch models in settings.`}
      >
        <span style={{ fontWeight: 600, color: 'var(--prime-text-secondary)' }}>Power:</span>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div
              key={i}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: i <= power ? activeDotColor : inactiveDot,
                opacity: i <= power ? 1 : 0.45,
                transition: 'background 0.2s ease, opacity 0.2s ease',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
