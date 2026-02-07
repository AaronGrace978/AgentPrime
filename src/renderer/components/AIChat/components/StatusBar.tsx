/**
 * StatusBar - Shows active model and complexity indicator
 */

import React from 'react';

interface StatusBarProps {
  currentModel: string;
  complexity: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ currentModel, complexity }) => {
  if (!currentModel) return null;

  return (
    <div style={{
      padding: '6px 20px 10px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '11px',
      color: '#6b7280'
    }}>
      <span style={{ fontWeight: '500' }}>Active:</span>
      <span style={{ 
        fontFamily: '"JetBrains Mono", monospace',
        background: '#f3f4f6',
        padding: '2px 8px',
        borderRadius: '4px',
        color: '#1a1d21'
      }}>
        {currentModel}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>Complexity:</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
            <div 
              key={i}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '2px',
                background: i <= complexity 
                  ? (complexity >= 7 ? '#8b5cf6' : complexity >= 4 ? '#f59e0b' : '#10b981')
                  : '#e5e7eb',
                transition: 'all 0.2s ease'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusBar;

