# Implementing Cursor-Like Features - Practical Guide

## 🎯 Priority Features to Implement

### 1. Ghost Text Inline Completions (HIGHEST IMPACT)

**Current State:** Using Monaco's completion API (dropdown)
**Goal:** Gray ghost text that appears inline as you type

**Implementation Steps:**

#### Step 1: Create Ghost Text Decorations

```typescript
// src/renderer/components/MonacoEditor.tsx

interface GhostCompletion {
  text: string;
  range: monaco.Range;
  decorationId: string | null;
}

let currentGhostCompletion: GhostCompletion | null = null;

function showGhostCompletion(
  editor: editor.IStandaloneCodeEditor,
  monaco: Monaco,
  completion: string,
  position: monaco.Position
) {
  // Clear existing completion
  if (currentGhostCompletion?.decorationId) {
    editor.deltaDecorations([currentGhostCompletion.decorationId], []);
  }

  // Create decoration for ghost text
  const decoration = {
    range: new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    ),
    options: {
      after: {
        content: completion,
        inlineClassName: 'ghost-completion-text',
        inlineClassNameAffectsLetterSpacing: true
      },
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }
  };

  const decorationIds = editor.deltaDecorations([], [decoration]);
  
  currentGhostCompletion = {
    text: completion,
    range: decoration.range,
    decorationId: decorationIds[0]
  };
}

function clearGhostCompletion(editor: editor.IStandaloneCodeEditor) {
  if (currentGhostCompletion?.decorationId) {
    editor.deltaDecorations([currentGhostCompletion.decorationId], []);
    currentGhostCompletion = null;
  }
}
```

#### Step 2: Add CSS for Ghost Text

```css
/* src/renderer/styles.css */

.ghost-completion-text {
  color: #6e7681 !important;
  opacity: 0.6;
  font-style: italic;
}
```

#### Step 3: Integrate with Completion Handler

```typescript
// In handleEditorDidMount

let completionTimeout: NodeJS.Timeout | null = null;

editor.onDidChangeModelContent((e) => {
  // Clear existing completion
  clearGhostCompletion(editor);

  // Only trigger on typing (not deletions)
  const hasInsertions = e.changes.some(c => c.text.length > 0);
  const hasDeletions = e.changes.some(c => c.rangeLength > 0);
  
  if (!hasInsertions || hasDeletions) return;

  // Debounce completion requests
  if (completionTimeout) clearTimeout(completionTimeout);
  
  completionTimeout = setTimeout(async () => {
    const position = editor.getPosition();
    if (!position) return;

    const model = editor.getModel();
    if (!model) return;

    // Get context
    const beforeCursor = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column
    });

    const context = {
      beforeCursor,
      lineNumber: position.lineNumber,
      column: position.column,
      language,
      filePath: filePath || ''
    };

    try {
      const result = await window.agentAPI.inlineCompletion(context);
      if (result.completion && result.completion.trim()) {
        showGhostCompletion(editor, monaco, result.completion.trim(), position);
      }
    } catch (error) {
      // Silently fail
    }
  }, 100); // Reduced from 300ms
});

// Accept completion on Tab
editor.addCommand(monaco.KeyCode.Tab, () => {
  if (currentGhostCompletion) {
    const position = editor.getPosition();
    if (position) {
      editor.executeEdits('accept-completion', [{
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        text: currentGhostCompletion.text,
        forceMoveMarkers: true
      }]);
      clearGhostCompletion(editor);
    }
    return; // Prevent default Tab behavior
  }
  return false; // Allow default Tab behavior
});
```

---

### 2. Automatic File Discovery (HIGH IMPACT)

**Current State:** Requires @mentions
**Goal:** Automatically find relevant files based on query

**Implementation Steps:**

#### Step 1: Add Semantic Search

