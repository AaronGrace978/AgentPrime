import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import { CompletionService } from '../services/CompletionService';
import '../styles/ghost-text.css';

interface EditorSettings {
  fontSize?: number;
  tabSize?: number;
  wordWrap?: 'on' | 'off' | 'wordWrapColumn';
  minimap?: boolean;
  lineNumbers?: 'on' | 'off' | 'relative';
}

interface MonacoEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onRun?: () => void;
  theme?: string;
  readOnly?: boolean;
  filePath?: string;
  workspacePath?: string;
  editorSettings?: EditorSettings;
  inlineCompletions?: boolean;
  issues?: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
    ruleId: string;
  }>;
}

export interface MonacoEditorRef {
  getSelectedText: () => string | undefined;
  getCursorPosition: () => { lineNumber: number; column: number } | undefined;
}


const MonacoEditor = forwardRef<MonacoEditorRef, MonacoEditorProps>(({
  value,
  language,
  onChange,
  onSave,
  onRun,
  theme = 'vs-dark',
  readOnly = false,
  filePath,
  workspacePath,
  editorSettings = {},
  inlineCompletions = true,
  issues = []
}, ref) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionServiceRef = useRef<CompletionService | null>(null);

  useImperativeHandle(ref, () => ({
    getSelectedText: () => {
      if (!editorRef.current) return undefined;
      const selection = editorRef.current.getSelection();
      if (!selection || selection.isEmpty()) return undefined;
      const model = editorRef.current.getModel();
      if (!model) return undefined;
      return model.getValueInRange(selection);
    },
    getCursorPosition: () => {
      if (!editorRef.current) return undefined;
      const position = editorRef.current.getPosition();
      if (!position) return undefined;
      return { lineNumber: position.lineNumber, column: position.column };
    }
  }));

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Handle keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    if (onRun) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR, () => {
        onRun();
      });
    }

    // Ctrl+K — Inline AI Edit
    // addCommand overrides Monaco's built-in Ctrl+K chord prefix (Ctrl+K,Ctrl+C etc.)
    const triggerInlineEdit = () => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (!selection || !model) return;

      const selectedText = selection.isEmpty()
        ? model.getLineContent(selection.startLineNumber)
        : model.getValueInRange(selection);

      const startLine = selection.startLineNumber;
      const endLine = selection.isEmpty() ? selection.startLineNumber : selection.endLineNumber;

      window.dispatchEvent(new CustomEvent('agentprime:inlineEdit', {
        detail: { selectedText, startLine, endLine, filePath, language }
      }));
    };

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, triggerInlineEdit);

    editor.addAction({
      id: 'agentprime.inlineEdit',
      label: 'AI: Edit Selection Inline',
      contextMenuGroupId: 'ai',
      contextMenuOrder: 0,
      run: triggerInlineEdit
    });

    // Setup ghost text completions using CompletionService
    completionServiceRef.current = new CompletionService(editor);

    // Pre-warm completion models when editor gets focus for faster first completion
    editor.onDidFocusEditorText(() => {
      window.agentAPI.prewarmCompletions().catch(err =>
        console.debug('[MonacoEditor] Model pre-warm failed:', err.message)
      );
    });

    // Setup symbol navigation (Go to Definition, Find References)
    setupSymbolNavigation(editor, monaco);

    // Update markers for issues
    updateMarkers();
  };

  // Setup symbol navigation features
  const setupSymbolNavigation = useCallback((editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    // Add context menu items
    editor.addAction({
      id: 'agentprime.goToDefinition',
      label: 'Go to Definition',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: async () => {
        const position = editor.getPosition();
        const model = editor.getModel();
        if (!position || !model) return;

        // Get word at position
        const word = model.getWordAtPosition(position);
        if (!word) return;

        try {
          // Search for definition in workspace
          const result = await window.agentAPI.findDefinition({
            word: word.word,
            filePath: filePath,
            workspacePath: workspacePath,
            language: language
          });

          if (result.success && result.definitions && result.definitions.length > 0) {
            const def = result.definitions[0];
            // If same file, just go to line
            if (def.filePath === filePath) {
              editor.setPosition({ lineNumber: def.line, column: def.column || 1 });
              editor.revealLineInCenter(def.line);
            } else {
              // Emit event to open file at location
              window.dispatchEvent(new CustomEvent('agentprime:openFileAtLine', {
                detail: { filePath: def.filePath, line: def.line, column: def.column }
              }));
            }
          }
        } catch (error) {
          console.warn('Go to definition failed:', error);
        }
      }
    });

    editor.addAction({
      id: 'agentprime.findReferences',
      label: 'Find All References',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      run: async () => {
        const position = editor.getPosition();
        const model = editor.getModel();
        if (!position || !model) return;

        const word = model.getWordAtPosition(position);
        if (!word) return;

        try {
          const result = await window.agentAPI.findReferences({
            word: word.word,
            filePath: filePath,
            workspacePath: workspacePath,
            language: language
          });

          if (result.success && result.references && result.references.length > 0) {
            // Emit event to show references panel
            window.dispatchEvent(new CustomEvent('agentprime:showReferences', {
              detail: { references: result.references, word: word.word }
            }));
          }
        } catch (error) {
          console.warn('Find references failed:', error);
        }
      }
    });

    editor.addAction({
      id: 'agentprime.peekDefinition',
      label: 'Peek Definition',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 3,
      run: async () => {
        // Trigger built-in peek definition
        editor.trigger('keyboard', 'editor.action.peekDefinition', null);
      }
    });

    // Add breadcrumb navigation support
    editor.addAction({
      id: 'agentprime.goToSymbol',
      label: 'Go to Symbol in File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO],
      run: () => {
        // Trigger Monaco's built-in symbol navigation
        editor.trigger('keyboard', 'editor.action.quickOutline', null);
      }
    });

    // Add workspace symbol search
    editor.addAction({
      id: 'agentprime.goToSymbolWorkspace',
      label: 'Go to Symbol in Workspace',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT],
      run: async () => {
        // Emit event to open command palette with @ prefix
        window.dispatchEvent(new CustomEvent('agentprime:openSymbolSearch', {
          detail: { workspacePath }
        }));
      }
    });
  }, [filePath, workspacePath, language]);


  const updateMarkers = () => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        // Clear existing markers
        monacoRef.current.editor.setModelMarkers(model, 'eslint', []);

        // Add new markers
        const markers = issues.map((issue: any) => ({
          startLineNumber: issue.line,
          startColumn: issue.column,
          endLineNumber: issue.line,
          endColumn: issue.column + 1,
          message: issue.message,
          severity: issue.severity === 'error' 
            ? monacoRef.current!.MarkerSeverity.Error 
            : monacoRef.current!.MarkerSeverity.Warning,
          source: 'ESLint',
          code: issue.ruleId
        }));

        monacoRef.current.editor.setModelMarkers(model, 'eslint', markers);
      }
    }
  };

  // Update markers when issues change
  useEffect(() => {
    updateMarkers();
  }, [issues]);

  // Toggle completion service when the setting changes at runtime
  useEffect(() => {
    if (completionServiceRef.current) {
      completionServiceRef.current.setEnabled(inlineCompletions);
    }
  }, [inlineCompletions]);

  // Cleanup completion service on unmount
  useEffect(() => {
    return () => {
      if (completionServiceRef.current) {
        completionServiceRef.current.destroy();
        completionServiceRef.current = null;
      }
    };
  }, []);

  const handleChange = (newValue: string | undefined) => {
    onChange(newValue || '');
  };

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      theme={theme}
      onChange={handleChange}
      onMount={handleEditorDidMount}
      options={{
        fontSize: editorSettings.fontSize ?? 14,
        fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
        minimap: { enabled: editorSettings.minimap ?? true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: editorSettings.tabSize ?? 2,
        insertSpaces: true,
        wordWrap: editorSettings.wordWrap ?? 'on',
        readOnly,
        contextmenu: true,
        mouseWheelZoom: true,
        smoothScrolling: true,
        cursorBlinking: 'blink',
        renderWhitespace: 'selection',
        folding: true,
        lineNumbers: editorSettings.lineNumbers ?? 'on',
        glyphMargin: true,
        foldingHighlight: true,
        showFoldingControls: 'mouseover',
      }}
      loading={
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100%',
          color: '#8b949e'
        }}>
          Loading editor...
        </div>
      }
    />
  );
});

MonacoEditor.displayName = 'MonacoEditor';

export default MonacoEditor;