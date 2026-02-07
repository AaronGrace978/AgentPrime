/**
 * ChatInput - Input area with send button and mode indicator
 */

import React from 'react';
import { DualMode } from '../types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  agentRunning: boolean;
  mode: DualMode;
  workspacePath: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isLoading,
  agentRunning,
  mode,
  workspacePath
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isDisabled = !input.trim() || isLoading || agentRunning;

  return (
    <div style={{
      padding: '16px 20px',
      borderTop: '1px solid #e5e7eb',
      background: '#ffffff'
    }}>
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-end'
      }}>
        <div style={{
          flex: 1,
          position: 'relative'
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="🤖 Describe what you want to build..."
            style={{
              width: '100%',
              padding: '14px 16px',
              paddingRight: '50px',
              borderRadius: '14px',
              border: '2px solid #e5e7eb',
              background: '#fafbfc',
              color: '#1a1d21',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'none',
              minHeight: '52px',
              maxHeight: '150px',
              outline: 'none',
              transition: 'all 0.2s ease',
              lineHeight: '1.5'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#ff6b4a';
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 74, 0.08)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.background = '#fafbfc';
              e.currentTarget.style.boxShadow = 'none';
            }}
            disabled={isLoading || agentRunning}
          />
          {/* Mode indicator inside input */}
          <div style={{
            position: 'absolute',
            right: '12px',
            bottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color: '#9ca3af',
            background: '#f3f4f6',
            padding: '3px 8px',
            borderRadius: '6px'
          }}>
            {mode === 'fast' && '⚡'}
            {mode === 'auto' && '🔀'}
            {mode === 'deep' && '🧠'}
            <span style={{ textTransform: 'capitalize' }}>{mode}</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {agentRunning && (
            <button
              onClick={onStop}
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
              }}
            >
              ⏹ Stop
            </button>
          )}
          <button
            onClick={onSend}
            disabled={isDisabled}
            style={{
              padding: '14px 24px',
              borderRadius: '12px',
              border: 'none',
              background: isDisabled
                ? '#e5e7eb'
                : 'linear-gradient(135deg, #ff6b4a 0%, #ff8a6b 100%)',
              color: isDisabled ? '#9ca3af' : 'white',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              boxShadow: isDisabled
                ? 'none'
                : '0 4px 12px rgba(255, 107, 74, 0.3)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: '100px',
              justifyContent: 'center'
            }}
            onMouseOver={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 74, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 74, 0.3)';
              }
            }}
          >
            {isLoading || agentRunning ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                {agentRunning ? 'Working' : 'Thinking'}
              </>
            ) : (
              <>
                Send
                <span style={{ fontSize: '16px' }}>→</span>
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Keyboard hint */}
      <div style={{
        marginTop: '8px',
        fontSize: '11px',
        color: '#9ca3af',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          Press <kbd style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'inherit' }}>Enter</kbd> to send, <kbd style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'inherit' }}>Shift+Enter</kbd> for new line
        </span>
        {workspacePath && (
          <span style={{ color: '#10b981' }}>
            ✓ Agent ready
          </span>
        )}
      </div>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ChatInput;

