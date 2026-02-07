import React, { useState, useRef, useEffect } from 'react';

interface ComposerFile {
  path: string;
  content: string;
  language: string;
  existingContent?: string;
  isNew?: boolean;
  dependencies?: string[];
}

/**
 * Framework Knowledge - Injected into AI prompts for correct generation
 * Updated: January 2026
 */
const FRAMEWORK_KNOWLEDGE = {
  tauri: {
    keywords: ['tauri', 'rust desktop', 'native app'],
    prompt: `
## TAURI V2 REQUIREMENTS (CRITICAL - FOLLOW EXACTLY)

**Package.json Dependencies:**
\`\`\`json
"dependencies": {
  "@tauri-apps/api": "^2.0.0",
  "@tauri-apps/plugin-shell": "^2.0.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
},
"devDependencies": {
  "@tauri-apps/cli": "^2.0.0",
  "@types/react": "^18.3.8",
  "@types/react-dom": "^18.3.0",
  "@vitejs/plugin-react": "^4.3.1",
  "typescript": "^5.6.2",
  "vite": "^5.4.6"
}
\`\`\`

**tauri.conf.json (V2 FORMAT - NOT V1):**
\`\`\`json
{
  "$schema": "../node_modules/@tauri-apps/cli/schema.json",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico", "icons/icon.icns"],
    "identifier": "com.example.app",
    "targets": "all"
  },
  "identifier": "com.example.app",
  "productName": "AppName",
  "security": {
    "csp": "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https: wss: ws:; object-src 'none';"
  },
  "version": "1.0.0"
}
\`\`\`

**Cargo.toml:**
\`\`\`toml
[dependencies]
tauri = { version = "2.0", features = ["shell-open", "protocol-asset", "devtools"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[build-dependencies]
tauri-build = { version = "2.0", features = [] }
\`\`\`

**Rust lib.rs - MUST initialize plugins:**
\`\`\`rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![...commands...])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
\`\`\`

**CRITICAL MISTAKES TO AVOID:**
- ❌ NEVER use "devPath" - use "devUrl" (v2 format)
- ❌ NEVER use "distDir" - use "frontendDist" (v2 format)
- ❌ NEVER use features = ["api-all"] - DEPRECATED, use specific features
- ❌ NEVER set CSP to null - always configure security
- ❌ NEVER forget to call .plugin(tauri_plugin_shell::init())
- ❌ NEVER use .tsxx extension - use .tsx

**ALWAYS INCLUDE:**
- .gitignore file (ignore target/, dist/, node_modules/)
- icons/ directory with README
- Proper HTML security headers in index.html
`
  },
  electron: {
    keywords: ['electron', 'desktop electron'],
    prompt: `
## ELECTRON REQUIREMENTS

**Dependencies:**
\`\`\`json
"devDependencies": {
  "electron": "^28.0.0",
  "electron-builder": "^26.0.12"
}
\`\`\`

**Security (CRITICAL):**
- contextIsolation: true (ALWAYS)
- nodeIntegration: false (ALWAYS)
- sandbox: true (ALWAYS)
- Use preload scripts for IPC

**NEVER do:**
- ❌ nodeIntegration: true (security vulnerability)
- ❌ contextIsolation: false (security vulnerability)
- ❌ Expose Node.js APIs directly to renderer
`
  },
  react: {
    keywords: ['react', 'react app', 'frontend'],
    prompt: `
## REACT 18 REQUIREMENTS

**Dependencies:**
\`\`\`json
"dependencies": {
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
},
"devDependencies": {
  "@types/react": "^18.3.8",
  "@types/react-dom": "^18.3.0"
}
\`\`\`

**Entry Point (main.tsx):**
\`\`\`tsx
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
\`\`\`

**Use .tsx extension for React components, NOT .ts**
`
  }
};

/**
 * Detect frameworks from user prompt and return relevant knowledge
 */
function getFrameworkKnowledge(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  let knowledge = '';

  for (const [framework, data] of Object.entries(FRAMEWORK_KNOWLEDGE)) {
    for (const keyword of data.keywords) {
      if (lowerPrompt.includes(keyword)) {
        knowledge += data.prompt;
        break;
      }
    }
  }

  return knowledge;
}

