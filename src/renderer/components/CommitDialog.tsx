import React, { useState } from 'react';

interface CommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string) => Promise<void>;
  stagedFiles?: string[];
  modifiedFiles?: string[];
}

const CommitDialog: React.FC<CommitDialogProps> = ({
  isOpen,
  onClose,
  onCommit,
  stagedFiles = [],
  modifiedFiles = []
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!commitMessage.trim()) {
      setError('Commit message is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onCommit(commitMessage.trim());
      setSuccess(true);

      // Reset form and close after success
      setTimeout(() => {
        setCommitMessage('');
        setSuccess(false);
        onClose();
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Failed to commit');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setCommitMessage('');
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  const totalFiles = stagedFiles.length + modifiedFiles.length;

  return (
    <div className="commit-dialog-overlay" onClick={handleClose}>
      <div className="commit-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="commit-dialog-header">
          <h3>Commit Changes</h3>
          <button
            className="commit-dialog-close"
            onClick={handleClose}
            disabled={loading}
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="commit-dialog-content">
          {success ? (
            <div className="commit-success">
              ✅ Changes committed successfully!
            </div>
          ) : (
            <>
              <div className="commit-files-summary">
                <p>Committing {totalFiles} file{totalFiles !== 1 ? 's' : ''}</p>
                {stagedFiles.length > 0 && (
                  <div className="commit-files-section">
                    <span className="section-label">Staged:</span>
                    <span className="files-count">{stagedFiles.length}</span>
                  </div>
                )}
                {modifiedFiles.length > 0 && (
                  <div className="commit-files-section">
                    <span className="section-label">Modified:</span>
                    <span className="files-count">{modifiedFiles.length}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit}>
                <div className="commit-message-section">
                  <label htmlFor="commit-message">Commit Message:</label>
                  <textarea
                    id="commit-message"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Enter commit message..."
                    rows={3}
                    disabled={loading}
                    autoFocus
                  />
                  <div className="commit-message-footer">
                    <span className="char-count">
                      {commitMessage.length} characters
                    </span>
                    <span className="commit-tip">
                      Press Enter to commit, Esc to cancel
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="commit-error">
                    ❌ {error}
                  </div>
                )}

                <div className="commit-dialog-actions">
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="commit-button"
                    disabled={!commitMessage.trim() || loading}
                  >
                    {loading ? 'Committing...' : 'Commit'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommitDialog;
