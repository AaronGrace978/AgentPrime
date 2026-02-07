/**
 * OutputPanel - Terminal output display
 */

import React from 'react';
import { RunOutput } from '../types';

interface OutputPanelProps {
  runOutput: RunOutput[];
  onClose: () => void;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({
  runOutput,
  onClose
}) => {
  return (
    <div className="output-panel">
      <div className="output-header">
        <span>Output</span>
        <button onClick={onClose} className="close-btn">×</button>
      </div>
      <div className="output-content">
        {runOutput.length > 0 ? (
          <pre className="output-text">
            {runOutput.map((item, i) => (
              <span key={i} className={`output-${item.type}`}>{item.text}</span>
            ))}
          </pre>
        ) : (
          <div className="output-placeholder">
            <p>💡 Click "Run" to see your code in action!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OutputPanel;