```typescript
// src/main/core/semantic-search.ts

import { CodebaseIndexer } from '../legacy/codebase-indexer';

export class SemanticSearch {
  private indexer: CodebaseIndexer;
  private embeddings: Map<string, number[]> = new Map();

  constructor(indexer: CodebaseIndexer) {
    this.indexer = indexer;
  }

  /**
   * Find relevant files based on query (simple keyword matching for now)
   * TODO: Add vector embeddings for true semantic search
   */
  async findRelevantFiles(
    query: string,
    currentFile: string | null,
    limit: number = 5
  ): Promise<Array<{ path: string; score: number; reason: string }>> {
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    const results: Array<{ path: string; score: number; reason: string }> = [];
    
    // Search file names
    const files = this.indexer.searchFiles(query, limit * 2);
    
    for (const file of files) {
      const fileName = file.path.toLowerCase();
      let score = file.score;
      let reason = 'Filename match';
      
      // Boost score if keywords appear in filename
      const keywordMatches = keywords.filter(kw => fileName.includes(kw)).length;
      score += keywordMatches * 0.3;
      
      // Boost score if in same directory as current file
      if (currentFile) {
        const currentDir = currentFile.split('/').slice(0, -1).join('/');
        const fileDir = file.path.split('/').slice(0, -1).join('/');
        if (currentDir === fileDir) {
          score += 0.2;
          reason = 'Same directory';
        }
      }
      
      results.push({ path: file.path, score, reason });
    }
    
    // Search symbols
    const symbols = this.indexer.searchSymbols(query, limit);
    for (const symbol of symbols) {
      const existing = results.find(r => r.path === symbol.file);
      if (existing) {
        existing.score += 0.1;
        existing.reason = `${existing.reason} + symbol match`;
      } else {
        results.push({
          path: symbol.file,
          score: symbol.score * 0.5,
          reason: 'Symbol match'
        });
      }
    }
    
    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
```

#### Step 2: Integrate with Context Builder

```typescript
// src/main/core/context-builder.ts

import { SemanticSearch } from './semantic-search';

export class IntelligentContextBuilder {
  private semanticSearch: SemanticSearch;

  // ... existing code ...

  async buildContext(query: string, currentContext: Partial<ChatContext>): Promise<string> {
    // ... existing analysis ...

    // NEW: Automatically find relevant files
    if (this.codebaseIndexer) {
      const relevantFiles = await this.semanticSearch.findRelevantFiles(
        query,
        currentContext.file_path || null,
        5 // Top 5 most relevant files
      );

      // Add to context
      for (const file of relevantFiles) {
        const content = await this.readFileContent(file.path);
        if (content) {
          data.relevantFiles.push({
            path: file.path,
            content: content.substring(0, 3000),
            reason: file.reason
          });
        }
      }
    }

    // ... rest of existing code ...
  }
}
```

---

### 3. Faster Completions (MEDIUM IMPACT)

**Current State:** 300ms debounce, API calls
**Goal:** <100ms latency, local models

**Implementation Steps:**

#### Step 1: Pre-warm Model

```typescript
// src/main/ipc-handlers/completions.ts

let modelWarmed = false;

async function warmupCompletionModel() {
  if (modelWarmed) return;
  
  // Send a dummy completion request to warm up the model
  try {
    await aiRouter.generateCompletion({
      prompt: 'function test() {',
      maxTokens: 1,
      temperature: 0.1
    });
    modelWarmed = true;
    console.log('✅ Completion model warmed up');
  } catch (error) {
    console.warn('Failed to warm up model:', error);
  }
}

// Warm up when editor is focused
ipcMain.handle('editor-focused', async () => {
  warmupCompletionModel();
  return { success: true };
});
```

#### Step 2: Use Local Models for Completions

```typescript
// src/main/ipc-handlers/completions.ts

ipcMain.handle('inline-completion', async (event, context) => {
  // Always use local Ollama for completions (faster)
  const completionModel = 'qwen3-coder:480b-cloud'; // Fast local model
  
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: completionModel,
      prompt: buildCompletionPrompt(context),
      stream: false,
      options: {
        temperature: 0.1, // Low temperature for deterministic completions
        num_predict: 50,  // Short completions only
        stop: ['\n\n', '\n```', '```']
      }
    }, {
      headers: OLLAMA_API_KEY ? {
        'Authorization': `Bearer ${OLLAMA_API_KEY}`
      } : {},
      timeout: 2000 // 2 second timeout for completions
    });

    const completion = response.data?.response?.trim() || '';
    
    // Filter out bad completions
    if (completion.startsWith('```') || completion.length > 100) {
      return { completion: null };
    }

    return { completion };
  } catch (error) {
    return { completion: null };
  }
});
```

#### Step 3: Add Completion Caching

```typescript
// src/main/ipc-handlers/completions.ts

