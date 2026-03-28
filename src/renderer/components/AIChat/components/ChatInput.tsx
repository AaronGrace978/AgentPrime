/**
 * ChatInput - Message input area with send controls and @-mentions
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ChatMode, DualMode } from '../types';
import MentionAutocomplete, { MentionItem } from './MentionAutocomplete';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  agentRunning: boolean;
  mode: DualMode;
  chatMode: ChatMode;
  workspacePath: string | null;
}

const PLACEHOLDERS: Record<ChatMode, string> = {
  agent: 'Describe what you want to build... (@ to mention files)',
  chat: 'Ask anything, brainstorm, or just chat...',
  dino: 'Talk to Dino Buddy! 🦖',
};

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isLoading,
  agentRunning,
  mode,
  chatMode,
  workspacePath
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const mentionStartRef = useRef<number>(-1);

  useEffect(() => {
    if (!isLoading && !agentRunning && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading, agentRunning]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (showMentions) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      mentionStartRef.current = cursorPos - atMatch[0].length;
      setMentionQuery(atMatch[1]);

      if (textareaRef.current) {
        const rect = textareaRef.current.getBoundingClientRect();
        setMentionPosition({
          top: window.innerHeight - rect.top + 8,
          left: rect.left + 16,
        });
      }
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }, [setInput]);

  const handleMentionSelect = useCallback((item: MentionItem) => {
    const start = mentionStartRef.current;
    if (start >= 0) {
      const before = input.substring(0, start);
      const cursorPos = textareaRef.current?.selectionStart || input.length;
      const after = input.substring(cursorPos);
      setInput(before + item.value + ' ' + after);
    }
    setShowMentions(false);
    mentionStartRef.current = -1;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [input, setInput]);

  const isDisabled = !input.trim() || isLoading || agentRunning;

  return (
    <div style={{
      padding: '12px 16px 14px',
      borderTop: '1px solid var(--prime-border)',
      background: 'var(--prime-surface)',
      position: 'relative'
    }}>
      <MentionAutocomplete
        query={mentionQuery}
        position={mentionPosition}
        onSelect={handleMentionSelect}
        onClose={() => setShowMentions(false)}
        visible={showMentions}
      />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={PLACEHOLDERS[chatMode]}
            rows={1}
            style={{
              width: '100%',
              padding: '11px 14px',
              paddingRight: '52px',
              borderRadius: '10px',
              border: '1px solid var(--prime-border)',
              background: 'var(--prime-bg)',
              color: 'var(--prime-text)',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'none',
              minHeight: '44px',
              maxHeight: '120px',
              outline: 'none',
              transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
              lineHeight: '1.5'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--prime-accent)';
              e.currentTarget.style.boxShadow = '0 0 0 2px var(--prime-accent-glow)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--prime-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            disabled={isLoading || agentRunning}
          />
          <div style={{
            position: 'absolute',
            right: '10px',
            bottom: '10px',
            fontSize: '10px',
            color: chatMode === 'dino' ? 'var(--prime-amber)' : 'var(--prime-text-muted)',
            background: 'var(--prime-surface-hover)',
            padding: '2px 6px',
            borderRadius: '4px',
            textTransform: 'capitalize',
            fontWeight: 600
          }}>
            {chatMode === 'agent' ? mode : chatMode === 'dino' ? '🦖 dino' : 'chat'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          {agentRunning && (
            <button
              onClick={onStop}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--prime-error)',
                background: 'var(--prime-error)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                fontFamily: 'inherit'
              }}
            >
              Stop
            </button>
          )}
          <button
            onClick={onSend}
            disabled={isDisabled}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              background: isDisabled ? 'var(--prime-border)' : 'var(--prime-accent)',
              color: isDisabled ? 'var(--prime-text-muted)' : '#fff',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              fontFamily: 'inherit',
              minWidth: '80px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.12s ease'
            }}
          >
            {isLoading || agentRunning ? (
              <>
                <div style={{
                  width: '14px', height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid #fff',
                  borderRadius: '50%',
                  animation: 'chatSpin 0.7s linear infinite'
                }} />
                {agentRunning ? 'Working' : 'Thinking'}
              </>
            ) : 'Send'}
          </button>
        </div>
      </div>

      <div style={{
        marginTop: '6px',
        fontSize: '11px',
        color: 'var(--prime-text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 2px'
      }}>
        <span>
          <kbd style={{
            background: 'var(--prime-surface-hover)',
            padding: '1px 5px', borderRadius: '3px',
            border: '1px solid var(--prime-border)', fontSize: '10px'
          }}>Enter</kbd> to send
          {' '}&middot;{' '}
          <kbd style={{
            background: 'var(--prime-surface-hover)',
            padding: '1px 5px', borderRadius: '3px',
            border: '1px solid var(--prime-border)', fontSize: '10px'
          }}>Shift+Enter</kbd> new line
        </span>
        <span style={{
          color: 'var(--prime-success)',
          fontSize: '10px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span style={{
            width: '5px', height: '5px',
            borderRadius: '50%',
            background: chatMode !== 'agent' || workspacePath ? 'var(--prime-success)' : 'var(--prime-text-muted)'
          }} />
          {chatMode !== 'agent' ? 'Ready' : workspacePath ? 'Ready' : 'No workspace'}
        </span>
      </div>

      <style>{`
        @keyframes chatSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ChatInput;
