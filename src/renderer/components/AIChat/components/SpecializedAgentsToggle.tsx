/**
 * SpecializedAgentsToggle - Toggle between monolithic and specialized agents
 */

import React from 'react';

interface SpecializedAgentsToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export const SpecializedAgentsToggle: React.FC<SpecializedAgentsToggleProps> = ({
  enabled,
  onChange
}) => {
  return (
    <button
      onClick={() => onChange(!enabled)}
      title={enabled
        ? 'Specialized Agents: Uses domain experts'
        : 'Single Agent: Uses one agent for all tasks'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        padding: '5px 10px',
        background: enabled ? 'var(--prime-accent-light)' : 'var(--prime-surface)',
        borderRadius: '6px',
        border: `1px solid ${enabled ? 'var(--prime-accent)' : 'var(--prime-border)'}`,
        cursor: 'pointer',
        transition: 'all 0.12s ease',
        fontFamily: 'inherit'
      }}
    >
      <div style={{
        width: '32px',
        height: '16px',
        borderRadius: '8px',
        background: enabled ? 'var(--prime-accent)' : 'var(--prime-border)',
        position: 'relative',
        transition: 'background 0.15s ease',
        flexShrink: 0
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: '2px',
          left: enabled ? '18px' : '2px',
          transition: 'left 0.15s ease'
        }} />
      </div>
      <span style={{
        fontSize: '11px',
        fontWeight: '600',
        color: enabled ? 'var(--prime-accent)' : 'var(--prime-text-muted)',
        whiteSpace: 'nowrap'
      }}>
        {enabled ? 'Specialized' : 'Single Agent'}
      </span>
    </button>
  );
};

export default SpecializedAgentsToggle;
