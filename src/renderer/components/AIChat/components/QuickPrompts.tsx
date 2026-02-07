/**
 * QuickPrompts - Suggested prompts for new users
 * Uses CSS classes for theme support
 */

import React from 'react';
import { QUICK_PROMPTS } from '../constants';

interface QuickPromptsProps {
  onSelect: (prompt: string) => void;
}

export const QuickPrompts: React.FC<QuickPromptsProps> = ({ onSelect }) => {
  return (
    <div className="quick-prompts">
      <span className="quick-prompts-label">Try:</span>
      {QUICK_PROMPTS.map((item, i) => (
        <button
          key={i}
          onClick={() => onSelect(item.prompt)}
          className="quick-prompt-chip"
        >
          {item.text}
        </button>
      ))}
    </div>
  );
};

export default QuickPrompts;