interface ComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFiles: (files: ComposerFile[]) => void;
  workspacePath?: string;
}

const Composer: React.FC<ComposerProps> = ({
  isOpen,
  onClose,
  onCreateFiles,
  workspacePath
}) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<ComposerFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // @ts-ignore - focus exists on HTMLTextAreaElement
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setGeneratedFiles([]);

    try {
      // Detect frameworks and get relevant knowledge
      const frameworkKnowledge = getFrameworkKnowledge(prompt);

      // Build context-aware prompt - Make AI smarter, not just a code bot
      const enhancedPrompt = `You are an expert software architect and developer. Your task is to create a COMPLETE, PRODUCTION-READY project based on the user's request.

USER REQUEST: ${prompt}

CRITICAL REQUIREMENTS:
1. **Think First**: Understand the full scope before coding. What problem are we solving? What's the architecture?
2. **Complete Solution**: Don't just generate boilerplate - create a WORKING, USABLE application
3. **Best Practices**: Use modern patterns, proper error handling, type safety, and clean architecture
4. **Real Code**: Write code that actually works, not placeholder comments or TODOs
5. **Context Awareness**: Consider dependencies, file structure, and how components interact
6. **User Experience**: Make it intuitive and polished, not just functional
7. **Modern Dependencies**: Use the EXACT versions specified below - NO outdated packages

${workspacePath ? `Workspace Context: ${workspacePath}` : ''}
${frameworkKnowledge ? `\n${frameworkKnowledge}` : ''}

## DEPENDENCY VERSIONS (January 2026 - USE THESE EXACT VERSIONS)
- React: ^18.3.1
- TypeScript: ^5.6.2
- Vite: ^5.4.6
- Tauri API: ^2.0.0 (if using Tauri)
- Electron: ^28.0.0 (if using Electron)

OUTPUT FORMAT:
For each file, use this exact format:
FILE: relative/path/to/file.ext
\`\`\`language
[Complete, working code - no placeholders, no "// TODO", actual implementation]
\`\`\`

Separate files with a blank line.

IMPORTANT: 
- Generate ALL necessary files (package.json, README.md, config files, .gitignore, etc.)
- Include proper imports and dependencies with CORRECT versions
- Make it runnable immediately after creation
- Add meaningful comments explaining WHY, not just WHAT
- Handle edge cases and errors gracefully
- ALWAYS include .gitignore file
- ALWAYS include proper security configurations

Be intelligent. Be thorough. Create something you'd be proud to ship.`;

      // Build context with dependency awareness
      const context = {
        file_path: '',
        selected_text: '',
        file_content: '',
        focused_folder: workspacePath || null,
        // Add workspace context for dependency awareness
        workspace_context: workspacePath ? 'Workspace is open' : 'No workspace'
      };

      // @ts-ignore - window.agentAPI is injected by preload
      const result = await window.agentAPI.chat(enhancedPrompt, context);

      if (result.success && result.response) {
        // Parse the AI response to extract files
        const files = parseGeneratedFiles(result.response);
        
        // Check which files exist and load their content for diff preview
        // Also analyze dependencies between files (Composer mode enhancement)
        const filesWithStatus = await Promise.all(
          files.map(async (file, index) => {
            let existingContent: string | undefined;
            let isNew = true;
            let dependencies: string[] = [];

            try {
              // @ts-ignore - window.agentAPI is injected by preload
              const existingFile = await window.agentAPI.readFile(file.path);
              if (existingFile && !existingFile.error) {
                existingContent = existingFile.content;
                isNew = false;
              }
            } catch (error) {
              // File doesn't exist, which is fine
            }

            // Analyze dependencies (imports, requires, etc.)
            if (file.content) {
              const importMatches = [
                ...file.content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g),
                ...file.content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
                ...file.content.matchAll(/from\s+['"]([^'"]+)['"]/g)
              ];
              
              dependencies = importMatches
                .map(match => match[1])
                .filter((dep, idx, arr) => arr.indexOf(dep) === idx) // unique
                .filter(dep => !dep.startsWith('.') || files.some(f => f.path.includes(dep))); // only local deps
            }

            return {
              ...file,
              existingContent,
              isNew,
              dependencies
            };
          })
        );

        // Sort files by dependencies (files that are imported come after their dependencies)
        const sortedFiles = [...filesWithStatus].sort((a, b) => {
          // If a depends on b, b should come first
          if (a.dependencies.some(dep => b.path.includes(dep) || b.path.endsWith(dep))) {
            return 1;
          }
          if (b.dependencies.some(dep => a.path.includes(dep) || a.path.endsWith(dep))) {
            return -1;
          }
          return 0;
        });
        
        setGeneratedFiles(sortedFiles);
        // Auto-select all files
        setSelectedFiles(new Set(sortedFiles.map((_, i) => i)));
      }
    } catch (error) {
      console.error('Composer error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const parseGeneratedFiles = (response: string): ComposerFile[] => {
    const files: ComposerFile[] = [];
    const lines = response.split('\n');
    let currentFile: Partial<ComposerFile> | null = null;
    let currentContent = '';
    let inCodeBlock = false;
    let language = '';

    for (const line of lines) {
      if (line.startsWith('FILE: ')) {
        // Save previous file if exists
        if (currentFile && currentFile.path) {
          files.push({
            path: currentFile.path,
            content: currentContent.trim(),
            language: currentFile.language || 'text'
          });
        }

        // Start new file
        currentFile = {
          path: line.substring(6).trim(),
          language: 'text'
        };
        currentContent = '';
        inCodeBlock = false;
      } else if (line.startsWith('```') && currentFile) {
        if (!inCodeBlock) {
          // Start of code block
          inCodeBlock = true;
          language = line.substring(3).trim() || 'text';
          currentFile.language = language;
        } else {
          // End of code block
          inCodeBlock = false;
        }
      } else if (inCodeBlock && currentFile) {
        currentContent += line + '\n';
      }
    }

    // Save last file
    if (currentFile && currentFile.path) {
      files.push({
        path: currentFile.path,
        content: currentContent.trim(),
        language: currentFile.language || 'text'
      });
    }

    return files;
  };

  const handleCreateFiles = () => {
    const filesToCreate = generatedFiles.filter((_, index) => selectedFiles.has(index));
    onCreateFiles(filesToCreate);
    onClose();
    // Reset state
    setPrompt('');
    setGeneratedFiles([]);
    setSelectedFiles(new Set());
    setPreviewFileIndex(null);
  };

  const toggleFileSelection = (index: number) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedFiles(newSelection);
  };

  // Simple diff calculation for preview
  const calculateDiff = (oldContent: string, newContent: string): { added: number; removed: number; modified: boolean } => {
    if (!oldContent) {
      return { added: newContent.split('\n').length, removed: 0, modified: false };
    }
    
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Simple line-based diff
    let added = 0;
    let removed = 0;
    
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= oldLines.length) {
        added++;
      } else if (i >= newLines.length) {
        removed++;
      } else if (oldLines[i] !== newLines[i]) {
        added++;
        removed++;
      }
    }
    
    return {
      added,
      removed,
      modified: oldContent !== newContent
    };
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop-stunning animate-fade-in" onClick={onClose}>
      <div className="modal-stunning composer-modal animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="composer-header">
          <h2 className="gradient-text">✨ AI Composer</h2>
          <button className="composer-close btn-secondary-stunning" onClick={onClose}>×</button>
        </div>

        <div className="composer-content">
          {!generatedFiles.length ? (
            <div className="composer-input-section">
              <div className="composer-prompt">
                <label htmlFor="composer-input">What do you want to build?</label>
                <textarea
                  id="composer-input"
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="What do you want to build, Aaron? Describe the project, feature, or code...

Examples:
• Build a React todo app with local storage
• Create a Node.js API for user management
• Make a Python script to process CSV files
• Build a simple game with HTML/CSS/JavaScript"
                  disabled={isGenerating}
                  rows={8}
                  className="composer-input-stunning stunning-scrollbar"
                />
              </div>

              <div className="composer-examples">
                <span className="examples-label">Quick examples:</span>
                <button
                  className="example-chip"
                  onClick={() => setPrompt('Create a simple React counter component')}
                >
                  React Counter
                </button>
                <button
                  className="example-chip"
                  onClick={() => setPrompt('Build a Node.js Express API with CRUD operations')}
                >
                  Express API
                </button>
                <button
                  className="example-chip"
                  onClick={() => setPrompt('Create a Python script to analyze CSV data')}
                >
                  Python Data Script
                </button>
                <button
                  className="example-chip"
                  onClick={() => setPrompt('Make a simple HTML/CSS/JavaScript game')}
                >
                  Web Game
                </button>
              </div>

              <div className="composer-actions">
                <button
                  className="btn-stunning btn-primary-stunning glow-pulse composer-generate"
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <span className="spinner shimmer">⏳</span>
                      Generating magic...
                    </>
                  ) : (
                    <>
                      ✨ Generate Code
                    </>
                  )}
                </button>
                <button className="btn-stunning btn-secondary-stunning composer-cancel" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="composer-files-section">
              <div className="files-header">
                <h3>Generated Files ({generatedFiles.length})</h3>
                <span className="files-selected">{selectedFiles.size} selected</span>
              </div>

              <div className="files-list">
                {generatedFiles.map((file, index) => (
                  <React.Fragment key={index}>
                    <div className="file-item">
                      <label className="file-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(index)}
                          onChange={() => toggleFileSelection(index)}
                        />
                        <span className="checkmark"></span>
                      </label>

                      <div className="file-info">
                        <div className="file-path">
                          {file.path}
                          {file.isNew ? (
                            <span className="file-badge new">New</span>
                          ) : (
                            <span className="file-badge modified">Modified</span>
                          )}
                        </div>
                        <div className="file-meta">
                          {file.language} • {file.content.split('\n').length} lines
                          {file.existingContent && (() => {
                            const diff = calculateDiff(file.existingContent, file.content);
                            return (
                              <span className="diff-stats">
                                {' • '}
                                <span className="diff-added">+{diff.added}</span>
                                {' '}
                                <span className="diff-removed">-{diff.removed}</span>
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <button
                        className="file-preview-btn"
                        onClick={() => {
                          setPreviewFileIndex(previewFileIndex === index ? null : index);
                        }}
                        title={previewFileIndex === index ? 'Hide preview' : 'Show diff preview'}
                      >
                        {previewFileIndex === index ? '👁‍🗨' : '👁'}
                      </button>
                    </div>
                    
                    {previewFileIndex === index && (
                      <div className="file-diff-preview">
                        <div className="diff-preview-header">
                          <span>Diff Preview: {file.path}</span>
                          <button onClick={() => setPreviewFileIndex(null)}>×</button>
                        </div>
                        <div className="diff-preview-content">
                          {file.existingContent ? (
                            <div className="diff-split">
                              <div className="diff-old">
                                <div className="diff-header">Current</div>
                                <pre>{file.existingContent}</pre>
                              </div>
                              <div className="diff-new">
                                <div className="diff-header">New</div>
                                <pre>{file.content}</pre>
                              </div>
                            </div>
                          ) : (
                            <div className="diff-new-only">
                              <div className="diff-header">New File</div>
                              <pre>{file.content}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div className="composer-actions">
                <button
                  className="composer-create"
                  onClick={handleCreateFiles}
                  disabled={selectedFiles.size === 0}
                >
                  📁 {selectedFiles.size === generatedFiles.filter((f, i) => selectedFiles.has(i) && !f.isNew).length 
                    ? 'Update' 
                    : selectedFiles.size === generatedFiles.filter((f, i) => selectedFiles.has(i) && f.isNew).length
                    ? 'Create'
                    : 'Apply Changes'} {selectedFiles.size} File{selectedFiles.size !== 1 ? 's' : ''}
                </button>
                <button
                  className="composer-regenerate"
                  onClick={() => {
                    setGeneratedFiles([]);
                    setSelectedFiles(new Set());
                  }}
                >
                  🔄 Try Again
                </button>
                <button className="composer-cancel" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Composer;
