import React, { useState, useEffect, useRef } from 'react';

interface CreateModalProps {
  isOpen: boolean;
  type: 'file' | 'folder';
  onClose: () => void;
  onCreate: (type: 'file' | 'folder', name: string) => Promise<void>;
  currentPath: string;
}

const CreateModal: React.FC<CreateModalProps> = ({
  isOpen,
  type,
  onClose,
  onCreate,
  currentPath
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    // Basic validation
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      setError('Invalid characters in name');
      return;
    }

    // File extension validation
    if (type === 'file' && !name.includes('.')) {
      setError('Files must have an extension');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onCreate(type, name.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create item');
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

  const title = type === 'file' ? 'Create New File' : 'Create New Folder';
  const placeholder = type === 'file' ? 'filename.txt' : 'folder-name';
  const icon = type === 'file' ? '📄' : '📁';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon">{icon}</span>
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="item-name">Name:</label>
              <input
                ref={inputRef}
                id="item-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <div className="path-info">
              <small>Location: {currentPath}</small>
            </div>

            {error && (
              <div className="error-message">
                ❌ {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || loading}>
              {loading ? 'Creating...' : `Create ${type}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateModal;
