/**
 * CreateFolderDialog - Dialog for creating a new folder
 */

import React, { useState, useEffect, useRef } from 'react';

interface CreateFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (folderName: string) => Promise<string | null>;
}

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!folderName.trim()) {
      setError('Folder name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await onCreate(folderName.trim());
      if (result) {
        setFolderName('');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '400px',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '20px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <span style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#1f6feb',
            background: '#eaf2ff',
            border: '1px solid #c9dcff'
          }}>FD</span>
          <h3 style={{
            flex: 1,
            margin: 0,
            fontSize: '16px',
            fontWeight: '600',
            color: '#1a1d21'
          }}>
            Name Your New Folder
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: '#9ca3af',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.color = '#1a1d21';
                e.currentTarget.style.background = '#f3f4f6';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.color = '#9ca3af';
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="folder-name"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}
              >
                Enter folder name:
              </label>
              <input
                ref={inputRef}
                id="folder-name"
                type="text"
                value={folderName}
                onChange={(e) => {
                  setFolderName(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Enter folder name (e.g., my-game, todo-app)"
                disabled={loading}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '14px',
                  border: error ? '2px solid #ef4444' : '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#1a1d21',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = error ? '#ef4444' : '#d1d5db';
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                Error: {error}
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#374151',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = '#f9fafb';
                  }
                }}
                onMouseOut={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = '#ffffff';
                  }
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!folderName.trim() || loading}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: 'none',
                  borderRadius: '8px',
                  background: !folderName.trim() || loading
                    ? '#d1d5db'
                    : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#ffffff',
                  cursor: !folderName.trim() || loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: !folderName.trim() || loading
                    ? 'none'
                    : '0 2px 8px rgba(59, 130, 246, 0.3)'
                }}
                onMouseOver={(e) => {
                  if (folderName.trim() && !loading) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                  }
                }}
                onMouseOut={(e) => {
                  if (folderName.trim() && !loading) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
                  }
                }}
              >
                {loading ? 'Creating...' : 'Create Folder'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateFolderDialog;

