/**
 * InlineEditDialog — Cursor-style Cmd+K inline edit input
 * 
 * When the user presses Cmd+K with selected code, this floating
 * dialog appears asking for edit instructions. The AI processes
 * the instruction and shows an InlineDiff preview.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface InlineEditRequest {
  selectedText: string;
  startLine: number;
  endLine: number;
  filePath?: string;
  language?: string;
}

interface InlineEditDialogProps {
  request: InlineEditRequest | null;
  onSubmit: (instruction: string, request: InlineEditRequest) => void;
  onClose: () => void;
  isProcessing: boolean;
}

const InlineEditDialog: React.FC<InlineEditDialogProps> = ({
  request,
  onSubmit,
  onClose,
  isProcessing,
}) => {
  const [instruction, setInstruction] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (request) {
      setInstruction('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [request]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && request) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [request, onClose]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || !request || isProcessing) return;
    onSubmit(instruction, request);
  }, [instruction, request, isProcessing, onSubmit]);

  if (!request) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '20vh',
      background: 'rgba(0, 0, 0, 0.3)',
      backdropFilter: 'blur(2px)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '560px',
          background: 'var(--prime-surface)',
          border: '1px solid var(--prime-border)',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Context preview */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--prime-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '12px' }}>✏</span>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Inline Edit</span>
          <span style={{
            fontSize: '10px',
            color: 'var(--prime-text-muted)',
            fontFamily: 'monospace',
          }}>
            {request.filePath?.split(/[/\\]/).pop()} : lines {request.startLine}-{request.endLine}
          </span>
          {request.language && (
            <span style={{
              fontSize: '9px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'var(--prime-accent-glow)',
              color: 'var(--prime-accent)',
              fontWeight: 600,
            }}>
              {request.language}
            </span>
          )}
        </div>

        {/* Code preview */}
        <div style={{
          maxHeight: '120px',
          overflow: 'auto',
          background: '#0d1117',
          borderBottom: '1px solid var(--prime-border)',
        }}>
          <pre style={{
            margin: 0,
            padding: '8px 16px',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '11px',
            lineHeight: '1.5',
            color: '#c9d1d9',
            whiteSpace: 'pre-wrap',
          }}>
            {request.selectedText}
          </pre>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={inputRef}
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Describe the change... (e.g., 'add error handling', 'make async')"
              disabled={isProcessing}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--prime-border)',
                background: 'var(--prime-bg)',
                color: 'var(--prime-text)',
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--prime-accent)';
                e.currentTarget.style.boxShadow = '0 0 0 2px var(--prime-accent-glow)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--prime-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <button
              type="submit"
              disabled={!instruction.trim() || isProcessing}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                background: (!instruction.trim() || isProcessing)
                  ? 'var(--prime-border)' : 'var(--prime-accent)',
                color: (!instruction.trim() || isProcessing)
                  ? 'var(--prime-text-muted)' : '#fff',
                cursor: (!instruction.trim() || isProcessing)
                  ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isProcessing ? (
                <>
                  <div style={{
                    width: '12px', height: '12px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'inlineEditSpin 0.7s linear infinite',
                  }} />
                  Editing...
                </>
              ) : 'Apply'}
            </button>
          </div>
          <div style={{
            marginTop: '6px',
            fontSize: '10px',
            color: 'var(--prime-text-muted)',
            display: 'flex',
            gap: '12px',
          }}>
            <span>
              <kbd style={{
                background: 'var(--prime-surface-hover)',
                padding: '1px 4px', borderRadius: '3px',
                border: '1px solid var(--prime-border)', fontSize: '9px',
              }}>Enter</kbd> to apply
            </span>
            <span>
              <kbd style={{
                background: 'var(--prime-surface-hover)',
                padding: '1px 4px', borderRadius: '3px',
                border: '1px solid var(--prime-border)', fontSize: '9px',
              }}>Esc</kbd> to cancel
            </span>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes inlineEditSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default InlineEditDialog;