interface CachedCompletion {
  completion: string;
  timestamp: number;
}

const completionCache = new Map<string, CachedCompletion>();
const CACHE_TTL = 5000; // 5 seconds

function getCacheKey(context: any): string {
  // Create cache key from context
  const key = `${context.filePath}:${context.lineNumber}:${context.column}:${context.beforeCursor.slice(-100)}`;
  return Buffer.from(key).toString('base64');
}

ipcMain.handle('inline-completion', async (event, context) => {
  // Check cache first
  const cacheKey = getCacheKey(context);
  const cached = completionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { completion: cached.completion };
  }

  // ... existing completion logic ...

  // Cache the result
  if (completion) {
    completionCache.set(cacheKey, {
      completion,
      timestamp: Date.now()
    });
  }

  return { completion };
});
```

---

### 4. Better Context Selection (MEDIUM IMPACT)

**Current State:** Sends too much or too little context
**Goal:** Intelligently select most relevant context

**Implementation Steps:**

```typescript
// src/main/core/context-builder.ts

interface ContextPriority {
  file: string;
  priority: number;
  reason: string;
}

function prioritizeContext(
  query: string,
  currentFile: string | null,
  allFiles: string[]
): ContextPriority[] {
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  const priorities: ContextPriority[] = [];
  
  for (const file of allFiles) {
    let priority = 0;
    const reasons: string[] = [];
    
    // Current file always has highest priority
    if (file === currentFile) {
      priority = 100;
      reasons.push('current file');
    }
    
    // Check filename matches
    const fileName = file.toLowerCase();
    const keywordMatches = keywords.filter(kw => fileName.includes(kw)).length;
    if (keywordMatches > 0) {
      priority += keywordMatches * 20;
      reasons.push('filename match');
    }
    
    // Check directory matches
    if (currentFile) {
      const currentDir = currentFile.split('/').slice(0, -1).join('/');
      const fileDir = file.split('/').slice(0, -1).join('/');
      if (currentDir === fileDir) {
        priority += 10;
        reasons.push('same directory');
      }
    }
    
    // Check file type relevance
    const ext = file.split('.').pop()?.toLowerCase();
    if (queryLower.includes(ext || '')) {
      priority += 15;
      reasons.push('file type match');
    }
    
    priorities.push({
      file,
      priority,
      reason: reasons.join(', ') || 'low relevance'
    });
  }
  
  return priorities.sort((a, b) => b.priority - a.priority);
}
```

---

## 🎯 Quick Wins (Implement First)

1. **Ghost Text Rendering** - Biggest visual impact
2. **Reduce Debounce** - From 300ms to 100ms
3. **Completion Caching** - Reuse completions when possible
4. **Local Models for Completions** - Faster than API calls

## 📊 Expected Improvements

| Feature | Current | After Implementation | Impact |
|---------|---------|---------------------|--------|
| Completion Latency | 300-500ms | 100-200ms | ⭐⭐⭐⭐⭐ |
| Visual Feedback | Dropdown | Ghost Text | ⭐⭐⭐⭐⭐ |
| Context Quality | Manual @mentions | Auto-discovery | ⭐⭐⭐⭐ |
| User Experience | Good | Great | ⭐⭐⭐⭐⭐ |

---

## 🚀 Start Here

1. **Implement ghost text** (1-2 hours)
2. **Reduce debounce** (5 minutes)
3. **Add caching** (30 minutes)
4. **Test and iterate** (ongoing)

These changes will make AgentPrime feel **significantly more like Cursor** without requiring massive infrastructure changes.

