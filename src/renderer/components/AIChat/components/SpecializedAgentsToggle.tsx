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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      background: enabled ? 'var(--prime-accent-light)' : 'var(--prime-surface-hover)',
      borderRadius: '8px',
      border: `1px solid ${enabled ? 'var(--prime-blue)' : 'var(--prime-border)'}`,
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    }}
    onClick={() => onChange(!enabled)}
    title={enabled 
      ? 'Specialized Agents: Uses domain experts (JS specialist, Python specialist, etc.)' 
      : 'Monolithic Agent: Uses single agent for all tasks'}
    >
      <div style={{
        width: '40px',
        height: '20px',
        borderRadius: '10px',
        background: enabled ? 'var(--prime-blue)' : 'var(--prime-border)',
        position: 'relative',
        transition: 'all 0.2s ease',
        flexShrink: 0
      }}>
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'var(--prime-surface)',
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          transition: 'all 0.2s ease',
          boxShadow: 'var(--prime-shadow-sm)'
        }} />
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: '600',
          color: enabled ? 'var(--prime-blue)' : 'var(--prime-text-secondary)',
          lineHeight: '1.2'
        }}>
          {enabled ? '👥 Specialized' : '🤖 Monolithic'}
        </span>
        <span style={{
          fontSize: '9px',
          color: enabled ? 'var(--prime-blue)' : 'var(--prime-text-muted)',
          lineHeight: '1.2'
        }}>
          {enabled ? 'Domain experts' : 'Single agent'}
        </span>
      </div>
    </div>
  );
};

export default SpecializedAgentsToggle;

