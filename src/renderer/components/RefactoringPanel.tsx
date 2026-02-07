/**
 * AgentPrime - Refactoring Panel Component
 * UI for AI-powered refactoring operations
 */

import React, { useState } from 'react';

// Refactoring types (shared with main process)
type RefactoringType = 
  | 'extract-function'
  | 'extract-method'
  | 'extract-component'
  | 'rename-symbol'
  | 'move-code'
  | 'convert-async'
  | 'inline-variable'
  | 'optimize-imports';

interface RefactoringChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  diff: string;
}

interface RefactoringResult {
  success: boolean;
  changes: RefactoringChange[];
  preview: string;
  safetyScore: number;
  warnings: string[];
  errors?: string[];
}

interface RefactoringPanelProps {
  filePath: string;
  selection?: {
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
  };
  workspacePath: string;
  onRefactorComplete?: (result: RefactoringResult) => void;
}

export const RefactoringPanel: React.FC<RefactoringPanelProps> = ({
  filePath,
  selection,
  workspacePath,
  onRefactorComplete
}) => {
  const [refactoringType, setRefactoringType] = useState<RefactoringType>('extract-function');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RefactoringResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleRefactor = async () => {
    if (!selection) {
      alert('Please select code to refactor');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await window.agentAPI.refactorCode({
        type: refactoringType,
        filePath,
        selection,
        target: target || undefined,
        workspacePath
      });

      setResult(response);
      setShowPreview(true);

      if (response.success && onRefactorComplete) {
        onRefactorComplete(response);
      }
    } catch (error: any) {
      console.error('Refactoring failed:', error);
      setResult({
        success: false,
        changes: [],
        preview: '',
        safetyScore: 0,
        warnings: [],
        errors: [error.message || 'Refactoring failed']
      });
    } finally {
      setLoading(false);
    }
  };

  const applyRefactoring = async () => {
    if (!result || !result.success) return;

    try {
      await window.agentAPI.applyRefactoring(result.changes);
      alert('Refactoring applied successfully!');
      setShowPreview(false);
      setResult(null);
    } catch (error: any) {
      alert(`Failed to apply refactoring: ${error.message}`);
    }
  };

  return (
    <div className="refactoring-panel">
      <div className="refactoring-header">
        <h3>AI-Powered Refactoring</h3>
        <button onClick={() => setShowPreview(false)}>Close</button>
      </div>

      {!showPreview ? (
        <div className="refactoring-form">
          <div className="form-group">
            <label>Refactoring Type:</label>
            <select
              value={refactoringType}
              onChange={(e) => setRefactoringType(e.target.value as RefactoringType)}
            >
              <option value="extract-function">Extract Function</option>
              <option value="extract-method">Extract Method</option>
              <option value="rename-symbol">Rename Symbol</option>
              <option value="move-code">Move Code</option>
              <option value="convert-async">Convert to Async/Await</option>
              <option value="simplify-expression">Simplify Expression</option>
              <option value="remove-dead-code">Remove Dead Code</option>
              <option value="inline-variable">Inline Variable</option>
              <option value="extract-variable">Extract Variable</option>
            </select>
          </div>

          {(refactoringType === 'extract-function' ||
            refactoringType === 'extract-method' ||
            refactoringType === 'rename-symbol' ||
            refactoringType === 'move-code') && (
            <div className="form-group">
              <label>
                {refactoringType === 'rename-symbol' ? 'New Name:' : 'Target:'}
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={
                  refactoringType === 'rename-symbol'
                    ? 'New symbol name'
                    : refactoringType === 'move-code'
                    ? 'Target file path'
                    : 'Function/method name'
                }
              />
            </div>
          )}

          {selection && (
            <div className="selection-info">
              <p>
                Selected: Lines {selection.startLine}-{selection.endLine}
              </p>
            </div>
          )}

          <button
            className="refactor-button"
            onClick={handleRefactor}
            disabled={loading || !selection}
          >
            {loading ? 'Refactoring...' : 'Refactor'}
          </button>
        </div>
      ) : result ? (
        <div className="refactoring-preview">
          <div className="preview-header">
            <h4>Refactoring Preview</h4>
            <div className="safety-score">
              Safety Score: {(result.safetyScore * 100).toFixed(0)}%
            </div>
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="errors">
              <h5>Errors:</h5>
              <ul>
                {result.errors.map((error: string, i: number) => (
                  <li key={i} className="error">{error}</li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="warnings">
              <h5>Warnings:</h5>
              <ul>
                {result.warnings.map((warning, i) => (
                  <li key={i} className="warning">{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.success && (
            <>
              <div className="preview-diff">
                <pre>{result.preview}</pre>
              </div>

              <div className="preview-actions">
                <button onClick={applyRefactoring} className="apply-button">
                  Apply Refactoring
                </button>
                <button onClick={() => setShowPreview(false)} className="cancel-button">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default RefactoringPanel;

