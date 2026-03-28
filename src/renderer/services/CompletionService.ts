/**
 * AgentPrime - Completion Service
 * Handles AI completion requests and context building
 * Optimized for <100ms latency with streaming support
 */

import * as monaco from 'monaco-editor';
import { editor, Range } from 'monaco-editor';
import { GhostTextManager } from '../components/GhostTextManager';
import type { CompletionRequest, CompletionResponse, CompletionAnalytics } from '../../types/completions';

export class CompletionService {
  private ghostManager: GhostTextManager;
  private completionTimeout: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  private streamingTimeout: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 25; // ms - reduced for faster feel
  private readonly IDLE_COMPLETION_DELAY = 150; // ms - for idle typing detection

  // Recent edits tracking for context
  private recentEdits: string[] = [];
  private readonly MAX_RECENT_EDITS = 3;
  
  // Request tracking for cancellation
  private lastRequestPosition: { line: number; col: number } | null = null;
  private pendingRequest: boolean = false;

  // Enable/disable toggle (respects user settings)
  private enabled: boolean = true;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.ghostManager = new GhostTextManager(editor);
    this.setupEditorListeners(editor);
    this.setupIPCStreaming();
    this.setupCompletionCleanup();
  }

  /**
   * Setup IPC streaming for partial completion results
   * This enables real-time ghost text updates as the AI generates tokens
   */
  private setupIPCStreaming(): void {
    let streamingBuffer = '';

    // Listen for partial completion updates from backend
    window.agentAPI.onCompletionPartial((data: any) => {
      // Accumulate streaming data
      streamingBuffer += data.completion;

      // Debounce updates to avoid excessive re-renders
      if (this.streamingTimeout) clearTimeout(this.streamingTimeout);

      this.streamingTimeout = setTimeout(() => {
        const position = this.ghostManager.getEditor().getPosition();
        if (position && this.pendingRequest) {
          // Show as streaming/partial completion with accumulated buffer
          this.ghostManager.showCompletion(streamingBuffer, position, true);
        }
        streamingBuffer = ''; // Clear buffer after update
        this.streamingTimeout = null; // Reset timeout reference
      }, 16); // ~60fps update rate for smooth streaming
    });
  }

  /**
   * Setup periodic cleanup of stale completions
   */
  private setupCompletionCleanup(): void {
    // Clean up expired completions every 30 seconds
    setInterval(() => {
      if (this.ghostManager.isExpired()) {
        this.ghostManager.clearCompletion();
      }
    }, 30000);
  }

  /**
   * Setup editor event listeners
   */
  private setupEditorListeners(editor: editor.IStandaloneCodeEditor): void {
    // On content change - trigger completion
    editor.onDidChangeModelContent((e) => {
      this.handleContentChange(e, editor);
    });

    // On cursor position change - validate completion relevance
    editor.onDidChangeCursorPosition(() => {
      // Only clear if cursor moved significantly away from completion position
      const currentPos = editor.getPosition();
      if (currentPos && !this.isTypingNearPosition(currentPos)) {
        this.ghostManager.clearCompletion();
      }
    });

    // Tab key - accept completion with improved priority handling
    editor.addCommand(monaco.KeyCode.Tab, () => {
      if (this.ghostManager.hasCompletion()) {
        this.ghostManager.acceptCompletion();
        return; // Prevent default tab behavior
      }
      return false; // Allow default indentation behavior
    });

    // Right Arrow key - accept completion (Cursor-style)
    editor.addCommand(monaco.KeyCode.RightArrow, () => {
      if (this.ghostManager.hasCompletion()) {
        const position = editor.getPosition();
        const model = editor.getModel();
        if (position && model) {
          const lineContent = model.getLineContent(position.lineNumber);
          // Only accept if cursor is at end of line or ghost text starts immediately
          if (position.column >= lineContent.length) {
            this.ghostManager.acceptCompletion();
            return; // Handled
          }
        }
      }
      return false; // Allow default cursor movement
    });

    // Escape key - clear completion
    editor.addCommand(monaco.KeyCode.Escape, () => {
      this.ghostManager.clearCompletion();
    });

    // Track edits for context
    editor.onDidChangeModelContent((e) => {
      this.trackEdit(e, editor);
    });
  }

  /**
   * Handle editor content changes
   * Uses smart detection to determine when to trigger completions
   */
  private handleContentChange(
    event: editor.IModelContentChangedEvent,
    editorInstance: editor.IStandaloneCodeEditor
  ): void {
    // Detect undo/redo operations and clear completions
    const isUndoRedo = event.isUndoing || event.isRedoing;
    if (isUndoRedo) {
      this.ghostManager.clearCompletion();
      this.pendingRequest = false;
      return;
    }

    // Validate completion is still relevant after cursor moves
    const currentPos = editorInstance.getPosition();
    if (this.lastRequestPosition && currentPos) {
      const posChanged = currentPos.lineNumber !== this.lastRequestPosition.line ||
                        currentPos.column !== this.lastRequestPosition.col;

      if (posChanged && !this.isTypingNearPosition(currentPos)) {
        this.ghostManager.clearCompletion();
      }
    }

    // Clear existing completion on any significant change
    this.ghostManager.clearCompletion();
    this.pendingRequest = false;

    // Determine if this is a user typing event (vs undo/redo/paste)
    const isUserTyping = event.changes.some(change => {
      const text = change.text;
      // User typing: single char or small addition
      return text.length > 0 && 
             text.length <= 3 && 
             !text.includes('\n\n') &&
             change.rangeLength <= 1; // Not replacing multiple chars
    });

    // Skip completions for certain scenarios
    if (!isUserTyping) {
      return;
    }

    // Check for trigger characters that should NOT trigger completion
    const lastChange = event.changes[event.changes.length - 1];
    const lastChar = lastChange?.text.slice(-1);
    const skipChars = [' ', '\n', '\t', '{', '}', '(', ')', '[', ']', ';', ',', '"', "'", '`'];
    
    // Skip on certain characters (these usually need context to settle)
    if (lastChar && skipChars.includes(lastChar)) {
      // But still trigger after a slight delay for statement completions
      if (this.completionTimeout) {
        clearTimeout(this.completionTimeout);
      }
      this.completionTimeout = setTimeout(() => {
        this.requestCompletion(editorInstance);
      }, this.IDLE_COMPLETION_DELAY);
      return;
    }

    // Cancel any pending request
    if (this.completionTimeout) {
      clearTimeout(this.completionTimeout);
    }

    // Fast debounce for regular typing
    this.completionTimeout = setTimeout(() => {
      this.requestCompletion(editorInstance);
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Check if user is typing near the completion position
   */
  private isTypingNearPosition(currentPos: monaco.IPosition): boolean {
    if (!this.lastRequestPosition) return false;

    const lineDiff = Math.abs(currentPos.lineNumber - this.lastRequestPosition.line);
    const colDiff = Math.abs(currentPos.column - this.lastRequestPosition.col);

    // Consider "near" if within 2 lines and reasonable column distance
    return lineDiff <= 2 && colDiff <= 10;
  }

  /**
   * Track recent edits for better context
   */
  private trackEdit(event: editor.IModelContentChangedEvent, editor: editor.IStandaloneCodeEditor): void {
    const model = editor.getModel();
    if (!model) return;

    // Get the changed text
    const changedText = event.changes
      .map(change => change.text)
      .filter(text => text.trim().length > 0)
      .join('')
      .trim();

    if (changedText) {
      this.recentEdits.unshift(changedText);
      this.recentEdits = this.recentEdits.slice(0, this.MAX_RECENT_EDITS);
    }
  }

  /**
   * Request completion from backend
   * Optimized for fast response with streaming support
   */
  private async requestCompletion(editorInstance: editor.IStandaloneCodeEditor): Promise<void> {
    if (!editorInstance || !this.enabled) return;

    const position = editorInstance.getPosition();
    if (!position) return;

    const model = editorInstance.getModel();
    if (!model) return;

    // Track position for stale request detection
    this.lastRequestPosition = { line: position.lineNumber, col: position.column };

    // Cancel any previous request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    this.pendingRequest = true;

    // Build minimal context for speed (expanded context built by backend)
    const beforeCursor = this.getTextBeforeCursor(model, position);
    
    // Skip if before cursor is too short or just whitespace
    const trimmedBefore = beforeCursor.trim();
    if (trimmedBefore.length < 3) {
      this.pendingRequest = false;
      return;
    }

    const filePath = await this.getCurrentFilePath();
    const context = await this.buildContext(model, position);
    const request: CompletionRequest = {
      beforeCursor: beforeCursor,
      afterCursor: this.getTextAfterCursor(model, position),
      lineNumber: position.lineNumber,
      column: position.column,
      language: model.getLanguageId(),
      filePath,
      context
    };

    try {
      const startTime = performance.now();
      const response = await window.agentAPI.requestCompletion(request);
      const latency = performance.now() - startTime;

      // Check if request was cancelled or position changed
      if (this.abortController?.signal.aborted) {
        this.pendingRequest = false;
        return;
      }

      // Verify cursor hasn't moved (stale check)
      const currentPos = editorInstance.getPosition();
      if (currentPos && 
          (currentPos.lineNumber !== position.lineNumber || 
           currentPos.column !== position.column)) {
        this.pendingRequest = false;
        return;
      }

      if (response.completion && response.confidence > 0.25) {
        // Show final completion (not streaming)
        this.ghostManager.showCompletion(response.completion, position, false);

        // Log latency for performance monitoring
        if (latency > 100) {
          console.debug(`[CompletionService] Slow completion: ${latency.toFixed(0)}ms`);
        }

        // Track completion request for analytics
        this.trackCompletionRequest(response, request);
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.warn('[CompletionService] Completion request failed:', error);
      }
    } finally {
      this.pendingRequest = false;
    }
  }

  /**
   * Get text before cursor for context
   */
  private getTextBeforeCursor(model: monaco.editor.ITextModel, position: monaco.IPosition): string {
    const range = new Range(1, 1, position.lineNumber, position.column);
    return model.getValueInRange(range);
  }

  /**
   * Get text after cursor for context
   */
  private getTextAfterCursor(model: monaco.editor.ITextModel, position: monaco.IPosition): string {
    const lineCount = model.getLineCount();
    const lastLineContent = model.getLineContent(lineCount);
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      lineCount,
      lastLineContent.length + 1
    );
    return model.getValueInRange(range);
  }

  /**
   * Build additional context for better completions.
   * Async because semantic context requires an IPC round-trip.
   */
  private async buildContext(model: monaco.editor.ITextModel, position: monaco.IPosition) {
    const semanticContext = await this.getSemanticContext(model, position);
    return {
      recentEdits: this.recentEdits,
      visibleRange: this.getVisibleRange(),
      imports: this.extractImports(model),
      semanticContext
    };
  }

  /**
   * Get semantic context from codebase embeddings
   */
  private async getSemanticContext(model: monaco.editor.ITextModel, position: monaco.IPosition): Promise<string> {
    try {
      const beforeCursor = this.getTextBeforeCursor(model, position);
      const contextQuery = beforeCursor.substring(Math.max(0, beforeCursor.length - 100));

      // Request semantic context from backend
      const filePath = await this.getCurrentFilePath();
      const semanticContext = await window.agentAPI.getSemanticContext({
        query: contextQuery,
        filePath,
        maxFiles: 3,
        contextWindow: 2000
      });

      return semanticContext || '';
    } catch (error) {
      console.debug('[CompletionService] Semantic context unavailable:', error);
      return '';
    }
  }

  /**
   * Extract import statements for context
   */
  private extractImports(model: editor.ITextModel): string[] {
    const content = model.getValue();
    const importRegex = /^(?:import|from|using)\s+.+$/gm;
    const matches = content.match(importRegex) || [];
    return matches.slice(-10); // Last 10 imports
  }

  /**
   * Get visible range for context prioritization
   */
  private getVisibleRange(): monaco.IRange {
    const editorInstance = this.ghostManager.getEditor();
    return editorInstance.getVisibleRanges()[0] || new Range(1, 1, 1, 1);
  }

  /**
   * Get current file path
   */
  private async getCurrentFilePath(): Promise<string> {
    // Implementation depends on your file management system
    try {
      const filePath = await window.agentAPI.getCurrentFilePath();
      return filePath || '';
    } catch (error) {
      console.warn('[CompletionService] Failed to get current file path:', error);
      return '';
    }
  }

  /**
   * Track completion request for analytics
   */
  private trackCompletionRequest(response: CompletionResponse, request: CompletionRequest): void {
    const analytics: CompletionAnalytics = {
      duration: 0, // Would be calculated by backend
      length: response.completion.length,
      language: request.language,
      model: response.model,
      latency: response.latency,
      confidence: response.confidence,
      completionLength: response.completion.length
    };

    window.agentAPI.trackEvent('completion_requested', analytics);
  }

  /**
   * Manually request completion (for external triggers)
   */
  async requestCompletionAt(position: monaco.IPosition): Promise<void> {
    const editor = this.ghostManager.getEditor();
    await this.requestCompletion(editor);
  }

  /**
   * Check if completion is currently active
   */
  hasActiveCompletion(): boolean {
    return this.ghostManager.hasCompletion();
  }

  /**
   * Accept current completion
   */
  acceptCompletion(): boolean {
    return this.ghostManager.acceptCompletion();
  }

  /**
   * Clear current completion
   */
  clearCompletion(): void {
    this.ghostManager.clearCompletion();
  }

  /**
   * Get current completion text
   */
  getCurrentCompletion(): string | null {
    return this.ghostManager.getCurrentCompletion();
  }

  /**
   * Enable or disable inline completions at runtime.
   * When disabled, any active ghost text is cleared and new requests are suppressed.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearCompletion();
      if (this.completionTimeout) {
        clearTimeout(this.completionTimeout);
        this.completionTimeout = null;
      }
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      this.pendingRequest = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Destroy the service and clean up
   */
  destroy(): void {
    // Clear all timeouts
    if (this.completionTimeout) {
      clearTimeout(this.completionTimeout);
      this.completionTimeout = null;
    }
    if (this.streamingTimeout) {
      clearTimeout(this.streamingTimeout);
      this.streamingTimeout = null;
    }

    // Abort any pending requests
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Clear completion state
    this.ghostManager.clearCompletion();
    this.pendingRequest = false;
    this.lastRequestPosition = null;
    this.recentEdits = [];
  }
}
