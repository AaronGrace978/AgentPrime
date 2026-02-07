/**
 * AgentPrime - Ghost Text Manager
 * Manages ghost text completions in Monaco Editor (Cursor-style)
 */

import * as monaco from 'monaco-editor';
import { editor, IPosition } from 'monaco-editor';
import type { GhostCompletion } from '../../types/completions';

export class GhostTextManager {
  private currentCompletion: GhostCompletion | null = null;
  private decorationIds: string[] = [];
  private readonly MAX_COMPLETION_LENGTH = 500;
  private readonly COMPLETION_TIMEOUT = 5000; // 5s visibility timeout
  private isStreaming: boolean = false;
  private hintDecorationIds: string[] = []; // For visual hint decorations

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {}

  /**
   * Show ghost text completion at cursor position
   * Supports both single-line and multi-line completions
   */
  showCompletion(completion: string, position: IPosition, isPartial: boolean = false): void {
    // Don't clear if we're updating a streaming completion
    if (!isPartial) {
      this.clearCompletion();
    }

    // Validate completion
    if (!completion || completion.trim().length === 0) {
      return;
    }

    // Truncate if too long
    const truncatedCompletion = completion.length > this.MAX_COMPLETION_LENGTH 
      ? completion.substring(0, this.MAX_COMPLETION_LENGTH) + '...'
      : completion;

    const model = this.editor.getModel();
    if (!model) return;

    // Check if completion is multiline
    const isMultiline = truncatedCompletion.includes('\n');
    const lines = truncatedCompletion.split('\n');

    // For both single-line and multi-line: show full completion
    // Monaco's 'after' decoration supports newlines properly
    const displayText = truncatedCompletion;

    // Create decoration range at cursor position
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    );

    // Build inline class (add streaming and multiline classes if needed)
    let inlineClass = 'ghost-completion-text';
    if (isPartial) inlineClass += ' streaming';
    if (isMultiline) inlineClass += ' multiline';

    // Create ghost text decoration
    const decoration: monaco.editor.IModelDeltaDecoration = {
      range,
      options: {
        after: {
          content: displayText,
          inlineClassName: inlineClass,
          inlineClassNameAffectsLetterSpacing: true
        },
        stickiness: editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    };

    // Use requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
      // Update or create decorations
      this.decorationIds = this.editor.deltaDecorations(this.decorationIds, [decoration]);
      this.isStreaming = isPartial;

      // Show visual hint for completion acceptance
      this.showHint(position);
    });

    this.currentCompletion = {
      id: crypto.randomUUID(),
      text: truncatedCompletion,
      range,
      decorationIds: this.decorationIds,
      timestamp: Date.now()
    };
  }

  /**
   * Accept the current ghost completion
   */
  acceptCompletion(): boolean {
    if (!this.currentCompletion) return false;

    try {
      // Insert the completion text
      const editOperation = {
        range: this.currentCompletion.range,
        text: this.currentCompletion.text,
        forceMoveMarkers: true
      };

      this.editor.executeEdits('accept-ghost-completion', [editOperation]);

      // Clear the completion
      this.clearCompletion();

      // Track acceptance for analytics
      this.trackAcceptance();

      return true;
    } catch (error) {
      console.error('Failed to accept ghost completion:', error);
      return false;
    }
  }

  /**
   * Clear current ghost completion
   */
  clearCompletion(): void {
    if (this.decorationIds.length > 0) {
      this.editor.deltaDecorations(this.decorationIds, []);
      this.decorationIds = [];
    }
    this.clearHint();
    this.currentCompletion = null;
  }

  /**
   * Show visual hint for completion acceptance
   */
  private showHint(position: IPosition): void {
    const model = this.editor.getModel();
    if (!model) return;

    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    );

    const hintDecoration: monaco.editor.IModelDeltaDecoration = {
      range,
      options: {
        after: {
          content: ' Tab',
          inlineClassName: 'ghost-completion-hint',
          inlineClassNameAffectsLetterSpacing: true
        },
        stickiness: editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    };

    this.hintDecorationIds = this.editor.deltaDecorations(this.hintDecorationIds, [hintDecoration]);
  }

  /**
   * Clear visual hint
   */
  private clearHint(): void {
    if (this.hintDecorationIds.length > 0) {
      this.editor.deltaDecorations(this.hintDecorationIds, []);
      this.hintDecorationIds = [];
    }
  }

  /**
   * Check if ghost completion is currently visible
   */
  hasCompletion(): boolean {
    return this.currentCompletion !== null;
  }

  /**
   * Get current completion text
   */
  getCurrentCompletion(): string | null {
    return this.currentCompletion?.text || null;
  }

  /**
   * Track completion acceptance for analytics
   */
  private trackAcceptance(): void {
    if (!this.currentCompletion) return;

    const duration = Date.now() - this.currentCompletion.timestamp;
    const length = this.currentCompletion.text.length;

    // Send analytics event
    window.agentAPI.trackEvent('ghost_completion_accepted', {
      duration,
      length,
      language: this.getCurrentLanguage()
    });
  }

  /**
   * Get current programming language
   */
  private getCurrentLanguage(): string {
    const model = this.editor.getModel();
    return model?.getLanguageId() || 'unknown';
  }

  /**
   * Get the editor instance
   */
  getEditor(): monaco.editor.IStandaloneCodeEditor {
    return this.editor;
  }

  /**
   * Check if completion has timed out
   */
  isExpired(): boolean {
    if (!this.currentCompletion) return true;
    return Date.now() - this.currentCompletion.timestamp > this.COMPLETION_TIMEOUT;
  }
}
