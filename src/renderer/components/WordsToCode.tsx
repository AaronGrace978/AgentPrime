/**
 * WordsToCode - Generate code files from natural language
 * 
 * Point to any folder and describe what you want - the AI will create
 * the files directly in that folder.
 * 
 * Enhanced Features:
 * - File overwrite protection with diff preview
 * - Open generated files in editor
 * - Streaming responses for real-time feedback
 * - Project type selector for better generation
 * - Saved prompts/favorites
 * - File-by-file progress tracking
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// @ts-ignore - window.agentAPI is injected by preload script
declare const window: any;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  files?: GeneratedFile[];
  isStreaming?: boolean;
}

interface GeneratedFile {
  path: string;
  name: string;
  language: string;
  status: 'pending' | 'created' | 'error' | 'skipped' | 'overwritten';
  error?: string;
  existingContent?: string; // For diff preview
  newContent?: string;
}

interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
  projectType: string;
  createdAt: Date;
}

interface FileConflict {
  path: string;
  name: string;
  existingContent: string;
  newContent: string;
  language: string;
}

interface WordsToCodeProps {
  isOpen: boolean;
  onClose: () => void;
}

// Project type configurations for better AI prompts
const PROJECT_TYPES = {
  auto: { label: '🔮 Auto-Detect', description: 'Let AI choose the best stack' },
  react: { label: '⚛️ React', description: 'React with Vite, modern hooks' },
  nextjs: { label: '▲ Next.js', description: 'React with SSR, App Router' },
  vue: { label: '💚 Vue.js', description: 'Vue 3 with Composition API' },
  node: { label: '🟢 Node.js', description: 'Express/Fastify backend' },
  python: { label: '🐍 Python', description: 'Flask/FastAPI backend' },
  static: { label: '🌐 Static Site', description: 'HTML/CSS/JS only' },
  fullstack: { label: '🚀 Full-Stack', description: 'Frontend + Backend' },
  electron: { label: '⚡ Electron', description: 'Desktop app with web tech' },
  chrome: { label: '🧩 Chrome Extension', description: 'Browser extension' },
  cli: { label: '💻 CLI Tool', description: 'Command-line application' },
  game: { label: '🎮 Web Game', description: 'Canvas/WebGL game' },
};

// Design style presets for visual appearance
const DESIGN_STYLES = {
  modern: { 
    label: '✨ Modern', 
    description: 'Clean gradients, smooth animations',
    colors: { primary: '#6366f1', secondary: '#06b6d4', accent: '#10b981' },
    features: ['gradients', 'shadows', 'rounded corners', 'smooth transitions']
  },
  dark: { 
    label: '🌙 Dark Mode', 
    description: 'Sleek dark theme with glows',
    colors: { primary: '#8b5cf6', secondary: '#ec4899', accent: '#14b8a6', bg: '#0f172a' },
    features: ['dark background', 'neon accents', 'glow effects', 'high contrast']
  },
  minimal: { 
    label: '⬜ Minimal', 
    description: 'Clean, whitespace-focused',
    colors: { primary: '#18181b', secondary: '#71717a', accent: '#3b82f6' },
    features: ['lots of whitespace', 'subtle borders', 'clean typography', 'no shadows']
  },
  vibrant: { 
    label: '🌈 Vibrant', 
    description: 'Bold colors, playful design',
    colors: { primary: '#f43f5e', secondary: '#8b5cf6', accent: '#eab308' },
    features: ['bold colors', 'playful animations', 'creative layouts', 'fun micro-interactions']
  },
  corporate: { 
    label: '💼 Corporate', 
    description: 'Professional, trustworthy',
    colors: { primary: '#1e40af', secondary: '#0369a1', accent: '#15803d' },
    features: ['professional', 'clean lines', 'trust indicators', 'structured layout']
  },
  glassmorphism: { 
    label: '🔮 Glass', 
    description: 'Frosted glass effects',
    colors: { primary: '#6366f1', secondary: '#a855f7', accent: '#22d3ee' },
    features: ['glass blur effects', 'transparency', 'gradient backgrounds', 'floating elements']
  },
  neobrutalism: { 
    label: '🎯 Neo-Brutal', 
    description: 'Bold borders, raw aesthetic',
    colors: { primary: '#000000', secondary: '#facc15', accent: '#ef4444' },
    features: ['thick black borders', 'solid colors', 'no gradients', 'blocky shapes', 'offset shadows']
  },
  retro: { 
    label: '📺 Retro', 
    description: '80s/90s nostalgia',
    colors: { primary: '#e11d48', secondary: '#7c3aed', accent: '#06b6d4' },
    features: ['retro colors', 'pixel patterns', 'neon effects', 'synthwave vibes']
  },
};

const WordsToCode: React.FC<WordsToCodeProps> = ({ isOpen, onClose }) => {
  const [targetFolder, setTargetFolder] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewCode, setPreviewCode] = useState<string>('');
  const [previewFiles, setPreviewFiles] = useState<any[]>([]);
  
  // New enhanced state
  const [projectType, setProjectType] = useState<keyof typeof PROJECT_TYPES>('auto');
  const [designStyle, setDesignStyle] = useState<keyof typeof DESIGN_STYLES>('modern');
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [fileConflicts, setFileConflicts] = useState<FileConflict[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ name: string; content: string; language: string }[]>([]);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; currentFile: string }>({ current: 0, total: 0, currentFile: '' });
  const [overwriteAll, setOverwriteAll] = useState(false);
  
  // New features state
  const [showVisualPreview, setShowVisualPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [refinementMode, setRefinementMode] = useState(false);
  const [refinementTarget, setRefinementTarget] = useState<string>('');
  const [detectedDependencies, setDetectedDependencies] = useState<{ npm: string[]; pip: string[] }>({ npm: [], pip: [] });
  const [autoInstallDeps, setAutoInstallDeps] = useState(true);
  
  // File tree view state
  const [showFileTree, setShowFileTree] = useState(false);
  const [fileTree, setFileTree] = useState<{ path: string; name: string; isDir: boolean; children?: any[] }[]>([]);
  const [lastGeneratedFiles, setLastGeneratedFiles] = useState<string[]>([]);
  
  // Status messages state
  const [statusMessage, setStatusMessage] = useState<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const savedPromptsBtnRef = useRef<HTMLButtonElement>(null);
  const savedPromptsDropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  // Close saved prompts dropdown when clicking outside
  useEffect(() => {
    if (!showSavedPrompts) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isOutsideDropdown = savedPromptsDropdownRef.current && !savedPromptsDropdownRef.current.contains(target);
      const isOutsideButton = savedPromptsBtnRef.current && !savedPromptsBtnRef.current.contains(target);
      
      if (isOutsideDropdown && isOutsideButton) {
        setShowSavedPrompts(false);
      }
    };
    
    // Use mousedown to catch clicks before they propagate
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSavedPrompts]);

  // Load recent folders and saved prompts from localStorage
  useEffect(() => {
    try {
      const savedFolders = localStorage.getItem('words-to-code-recent-folders');
      if (savedFolders) {
        setRecentFolders(JSON.parse(savedFolders));
      }
      
      const savedPromptsData = localStorage.getItem('words-to-code-saved-prompts');
      if (savedPromptsData) {
        setSavedPrompts(JSON.parse(savedPromptsData));
      }
    } catch (e) {
      console.error('Failed to load saved data:', e);
    }
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Setup streaming listener
  useEffect(() => {
    if (!isOpen) return;

    const handleStream = (data: any) => {
      if (data.content) {
        setStreamingContent(prev => prev + data.content);
      }
      if (data.done) {
        setIsStreaming(false);
      }
    };

    window.agentAPI.onChatStream(handleStream);

    return () => {
      window.agentAPI.removeChatStream();
    };
  }, [isOpen]);

  // Save folder to recent list
  const saveRecentFolder = (folder: string) => {
    const updated = [folder, ...recentFolders.filter(f => f !== folder)].slice(0, 5);
    setRecentFolders(updated);
    try {
      localStorage.setItem('words-to-code-recent-folders', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save recent folders:', e);
    }
  };

  // Save prompt to favorites
  const savePrompt = useCallback((name: string, prompt: string) => {
    const newPrompt: SavedPrompt = {
      id: `prompt-${Date.now()}`,
      name,
      prompt,
      projectType,
      createdAt: new Date()
    };
    const updated = [newPrompt, ...savedPrompts].slice(0, 20);
    setSavedPrompts(updated);
    try {
      localStorage.setItem('words-to-code-saved-prompts', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save prompts:', e);
    }
  }, [savedPrompts, projectType]);

  // Delete saved prompt
  const deletePrompt = useCallback((promptId: string) => {
    const updated = savedPrompts.filter(p => p.id !== promptId);
    setSavedPrompts(updated);
    try {
      localStorage.setItem('words-to-code-saved-prompts', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete prompt:', e);
    }
  }, [savedPrompts]);

  // Load saved prompt
  const loadPrompt = useCallback((prompt: SavedPrompt) => {
    setInput(prompt.prompt);
    setProjectType(prompt.projectType as keyof typeof PROJECT_TYPES);
    setShowSavedPrompts(false);
    inputRef.current?.focus();
  }, []);

  // Check if file exists and get content for diff
  const checkFileExists = async (filePath: string): Promise<{ exists: boolean; content?: string }> => {
    try {
      const result = await window.agentAPI.readFile(filePath);
      if (result.success && result.content) {
        return { exists: true, content: result.content };
      }
      return { exists: false };
    } catch {
      return { exists: false };
    }
  };

  // Open file in editor
  const openInEditor = useCallback((filePath: string, line?: number) => {
    window.dispatchEvent(new CustomEvent('agentprime:openFileAtLine', {
      detail: { path: filePath, line: line || 1 }
    }));
  }, []);

  // Load file tree from target folder
  const loadFileTree = useCallback(async () => {
    if (!targetFolder) return;
    
    try {
      const result = await window.agentAPI.readTree(targetFolder);
      if (result.tree) {
        setFileTree(result.tree);
        setShowFileTree(true);
      }
    } catch (e) {
      console.warn('[WordsToCode] Could not load file tree:', e);
    }
  }, [targetFolder]);

  // Show status message with auto-dismiss
  const showStatus = useCallback((type: 'info' | 'success' | 'warning' | 'error', text: string, duration: number = 3000) => {
    setStatusMessage({ type, text });
    if (duration > 0) {
      setTimeout(() => setStatusMessage(null), duration);
    }
  }, []);

  // Open folder in system file explorer
  const openFolderInExplorer = useCallback(async () => {
    if (!targetFolder) return;
    
    try {
      // Use shell to open folder
      if (window.agentAPI.runCommand) {
        const isWindows = targetFolder.includes('\\');
        if (isWindows) {
          await window.agentAPI.runCommand(`explorer "${targetFolder}"`);
        } else {
          await window.agentAPI.runCommand(`open "${targetFolder}"`);
        }
      }
    } catch (e) {
      console.warn('[WordsToCode] Could not open folder in explorer:', e);
    }
  }, [targetFolder]);

  // Get project type specific prompt enhancements
  const getProjectTypePrompt = (type: keyof typeof PROJECT_TYPES): string => {
    const prompts: Record<string, string> = {
      auto: `Generate a complete static website with: index.html, styles.css (400+ lines), script.js (200+ lines), start.bat, README.md. Make it visually stunning with animations.`,
      react: `Use React 18+ with Vite. Generate: package.json, vite.config.js, index.html, src/main.jsx, src/App.jsx, src/App.css (400+ lines), and a .jsx file for EVERY component.`,
      nextjs: `Use Next.js 14+ with App Router. Generate: package.json, next.config.js, app/layout.jsx, app/page.jsx, app/globals.css, components/*.jsx.`,
      vue: `Use Vue 3 with Vite. Generate: package.json, vite.config.js, index.html, src/main.js, src/App.vue, src/style.css, and a .vue file for EVERY component.`,
      node: `Use Node.js with Express. Generate: package.json, src/index.js, src/routes/*.js, public/index.html, public/css/styles.css, public/js/script.js.`,
      python: `Use Python with Flask. Generate: requirements.txt, run.py, app/__init__.py, app/routes.py, templates/*.html, static/css/styles.css, static/js/script.js.`,
      static: `Generate a stunning static website with: index.html, styles.css (400+ lines with animations), script.js (200+ lines with interactivity), start.bat.`,
      fullstack: `Generate Express server serving static files. ROOT files only: package.json, server.js, index.html, styles.css, script.js, start.bat. NO subdirectories.`,
      electron: `Generate Electron desktop app. ROOT files: package.json, main.js, preload.js, index.html, styles.css, script.js, start.bat.`,
      chrome: `Generate Chrome extension. ROOT files: manifest.json, popup.html, popup.css, popup.js, background.js, content.js, start.bat.`,
      cli: `Generate Node.js CLI tool. ROOT files: package.json (with bin field), index.js (with commander/yargs, chalk), start.bat.`,
      game: `Generate HTML5 Canvas game. ROOT files: index.html, styles.css, game.js (complete game loop, controls, collision, scoring), start.bat. MUST be fully playable!`
    };
    return prompts[type] || prompts.auto;
  };

  // Select target folder
  const selectFolder = async () => {
    try {
      const result = await window.agentAPI.selectDirectory();
      if (result.success && result.path) {
        setTargetFolder(result.path);
        saveRecentFolder(result.path);
        
        // IMPORTANT: Set this folder as the workspace so file writes are allowed
        try {
          await window.agentAPI.setWorkspace(result.path);
          console.log('[WordsToCode] Workspace set to:', result.path);
        } catch (e) {
          console.warn('[WordsToCode] Could not set workspace:', e);
        }
        
        const folderName = result.path.split(/[/\\]/).pop() || result.path;
        setMessages(prev => [...prev, {
          id: `system-${Date.now()}`,
          role: 'system',
          content: `Target folder set to: **${folderName}**\n\n\`${result.path}\`\n\nNow describe what you want me to create!`,
          timestamp: new Date()
        }]);
      }
    } catch (error: any) {
      console.error('Failed to select folder:', error);
    }
  };

  // Use a recent folder
  const useRecentFolder = async (folder: string) => {
    setTargetFolder(folder);
    saveRecentFolder(folder);
    
    // IMPORTANT: Set this folder as the workspace so file writes are allowed
    try {
      await window.agentAPI.setWorkspace(folder);
      console.log('[WordsToCode] Workspace set to:', folder);
    } catch (e) {
      console.warn('[WordsToCode] Could not set workspace:', e);
    }
    
    const folderName = folder.split(/[/\\]/).pop() || folder;
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `Target folder set to: **${folderName}**\n\n\`${folder}\`\n\nNow describe what you want me to create!`,
      timestamp: new Date()
    }]);
  };

  // Parse AI response for file blocks - ENHANCED with 10+ patterns for maximum reliability
  const parseFilesFromResponse = (response: string): { content: string; files: { name: string; content: string; language: string }[] } => {
    const files: { name: string; content: string; language: string }[] = [];
    let cleanContent = response;
    
    // Track unique filenames to avoid duplicates
    const usedFilenames = new Set<string>();
    let fileCounter: Record<string, number> = {};
    
    // Helper function to sanitize filenames - removes common prefixes that shouldn't be part of the filename
    const sanitizeFilename = (filename: string): string => {
      return filename
        .trim()
        .replace(/^[`'"]+|[`'"]+$/g, '')  // Remove quotes/backticks
        .replace(/^FILE:\s*/i, '')         // Remove "FILE:" prefix
        .replace(/^Path:\s*/i, '')         // Remove "Path:" prefix  
        .replace(/^Filename:\s*/i, '')     // Remove "Filename:" prefix
        .replace(/^Create:\s*/i, '')       // Remove "Create:" prefix
        .replace(/\\/g, '/')               // Normalize path separators
        .trim();
    };
    
    // Check if a string is a valid filename (not a title or description)
    const isValidFilename = (filename: string): boolean => {
      const clean = sanitizeFilename(filename);
      // Reject if it looks like a markdown title (multiple words with spaces)
      if (clean.split(/\s+/).length > 2) return false;
      // Reject if it starts with # (markdown heading that slipped through)
      if (clean.startsWith('#')) return false;
      // Reject if it contains markdown formatting
      if (/[*_~`]/.test(clean)) return false;
      // Reject if it's too long (real filenames are usually <100 chars)
      if (clean.length > 100) return false;
      // Reject if it doesn't have a proper extension at the end
      if (!/\.[a-z0-9]{1,10}$/i.test(clean)) return false;
      // Reject if the base name has spaces (like "Space Simulator")
      const baseName = clean.split('/').pop() || '';
      if (/\s/.test(baseName.replace(/\.[^.]+$/, ''))) return false;
      return true;
    };
    
    // Get just the filename without directory path
    const getBasename = (filepath: string): string => {
      return filepath.split('/').pop() || filepath;
    };
    
    let match;
    
    // Pattern 1: FILE: marker with various formats
    // Matches: FILE: filename.ext, FILE: `filename.ext`, FILE: "filename.ext"
    const pattern1 = /FILE:\s*[`'"]*([^\n`'"]+?)[`'"]*\s*\n```(\w+)?\n([\s\S]*?)```/gi;
    while ((match = pattern1.exec(response)) !== null) {
      const [, filename, language, content] = match;
      if (filename && content && content.trim().length > 0) {
        let cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          // Check for duplicate basenames - prefer files in subdirectories
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (existingWithSameBasename) {
            // If existing is at root and new one is in subdir, replace it
            if (!existingWithSameBasename.name.includes('/') && cleanName.includes('/')) {
              const idx = files.indexOf(existingWithSameBasename);
              files[idx] = { name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) };
            }
            // Otherwise skip this duplicate
          } else if (!usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) });
          }
        }
      }
    }
    
    // Pattern 2: **filename** or `filename` before code block (bold/code style)
    const pattern2 = /(?:\*\*|`)([^\n*`]+\.(?:py|js|ts|tsx|jsx|html|css|scss|java|cpp|c|go|rs|rb|php|sh|bat|sql|json|yaml|yml|xml|md|vue|svelte|env|gitignore|toml|lock|config\.[jt]s))(?:\*\*|`)\s*\n```(\w+)?\n([\s\S]*?)```/gi;
    while ((match = pattern2.exec(response)) !== null) {
      const [, filename, language, content] = match;
      if (filename && content && content.trim().length > 0) {
        const cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (existingWithSameBasename) {
            if (!existingWithSameBasename.name.includes('/') && cleanName.includes('/')) {
              const idx = files.indexOf(existingWithSameBasename);
              files[idx] = { name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) };
            }
          } else if (!usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) });
          }
        }
      }
    }
    
    // Pattern 3: ```language:path/filename (colon-separated)
    const pattern3 = /```(\w+)[:\s]+([^\n]+\.(?:py|js|ts|tsx|jsx|html|css|scss|java|cpp|c|go|rs|rb|php|sh|bat|sql|json|yaml|yml|xml|md|vue|svelte))\n([\s\S]*?)```/gi;
    while ((match = pattern3.exec(response)) !== null) {
      const [, language, filename, content] = match;
      if (filename && content && content.trim().length > 0) {
        const cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (existingWithSameBasename) {
            if (!existingWithSameBasename.name.includes('/') && cleanName.includes('/')) {
              const idx = files.indexOf(existingWithSameBasename);
              files[idx] = { name: cleanName, content: content.trim(), language: language || 'text' };
            }
          } else if (!usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || 'text' });
          }
        }
      }
    }
    
    // Pattern 4: ### filename or #### filename header before code block
    // STRICT: Only match if the header looks like a filename (no spaces in basename)
    const pattern4 = /#{1,4}\s*([a-zA-Z0-9_\-./]+\.(?:py|js|ts|tsx|jsx|html|css|scss|json|yaml|yml|md|env|bat|sh|vue|svelte|toml))\s*\n+```(\w+)?\n([\s\S]*?)```/gi;
    while ((match = pattern4.exec(response)) !== null) {
      const [, filename, language, content] = match;
      if (filename && content && content.trim().length > 0) {
        const cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (existingWithSameBasename) {
            if (!existingWithSameBasename.name.includes('/') && cleanName.includes('/')) {
              const idx = files.indexOf(existingWithSameBasename);
              files[idx] = { name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) };
            }
          } else if (!usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) });
          }
        }
      }
    }
    
    // Pattern 5: [filename] header style
    const pattern5 = /\[([^\]]+\.(?:py|js|ts|tsx|jsx|html|css|scss|json|yaml|yml|md|bat|sh))\]\s*\n```(\w+)?\n([\s\S]*?)```/gi;
    while ((match = pattern5.exec(response)) !== null) {
      const [, filename, language, content] = match;
      if (filename && content && content.trim().length > 0) {
        const cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (!existingWithSameBasename && !usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) });
          }
        }
      }
    }
    
    // Pattern 6: filename.ext: or filename.ext - followed by code block
    const pattern6 = /^([a-zA-Z0-9_\-./]+\.(?:py|js|ts|tsx|jsx|html|css|scss|json|yaml|yml|md|bat|sh|vue|svelte))[\s:]*\n```(\w+)?\n([\s\S]*?)```/gim;
    while ((match = pattern6.exec(response)) !== null) {
      const [, filename, language, content] = match;
      if (filename && content && content.trim().length > 0) {
        const cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (!existingWithSameBasename && !usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) });
          }
        }
      }
    }
    
    // Pattern 7: (filename.ext) parentheses style
    const pattern7 = /\(([^)]+\.(?:py|js|ts|tsx|jsx|html|css|scss|json|yaml|yml|md|bat|sh))\)\s*\n```(\w+)?\n([\s\S]*?)```/gi;
    while ((match = pattern7.exec(response)) !== null) {
      const [, filename, language, content] = match;
      if (filename && content && content.trim().length > 0) {
        const cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (!existingWithSameBasename && !usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) });
          }
        }
      }
    }
    
    // Pattern 8: "Create filename.ext" or "Save as filename.ext" followed by code
    const pattern8 = /(?:create|save\s+as|write\s+to|file\s+name|filename)\s*[:=]?\s*[`'"]*([^\n`'"]+\.(?:py|js|ts|tsx|jsx|html|css|scss|json|yaml|yml|md|bat|sh))[`'"]*\s*\n```(\w+)?\n([\s\S]*?)```/gi;
    while ((match = pattern8.exec(response)) !== null) {
      const [, filename, language, content] = match;
      if (filename && content && content.trim().length > 0) {
        const cleanName = sanitizeFilename(filename);
        if (isValidFilename(cleanName)) {
          const basename = getBasename(cleanName).toLowerCase();
          const existingWithSameBasename = files.find(f => getBasename(f.name).toLowerCase() === basename);
          if (!existingWithSameBasename && !usedFilenames.has(cleanName.toLowerCase())) {
            usedFilenames.add(cleanName.toLowerCase());
            files.push({ name: cleanName, content: content.trim(), language: language || detectLanguage(cleanName) });
          }
        }
      }
    }
    
    // If we still have no files, try generic code blocks with language detection
    if (files.length === 0) {
      const genericPattern = /```(\w+)?\n([\s\S]*?)```/g;
      let blockIndex = 0;
      while ((match = genericPattern.exec(response)) !== null) {
        const [, language, content] = match;
        if (content && content.trim().length > 20) {
          blockIndex++;
          // Infer filename from language and content
          const langExtensions: Record<string, string> = {
            'python': 'main.py', 'py': 'main.py',
            'javascript': 'script.js', 'js': 'script.js',
            'typescript': 'index.ts', 'ts': 'index.ts',
            'jsx': 'App.jsx', 'tsx': 'App.tsx',
            'html': 'index.html', 'css': 'styles.css', 'scss': 'styles.scss',
            'java': 'Main.java', 'cpp': 'main.cpp', 'c': 'main.c',
            'go': 'main.go', 'rust': 'main.rs', 'rs': 'main.rs',
            'ruby': 'main.rb', 'rb': 'main.rb', 'php': 'index.php',
            'sh': 'script.sh', 'bash': 'script.sh', 'shell': 'script.sh',
            'batch': 'start.bat', 'bat': 'start.bat', 'cmd': 'start.bat',
            'sql': 'query.sql', 'json': 'package.json', 'jsonc': 'package.json',
            'yaml': 'config.yaml', 'yml': 'config.yml',
            'xml': 'data.xml', 'md': 'README.md', 'markdown': 'README.md',
            'vue': 'App.vue', 'svelte': 'App.svelte'
          };
          
          // Special detection: if content starts with <!DOCTYPE or <html, it's HTML
          let filename = langExtensions[(language || '').toLowerCase()] || '';
          const trimmedContent = content.trim().toLowerCase();
          if (trimmedContent.startsWith('<!doctype') || trimmedContent.startsWith('<html')) {
            filename = 'index.html';
          } else if (trimmedContent.includes('@keyframes') || trimmedContent.includes('display:') || /^[.#]?\w+\s*\{/.test(trimmedContent)) {
            filename = 'styles.css';
          } else if (trimmedContent.startsWith('{') && trimmedContent.includes('"name"')) {
            filename = 'package.json';
          }
          
          if (!filename) filename = `file_${blockIndex}.${language || 'txt'}`;
          
          // Make unique
          if (usedFilenames.has(filename.toLowerCase())) {
            const ext = filename.substring(filename.lastIndexOf('.'));
            const base = filename.substring(0, filename.lastIndexOf('.'));
            fileCounter[base] = (fileCounter[base] || 1) + 1;
            filename = `${base}_${fileCounter[base]}${ext}`;
          }
          
          usedFilenames.add(filename.toLowerCase());
          files.push({ name: filename, content: content.trim(), language: language || detectLanguage(filename) });
        }
      }
    }
    
    return { content: cleanContent, files };
  };
  
  // Helper to detect language from filename
  const detectLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      'js': 'javascript', 'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx',
      'py': 'python', 'html': 'html', 'css': 'css', 'scss': 'scss',
      'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'md': 'markdown',
      'sh': 'bash', 'bat': 'batch', 'sql': 'sql', 'vue': 'vue', 'svelte': 'svelte'
    };
    return langMap[ext] || ext || 'text';
  };

  // Validate generated files - check for missing imports
  const validateGeneratedFiles = (files: { name: string; content: string; language: string }[]): { 
    valid: boolean; 
    missingFiles: string[];
    warnings: string[];
  } => {
    const fileNames = new Set(files.map(f => f.name.toLowerCase()));
    const missingFiles: string[] = [];
    const warnings: string[] = [];
    
    for (const file of files) {
      // Check JS/TS/JSX/TSX imports
      if (/\.(js|jsx|ts|tsx)$/i.test(file.name)) {
        // Match import statements: import X from './path' or import X from '../path'
        const importRegex = /import\s+(?:[\w{}\s*,]+\s+from\s+)?['"]([^'"]+)['"]/g;
        let importMatch;
        while ((importMatch = importRegex.exec(file.content)) !== null) {
          const importPath = importMatch[1];
          // Skip node_modules imports
          if (!importPath.startsWith('.')) continue;
          
          // Resolve relative path
          const fileDir = file.name.includes('/') ? file.name.substring(0, file.name.lastIndexOf('/')) : '';
          let resolvedPath = importPath;
          
          if (importPath.startsWith('./')) {
            resolvedPath = fileDir ? `${fileDir}/${importPath.slice(2)}` : importPath.slice(2);
          } else if (importPath.startsWith('../')) {
            const parts = fileDir.split('/');
            parts.pop();
            resolvedPath = parts.length ? `${parts.join('/')}/${importPath.slice(3)}` : importPath.slice(3);
          }
          
          // Check if the imported file exists (with various extensions)
          const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '.css'];
          const found = extensions.some(ext => {
            const checkPath = (resolvedPath + ext).toLowerCase();
            return fileNames.has(checkPath) || fileNames.has(`${checkPath}/index.js`) || fileNames.has(`${checkPath}/index.jsx`);
          });
          
          if (!found && !importPath.includes('react') && !importPath.includes('chart')) {
            // Extract component name from import
            const componentMatch = importPath.match(/\/([^/]+)$/);
            const componentName = componentMatch ? componentMatch[1] : importPath;
            if (!missingFiles.includes(componentName)) {
              missingFiles.push(componentName);
            }
          }
        }
        
        // Check for CSS imports
        const cssImportRegex = /import\s+['"]([^'"]+\.css)['"]/g;
        let cssMatch;
        while ((cssMatch = cssImportRegex.exec(file.content)) !== null) {
          const cssPath = cssMatch[1];
          if (cssPath.startsWith('.')) {
            const fileDir = file.name.includes('/') ? file.name.substring(0, file.name.lastIndexOf('/')) : '';
            let resolvedCss = cssPath.startsWith('./') 
              ? (fileDir ? `${fileDir}/${cssPath.slice(2)}` : cssPath.slice(2))
              : cssPath;
            if (!fileNames.has(resolvedCss.toLowerCase())) {
              warnings.push(`CSS file not found: ${cssPath} (imported in ${file.name})`);
            }
          }
        }
      }
    }
    
    return {
      valid: missingFiles.length === 0,
      missingFiles,
      warnings
    };
  };

  // Fix React component imports - ensure components are imported and rendered in App.tsx/jsx
  const fixReactComponentImports = (files: { name: string; content: string; language: string }[]): { name: string; content: string; language: string }[] => {
    // Find App.tsx or App.jsx
    const appFile = files.find(f => 
      (f.name.toLowerCase() === 'src/app.tsx' || 
       f.name.toLowerCase() === 'app.tsx' ||
       f.name.toLowerCase() === 'src/app.jsx' ||
       f.name.toLowerCase() === 'app.jsx')
    );
    
    if (!appFile) {
      console.log('[WordsToCode] No App.tsx/jsx found, skipping component import fix');
      return files;
    }

    // Find React components in components/ directory
    const componentFiles = files.filter(f => 
      f.name.includes('/components/') && 
      (f.name.endsWith('.tsx') || f.name.endsWith('.jsx'))
    );

    if (componentFiles.length === 0) {
      console.log('[WordsToCode] No components found, skipping import fix');
      return files;
    }

    console.log('[WordsToCode] Found components to check:', componentFiles.map(f => f.name));

    // Extract component names from file paths
    const componentNames = componentFiles.map(f => {
      const fileName = f.name.split('/').pop() || f.name;
      return fileName.replace(/\.(tsx|jsx)$/, '');
    });

    let appContent = appFile.content;
    let needsUpdate = false;

    // Check and add imports
    for (const componentName of componentNames) {
      // Check if component is already imported
      const importPattern = new RegExp(`import\\s+.*\\b${componentName}\\b.*from`, 'i');
      if (!importPattern.test(appContent)) {
        // Find the components directory path
        const componentFile = componentFiles.find(f => f.name.includes(componentName));
        if (!componentFile) continue;
        
        // Determine relative path from App.tsx to component
        const appDir = appFile.name.includes('/') 
          ? appFile.name.substring(0, appFile.name.lastIndexOf('/'))
          : '';
        const componentPath = componentFile.name.includes('/')
          ? componentFile.name.substring(0, componentFile.name.lastIndexOf('/'))
          : '';
        
        // Calculate relative import path
        let importPath = '';
        if (appDir === 'src' && componentPath === 'src/components') {
          importPath = './components/' + componentName;
        } else if (appDir === componentPath) {
          importPath = './components/' + componentName;
        } else {
          // Try to calculate relative path
          const appParts = appDir.split('/').filter(p => p);
          const compParts = componentPath.split('/').filter(p => p);
          
          // Find common path
          let commonLength = 0;
          for (let i = 0; i < Math.min(appParts.length, compParts.length); i++) {
            if (appParts[i] === compParts[i]) {
              commonLength++;
            } else {
              break;
            }
          }
          
          // Build relative path
          const upLevels = appParts.length - commonLength;
          const downPath = compParts.slice(commonLength).join('/');
          importPath = '../'.repeat(upLevels) + (downPath ? downPath + '/' : '') + componentName;
        }

        // Add import statement after existing imports or at the top
        const importStatement = `import ${componentName} from '${importPath}';\n`;
        
        // Find where to insert (after last import or after React import)
        const lastImportMatch = appContent.match(/^import\s+.*$/gm);
        if (lastImportMatch && lastImportMatch.length > 0) {
          const lastImport = lastImportMatch[lastImportMatch.length - 1];
          const lastImportIndex = appContent.lastIndexOf(lastImport);
          const insertIndex = lastImportIndex + lastImport.length;
          appContent = appContent.slice(0, insertIndex) + '\n' + importStatement + appContent.slice(insertIndex);
        } else {
          // No imports found, add after React import or at top
          const reactImportMatch = appContent.match(/^import\s+React.*$/m);
          if (reactImportMatch) {
            const reactImportIndex = appContent.indexOf(reactImportMatch[0]);
            const insertIndex = reactImportIndex + reactImportMatch[0].length;
            appContent = appContent.slice(0, insertIndex) + '\n' + importStatement + appContent.slice(insertIndex);
          } else {
            appContent = importStatement + appContent;
          }
        }
        needsUpdate = true;
        console.log(`[WordsToCode] Added import for ${componentName}`);
      }

      // Check if component is rendered in JSX
      // Look for JSX patterns: <ComponentName /> or <ComponentName> or {ComponentName}
      const renderPatterns = [
        new RegExp(`<${componentName}\\s*/?>`, 'i'),
        new RegExp(`<${componentName}>`, 'i'),
        new RegExp(`\\{${componentName}\\}`, 'i'),
        new RegExp(`\\{<${componentName}`, 'i')
      ];

      const isRendered = renderPatterns.some(pattern => pattern.test(appContent));

      if (!isRendered) {
        // Find where to add the component (in the return statement)
        // Look for common patterns: <main>, <div className="App">, or comment placeholders
        const mainPattern = /<main[^>]*>([\s\S]*?)<\/main>/i;
        const divAppPattern = /<div\s+className=["']App["'][^>]*>([\s\S]*?)<\/div>/i;
        const commentPattern = /(?:<!--|{\/\*)\s*(?:TodoList|component|Component).*?(?:-->|\*\/})/i;

        let insertPosition = -1;
        let insertContent = `<${componentName} />`;

        if (commentPattern.test(appContent)) {
          // Replace comment placeholder
          appContent = appContent.replace(commentPattern, insertContent);
          needsUpdate = true;
          console.log(`[WordsToCode] Replaced comment placeholder with ${componentName}`);
        } else {
          // Find <main> tag and insert component inside it
          const mainMatch = appContent.match(/(<main[^>]*>)([\s\S]*?)(<\/main>)/i);
          if (mainMatch) {
            const mainOpen = mainMatch[1];
            const mainContent = mainMatch[2];
            const mainClose = mainMatch[3];
            if (!mainContent.includes(componentName)) {
              appContent = appContent.replace(mainMatch[0], `${mainOpen}${mainContent}\n        ${insertContent}\n      ${mainClose}`);
              needsUpdate = true;
              console.log(`[WordsToCode] Added ${componentName} inside <main>`);
            }
          } else {
            // Try <div className="App">
            const divMatch = appContent.match(/(<div\s+className=["']App["'][^>]*>)([\s\S]*?)(<\/div>)/i);
            if (divMatch) {
              const divOpen = divMatch[1];
              const divContent = divMatch[2];
              const divClose = divMatch[3];
              if (!divContent.includes(componentName)) {
                appContent = appContent.replace(divMatch[0], `${divOpen}${divContent}\n        ${insertContent}\n      ${divClose}`);
                needsUpdate = true;
                console.log(`[WordsToCode] Added ${componentName} inside <div className="App">`);
              }
            } else {
              // Last resort: find return statement and insert before closing paren
              const returnMatch = appContent.match(/(return\s*\([\s\S]*?)(\)\s*;?\s*$)/m);
              if (returnMatch) {
                const returnBody = returnMatch[1];
                const closing = returnMatch[2];
                if (!returnBody.includes(componentName)) {
                  appContent = appContent.replace(returnMatch[0], `${returnBody}\n        ${insertContent}\n      ${closing}`);
                  needsUpdate = true;
                  console.log(`[WordsToCode] Added ${componentName} in return statement`);
                }
              }
            }
          }
        }
      }
    }

    if (needsUpdate) {
      console.log('[WordsToCode] Updated App.tsx/jsx to import and render components');
      // Update the file in the array
      const updatedFiles = files.map(f => 
        f === appFile ? { ...f, content: appContent } : f
      );
      return updatedFiles;
    }

    return files;
  };

  // Generate missing component files
  const generateMissingFiles = async (missingFiles: string[], existingFiles: { name: string; content: string; language: string }[]): Promise<{ name: string; content: string; language: string }[]> => {
    if (missingFiles.length === 0) return [];
    
    const newFiles: { name: string; content: string; language: string }[] = [];
    
    // Find the components directory from existing files
    const componentFile = existingFiles.find(f => f.name.includes('/components/'));
    const componentsDir = componentFile 
      ? componentFile.name.substring(0, componentFile.name.lastIndexOf('/'))
      : 'src/components';
    
    for (const componentName of missingFiles) {
      // Generate a placeholder component
      const isJsx = existingFiles.some(f => f.name.endsWith('.jsx'));
      const ext = isJsx ? 'jsx' : 'js';
      const fileName = `${componentsDir}/${componentName}.${ext}`;
      
      // Check if it's likely a CSS file
      if (componentName.endsWith('.css')) {
        newFiles.push({
          name: `${componentsDir}/${componentName}`,
          content: `/* ${componentName} styles */\n\n.container {\n  padding: 20px;\n}\n`,
          language: 'css'
        });
      } else {
        // Generate a React component
        newFiles.push({
          name: fileName,
          content: `import React from 'react';

const ${componentName} = () => {
  return (
    <div className="${componentName.toLowerCase()}">
      <h2>${componentName}</h2>
      <p>This component was auto-generated. Please customize it.</p>
    </div>
  );
};

export default ${componentName};
`,
          language: ext
        });
      }
    }
    
    return newFiles;
  };

  // Preview code generation
  const handlePreview = async () => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setShowPreview(true);

    try {
      const systemPrompt = `Generate a preview showing the project structure you would create.

Show:
1. Complete folder/file tree structure
2. Technologies and frameworks you'll use
3. Key features that will be implemented
4. Brief code snippets for main components

Format as a clear outline, not full code. Focus on architecture decisions.

Request: ${input.trim()}`;

      const response = await window.agentAPI.chat(input.trim(), {
        system_prompt: systemPrompt,
        use_agent_loop: false,
        agent_mode: false,
        words_to_code_mode: true,
        preview_mode: true
      });

      const aiResponse = response?.response || response?.content || response?.message || '';
      setPreviewCode(aiResponse);
      setPreviewFiles([]); // Could parse files here too

    } catch (error: any) {
      console.error('Preview error:', error);
      setPreviewCode(`**Error generating preview:** ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Smart dependency detection - scan files for imports/requires
  const detectDependencies = (files: { name: string; content: string; language: string }[]): { npm: string[]; pip: string[] } => {
    const npmDeps = new Set<string>();
    const pipDeps = new Set<string>();
    
    for (const file of files) {
      const content = file.content;
      
      // Detect npm dependencies
      if (file.name === 'package.json') {
        try {
          const pkg = JSON.parse(content);
          if (pkg.dependencies) {
            Object.keys(pkg.dependencies).forEach(dep => npmDeps.add(dep));
          }
          if (pkg.devDependencies) {
            Object.keys(pkg.devDependencies).forEach(dep => npmDeps.add(dep));
          }
        } catch (e) {
          // Not valid JSON, parse manually
          const depMatches = content.match(/"([^"]+)":\s*"[^"]+"/g);
          if (depMatches) {
            depMatches.forEach(match => {
              const dep = match.match(/"([^"]+)":/)?.[1];
              if (dep && !['name', 'version', 'description', 'main', 'scripts'].includes(dep)) {
                npmDeps.add(dep);
              }
            });
          }
        }
      }
      
      // Detect from require/import statements
      if (file.language === 'javascript' || file.language === 'typescript' || file.language === 'jsx' || file.language === 'tsx') {
        // require('package')
        const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g);
        if (requireMatches) {
          requireMatches.forEach(match => {
            const dep = match.match(/['"]([^'"]+)['"]/)?.[1];
            if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
              npmDeps.add(dep.split('/')[0]); // Handle scoped packages
            }
          });
        }
        
        // import ... from 'package'
        const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g);
        if (importMatches) {
          importMatches.forEach(match => {
            const dep = match.match(/['"]([^'"]+)['"]/)?.[1];
            if (dep && !dep.startsWith('.') && !dep.startsWith('/') && !dep.startsWith('http')) {
              npmDeps.add(dep.split('/')[0]);
            }
          });
        }
      }
      
      // Detect Python dependencies
      if (file.name === 'requirements.txt') {
        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const dep = trimmed.split(/[>=<]/)[0].trim();
            if (dep) pipDeps.add(dep);
          }
        });
      }
      
      if (file.language === 'python') {
        // import package
        const importMatches = content.match(/^(?:from|import)\s+([a-zA-Z0-9_]+)/gm);
        if (importMatches) {
          importMatches.forEach(match => {
            const dep = match.replace(/^(?:from|import)\s+/, '').split('.')[0].trim();
            if (dep && !['os', 'sys', 'json', 'datetime', 'time', 'random', 'math', 'collections', 'itertools', 'functools', 're'].includes(dep)) {
              pipDeps.add(dep);
            }
          });
        }
      }
    }
    
    return {
      npm: Array.from(npmDeps).filter(dep => !['fs', 'path', 'http', 'https', 'url', 'crypto', 'util', 'events', 'stream', 'buffer', 'child_process'].includes(dep)),
      pip: Array.from(pipDeps)
    };
  };

  // Auto-install dependencies - ENHANCED with better error handling
  const installDependencies = async (deps: { npm: string[]; pip: string[] }) => {
    if (!targetFolder) {
      console.warn('[WordsToCode] Cannot install dependencies: no target folder');
      return;
    }
    
    // Better path separator detection
    const isWindows = targetFolder.includes('\\') || /^[A-Za-z]:/.test(targetFolder);
    const pathSep = isWindows ? '\\' : '/';
    
    try {
      // Install npm dependencies
      if (deps.npm.length > 0 && autoInstallDeps) {
        const packageJsonPath = `${targetFolder}${pathSep}package.json`;
        const packageJsonExists = await checkFileExists(packageJsonPath);
        
        if (packageJsonExists.exists) {
          console.log('[WordsToCode] Installing npm dependencies:', deps.npm);
          
          // Show installing status
          setMessages(prev => [...prev, {
            id: `install-npm-${Date.now()}`,
            role: 'system',
            content: '📦 **Installing npm dependencies...**\n\nThis may take a minute.',
            timestamp: new Date()
          }]);
          
          try {
            // Use agentRunCommand which supports cwd parameter
            if (window.agentAPI.agentRunCommand) {
              const result = await window.agentAPI.agentRunCommand('npm install', targetFolder, 120);
              if (result.success) {
                console.log('[WordsToCode] npm dependencies installed successfully');
                setMessages(prev => [...prev, {
                  id: `install-npm-done-${Date.now()}`,
                  role: 'system',
                  content: '✅ **npm dependencies installed successfully!**',
                  timestamp: new Date()
                }]);
              } else {
                console.warn('[WordsToCode] npm install returned error:', result.error || result.stderr);
                setMessages(prev => [...prev, {
                  id: `install-npm-warn-${Date.now()}`,
                  role: 'system',
                  content: `⚠️ **npm install warning:** ${result.error || result.stderr || 'Unknown error'}\n\nYou may need to run \`npm install\` manually.`,
                  timestamp: new Date()
                }]);
              }
            } else if (window.agentAPI.runCommand) {
              // Fallback to runCommand (runs in workspace root)
              await window.agentAPI.runCommand(`cd "${targetFolder}" && npm install`);
              console.log('[WordsToCode] npm dependencies installed via runCommand');
            } else {
              // Fallback: show message
              console.log('[WordsToCode] Auto-install not available. Run: cd ' + targetFolder + ' && npm install');
              setMessages(prev => [...prev, {
                id: `install-npm-manual-${Date.now()}`,
                role: 'system',
                content: `📋 **Manual install required:**\n\n\`\`\`bash\ncd "${targetFolder}"\nnpm install\n\`\`\``,
                timestamp: new Date()
              }]);
            }
          } catch (e: any) {
            console.warn('[WordsToCode] Could not auto-install npm dependencies:', e);
            setMessages(prev => [...prev, {
              id: `install-npm-error-${Date.now()}`,
              role: 'system',
              content: `⚠️ **npm install failed:** ${e.message || 'Unknown error'}\n\nRun manually: \`cd "${targetFolder}" && npm install\``,
              timestamp: new Date()
            }]);
          }
        }
      }
      
      // Install pip dependencies
      if (deps.pip.length > 0 && autoInstallDeps) {
        const requirementsPath = `${targetFolder}${pathSep}requirements.txt`;
        const requirementsExists = await checkFileExists(requirementsPath);
        
        if (requirementsExists.exists) {
          console.log('[WordsToCode] Installing pip dependencies:', deps.pip);
          
          setMessages(prev => [...prev, {
            id: `install-pip-${Date.now()}`,
            role: 'system',
            content: '🐍 **Installing pip dependencies...**',
            timestamp: new Date()
          }]);
          
          try {
            if (window.agentAPI.agentRunCommand) {
              const result = await window.agentAPI.agentRunCommand('pip install -r requirements.txt', targetFolder, 120);
              if (result.success) {
                console.log('[WordsToCode] pip dependencies installed successfully');
                setMessages(prev => [...prev, {
                  id: `install-pip-done-${Date.now()}`,
                  role: 'system',
                  content: '✅ **pip dependencies installed successfully!**',
                  timestamp: new Date()
                }]);
              } else {
                console.warn('[WordsToCode] pip install error:', result.error || result.stderr);
              }
            } else if (window.agentAPI.runCommand) {
              await window.agentAPI.runCommand(`cd "${targetFolder}" && pip install -r requirements.txt`);
            } else {
              console.log('[WordsToCode] Auto-install not available. Run: cd ' + targetFolder + ' && pip install -r requirements.txt');
            }
          } catch (e: any) {
            console.warn('[WordsToCode] Could not auto-install pip dependencies:', e);
            setMessages(prev => [...prev, {
              id: `install-pip-error-${Date.now()}`,
              role: 'system',
              content: `⚠️ **pip install failed:** ${e.message || 'Unknown error'}\n\nRun manually: \`cd "${targetFolder}" && pip install -r requirements.txt\``,
              timestamp: new Date()
            }]);
          }
        }
      }
    } catch (error: any) {
      console.error('[WordsToCode] Error installing dependencies:', error);
    }
  };

  // Generate visual preview
  const generateVisualPreview = async (files: { name: string; content: string; language: string }[]) => {
    const htmlFile = files.find(f => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase() === 'index.html');
    const cssFile = files.find(f => f.name.toLowerCase().endsWith('.css'));
    const jsFile = files.find(f => f.name.toLowerCase().endsWith('.js') && !f.name.includes('config'));
    
    if (!htmlFile) {
      setPreviewHtml('<p>No HTML file found for preview</p>');
      return;
    }
    
    // Create a complete preview HTML with inline styles and scripts
    let previewContent = htmlFile.content;
    
    // Inject CSS if available
    if (cssFile) {
      const styleTag = `<style>${cssFile.content}</style>`;
      if (previewContent.includes('</head>')) {
        previewContent = previewContent.replace('</head>', `${styleTag}</head>`);
      } else if (previewContent.includes('<head>')) {
        previewContent = previewContent.replace('<head>', `<head>${styleTag}`);
      } else {
        previewContent = styleTag + previewContent;
      }
    }
    
    // Inject JS if available
    if (jsFile) {
      // Detect ES module imports and Three.js usage
      const hasEsModuleImports = jsFile.content.includes('import ') && jsFile.content.includes(' from ');
      const hasThreeJs = jsFile.content.includes('THREE') || jsFile.content.includes('three');
      const hasCdnScripts = previewContent.includes('cdnjs.cloudflare.com') || 
                           previewContent.includes('unpkg.com') || 
                           previewContent.includes('jsdelivr.net') ||
                           previewContent.includes('cdn.');
      
      // WARNING: ES module imports (import X from 'package') will FAIL in inline scripts!
      // This is because browsers can't resolve npm package names without a bundler like Vite
      if (hasEsModuleImports) {
        console.warn('[Visual Preview] JS file has ES module imports - showing Vite instructions instead');
        
        // Show a helpful message instead of broken preview
        const viteInstructions = `
          <div style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; color: #e4e4e7; background: linear-gradient(135deg, #18181b 0%, #27272a 100%); min-height: 100vh; box-sizing: border-box;">
            <h2 style="color: #fbbf24; margin-bottom: 20px;">⚡ Vite Project Detected</h2>
            <p style="margin-bottom: 16px; line-height: 1.6;">
              This project uses <strong>ES Module imports</strong> (like <code style="background: #3f3f46; padding: 2px 6px; border-radius: 4px;">import * as THREE from "three"</code>) 
              which require a bundler to run.
            </p>
            <div style="background: #3f3f46; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #a78bfa; margin-bottom: 12px;">🚀 To run this project:</h3>
              <ol style="line-height: 1.8; padding-left: 20px;">
                <li>Open a terminal in the project folder</li>
                <li>Run: <code style="background: #52525b; padding: 2px 6px; border-radius: 4px; color: #22c55e;">npm install</code></li>
                <li>Run: <code style="background: #52525b; padding: 2px 6px; border-radius: 4px; color: #22c55e;">npm run dev</code></li>
                <li>Open <code style="background: #52525b; padding: 2px 6px; border-radius: 4px;">http://localhost:5173</code> in your browser</li>
              </ol>
            </div>
            <p style="color: #a1a1aa; font-size: 14px; margin-top: 20px;">
              💡 The Visual Preview cannot run npm-based projects directly. Use the terminal commands above to see your ${hasThreeJs ? 'Three.js 3D scene' : 'project'}.
            </p>
          </div>
        `;
        setPreviewHtml(viteInstructions);
        setShowVisualPreview(true);
        return;
      }
      
      // WARNING: CDN scripts (Three.js, etc.) may not load in preview iframe
      // Show launch instructions for 3D games
      if (hasThreeJs && hasCdnScripts) {
        console.warn('[Visual Preview] Three.js CDN game - showing launch instructions');
        
        const launchInstructions = `
          <div style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; color: #e4e4e7; background: linear-gradient(135deg, #18181b 0%, #27272a 100%); min-height: 100vh; box-sizing: border-box;">
            <h2 style="color: #22c55e; margin-bottom: 20px;">🎮 Three.js Game Ready!</h2>
            <p style="margin-bottom: 16px; line-height: 1.6;">
              This is a <strong>3D game</strong> that uses Three.js from CDN. The preview iframe has limitations with external scripts, 
              but the game works perfectly when launched!
            </p>
            <div style="background: #3f3f46; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #a78bfa; margin-bottom: 12px;">🚀 To play the game:</h3>
              <ol style="line-height: 1.8; padding-left: 20px;">
                <li>Click <strong>"🚀 Launch Project"</strong> button above</li>
                <li>Or double-click <code style="background: #52525b; padding: 2px 6px; border-radius: 4px;">start.bat</code> in the folder</li>
                <li>Or open <code style="background: #52525b; padding: 2px 6px; border-radius: 4px;">index.html</code> directly in your browser</li>
              </ol>
            </div>
            <div style="background: #1f2937; border: 1px solid #374151; padding: 16px; border-radius: 8px; margin-top: 20px;">
              <div style="color: #9ca3af; font-size: 13px; margin-bottom: 8px;">Game files created:</div>
              <div style="color: #10b981; font-family: monospace; font-size: 14px;">
                ✓ index.html (game HTML + UI)<br/>
                ✓ styles.css (game styling)<br/>
                ✓ script.js (game logic + Three.js)<br/>
                ✓ start.bat (launcher)
              </div>
            </div>
            <p style="color: #a1a1aa; font-size: 14px; margin-top: 20px;">
              💡 The buttons and gameplay will work perfectly when launched in your browser!
            </p>
          </div>
        `;
        setPreviewHtml(launchInstructions);
        setShowVisualPreview(true);
        return;
      }
      
      const scriptTag = `<script>${jsFile.content}</script>`;
      if (previewContent.includes('</body>')) {
        previewContent = previewContent.replace('</body>', `${scriptTag}</body>`);
      } else {
        previewContent = previewContent + scriptTag;
      }
    }
    
    setPreviewHtml(previewContent);
    setShowVisualPreview(true);
  };

  // Process files after generation - check for conflicts
  // FIXED: Improved path handling for Windows compatibility
  const processFilesWithConflictCheck = async (files: { name: string; content: string; language: string }[]): Promise<GeneratedFile[]> => {
    if (!targetFolder || targetFolder.trim() === '') {
      throw new Error('Target folder is not set. Please select a folder first.');
    }
    
    // Detect path separator from target folder (Windows uses backslash)
    const isWindows = targetFolder.includes('\\') || /^[A-Za-z]:/.test(targetFolder);
    const pathSep = isWindows ? '\\' : '/';
    const conflicts: FileConflict[] = [];
    const generatedFiles: GeneratedFile[] = [];
    
    console.log('[WordsToCode] Processing', files.length, 'files to folder:', targetFolder, '(Windows:', isWindows, ')');
    
    setGenerationProgress({ current: 0, total: files.length, currentFile: 'Checking files...' });
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file has content
      if (!file.content || file.content.trim().length === 0) {
        console.warn('[WordsToCode] Skipping empty file:', file.name);
        generatedFiles.push({
          path: '',
          name: file.name,
          language: file.language,
          status: 'error',
          error: 'File has no content'
        });
        continue;
      }
      
      // Sanitize filename - remove invalid characters for Windows
      let sanitizedName = file.name;
      if (isWindows) {
        // Remove characters not allowed in Windows filenames: < > : " | ? *
        sanitizedName = sanitizedName.replace(/[<>:"|?*]/g, '_');
      }
      
      // Normalize path separators consistently
      const normalizedFileName = sanitizedName.replace(/[/\\]/g, pathSep);
      
      // Build full path with proper separator handling
      const cleanTargetFolder = targetFolder.replace(/[/\\]+$/, ''); // Remove trailing slashes
      const filePath = `${cleanTargetFolder}${pathSep}${normalizedFileName}`;
      
      setGenerationProgress({ current: i + 1, total: files.length, currentFile: file.name });
      
      // Check if file exists
      const existingFile = await checkFileExists(filePath);
      
      if (existingFile.exists && !overwriteAll) {
        conflicts.push({
          path: filePath,
          name: file.name,
          existingContent: existingFile.content || '',
          newContent: file.content,
          language: file.language
        });
        generatedFiles.push({
          path: filePath,
          name: file.name,
          language: file.language,
          status: 'pending',
          existingContent: existingFile.content,
          newContent: file.content
        });
      } else {
        // Write file directly
        try {
          const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
          const dirPath = filePath.substring(0, lastSlashIndex);
          if (dirPath && dirPath !== targetFolder) {
            try {
              await window.agentAPI.createItem(dirPath, true);
            } catch (e) {
              // Directory might already exist
            }
          }
          
          console.log('[WordsToCode] Writing file:', filePath);
          const writeResult = await window.agentAPI.writeFile(filePath, file.content);
          
          if (!writeResult.success) {
            console.error('[WordsToCode] Failed to write file:', filePath, writeResult.error);
          } else {
            console.log('[WordsToCode] Successfully wrote:', filePath);
          }
          
          generatedFiles.push({
            path: filePath,
            name: file.name,
            language: file.language,
            status: writeResult.success ? (existingFile.exists ? 'overwritten' : 'created') : 'error',
            error: writeResult.success ? undefined : (writeResult.error || 'Unknown error')
          });
        } catch (error: any) {
          console.error('[WordsToCode] Exception writing file:', filePath, error);
          generatedFiles.push({
            path: filePath,
            name: file.name,
            language: file.language,
            status: 'error',
            error: error.message || String(error)
          });
        }
      }
    }
    
    setGenerationProgress({ current: 0, total: 0, currentFile: '' });
    
    if (conflicts.length > 0) {
      setFileConflicts(conflicts);
      setPendingFiles(files);
      setShowConflictModal(true);
    }
    
    return generatedFiles;
  };

  // Handle conflict resolution
  const handleConflictResolution = async (action: 'overwrite-all' | 'skip-all' | 'individual', individualChoices?: Record<string, 'overwrite' | 'skip'>) => {
    setShowConflictModal(false);
    const pathSep = targetFolder.includes('\\') ? '\\' : '/';
    const results: GeneratedFile[] = [];
    
    for (const conflict of fileConflicts) {
      const shouldOverwrite = action === 'overwrite-all' || 
        (action === 'individual' && individualChoices?.[conflict.path] === 'overwrite');
      
      if (shouldOverwrite) {
        try {
          const writeResult = await window.agentAPI.writeFile(conflict.path, conflict.newContent);
          results.push({
            path: conflict.path,
            name: conflict.name,
            language: conflict.language,
            status: writeResult.success ? 'overwritten' : 'error',
            error: writeResult.success ? undefined : writeResult.error
          });
        } catch (error: any) {
          results.push({
            path: conflict.path,
            name: conflict.name,
            language: conflict.language,
            status: 'error',
            error: error.message
          });
        }
      } else {
        results.push({
          path: conflict.path,
          name: conflict.name,
          language: conflict.language,
          status: 'skipped'
        });
      }
    }
    
    // Update the last message with conflict resolution results
    setMessages(prev => {
      const newMessages = [...prev];
      const lastAssistantIdx = newMessages.findIndex((m, i) => 
        m.role === 'assistant' && i === newMessages.length - 1
      );
      if (lastAssistantIdx >= 0 && newMessages[lastAssistantIdx].files) {
        const updatedFiles = newMessages[lastAssistantIdx].files!.map(f => {
          const result = results.find(r => r.path === f.path);
          return result || f;
        });
        newMessages[lastAssistantIdx] = {
          ...newMessages[lastAssistantIdx],
          files: updatedFiles
        };
      }
      return newMessages;
    });
    
    setFileConflicts([]);
    setPendingFiles([]);
  };

  // Send message and generate code
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    if (!targetFolder) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'system',
        content: '**Please select a target folder first!**\n\nClick "Select Folder" above to choose where your files will be created.',
        timestamp: new Date()
      }]);
      showStatus('warning', 'Please select a target folder first!');
      return;
    }

    // Pre-generation: Ensure workspace is set correctly
    try {
      const currentWorkspace = await window.agentAPI.getWorkspace();
      if (currentWorkspace !== targetFolder) {
        console.log('[WordsToCode] Workspace mismatch, setting to:', targetFolder);
        await window.agentAPI.setWorkspace(targetFolder);
      }
    } catch (e) {
      console.warn('[WordsToCode] Could not verify/set workspace:', e);
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    let currentInput = input.trim();
    setInput('');
    setIsLoading(true);
    setStreamingContent('');
    setStatusMessage(null); // Clear any previous status

    try {
      // Handle iterative refinement mode
      if (refinementMode && refinementTarget) {
        // Read existing files to improve them
        try {
          const existingFiles: { name: string; content: string }[] = [];
          const commonFiles = ['index.html', 'styles.css', 'script.js', 'app.js', 'App.jsx', 'App.vue'];
          
          for (const fileName of commonFiles) {
            try {
              const filePath = `${refinementTarget}${refinementTarget.endsWith('\\') || refinementTarget.endsWith('/') ? '' : '\\'}${fileName}`;
              const result = await window.agentAPI.readFile(filePath);
              if (result.success && result.content) {
                existingFiles.push({ name: fileName, content: result.content });
              }
            } catch (e) {
              // File doesn't exist, skip
            }
          }
          
          if (existingFiles.length > 0) {
            const filesContext = existingFiles.map(f => `\n\nFILE: ${f.name}\n\`\`\`\n${f.content.slice(0, 500)}...\n\`\`\``).join('');
            currentInput = `IMPROVE EXISTING PROJECT:\n\nUser wants: ${currentInput}\n\nCurrent files:${filesContext}\n\nPlease improve these files according to the user's request. Keep the same file structure but enhance the code.`;
          }
        } catch (e) {
          console.warn('[WordsToCode] Could not read existing files for refinement:', e);
        }
      }
      
      // Enhance with project type context
      const projectTypeEnhancement = getProjectTypePrompt(projectType);
      if (projectTypeEnhancement) {
        currentInput = `${currentInput}\n\nProject Type Requirements: ${projectTypeEnhancement}`;
      }
      
      // Enhance vague requests to be more specific
      const lowerInput = currentInput.toLowerCase();
      if (lowerInput.includes('website') || lowerInput.includes('site') || lowerInput.includes('web')) {
        if (!lowerInput.includes('react') && !lowerInput.includes('vue') && !lowerInput.includes('framework') && projectType === 'auto') {
          currentInput = `${currentInput} - Create a complete modern web project with Vite, proper folder structure (src/, public/), package.json, README.md, and all necessary files. Use modern JavaScript/TypeScript.`;
        }
      }
      
      // Get design style details
      const styleConfig = DESIGN_STYLES[designStyle];
      const styleColors = styleConfig.colors as { primary: string; secondary: string; accent: string; bg?: string };
      const styleFeatures = styleConfig.features.join(', ');
      
      // Use TEXT mode for reliable file generation
      const usingAgentLoop = false;
      
      // Auto-detect if user is asking for a game (even if projectType is 'auto')
      const gameKeywords = ['game', 'three.js', 'threejs', 'three js', '3d', 'webgl', 'canvas game', 'phaser', 'pixi', 'simulator', 'player', 'gameplay', 'shoot', 'platformer', 'rpg', 'arcade'];
      const isGameRequest = projectType === 'game' || 
        gameKeywords.some(keyword => currentInput.toLowerCase().includes(keyword));
      
      // Build a creative, high-quality system prompt
      const systemPrompt = `You are an ELITE web developer who creates stunning, award-winning websites. Your code is creative, themed, and visually impressive.

${isGameRequest ? `
#############################################################
## CRITICAL WARNING FOR GAME PROJECTS - READ THIS FIRST!!! ##
#############################################################

DO NOT USE ES MODULES OR IMPORT MAPS! THEY DO NOT WORK!

When users double-click index.html, browsers block ES module imports due to CORS.
This means the following WILL NOT WORK and WILL cause a blank/dark screen:

WRONG (DO NOT DO THIS):
<script type="importmap">...</script>
<script type="module" src="game.js"></script>
import * as THREE from 'three';

CORRECT (DO THIS INSTEAD):
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="game.js"></script>
// In game.js, use THREE directly as a global (NO import statements)

You MUST use traditional <script> tags with global CDN builds.
Your game.js file MUST NOT contain any 'import' or 'export' statements.
THREE will be available as a global variable from the CDN script.

#############################################################
` : ''}

${usingAgentLoop ? `## AGENT MODE ENABLED - USE TOOL CALLS

You have access to powerful tools! Use them to create files directly:

**AVAILABLE TOOLS:**
- write_file: {"name": "write_file", "arguments": {"path": "index.html", "content": "..."}}
- read_file: {"name": "read_file", "arguments": {"path": "file.js"}}
- run_command: {"name": "run_command", "arguments": {"command": "npm install"}}
- list_dir: {"name": "list_dir", "arguments": {"path": "."}}
- search_codebase: {"name": "search_codebase", "arguments": {"query": "pattern"}}
- scaffold_project: {"name": "scaffold_project", "arguments": {"project_type": "html_game", "project_name": "MyProject"}}

**WORKFLOW:**
1. Plan the project structure
2. Use write_file tool to create ALL files
3. Use run_command to install dependencies if needed
4. Test with run_command if applicable
5. Mark done when complete: {"done": true, "message": "Project created successfully!"}

**CRITICAL:** Create ALL files using write_file tool calls. Don't just describe them - CREATE them!

**RESPONSE FORMAT:** Output JSON with tool calls:
{"name": "write_file", "arguments": {"path": "index.html", "content": "..."}}

OR for multiple files, use multiple tool calls in sequence.

` : `## OUTPUT FORMAT - TEXT MODE

Use FILE: blocks in your response:

FILE: filename.ext
\`\`\`language
full code here
\`\`\`

`}

## DESIGN STYLE: ${styleConfig.label.toUpperCase()}

Create a ${styleConfig.description} design.
Features: ${styleFeatures}
Colors: Primary ${styleColors.primary || '#6366f1'}, Secondary ${styleColors.secondary || '#06b6d4'}, Accent ${styleColors.accent || '#10b981'}${styleColors.bg ? `, Background ${styleColors.bg}` : ''}

Include: CSS variables, Google Fonts, gradients, glassmorphism, @keyframes animations (float, fade, pulse), hover effects with transforms, responsive @media queries. MINIMUM 400 lines.

## JAVASCRIPT REQUIREMENTS (200+ lines)
Include: Class-based App structure, IntersectionObserver for scroll animations, counter animations, form validation, toast notifications, smooth scrolling, navbar scroll effects, mobile menu toggle.

## HTML REQUIREMENTS
Semantic structure (header, nav, main, sections, footer), 5+ sections, decorative elements, loading overlay, forms with validation.

## CREATIVE THEMING
Invent unique names/taglines matching the request. Use themed emojis throughout. Make it fun and engaging!

${projectType === 'static' || projectType === 'auto' ? `
## FILES TO GENERATE

FILE: index.html - Full themed HTML with all sections
FILE: styles.css - 400+ lines of stunning CSS
FILE: script.js - 200+ lines of interactive JavaScript  
FILE: start.bat - Opens the site
FILE: README.md - Project description` : ''}

${isGameRequest ? `
##############################################################################
##                    ⚠️  CRITICAL - READ THIS FIRST  ⚠️                    ##
##############################################################################

THIS GAME MUST WORK WHEN USER DOUBLE-CLICKS index.html (file:// protocol).
ES MODULES DO NOT WORK ON file:// - THE GAME WILL BE COMPLETELY BROKEN!

##############################################################################
##                    ❌ BANNED CODE - CAUSES BROKEN GAME ❌                 ##
##############################################################################

THE FOLLOWING CODE PATTERNS WILL MAKE THE GAME NON-FUNCTIONAL:

❌ <script type="module"> - BANNED! Buttons won't work!
❌ <script type="importmap"> - BANNED! Nothing will load!
❌ import * as THREE from "https://..." - BANNED! Even CDN URLs fail!
❌ import { X } from "..." - BANNED! Any import statement breaks it!
❌ export function/class/const - BANNED!

Why? ES modules have CORS restrictions. file:// has null origin.
The browser silently blocks ALL module loading. JavaScript never runs.
Result: Beautiful game that looks perfect but ZERO buttons work.

##############################################################################
##                    ✅ REQUIRED CODE - MAKES GAME WORK ✅                  ##
##############################################################################

THE ONLY WAY TO MAKE THREE.JS WORK ON file:// IS:

In index.html - use GLOBAL SCRIPT TAGS (not modules):
\`\`\`html
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
  <!-- Game content here -->
  <script src="game.js"></script>  <!-- NO type="module"! -->
</body>
\`\`\`

In game.js - NO IMPORTS, use global THREE:
\`\`\`javascript
// THREE is already global from CDN - just use it directly
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
const controls = new THREE.OrbitControls(camera, renderer.domElement);
\`\`\`

##############################################################################

### FOR 2D CANVAS GAMES:
Use vanilla JavaScript with Canvas API - no dependencies needed.
Put ALL game code in a single game.js file with NO imports.

### FILES TO GENERATE (EXACTLY THESE):
FILE: index.html - Game HTML with canvas, UI, CDN <script> tags (NOT type="module"!)
FILE: styles.css - Game UI styling (HUD, menus, animations)
FILE: game.js - ALL game logic, NO import/export statements, uses global THREE
FILE: start.bat - Opens index.html in browser
FILE: README.md - Controls and description

### VALIDATION CHECKLIST (ALL MUST BE TRUE):
☑ index.html has NO <script type="module">
☑ index.html has NO <script type="importmap">
☑ game.js has NO 'import' keyword anywhere
☑ game.js has NO 'export' keyword anywhere
☑ game.js uses THREE directly (global from CDN)
☑ All buttons have working addEventListener calls
☑ Start button hides menu and starts game loop
☑ Game actually runs when double-clicking index.html

### GAME MUST INCLUDE (ALL FUNCTIONAL):
- Start/title screen with "Click to Play" or "Start Game" button
- The start button MUST have a working click handler that hides the menu and starts the game loop
- WASD/Arrow movement that actually moves the player
- Collision detection that works
- Score/Health display that updates in real-time
- Game over screen with working restart button (use location.reload())
- Victory screen with working restart button
- All UI elements must be functional - wire up ALL button click handlers

### EXAMPLE COMPLETE GAME STRUCTURE:
\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <title>Game</title>
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <canvas id="gameCanvas"></canvas>
  <div id="start-screen"><button id="start-btn">START GAME</button></div>
  <div id="hud"><div id="health">Health: 100</div><div id="score">Score: 0</div></div>
  <div id="game-over"><h1>GAME OVER</h1><button onclick="location.reload()">Restart</button></div>
  <div id="victory"><h1>YOU WIN!</h1><button onclick="location.reload()">Play Again</button></div>
  <script src="game.js"></script>
</body>
</html>
\`\`\`

\`\`\`javascript
// game.js - NO IMPORTS, uses global THREE
let scene, camera, renderer, player;
let gameStarted = false;
let health = 100, score = 0;

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // ... setup scene, player, enemies ...
}

function startGame() {
  document.getElementById('start-screen').style.display = 'none';
  gameStarted = true;
  animate();
}

function animate() {
  if (!gameStarted) return;
  requestAnimationFrame(animate);
  // ... game logic ...
  renderer.render(scene, camera);
}

// Event listeners AFTER DOM loads
document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('start-btn').addEventListener('click', startGame);
});
\`\`\`

### PROCEDURAL 3D MODELS (use global THREE):
\`\`\`javascript
function createZombie() {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.0, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x4a4a4a })
  );
  torso.position.y = 1.2;
  group.add(torso);
  // ... head, arms, legs ...
  return group;
}
\`\`\`

### DARK/GOTHIC VISUAL STYLE:
- Dark atmosphere (dark browns #2c1d16, grays #3e2723, muted reds #8b0000)
- Isometric or third-person camera
- Point lights for torches/spells
- Fog: scene.fog = new THREE.Fog(0x0c0a10, 10, 50)
- Enemy health bars above heads
- Damage numbers floating up with CSS animation
- Death animations using scale/opacity tweening` : ''}

${projectType === 'react' ? `
## FILES TO GENERATE

FILE: package.json - With vite, react, react-dom
FILE: vite.config.js - React plugin config
FILE: index.html - Root with div#root and fonts
FILE: src/main.jsx - React entry
FILE: src/App.jsx - Main app with routing
FILE: src/App.css - Global styles (400+ lines)
FILE: src/components/*.jsx - Each component in separate file
FILE: start.bat - npm dev launcher` : ''}

${projectType === 'python' ? `
## FILES TO GENERATE

FILE: requirements.txt - flask, python-dotenv
FILE: run.py - Flask app entry
FILE: app/__init__.py - App factory
FILE: app/routes.py - All routes
FILE: templates/base.html - Base template
FILE: templates/index.html - Home page
FILE: static/css/styles.css - 400+ lines CSS
FILE: static/js/script.js - Interactive JS
FILE: start.bat - Python launcher` : ''}

${projectType === 'node' ? `
## FILES TO GENERATE

FILE: package.json - express, cors, dotenv
FILE: src/index.js - Express server
FILE: src/routes/api.js - API routes
FILE: public/index.html - Frontend
FILE: public/css/styles.css - Styling
FILE: public/js/script.js - Frontend JS
FILE: start.bat - Node launcher` : ''}

## CRITICAL RULES
1. COMPLETE every file - never truncate code
2. ROOT LEVEL files only - no unnecessary subdirectories  
3. WORKING start.bat that runs immediately
4. Generate ALL imported files
5. BE CREATIVE - unique themed names, animations, personality!

## START.BAT - ALWAYS INCLUDE THIS EXACT FILE

${projectType === 'static' || projectType === 'auto' || isGameRequest ? `FILE: start.bat
\`\`\`batch
@echo off
title Project Launcher
echo ================================
echo   Opening your project...
echo ================================
echo.
start "" "index.html"
echo Project opened in browser!
timeout /t 2 >nul
\`\`\`` : ''}

${projectType === 'react' || projectType === 'vue' || projectType === 'nextjs' ? `FILE: start.bat
\`\`\`batch
@echo off
title Project Launcher
echo ================================
echo   Starting Development Server
echo ================================
echo.
where node >nul 2>&1 || (echo ERROR: Node.js not found! Install from nodejs.org & pause & exit /b 1)
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
echo.
echo Starting server...
npm run dev
pause
\`\`\`` : ''}

${projectType === 'node' ? `FILE: start.bat
\`\`\`batch
@echo off
title Node.js Server
echo ================================
echo   Starting Node.js Server
echo ================================
echo.
where node >nul 2>&1 || (echo ERROR: Node.js not found! Install from nodejs.org & pause & exit /b 1)
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
echo.
echo Server starting on http://localhost:3000
node src/index.js
pause
\`\`\`` : ''}

${projectType === 'python' ? `FILE: start.bat
\`\`\`batch
@echo off
title Python Server
echo ================================
echo   Starting Python Server
echo ================================
echo.
where python >nul 2>&1 && (set PYTHON_CMD=python& goto :found)
where py >nul 2>&1 && (set PYTHON_CMD=py& goto :found)
echo ERROR: Python not found! Install from python.org & pause & exit /b 1
:found
if not exist venv (
    echo Creating virtual environment...
    %PYTHON_CMD% -m venv venv
)
call venv\\Scripts\\activate.bat
pip install -r requirements.txt --quiet
echo.
echo Server starting...
%PYTHON_CMD% run.py
pause
\`\`\`` : ''}

${projectType === 'fullstack' ? `FILE: start.bat
\`\`\`batch
@echo off
title Full-Stack Launcher
echo ================================
echo   Full-Stack Project Launcher
echo ================================
echo.
where node >nul 2>&1 || (echo ERROR: Node.js not found! Install from nodejs.org & pause & exit /b 1)
echo Installing dependencies...
npm install
echo.
echo Starting server on http://localhost:3000
npm start
pause
\`\`\`

IMPORTANT: For fullstack, create a SINGLE package.json in the ROOT with both frontend and backend. Use Express to serve static files. Do NOT create separate client/server folders.` : ''}

${projectType === 'electron' ? `FILE: start.bat
\`\`\`batch
@echo off
title Electron App Launcher
echo ================================
echo   Starting Electron App
echo ================================
echo.
where node >nul 2>&1 || (echo ERROR: Node.js not found! Install from nodejs.org & pause & exit /b 1)
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
echo.
echo Launching app...
npm start
pause
\`\`\`` : ''}

${projectType === 'chrome' ? `FILE: start.bat
\`\`\`batch
@echo off
title Chrome Extension
echo ================================
echo   Chrome Extension Ready
echo ================================
echo.
echo To install this extension:
echo 1. Open Chrome and go to chrome://extensions/
echo 2. Enable "Developer mode" (top right)
echo 3. Click "Load unpacked"
echo 4. Select this folder
echo.
echo Opening Chrome extensions page...
start chrome://extensions/
pause
\`\`\`` : ''}

${projectType === 'cli' ? `FILE: start.bat
\`\`\`batch
@echo off
title CLI Tool
echo ================================
echo   CLI Tool Setup
echo ================================
echo.
where node >nul 2>&1 || (echo ERROR: Node.js not found! Install from nodejs.org & pause & exit /b 1)
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
echo.
echo CLI tool ready! Run with: node src/index.js --help
node src/index.js --help
pause
\`\`\`` : ''}

Now generate a STUNNING, CREATIVE, fully-functional project. NO explanations - just output the FILE: blocks with complete code.`;

      // Use TEXT mode for reliability - agent loop can be inconsistent
      const response = await window.agentAPI.chat(currentInput, {
        system_prompt: systemPrompt,
        use_agent_loop: false,  // Use text mode for reliable FILE: blocks
        agent_mode: false,
        words_to_code_mode: true,
        target_folder: targetFolder,
        workspace_path: targetFolder
      });

      if (response?.success === false) {
        throw new Error(response.error || 'Failed to generate code');
      }

      const aiResponse = response?.response || response?.content || response?.message || '';
      
      // Debug logging
      console.log('[WordsToCode] Response received:', {
        hasResponse: !!response,
        responseKeys: response ? Object.keys(response) : [],
        aiResponseLength: aiResponse?.length || 0,
        aiResponsePreview: aiResponse?.slice(0, 500) || '(empty)'
      });
      
      if (!aiResponse || aiResponse.length < 50) {
        console.error('[WordsToCode] AI response is empty or too short:', aiResponse);
        throw new Error(`AI response was empty or too short (${aiResponse?.length || 0} chars). The model may not have responded. Check your AI provider settings.`);
      }
      
      // Check if agent loop was used and files were already written
      let files: { name: string; content: string; language: string }[] = [];
      let content = aiResponse;
      
      // If agent loop was used, it writes files directly - we need to read them back
      if (response?.agent_loop_used || response?.files_created) {
        console.log('[WordsToCode] Agent loop was used, files may already be written');
        
        // Try to read files that were created (if agent loop provides this info)
        if (response.files_created && Array.isArray(response.files_created)) {
          for (const filePath of response.files_created) {
            try {
              const fileResult = await window.agentAPI.readFile(filePath);
              if (fileResult.success && fileResult.content) {
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                const ext = fileName.split('.').pop()?.toLowerCase() || 'text';
                files.push({
                  name: fileName,
                  content: fileResult.content,
                  language: ext
                });
              }
            } catch (e) {
              console.warn('[WordsToCode] Could not read agent-created file:', filePath, e);
            }
          }
        }
        
        // Also try parsing text response for FILE: blocks (fallback)
        if (files.length === 0) {
          const parsed = parseFilesFromResponse(aiResponse);
          files = parsed.files;
          content = parsed.content;
        }
      } else {
        // Normal text parsing mode
        const parsed = parseFilesFromResponse(aiResponse);
        files = parsed.files;
        content = parsed.content;
      }

      console.log('[WordsToCode] Parsed files:', files.length, files.map(f => f.name));
      
      // If no files were parsed, show more detailed error
      if (files.length === 0) {
        console.error('[WordsToCode] No files parsed from response. Response sample:', aiResponse.slice(0, 1000));
        
        // Check if response has code blocks but no FILE: markers
        const hasCodeBlocks = /```[\s\S]*?```/.test(aiResponse);
        const hasFileMarkers = /FILE:/i.test(aiResponse);
        
        if (hasCodeBlocks && !hasFileMarkers) {
          console.warn('[WordsToCode] Response has code blocks but no FILE: markers');
          // Try to salvage by looking for common file patterns
          const htmlMatch = aiResponse.match(/```html\n([\s\S]*?)```/);
          const cssMatch = aiResponse.match(/```css\n([\s\S]*?)```/);
          const jsMatch = aiResponse.match(/```(?:javascript|js)\n([\s\S]*?)```/);
          
          if (htmlMatch) files.push({ name: 'index.html', content: htmlMatch[1].trim(), language: 'html' });
          if (cssMatch) files.push({ name: 'styles.css', content: cssMatch[1].trim(), language: 'css' });
          if (jsMatch) files.push({ name: 'script.js', content: jsMatch[1].trim(), language: 'javascript' });
          
          console.log('[WordsToCode] Salvaged files from code blocks:', files.map(f => f.name));
        }
      }

      // Check for truncated files (incomplete code) - ENHANCED DETECTION
      const truncatedFiles = files.filter(f => {
        const content = f.content.trim();
        const contentLower = content.toLowerCase();
        
        // Check for common truncation indicators
        const hasUnclosedBrace = (content.match(/\{/g) || []).length > (content.match(/\}/g) || []).length;
        const hasUnclosedParen = (content.match(/\(/g) || []).length > (content.match(/\)/g) || []).length;
        const hasUnclosedBracket = (content.match(/\[/g) || []).length > (content.match(/\]/g) || []).length;
        
        // Check for abrupt endings
        const endsAbruptly = content.endsWith('...') || 
                            content.endsWith('// ...') || 
                            content.endsWith('/* ...') || 
                            content.endsWith('/* more') ||
                            content.endsWith('// more') ||
                            content.endsWith('// etc') ||
                            content.endsWith('// TODO') ||
                            content.endsWith(',') || 
                            content.endsWith('{') || 
                            content.endsWith('(') ||
                            content.endsWith('[') ||
                            content.endsWith(':') ||
                            /\/\/\s*\.{3,}\s*$/.test(content) || // ends with // ... 
                            /\/\*\s*\.{3,}\s*\*?\/?\s*$/.test(content); // ends with /* ... */
        
        // Check for placeholder comments indicating incomplete code
        const hasPlaceholderComments = contentLower.includes('// add more') ||
                                       contentLower.includes('// implement') ||
                                       contentLower.includes('// todo: add') ||
                                       contentLower.includes('/* add more') ||
                                       contentLower.includes('// rest of') ||
                                       contentLower.includes('// remaining');
        
        // Check minimum file size by type
        const isTooShort = (f.language === 'css' && content.length < 200) || 
                          (f.language === 'javascript' && content.length < 100 && !f.name.includes('config')) ||
                          (f.language === 'html' && content.length < 100 && !f.name.includes('partial'));
                          
        // Check for HTML specific truncation (missing closing tags)
        const htmlTruncated = f.language === 'html' && (
          (content.includes('<html') && !content.includes('</html>')) ||
          (content.includes('<body') && !content.includes('</body>')) ||
          (content.includes('<head') && !content.includes('</head>'))
        );
        
        return hasUnclosedBrace || hasUnclosedParen || hasUnclosedBracket || 
               endsAbruptly || isTooShort || htmlTruncated || hasPlaceholderComments;
      });
      
      if (truncatedFiles.length > 0) {
        console.warn('[WordsToCode] Truncated files detected:', truncatedFiles.map(f => f.name));
        // Show warning to user about truncated files
        showStatus('warning', `Some files may be incomplete: ${truncatedFiles.map(f => f.name).join(', ')}`);
      }

      // Validate files for missing imports
      const validation = validateGeneratedFiles(files);
      
      // Auto-generate missing component files
      if (!validation.valid && validation.missingFiles.length > 0) {
        console.log('[WordsToCode] Missing files detected:', validation.missingFiles);
        const missingFileContents = await generateMissingFiles(validation.missingFiles, files);
        files = [...files, ...missingFileContents];
      }

      // Fix React component imports - ensure components are imported and rendered in App.tsx/jsx
      files = fixReactComponentImports(files);

      // Check for essential files and generate if missing
      const hasHtml = files.some(f => f.name.toLowerCase().endsWith('.html'));
      // Check for CSS/JS at root OR in src/ folder
      const cssFile = files.find(f => f.name.toLowerCase().endsWith('.css') && !f.name.includes('/')) ||
                      files.find(f => f.name.toLowerCase().endsWith('.css') && f.name.startsWith('src/'));
      const jsFile = files.find(f => (f.name.toLowerCase().endsWith('.js') || f.name.toLowerCase().endsWith('.jsx')) && !f.name.includes('/')) ||
                     files.find(f => (f.name.toLowerCase().endsWith('.js') || f.name.toLowerCase().endsWith('.jsx')) && f.name.startsWith('src/'));
      const hasStartBat = files.some(f => f.name.toLowerCase().endsWith('start.bat') || f.name.toLowerCase().endsWith('.bat'));
      const hasPackageJson = files.some(f => f.name.toLowerCase() === 'package.json');
      
      // Detect if this is a game/3D project - don't add portfolio fallbacks
      const isGameProject = files.some(f => 
        f.content.includes('THREE') || 
        f.content.includes('Phaser') || 
        f.content.includes('canvas') ||
        f.content.includes('gameCanvas') ||
        f.name.toLowerCase().includes('game')
      );
      
      // CRITICAL FIX: Check for ES modules in game projects and warn/fix them
      if (isGameProject) {
        const htmlFile = files.find(f => f.name.toLowerCase().endsWith('.html'));
        const gameJsFile = files.find(f => f.name.toLowerCase().endsWith('.js') && !f.name.includes('config'));
        
        // Check for banned ES module patterns
        const hasModuleScript = htmlFile?.content.includes('type="module"') || htmlFile?.content.includes("type='module'");
        const hasImportMap = htmlFile?.content.includes('type="importmap"') || htmlFile?.content.includes("type='importmap'");
        const hasImportStatement = gameJsFile?.content.match(/^import\s+/m) || gameJsFile?.content.includes('import ');
        const hasExportStatement = gameJsFile?.content.match(/^export\s+/m);
        
        if (hasModuleScript || hasImportMap || hasImportStatement || hasExportStatement) {
          console.warn('[WordsToCode] ⚠️ CRITICAL: Game project uses ES modules which break on file:// protocol!');
          console.warn('[WordsToCode] ES module patterns detected:', {
            hasModuleScript,
            hasImportMap,
            hasImportStatement: !!hasImportStatement,
            hasExportStatement: !!hasExportStatement
          });
          
          // Add a warning message to the user
          setMessages(prev => [...prev, {
            id: `warning-${Date.now()}`,
            role: 'system',
            content: `⚠️ **Warning: ES Modules Detected**\n\nThe generated game uses ES modules (\`type="module"\` or \`import\` statements) which **do not work** when double-clicking index.html.\n\n**To fix:** The game needs to use CDN script tags instead of ES modules. Try regenerating with a clearer prompt, or manually edit the files to use global THREE from CDN.`,
            timestamp: new Date()
          }]);
        }
      }
      
      // Check if CSS/JS are too minimal (stub files) - need at least 500 chars of real content
      const hasCss = cssFile && cssFile.content.length > 500;
      const hasJs = jsFile && jsFile.content.length > 300;
      
      // Remove stub CSS/JS files if they're too minimal - we'll replace with comprehensive ones
      // BUT NOT for game projects - they have their own CSS/JS that shouldn't be replaced
      if (cssFile && !hasCss && (projectType === 'static' || projectType === 'auto') && !isGameProject) {
        console.log('[WordsToCode] Replacing minimal CSS stub with comprehensive styles');
        files = files.filter(f => f !== cssFile);
      }
      if (jsFile && !hasJs && (projectType === 'static' || projectType === 'auto') && !isGameProject) {
        console.log('[WordsToCode] Replacing minimal JS stub with comprehensive script');
        files = files.filter(f => f !== jsFile);
      }

      // For static sites - ensure we have the basics with REAL styling (NOT for game projects!)
      if (hasHtml && !hasCss && (projectType === 'static' || projectType === 'auto') && !isGameProject) {
        console.log('[WordsToCode] Adding comprehensive styles.css');
        files.push({
          name: 'styles.css',
          language: 'css',
          content: `/* ============================================
   MODERN PORTFOLIO STYLES - Premium Design
   Features: Glassmorphism, Gradients, Animations
   ============================================ */

:root {
  /* Primary Colors */
  --primary: #6366f1;
  --primary-dark: #4f46e5;
  --primary-light: #818cf8;
  --secondary: #06b6d4;
  --accent: #f59e0b;
  
  /* Neutrals */
  --dark: #0f172a;
  --dark-light: #1e293b;
  --gray: #64748b;
  --gray-light: #94a3b8;
  --light: #f1f5f9;
  --white: #ffffff;
  
  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #6366f1 0%, #06b6d4 50%, #10b981 100%);
  --gradient-hero: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --gradient-dark: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  --gradient-glow: radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 50%);
  
  /* Glass Effect */
  --glass-bg: rgba(255, 255, 255, 0.1);
  --glass-border: rgba(255, 255, 255, 0.2);
  
  /* Shadows */
  --shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 10px 40px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 25px 80px rgba(0, 0, 0, 0.2);
  --shadow-glow: 0 0 60px rgba(99, 102, 241, 0.3);
  
  /* Transitions */
  --transition-fast: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-smooth: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-bounce: 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Reset & Base */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

html { scroll-behavior: smooth; font-size: 16px; }

body {
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  line-height: 1.7;
  color: var(--dark);
  background: var(--white);
  overflow-x: hidden;
}

/* Typography */
h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

h1 { font-size: clamp(2.5rem, 6vw, 4rem); }
h2 { font-size: clamp(2rem, 4vw, 3rem); }
h3 { font-size: clamp(1.5rem, 3vw, 2rem); }

p { color: var(--gray); }

.container { 
  width: 100%; 
  max-width: 1280px; 
  margin: 0 auto; 
  padding: 0 24px; 
}

/* ============ NAVIGATION ============ */
header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 20px 0;
  transition: var(--transition-smooth);
}

header.scrolled {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: var(--shadow-sm);
  padding: 15px 0;
}

.navbar { padding: 0; }

.nav-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-logo {
  font-size: 28px;
  font-weight: 800;
  text-decoration: none;
  color: var(--dark);
  letter-spacing: -0.03em;
  transition: var(--transition-fast);
}

.nav-logo span {
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-menu {
  display: flex;
  list-style: none;
  gap: 40px;
  align-items: center;
}

.nav-link {
  text-decoration: none;
  color: var(--gray);
  font-weight: 500;
  font-size: 15px;
  position: relative;
  padding: 8px 0;
  transition: var(--transition-fast);
}

.nav-link::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 2px;
  background: var(--gradient-primary);
  transition: var(--transition-smooth);
}

.nav-link:hover { color: var(--dark); }
.nav-link:hover::after { width: 100%; }

.hamburger {
  display: none;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  padding: 5px;
}

.bar {
  width: 28px;
  height: 3px;
  background: var(--dark);
  border-radius: 3px;
  transition: var(--transition-smooth);
}

/* ============ HERO SECTION ============ */
.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 120px 0 80px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
}

.hero::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 800px;
  height: 800px;
  background: var(--gradient-glow);
  border-radius: 50%;
  animation: pulse 8s ease-in-out infinite;
}

.hero::after {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 50%);
  border-radius: 50%;
  animation: pulse 10s ease-in-out infinite reverse;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.hero-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
  position: relative;
  z-index: 1;
}

.hero-content { animation: fadeInUp 1s ease-out; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-content h1 {
  margin-bottom: 16px;
  background: linear-gradient(135deg, var(--dark) 0%, var(--gray) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 24px;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-content p {
  font-size: 1.2rem;
  margin-bottom: 40px;
  max-width: 500px;
}

.hero-btns { display: flex; gap: 20px; flex-wrap: wrap; }

.hero-image {
  position: relative;
  animation: fadeInUp 1s ease-out 0.3s both;
}

.hero-image img {
  width: 100%;
  max-width: 450px;
  border-radius: 30px;
  box-shadow: var(--shadow-lg);
  transition: var(--transition-smooth);
}

.hero-image::before {
  content: '';
  position: absolute;
  top: -20px;
  right: -20px;
  width: 100%;
  height: 100%;
  border: 3px solid var(--primary);
  border-radius: 30px;
  z-index: -1;
  transition: var(--transition-smooth);
}

.hero-image:hover img { transform: translateY(-10px); box-shadow: var(--shadow-lg), var(--shadow-glow); }
.hero-image:hover::before { transform: translate(10px, 10px); }

/* ============ BUTTONS ============ */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 16px 36px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 600;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  transition: var(--transition-smooth);
  position: relative;
  overflow: hidden;
}

.btn-primary {
  background: var(--gradient-primary);
  color: white;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
}

.btn-primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  transition: 0.6s;
}

.btn-primary:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(99, 102, 241, 0.5);
}

.btn-primary:hover::before { left: 100%; }

.btn-secondary {
  background: transparent;
  border: 2px solid var(--primary);
  color: var(--primary);
}

.btn-secondary:hover {
  background: var(--primary);
  color: white;
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(99, 102, 241, 0.3);
}

/* ============ SECTIONS ============ */
section {
  padding: 120px 0;
  position: relative;
}

.section-title {
  text-align: center;
  margin-bottom: 80px;
  position: relative;
}

.section-title::after {
  content: '';
  display: block;
  width: 80px;
  height: 4px;
  background: var(--gradient-primary);
  margin: 20px auto 0;
  border-radius: 2px;
}

/* ============ ABOUT SECTION ============ */
.about { background: var(--white); }

.about-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
}

.about-text p {
  font-size: 1.1rem;
  margin-bottom: 24px;
  line-height: 1.8;
}

.about-stats {
  display: flex;
  gap: 50px;
  margin-top: 50px;
}

.stat {
  text-align: center;
  padding: 30px;
  background: var(--light);
  border-radius: 20px;
  transition: var(--transition-smooth);
}

.stat:hover {
  transform: translateY(-10px);
  box-shadow: var(--shadow-md);
}

.stat h3 {
  font-size: 3rem;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 8px;
}

.stat p { color: var(--gray); font-weight: 500; }

.about-image img {
  width: 100%;
  border-radius: 30px;
  box-shadow: var(--shadow-lg);
}

/* ============ SKILLS SECTION ============ */
.skills {
  background: linear-gradient(180deg, var(--light) 0%, var(--white) 100%);
}

.skills-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  margin-bottom: 80px;
}

.skill-category {
  background: var(--white);
  padding: 40px;
  border-radius: 24px;
  box-shadow: var(--shadow-sm);
}

.skill-category h3 {
  margin-bottom: 30px;
  font-size: 1.3rem;
}

.skill { margin-bottom: 25px; }

.skill span {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-weight: 500;
  color: var(--dark);
}

.progress-bar {
  height: 10px;
  background: var(--light);
  border-radius: 10px;
  overflow: hidden;
}

.progress {
  height: 100%;
  background: var(--gradient-primary);
  border-radius: 10px;
  transition: width 1.5s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.progress::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 24px;
}

.skill-card {
  background: var(--white);
  padding: 40px 24px;
  border-radius: 20px;
  text-align: center;
  box-shadow: var(--shadow-sm);
  border: 1px solid rgba(0,0,0,0.05);
  transition: var(--transition-smooth);
}

.skill-card:hover {
  transform: translateY(-15px);
  box-shadow: var(--shadow-md), var(--shadow-glow);
  border-color: var(--primary-light);
}

.skill-card i {
  font-size: 48px;
  margin-bottom: 20px;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.skill-card h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--dark);
}

/* ============ CONTACT SECTION ============ */
.contact { background: var(--white); }

.contact-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
}

.contact-info h3 {
  font-size: 2rem;
  margin-bottom: 20px;
}

.contact-info > p {
  font-size: 1.1rem;
  margin-bottom: 40px;
}

.contact-details { margin-bottom: 40px; }

.contact-item {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 30px;
  padding: 20px;
  background: var(--light);
  border-radius: 16px;
  transition: var(--transition-smooth);
}

.contact-item:hover {
  transform: translateX(10px);
  box-shadow: var(--shadow-sm);
}

.contact-item i {
  width: 56px;
  height: 56px;
  background: var(--gradient-primary);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 22px;
  flex-shrink: 0;
}

.contact-item h4 {
  font-size: 1rem;
  margin-bottom: 6px;
  color: var(--dark);
}

.contact-item p { color: var(--gray); margin: 0; }

.social-links {
  display: flex;
  gap: 16px;
}

.social-links a {
  width: 52px;
  height: 52px;
  background: var(--light);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray);
  font-size: 22px;
  text-decoration: none;
  transition: var(--transition-smooth);
}

.social-links a:hover {
  background: var(--gradient-primary);
  color: white;
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3);
}

.contact-form {
  background: var(--light);
  padding: 50px;
  border-radius: 30px;
}

.form-group { margin-bottom: 24px; }

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 18px 24px;
  border: 2px solid transparent;
  border-radius: 14px;
  font-size: 1rem;
  font-family: inherit;
  background: var(--white);
  transition: var(--transition-fast);
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
}

.form-group input::placeholder,
.form-group textarea::placeholder { color: var(--gray-light); }

.form-message {
  margin-top: 24px;
  padding: 16px 24px;
  border-radius: 12px;
  font-weight: 500;
  display: none;
}

.form-message.success {
  display: block;
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
}

.form-message.error {
  display: block;
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: #991b1b;
}

/* ============ FOOTER ============ */
footer {
  background: var(--gradient-dark);
  color: white;
  padding: 40px 0;
  text-align: center;
}

footer p { color: var(--gray-light); }

/* ============ ANIMATIONS ============ */
.fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}

.fade-in.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ============ RESPONSIVE ============ */
@media (max-width: 1024px) {
  .hero-container,
  .about-content,
  .contact-container,
  .skills-container {
    grid-template-columns: 1fr;
    gap: 50px;
  }
  
  .hero-content { text-align: center; }
  .hero-content p { max-width: 100%; }
  .hero-btns { justify-content: center; }
  .hero-image { order: -1; }
  .hero-image img { max-width: 350px; margin: 0 auto; display: block; }
  
  .skills-grid { grid-template-columns: repeat(3, 1fr); }
  .about-stats { justify-content: center; }
}

@media (max-width: 768px) {
  section { padding: 80px 0; }
  
  .nav-menu {
    display: none;
    position: absolute;
    top: calc(100% + 10px);
    left: 20px;
    right: 20px;
    background: var(--white);
    flex-direction: column;
    padding: 30px;
    gap: 20px;
    border-radius: 20px;
    box-shadow: var(--shadow-lg);
  }
  
  .nav-menu.active { display: flex; }
  .hamburger { display: flex; }
  
  .hamburger.active .bar:nth-child(1) { transform: translateY(9px) rotate(45deg); }
  .hamburger.active .bar:nth-child(2) { opacity: 0; }
  .hamburger.active .bar:nth-child(3) { transform: translateY(-9px) rotate(-45deg); }
  
  .skills-grid { grid-template-columns: repeat(2, 1fr); }
  .about-stats { flex-wrap: wrap; }
  .stat { flex: 1 1 140px; }
  
  .contact-form { padding: 30px; }
}

@media (max-width: 480px) {
  .skills-grid { grid-template-columns: 1fr 1fr; gap: 16px; }
  .skill-card { padding: 24px 16px; }
  .hero-btns { flex-direction: column; width: 100%; }
  .btn { width: 100%; }
  .stat { flex: 1 1 100%; }
}
`
        });
      }

      if (hasHtml && !hasJs && (projectType === 'static' || projectType === 'auto') && !isGameProject) {
        console.log('[WordsToCode] Adding comprehensive script.js');
        files.push({
          name: 'script.js',
          language: 'javascript',
          content: `/**
 * Modern Portfolio JavaScript
 * Features: Animations, Smooth Scroll, Form Handling, Intersection Observer
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Portfolio initialized');
    
    // ============ MOBILE NAVIGATION ============
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
            document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
        });
        
        // Close menu when clicking a link
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
    
    // ============ HEADER SCROLL EFFECT ============
    const header = document.querySelector('header');
    let lastScroll = 0;
    
    if (header) {
        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;
            
            // Add/remove scrolled class
            if (currentScroll > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            
            lastScroll = currentScroll;
        }, { passive: true });
    }
    
    // ============ SMOOTH SCROLL ============
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const target = document.querySelector(targetId);
            if (target) {
                const headerHeight = header ? header.offsetHeight : 0;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // ============ SCROLL ANIMATIONS ============
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                
                // Animate skill bars when skills section is visible
                if (entry.target.classList.contains('skills')) {
                    animateSkillBars();
                }
                
                // Animate stats counters
                if (entry.target.classList.contains('about')) {
                    animateCounters();
                }
            }
        });
    }, observerOptions);
    
    // Observe all sections for fade-in
    document.querySelectorAll('section').forEach(section => {
        section.classList.add('fade-in');
        fadeObserver.observe(section);
    });
    
    // Observe individual cards with stagger
    const cards = document.querySelectorAll('.skill-card, .stat, .contact-item');
    cards.forEach((card, index) => {
        card.style.transitionDelay = \`\${index * 0.1}s\`;
        card.classList.add('fade-in');
        fadeObserver.observe(card);
    });
    
    // ============ SKILL BAR ANIMATION ============
    let skillsAnimated = false;
    
    function animateSkillBars() {
        if (skillsAnimated) return;
        skillsAnimated = true;
        
        const progressBars = document.querySelectorAll('.progress');
        progressBars.forEach((bar, index) => {
            const targetWidth = bar.style.width;
            bar.style.width = '0';
            
            setTimeout(() => {
                bar.style.width = targetWidth;
            }, 100 + (index * 150));
        });
    }
    
    // ============ COUNTER ANIMATION ============
    let countersAnimated = false;
    
    function animateCounters() {
        if (countersAnimated) return;
        countersAnimated = true;
        
        const counters = document.querySelectorAll('.stat h3');
        counters.forEach(counter => {
            const target = parseInt(counter.textContent.replace(/[^0-9]/g, ''));
            const suffix = counter.textContent.replace(/[0-9]/g, '');
            let current = 0;
            const increment = target / 50;
            const duration = 2000;
            const stepTime = duration / 50;
            
            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    counter.textContent = Math.floor(current) + suffix;
                    setTimeout(updateCounter, stepTime);
                } else {
                    counter.textContent = target + suffix;
                }
            };
            
            updateCounter();
        });
    }
    
    // ============ TYPING EFFECT (Optional - for hero) ============
    const typingElement = document.querySelector('.hero-content h2');
    if (typingElement && typingElement.dataset.typing) {
        const words = typingElement.dataset.typing.split(',');
        let wordIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        
        function type() {
            const currentWord = words[wordIndex];
            
            if (isDeleting) {
                typingElement.textContent = currentWord.substring(0, charIndex - 1);
                charIndex--;
            } else {
                typingElement.textContent = currentWord.substring(0, charIndex + 1);
                charIndex++;
            }
            
            let typeSpeed = isDeleting ? 50 : 100;
            
            if (!isDeleting && charIndex === currentWord.length) {
                typeSpeed = 2000;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                wordIndex = (wordIndex + 1) % words.length;
                typeSpeed = 500;
            }
            
            setTimeout(type, typeSpeed);
        }
        
        type();
    }
    
    // ============ CONTACT FORM ============
    const contactForm = document.getElementById('contact-form');
    const formMessage = document.getElementById('form-message');
    
    if (contactForm) {
        // Add input animations
        const inputs = contactForm.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                input.parentElement.classList.add('focused');
            });
            
            input.addEventListener('blur', () => {
                if (!input.value) {
                    input.parentElement.classList.remove('focused');
                }
            });
        });
        
        // Form submission
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Basic validation
            if (!data.name || !data.email || !data.message) {
                showMessage('Please fill in all required fields.', 'error');
                return;
            }
            
            // Email validation
            const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
            if (!emailRegex.test(data.email)) {
                showMessage('Please enter a valid email address.', 'error');
                return;
            }
            
            // Show loading state
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            
            // Simulate form submission (replace with actual API call)
            try {
                await new Promise(resolve => setTimeout(resolve, 1500));
                showMessage('Thank you! Your message has been sent successfully.', 'success');
                contactForm.reset();
                inputs.forEach(input => input.parentElement.classList.remove('focused'));
            } catch (error) {
                showMessage('Oops! Something went wrong. Please try again.', 'error');
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    
    function showMessage(msg, type) {
        if (formMessage) {
            formMessage.textContent = msg;
            formMessage.className = 'form-message ' + type;
            
            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    formMessage.style.opacity = '0';
                    setTimeout(() => {
                        formMessage.className = 'form-message';
                        formMessage.style.opacity = '1';
                    }, 300);
                }, 5000);
            }
        }
    }
    
    // ============ PARALLAX EFFECT (subtle) ============
    const heroImage = document.querySelector('.hero-image img');
    if (heroImage && window.innerWidth > 768) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            heroImage.style.transform = \`translateY(\${scrolled * 0.1}px)\`;
        }, { passive: true });
    }
    
    // ============ ACTIVE NAV LINK ON SCROLL ============
    const sections = document.querySelectorAll('section[id]');
    
    function updateActiveNav() {
        const scrollY = window.pageYOffset;
        const headerHeight = header ? header.offsetHeight : 0;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop - headerHeight - 100;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + sectionId) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }
    
    window.addEventListener('scroll', updateActiveNav, { passive: true });
    updateActiveNav();
    
    // ============ HOVER EFFECTS FOR CARDS ============
    const hoverCards = document.querySelectorAll('.skill-card');
    hoverCards.forEach(card => {
        card.addEventListener('mouseenter', function(e) {
            this.style.transform = 'translateY(-15px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function(e) {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    console.log('✨ All features loaded successfully!');
});

// ============ UTILITY FUNCTIONS ============

// Debounce function for performance
function debounce(func, wait = 10, immediate = true) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Throttle function for scroll events
function throttle(func, limit = 100) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
`
        });
      }

      // Ensure start.bat exists - ENHANCED with better project type detection
      if (!hasStartBat) {
        // Detect project type from files
        const hasRequirements = files.some(f => f.name === 'requirements.txt');
        const hasPyProject = files.some(f => f.name === 'pyproject.toml');
        const hasPythonMain = files.some(f => f.name.endsWith('.py') && (f.name === 'main.py' || f.name === 'app.py' || f.name === 'run.py'));
        const hasViteConfig = files.some(f => f.name.includes('vite.config'));
        const hasFlask = files.some(f => f.content && f.content.includes('from flask import'));
        const hasFastAPI = files.some(f => f.content && f.content.includes('from fastapi import'));
        const hasGameJs = files.some(f => f.name === 'game.js');
        
        if (hasRequirements || hasPyProject || hasPythonMain) {
          // Python project
          const mainFile = hasFastAPI ? 'main.py' : (hasFlask ? 'app.py' : 'main.py');
          files.push({
            name: 'start.bat',
            language: 'batch',
            content: `@echo off
title Python Project Launcher
cd /d "%~dp0"
echo ========================================
echo   Starting Python Application
echo ========================================
echo.

REM Check if Python is installed
where python >nul 2>&1 || (
    echo [ERROR] Python not found! Install from python.org
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo [1/3] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
)

REM Activate virtual environment and install dependencies
echo [2/3] Activating environment and installing dependencies...
call venv\\Scripts\\activate.bat
if exist "requirements.txt" (
    pip install -r requirements.txt -q
)

REM Run the application
echo [3/3] Starting application...
echo.
${hasFastAPI ? 'python -m uvicorn main:app --reload' : hasFlask ? 'python app.py' : 'python main.py'}

pause`
          });
        } else if (hasPackageJson) {
          // Node.js project - detect if Vite project
          const devCommand = hasViteConfig ? 'npm run dev' : 'npm start';
          files.push({
            name: 'start.bat',
            language: 'batch',
            content: `@echo off
title Project Launcher
cd /d "%~dp0"
echo ========================================
echo   Starting Node.js Application
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1 || (
    echo [ERROR] Node.js not found! Install from nodejs.org
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo [1/2] Installing dependencies...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)

echo [2/2] Starting development server...
${devCommand}

pause`
          });
        } else if (hasHtml) {
          // Static site - enhanced with game detection
          const gameFile = hasGameJs ? 'game.js' : 'script.js';
          files.push({
            name: 'start.bat',
            language: 'batch',
            content: `@echo off
cd /d "%~dp0"
echo ========================================
echo   Opening ${hasGameJs ? 'Game' : 'Website'}
echo ========================================
echo.

REM Try to find and open index.html with default browser
if exist "index.html" (
    echo Opening index.html in your default browser...
    start "" "index.html"
) else (
    echo [ERROR] index.html not found!
    pause
    exit /b 1
)

echo.
echo Project opened! Press any key to close this window.
pause >nul`
          });
        }
      }

      // Add README if missing
      const hasReadme = files.some(f => f.name.toLowerCase().includes('readme'));
      if (!hasReadme && files.length > 0) {
        const projectName = targetFolder.split(/[/\\]/).pop() || 'Project';
        let readmeContent = '# ' + projectName + '\n\n## Quick Start\n\nDouble-click start.bat to run the project.\n\n';
        if (hasPackageJson) {
          readmeContent += '## Manual Setup\n\nnpm install\nnpm run dev\n\n';
        } else {
          readmeContent += '## Usage\n\nOpen index.html in your browser.\n\n';
        }
        readmeContent += '## Files\n\n' + files.map(f => '- ' + f.name).join('\n');
        
        files.push({
          name: 'README.md',
          language: 'markdown',
          content: readmeContent
        });
      }

      // Ensure workspace is set before writing files
      if (targetFolder) {
        try {
          await window.agentAPI.setWorkspace(targetFolder);
          console.log('[WordsToCode] Workspace set to:', targetFolder);
        } catch (e) {
          console.warn('[WordsToCode] Could not set workspace:', e);
        }
      }
      
      // Agent loop writes files directly via tool calls, but we still parse FILE: blocks as fallback
      // and to show in UI. If agent loop already wrote files, processFilesWithConflictCheck will detect them.
      
      // Detect dependencies before creating files
      const dependencies = detectDependencies(files);
      setDetectedDependencies(dependencies);
      
      // Validate we have files to write (either from parsing or agent loop will write via tools)
      if (files.length === 0 && !usingAgentLoop) {
        // Show more helpful error with response preview
        const preview = aiResponse.length > 500 ? aiResponse.slice(0, 500) + '...' : aiResponse;
        console.error('[WordsToCode] Failed to parse files. Full response:', aiResponse);
        throw new Error(`No files were generated. The AI response (${aiResponse.length} chars) did not contain FILE: blocks.\n\nResponse preview:\n${preview}\n\nTry rephrasing: "Create index.html, styles.css, and script.js for a [your project]"`);
      }
      
      let generatedFiles: GeneratedFile[] = [];
      
      // If we have parsed files, write them (agent loop may have already written some via tools)
      if (files.length > 0) {
        console.log('[WordsToCode] About to write', files.length, 'files to:', targetFolder);
        
        // Create the files with conflict checking (will skip if agent loop already wrote them)
        generatedFiles = await processFilesWithConflictCheck(files);
        
        // Auto-install dependencies if enabled
        if (autoInstallDeps && (dependencies.npm.length > 0 || dependencies.pip.length > 0)) {
          await installDependencies(dependencies);
        }
      } else if (usingAgentLoop) {
        // Agent loop wrote files via tools - try to read common files to show in UI
        console.log('[WordsToCode] Agent loop mode - checking for created files...');
        const commonFiles = ['index.html', 'styles.css', 'script.js', 'game.js', 'app.js', 'main.js',
                            'package.json', 'README.md', 'start.bat', 'requirements.txt', 'main.py', 'app.py'];
        
        // Detect path separator properly
        const isWindows = targetFolder.includes('\\') || /^[A-Za-z]:/.test(targetFolder);
        const pathSep = isWindows ? '\\' : '/';
        const cleanTargetFolder = targetFolder.replace(/[/\\]+$/, ''); // Remove trailing slashes
        
        for (const fileName of commonFiles) {
          try {
            const filePath = `${cleanTargetFolder}${pathSep}${fileName}`;
            const fileResult = await window.agentAPI.readFile(filePath);
            if (fileResult.success && fileResult.content) {
              const ext = fileName.split('.').pop()?.toLowerCase() || 'text';
              generatedFiles.push({
                path: filePath,
                name: fileName,
                language: ext,
                status: 'created'
              });
            }
          } catch (e) {
            // File doesn't exist, skip silently
          }
        }
        
        console.log('[WordsToCode] Found', generatedFiles.length, 'files from agent loop');
      }
      
      // Check for write errors
      const errorFiles = generatedFiles.filter(f => f.status === 'error');
      if (errorFiles.length > 0) {
        console.error('[WordsToCode] Files failed to write:', errorFiles);
        const errorMessages = errorFiles.map(f => `${f.name}: ${f.error || 'Unknown error'}`).join('\n');
        throw new Error(`Failed to write ${errorFiles.length} file(s):\n${errorMessages}`);
      }
      
      const successFiles = generatedFiles.filter(f => f.status === 'created' || f.status === 'overwritten');
      console.log('[WordsToCode] Successfully processed', successFiles.length, 'files');
      
      // Store last generated file names for highlighting in file tree
      setLastGeneratedFiles(successFiles.map(f => f.name));
      
      // Show success status message
      if (successFiles.length > 0) {
        showStatus('success', `✨ Created ${successFiles.length} file${successFiles.length !== 1 ? 's' : ''} successfully!`, 5000);
        
        // Auto-load file tree after successful generation
        setTimeout(() => loadFileTree(), 500);
      }

      // Build response message
      let responseContent = aiResponse;
      
      if (generatedFiles.length > 0) {
        const createdCount = generatedFiles.filter(f => f.status === 'created').length;
        const overwrittenCount = generatedFiles.filter(f => f.status === 'overwritten').length;
        const pendingCount = generatedFiles.filter(f => f.status === 'pending').length;
        const skippedCount = generatedFiles.filter(f => f.status === 'skipped').length;
        const errorCount = generatedFiles.filter(f => f.status === 'error').length;
        const successCount = createdCount + overwrittenCount;
        
        // Show critical error if no files were written
        if (successCount === 0 && errorCount > 0) {
          responseContent += `\n\n❌ **CRITICAL ERROR:** No files were written successfully!\n\n`;
          responseContent += `**Errors:**\n`;
          generatedFiles.filter(f => f.status === 'error').forEach(f => {
            responseContent += `- ${f.name}: ${f.error || 'Unknown error'}\n`;
          });
          responseContent += `\n**Possible causes:**\n`;
          responseContent += `- Workspace permissions issue\n`;
          responseContent += `- Invalid file paths\n`;
          responseContent += `- Disk space or path too long\n`;
          responseContent += `\n**Check the browser console for detailed error messages.**`;
        }
        
        responseContent += `\n\n---\n\n**Files:** ${successCount} created`;
        if (overwrittenCount > 0) responseContent += ` (${overwrittenCount} overwritten)`;
        if (pendingCount > 0) responseContent += `, ${pendingCount} pending approval`;
        if (skippedCount > 0) responseContent += `, ${skippedCount} skipped`;
        
        // Show auto-generated files info
        if (!validation.valid && validation.missingFiles.length > 0) {
          responseContent += `\n\n**Auto-generated:** ${validation.missingFiles.length} missing component(s) were created: ${validation.missingFiles.join(', ')}`;
        }
        
        // Show validation warnings
        if (validation.warnings.length > 0) {
          responseContent += `\n\n**Warnings:**`;
          validation.warnings.forEach(w => {
            responseContent += `\n- ${w}`;
          });
        }
        
        // Warn about truncated files
        if (truncatedFiles.length > 0) {
          responseContent += `\n\n⚠️ **Truncated Files Detected:** ${truncatedFiles.map(f => f.name).join(', ')}`;
          responseContent += `\n   Some files may be incomplete. Try regenerating with a simpler request.`;
        }
        
        // Warn if too few files were generated
        if (successCount < 3 && pendingCount === 0) {
          responseContent += `\n\n⚠️ **Warning:** Only ${successCount} file(s) were generated. Try asking again with more specific requirements.`;
        }
        
        if (errorCount > 0) {
          responseContent += `\n\n**Errors:**`;
          generatedFiles.filter(f => f.status === 'error').forEach(f => {
            responseContent += `\n- ${f.name}: ${f.error}`;
          });
        }
      } else {
        responseContent += `\n\n⚠️ **No files were generated.** The AI may not have followed the FILE: format. Try rephrasing your request or ask for a "complete project with all files".`;
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
        files: generatedFiles
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Auto-generate visual preview if HTML file exists
      if (files.some(f => f.name.toLowerCase().endsWith('.html'))) {
        setTimeout(() => {
          generateVisualPreview(files);
        }, 500);
      }
      
      // Reset refinement mode after successful generation
      if (refinementMode) {
        setRefinementMode(false);
        setRefinementTarget('');
      }
    } catch (error: any) {
      console.error('Code generation error:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `**Error generating code:** ${error.message}\n\nPlease try again or check your AI provider settings.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-new',
        role: 'assistant',
        content: `Fresh start! ${targetFolder ? `\n\nTarget folder: \`${targetFolder}\`\n\nDescribe what you want me to create.` : '\n\nSelect a folder first, then describe what you want to build.'}`,
        timestamp: new Date()
      }
    ]);
  };

  // Render file tree recursively
  const renderFileTree = (items: any[], depth: number): React.ReactNode => {
    return items.map((item, index) => {
      const isHighlighted = lastGeneratedFiles.some(f => item.path.includes(f));
      return (
        <div key={`${item.path}-${index}`} className={`file-tree-item ${isHighlighted ? 'highlighted' : ''}`} style={{ paddingLeft: `${depth * 16}px` }}>
          <span className="file-tree-icon">
            {item.is_dir ? '📁' : getFileIcon(item.name)}
          </span>
          <span 
            className={`file-tree-name ${item.is_dir ? 'folder' : 'file'}`}
            onClick={() => {
              if (!item.is_dir) {
                const fullPath = `${targetFolder}${targetFolder.endsWith('/') || targetFolder.endsWith('\\') ? '' : '/'}${item.path}`;
                openInEditor(fullPath);
              }
            }}
          >
            {item.name}
          </span>
          {isHighlighted && <span className="new-badge">NEW</span>}
          {item.children && item.children.length > 0 && renderFileTree(item.children, depth + 1)}
        </div>
      );
    });
  };

  if (!isOpen) return null;

  const folderName = targetFolder ? targetFolder.split(/[/\\]/).pop() : null;

  return (
    <div className="words-to-code-overlay">
      <div className="words-to-code-container">
        {/* Header */}
        <div className="words-to-code-header">
          <div className="words-to-code-title">
            <span className="words-to-code-icon">🪄</span>
            <h3>Words to Code</h3>
            <span className="words-to-code-subtitle">Describe it, I'll create it</span>
          </div>
          <div className="words-to-code-actions">
            <button onClick={clearChat} className="words-to-code-btn clear" title="Clear chat">
              🗑️
            </button>
            <button onClick={onClose} className="words-to-code-btn close" title="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Folder Selector & Project Type */}
        <div className="words-to-code-folder-bar">
          <div className="folder-selector">
            <button onClick={selectFolder} className="select-folder-btn">
              📁 {targetFolder ? 'Change Folder' : 'Select Folder'}
            </button>
            {targetFolder && (
              <div className="current-folder">
                <span className="folder-icon">📂</span>
                <span className="folder-name" title={targetFolder}>{folderName}</span>
                <span className="folder-status">✓ Ready</span>
              </div>
            )}
          </div>
          
          {/* Project Type Selector */}
          <div className="project-type-selector">
            <label className="project-type-label">Type:</label>
            <select 
              value={projectType} 
              onChange={(e) => setProjectType(e.target.value as keyof typeof PROJECT_TYPES)}
              className="project-type-dropdown"
              title={PROJECT_TYPES[projectType].description}
            >
              {Object.entries(PROJECT_TYPES).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>
          
          {/* Design Style Selector */}
          <div className="design-style-selector">
            <label className="design-style-label">Style:</label>
            <select 
              value={designStyle} 
              onChange={(e) => setDesignStyle(e.target.value as keyof typeof DESIGN_STYLES)}
              className="design-style-dropdown"
              title={DESIGN_STYLES[designStyle].description}
            >
              {Object.entries(DESIGN_STYLES).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>
          
          {/* Saved Prompts */}
          <div className="saved-prompts-container">
            <button 
              ref={savedPromptsBtnRef}
              onClick={() => {
                if (!showSavedPrompts && savedPromptsBtnRef.current) {
                  const rect = savedPromptsBtnRef.current.getBoundingClientRect();
                  const dropdownWidth = 300;
                  const viewportWidth = window.innerWidth;
                  // Align right edge with button, but ensure it stays within viewport
                  let left = rect.right - dropdownWidth;
                  // Don't go off left edge
                  left = Math.max(10, left);
                  // Don't go off right edge
                  left = Math.min(left, viewportWidth - dropdownWidth - 10);
                  setDropdownPosition({
                    top: rect.bottom + 4,
                    left: left
                  });
                }
                setShowSavedPrompts(!showSavedPrompts);
              }}
              className="saved-prompts-btn"
              title="Saved prompts"
            >
              ⭐ {savedPrompts.length > 0 ? `(${savedPrompts.length})` : ''}
            </button>
            
            {showSavedPrompts && dropdownPosition && createPortal(
              <div 
                ref={savedPromptsDropdownRef}
                className="saved-prompts-dropdown"
                style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
              >
                <div className="saved-prompts-header">
                  <span>Saved Prompts</span>
                  {input.trim() && (
                    <button 
                      onClick={() => {
                        const name = prompt('Name for this prompt:');
                        if (name) savePrompt(name, input.trim());
                      }}
                      className="save-current-btn"
                      title="Save current prompt"
                    >
                      + Save Current
                    </button>
                  )}
                </div>
                {savedPrompts.length === 0 ? (
                  <div className="no-saved-prompts">No saved prompts yet</div>
                ) : (
                  <div className="saved-prompts-list">
                    {savedPrompts.map(prompt => (
                      <div key={prompt.id} className="saved-prompt-item">
                        <button 
                          onClick={() => loadPrompt(prompt)}
                          className="load-prompt-btn"
                          title={prompt.prompt}
                        >
                          <span className="prompt-name">{prompt.name}</span>
                          <span className="prompt-type">{PROJECT_TYPES[prompt.projectType as keyof typeof PROJECT_TYPES]?.label || '🔮'}</span>
                        </button>
                        <button 
                          onClick={() => deletePrompt(prompt.id)}
                          className="delete-prompt-btn"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>,
              document.body
            )}
          </div>
          
          {recentFolders.length > 0 && !targetFolder && (
            <div className="recent-folders">
              <span className="recent-label">Recent:</span>
              {recentFolders.slice(0, 3).map((folder, i) => (
                <button
                  key={i}
                  onClick={() => useRecentFolder(folder)}
                  className="recent-folder-btn"
                  title={folder}
                >
                  {folder.split(/[/\\]/).pop()}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Status Message */}
        {statusMessage && (
          <div className={`words-to-code-status ${statusMessage.type}`}>
            <span className="status-icon">
              {statusMessage.type === 'success' ? '✓' : 
               statusMessage.type === 'error' ? '✗' : 
               statusMessage.type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span className="status-text">{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="status-close">✕</button>
          </div>
        )}
        
        {/* Quick Actions Bar - after folder selection */}
        {targetFolder && (
          <div className="words-to-code-quick-actions">
            <button 
              onClick={openFolderInExplorer} 
              className="quick-action-btn"
              title="Open folder in file explorer"
            >
              📂 Open Folder
            </button>
            <button 
              onClick={loadFileTree} 
              className="quick-action-btn"
              title="View project file tree"
            >
              🌳 View Files
            </button>
            <button 
              onClick={async () => {
                if (targetFolder) {
                  const result = await window.agentAPI.launchProject(targetFolder);
                  if (result.success) {
                    showStatus('success', result.message || 'Project launched!');
                  } else {
                    showStatus('error', result.error || 'Failed to launch');
                  }
                }
              }}
              className="quick-action-btn"
              title="Launch project (run start.bat or npm start)"
            >
              🚀 Launch Project
            </button>
          </div>
        )}
        
        {/* File Tree Modal */}
        {showFileTree && (
          <div className="file-tree-overlay" onClick={() => setShowFileTree(false)}>
            <div className="file-tree-modal" onClick={(e) => e.stopPropagation()}>
              <div className="file-tree-header">
                <h3>📁 Project Files</h3>
                <span className="file-tree-path">{targetFolder}</span>
                <button onClick={() => setShowFileTree(false)} className="file-tree-close">✕</button>
              </div>
              <div className="file-tree-content">
                {fileTree.length === 0 ? (
                  <div className="file-tree-empty">No files yet. Generate something!</div>
                ) : (
                  <div className="file-tree-list">
                    {renderFileTree(fileTree, 0)}
                  </div>
                )}
              </div>
              <div className="file-tree-footer">
                <button onClick={openFolderInExplorer} className="file-tree-btn">
                  📂 Open in Explorer
                </button>
                <button onClick={() => loadFileTree()} className="file-tree-btn">
                  🔄 Refresh
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Generation Progress */}
        {generationProgress.total > 0 && (
          <div className="generation-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
              />
            </div>
            <div className="progress-text">
              Creating {generationProgress.current}/{generationProgress.total}: {generationProgress.currentFile}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="words-to-code-messages">
          {/* Onboarding - when no folder selected and no messages */}
          {!targetFolder && messages.length === 0 && (
            <div className="words-to-code-onboarding">
              <div className="onboarding-hero" style={{
                textAlign: 'center',
                padding: '40px 24px 24px',
                background: 'linear-gradient(180deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
                borderRadius: '16px',
                marginBottom: '20px'
              }}>
                <div className="onboarding-icon" style={{
                  fontSize: '48px',
                  marginBottom: '12px',
                  filter: 'drop-shadow(0 4px 12px rgba(99,102,241,0.3))'
                }}>🪄</div>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#f1f5f9',
                  margin: '0 0 8px',
                  letterSpacing: '-0.02em'
                }}>Words to Code</h2>
                <p style={{
                  color: '#94a3b8',
                  fontSize: '14px',
                  margin: '0 0 24px',
                  maxWidth: '360px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  lineHeight: '1.6'
                }}>Describe any project in plain English and get production-ready code, instantly.</p>
                <button onClick={selectFolder} style={{
                  background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 28px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
                  transition: 'all 0.2s'
                }}>
                  <span style={{ fontSize: '16px' }}>📁</span> Select Folder to Begin
                </button>
              </div>
              
              <div className="onboarding-steps" style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '32px',
                padding: '16px 0 24px',
                marginBottom: '20px',
              }}>
                {[
                  { num: '1', text: 'Select a folder', icon: '📂' },
                  { num: '2', text: 'Describe your project', icon: '💬' },
                  { num: '3', text: 'Get complete code', icon: '✨' }
                ].map((step, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: 'column' as const,
                    alignItems: 'center',
                    gap: '8px',
                    opacity: 0.8,
                    position: 'relative' as const,
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'rgba(99,102,241,0.1)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                    }}>{step.icon}</div>
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: '500' }}>{step.text}</span>
                  </div>
                ))}
              </div>
              
              <div className="onboarding-templates">
                <h4 style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#64748b',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                  margin: '0 0 12px 4px',
                }}>Quick Start Templates</h4>
                <div className="template-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                }}>
                  <button onClick={() => { setProjectType('static'); setInput('Build a stunning modern landing page with: hero section with gradient background, features grid with hover animations, testimonials carousel, pricing cards, contact form with validation, smooth scroll navigation, mobile responsive design. Use CSS animations and modern design.'); }} className="template-btn">
                    <span className="template-icon">🌐</span>
                    <span className="template-name">Landing Page</span>
                  </button>
                  <button onClick={() => { setProjectType('node'); setInput('Create a complete REST API with Express.js: package.json, server.js with CORS and JSON parsing, routes for users CRUD (GET, POST, PUT, DELETE), in-memory data store, error handling middleware, and a simple HTML frontend to test the API. Include start.bat to run the server.'); }} className="template-btn">
                    <span className="template-icon">⚡</span>
                    <span className="template-name">REST API</span>
                  </button>
                  <button onClick={() => { setProjectType('react'); setInput('Build a React dashboard with Vite: package.json, vite.config.js, App.jsx with React Router, Sidebar component with navigation, Header with search bar, Dashboard page with stat cards, DataTable component with sorting/filtering, Chart component using CSS charts (no external libs). Modern dark theme.'); }} className="template-btn">
                    <span className="template-icon">📊</span>
                    <span className="template-name">Dashboard</span>
                  </button>
                  <button onClick={() => { setProjectType('static'); setInput('Create a beautiful portfolio website: hero with animated text, about me section with skills progress bars, projects gallery with hover effects and modal previews, experience timeline, contact form with social links, dark/light mode toggle. Use glassmorphism and smooth animations.'); }} className="template-btn">
                    <span className="template-icon">👤</span>
                    <span className="template-name">Portfolio</span>
                  </button>
                  <button onClick={() => { setProjectType('game'); setInput('Build a complete HTML5 Canvas game: Player character with WASD/arrow controls, enemy spawning system, collision detection, scoring system with high score save to localStorage, lives system, game over screen with restart, background music placeholder, sound effects, pause menu. Must be FULLY PLAYABLE!'); }} className="template-btn">
                    <span className="template-icon">🎮</span>
                    <span className="template-name">Web Game</span>
                  </button>
                  <button onClick={() => { setProjectType('chrome'); setInput('Create a Chrome extension: manifest.json (v3), popup.html with styled UI, popup.js with functionality, background.js service worker, content.js for page interaction, options.html for settings. Extension should be a productivity tool that saves notes per website.'); }} className="template-btn">
                    <span className="template-icon">🧩</span>
                    <span className="template-name">Extension</span>
                  </button>
                  <button onClick={() => { setProjectType('fullstack'); setInput('Build a full-stack todo app: Express server serving static files, SQLite or in-memory database, REST API for todos CRUD, React frontend with add/edit/delete/complete functionality, modern UI with animations, local storage backup, filter by status. Single npm start to run.'); }} className="template-btn">
                    <span className="template-icon">📝</span>
                    <span className="template-name">Todo App</span>
                  </button>
                  <button onClick={() => { setProjectType('python'); setInput('Create a Python Flask web app: requirements.txt, run.py, app folder with routes, templates folder with base.html and index.html using Jinja2, static folder with CSS and JS, form handling, SQLite database for data persistence. Include start.bat to run.'); }} className="template-btn">
                    <span className="template-icon">🐍</span>
                    <span className="template-name">Flask App</span>
                  </button>
                  <button onClick={() => { setProjectType('cli'); setInput('Create a Node.js CLI tool: package.json with bin field, index.js using commander for argument parsing, chalk for colored output, ora for spinners, useful utility commands (file operations, text processing, or system info), help documentation, npm link instructions.'); }} className="template-btn">
                    <span className="template-icon">💻</span>
                    <span className="template-name">CLI Tool</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Messages - when we have conversation */}
          {messages.length > 0 && messages.map((message) => (
            <div 
              key={message.id} 
              className={`words-to-code-message ${message.role}`}
            >
              <div className="message-avatar">
                {message.role === 'user' ? '👤' : message.role === 'system' ? '⚙️' : '🪄'}
              </div>
              <div className="message-content">
                <div 
                  className="message-text"
                  dangerouslySetInnerHTML={{ 
                    __html: formatMarkdown(message.content) 
                  }}
                />
                
                {/* Show generated files */}
                {message.files && message.files.length > 0 && (
                  <div className="generated-files">
                    <div className="files-header">
                      <span>
                        {message.files.filter(f => f.status === 'created' || f.status === 'overwritten').length} file{message.files.filter(f => f.status === 'created' || f.status === 'overwritten').length !== 1 ? 's' : ''} created
                      </span>
                      <div className="files-actions">
                        {message.files.some(f => f.status === 'pending') && (
                          <span className="pending-badge">
                            {message.files.filter(f => f.status === 'pending').length} pending
                          </span>
                        )}
                        
                        {/* Open in Browser - for HTML projects */}
                        {message.files.some(f => f.name.toLowerCase() === 'index.html' && (f.status === 'created' || f.status === 'overwritten')) && (
                          <button
                            onClick={async () => {
                              const htmlFile = message.files!.find(f => f.name.toLowerCase() === 'index.html');
                              if (htmlFile && htmlFile.path) {
                                try {
                                  // Open the HTML file in the default browser
                                  const filePath = htmlFile.path.replace(/\\/g, '/');
                                  await window.agentAPI.openExternal(`file:///${filePath}`);
                                } catch (e) {
                                  console.error('Failed to open in browser:', e);
                                  // Fallback: try window.open
                                  const filePath = htmlFile.path.replace(/\\/g, '/');
                                  window.open(`file:///${filePath}`, '_blank');
                                }
                              }
                            }}
                            className="open-browser-btn"
                            title="Open in browser"
                          >
                            🌐 Open in Browser
                          </button>
                        )}
                        
                        {/* Launch Project - for any project with start.bat or package.json */}
                        {message.files.some(f => 
                          (f.name.toLowerCase() === 'start.bat' || 
                           f.name.toLowerCase() === 'run.bat' ||
                           f.name.toLowerCase() === 'package.json') && 
                          (f.status === 'created' || f.status === 'overwritten')
                        ) && (
                          <button
                            onClick={async () => {
                              if (!targetFolder) return;
                              
                              try {
                                // First check if there's a start.bat - run it directly
                                const batFile = message.files!.find(f => 
                                  f.name.toLowerCase() === 'start.bat' || f.name.toLowerCase() === 'run.bat'
                                );
                                
                                if (batFile && batFile.path) {
                                  // Run the batch file using shell
                                  const pathSep = targetFolder.includes('\\') ? '\\' : '/';
                                  const batPath = `${targetFolder}${pathSep}${batFile.name}`;
                                  
                                  // Use runCommand or executeCommand
                                  if (window.agentAPI.runCommand) {
                                    await window.agentAPI.runCommand(`start "" "${batPath}"`);
                                  } else if (window.agentAPI.agentRunCommand) {
                                    await window.agentAPI.agentRunCommand(`start "" "${batPath}"`, targetFolder);
                                  }
                                  
                                  // Add success message
                                  setMessages(prev => [...prev, {
                                    id: `system-${Date.now()}`,
                                    role: 'system',
                                    content: `🚀 **Launched project!**\n\nRunning \`${batFile.name}\` in \`${targetFolder}\``,
                                    timestamp: new Date()
                                  }]);
                                } else {
                                  // Use the launchProject IPC for Node.js/Python projects
                                  const result = await window.agentAPI.launchProject(targetFolder);
                                  
                                  if (result.success) {
                                    setMessages(prev => [...prev, {
                                      id: `system-${Date.now()}`,
                                      role: 'system',
                                      content: `🚀 **Project launched!**\n\n${result.message}${result.url ? `\n\n🌐 Open: [${result.url}](${result.url})` : ''}`,
                                      timestamp: new Date()
                                    }]);
                                  } else {
                                    throw new Error(result.error || 'Failed to launch project');
                                  }
                                }
                              } catch (e: any) {
                                console.error('Failed to launch project:', e);
                                setMessages(prev => [...prev, {
                                  id: `error-${Date.now()}`,
                                  role: 'system',
                                  content: `❌ **Launch failed:** ${e.message || 'Unknown error'}\n\nTry running \`start.bat\` manually from the folder.`,
                                  timestamp: new Date()
                                }]);
                              }
                            }}
                            className="launch-project-btn"
                            title="Launch the project"
                          >
                            🚀 Launch
                          </button>
                        )}
                        
                        {message.files.some(f => f.name.toLowerCase().endsWith('.html')) && (
                          <button
                            onClick={async () => {
                              const htmlFile = message.files!.find(f => f.name.toLowerCase().endsWith('.html'));
                              const cssFile = message.files!.find(f => f.name.toLowerCase().endsWith('.css'));
                              const jsFile = message.files!.find(f => f.name.toLowerCase().endsWith('.js') && !f.name.includes('config'));
                              
                              const filesToPreview: { name: string; content: string; language: string }[] = [];
                              
                              if (htmlFile) {
                                try {
                                  const result = await window.agentAPI.readFile(htmlFile.path);
                                  if (result.success && result.content) {
                                    filesToPreview.push({ name: htmlFile.name, content: result.content, language: htmlFile.language });
                                  }
                                } catch (e) { console.warn('Could not read HTML file:', e); }
                              }
                              
                              if (cssFile) {
                                try {
                                  const result = await window.agentAPI.readFile(cssFile.path);
                                  if (result.success && result.content) {
                                    filesToPreview.push({ name: cssFile.name, content: result.content, language: cssFile.language });
                                  }
                                } catch (e) { console.warn('Could not read CSS file:', e); }
                              }
                              
                              if (jsFile) {
                                try {
                                  const result = await window.agentAPI.readFile(jsFile.path);
                                  if (result.success && result.content) {
                                    filesToPreview.push({ name: jsFile.name, content: result.content, language: jsFile.language });
                                  }
                                } catch (e) { console.warn('Could not read JS file:', e); }
                              }
                              
                              if (filesToPreview.length > 0) generateVisualPreview(filesToPreview);
                            }}
                            className="preview-visual-btn"
                            title="Preview how it looks"
                          >
                            👁️ Preview
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setRefinementMode(true);
                            setRefinementTarget(targetFolder);
                            setInput('Improve the design: make it more colorful, add animations');
                            inputRef.current?.focus();
                          }}
                          className="refine-btn"
                          title="Refine and improve"
                        >
                          ✨ Refine
                        </button>
                      </div>
                    </div>
                    {message.files.map((file, i) => (
                      <div key={i} className={`file-item ${file.status}`}>
                        <span className="file-type-icon">{getFileIcon(file.name)}</span>
                        <span className="file-name" title={file.path}>{file.name}</span>
                        <span className="file-lang">{languageNames[file.language.toLowerCase()] || file.language}</span>
                        <span className="file-status-icon">
                          {file.status === 'created' ? '✓' : 
                           file.status === 'overwritten' ? '↻' :
                           file.status === 'skipped' ? '⊘' :
                           file.status === 'error' ? '✗' : 
                           file.status === 'pending' ? '⏳' : '...'}
                        </span>
                        {(file.status === 'created' || file.status === 'overwritten') && (
                          <button 
                            className="open-file-btn"
                            onClick={() => openInEditor(file.path)}
                            title="Open in editor"
                          >
                            📝
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="words-to-code-message assistant streaming">
              <div className="message-avatar">🪄</div>
              <div className="message-content">
                {streamingContent ? (
                  <>
                    <div 
                      className="message-text streaming-text"
                      dangerouslySetInnerHTML={{ 
                        __html: formatMarkdown(streamingContent) 
                      }}
                    />
                    <div className="streaming-indicator">
                      <span className="pulse-dot"></span>
                      <span className="streaming-label">Generating...</span>
                    </div>
                  </>
                ) : (
                  <div className="message-text typing">
                    <span className="typing-text">
                      {generationProgress.total > 0 
                        ? `Creating file ${generationProgress.current}/${generationProgress.total}: ${generationProgress.currentFile}`
                        : 'Analyzing your request and generating code'
                      }
                    </span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Code Preview */}
        {showPreview && previewCode && (
          <div className="code-preview-section">
            <div className="preview-header">
              <h3>🔍 Code Preview</h3>
              <div className="preview-actions">
                <button onClick={() => setShowPreview(false)} className="preview-close">✕</button>
              </div>
            </div>
            <div className="preview-content">
              <div
                className="preview-text"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(previewCode) }}
              />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="words-to-code-input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={targetFolder
              ? `Describe what you want to create (${PROJECT_TYPES[projectType].label})...`
              : "Select a folder first..."
            }
            rows={2}
            disabled={isLoading || !targetFolder}
          />
          <div className="input-buttons">
            <div className="toggle-group">
              <label className="overwrite-toggle" title="Automatically overwrite existing files">
                <input 
                  type="checkbox" 
                  checked={overwriteAll}
                  onChange={(e) => setOverwriteAll(e.target.checked)}
                />
                <span>Auto-overwrite</span>
              </label>
              <label className="auto-install-toggle" title="Automatically install npm/pip dependencies">
                <input 
                  type="checkbox" 
                  checked={autoInstallDeps}
                  onChange={(e) => setAutoInstallDeps(e.target.checked)}
                />
                <span>Auto-install deps</span>
              </label>
            </div>
            <button
              onClick={handlePreview}
              disabled={!input.trim() || isLoading || !targetFolder}
              className="words-to-code-preview"
              title="Preview code before creating"
            >
              👁️ Preview
            </button>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || !targetFolder}
              className="words-to-code-send"
            >
              {isLoading ? (
                <span className="loading-spinner">⏳</span>
              ) : (
                '✨ Create'
              )}
            </button>
          </div>
          
          {/* Detected Dependencies Display */}
          {(detectedDependencies.npm.length > 0 || detectedDependencies.pip.length > 0) && (
            <div className="dependencies-display">
              <div className="deps-header">
                <span>📦 Detected Dependencies</span>
                {!autoInstallDeps && (
                  <button 
                    onClick={() => installDependencies(detectedDependencies)}
                    className="install-deps-btn"
                  >
                    Install Now
                  </button>
                )}
              </div>
              {detectedDependencies.npm.length > 0 && (
                <div className="deps-list">
                  <strong>npm:</strong> {detectedDependencies.npm.join(', ')}
                </div>
              )}
              {detectedDependencies.pip.length > 0 && (
                <div className="deps-list">
                  <strong>pip:</strong> {detectedDependencies.pip.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* File Conflict Modal */}
        {showConflictModal && fileConflicts.length > 0 && (
          <div className="conflict-modal-overlay">
            <div className="conflict-modal">
              <div className="conflict-modal-header">
                <h3>⚠️ File Conflicts Detected</h3>
                <span className="conflict-count">{fileConflicts.length} file{fileConflicts.length !== 1 ? 's' : ''} already exist</span>
              </div>
              
              <div className="conflict-list">
                {fileConflicts.map((conflict, i) => (
                  <div key={i} className="conflict-item">
                    <div className="conflict-file-header">
                      <span className="conflict-file-icon">{getFileIcon(conflict.name)}</span>
                      <span className="conflict-file-name">{conflict.name}</span>
                    </div>
                    <div className="conflict-diff-preview">
                      <div className="diff-section existing">
                        <div className="diff-label">Existing ({conflict.existingContent.split('\n').length} lines)</div>
                        <pre className="diff-content">{conflict.existingContent.slice(0, 200)}{conflict.existingContent.length > 200 ? '...' : ''}</pre>
                      </div>
                      <div className="diff-section new">
                        <div className="diff-label">New ({conflict.newContent.split('\n').length} lines)</div>
                        <pre className="diff-content">{conflict.newContent.slice(0, 200)}{conflict.newContent.length > 200 ? '...' : ''}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="conflict-modal-actions">
                <button 
                  onClick={() => handleConflictResolution('skip-all')}
                  className="conflict-btn skip"
                >
                  ⊘ Skip All
                </button>
                <button 
                  onClick={() => handleConflictResolution('overwrite-all')}
                  className="conflict-btn overwrite"
                >
                  ↻ Overwrite All
                </button>
                <button 
                  onClick={() => setShowConflictModal(false)}
                  className="conflict-btn cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Visual Preview Modal */}
        {showVisualPreview && previewHtml && (
          <div className="visual-preview-overlay" onClick={() => setShowVisualPreview(false)}>
            <div className="visual-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="visual-preview-header">
                <h3>👁️ Visual Preview</h3>
                <button onClick={() => setShowVisualPreview(false)} className="preview-close">✕</button>
              </div>
              <div className="visual-preview-content">
                <iframe 
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
                  title="Visual Preview"
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Iterative Refinement Mode */}
        {refinementMode && (
          <div className="refinement-banner">
            <span>🔄 Refinement Mode: Improving existing project</span>
            <button onClick={() => { setRefinementMode(false); setRefinementTarget(''); }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
};

// Language to display name mapping
const languageNames: Record<string, string> = {
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ts': 'TypeScript',
  'typescript': 'TypeScript',
  'tsx': 'TypeScript React',
  'jsx': 'JavaScript React',
  'py': 'Python',
  'python': 'Python',
  'html': 'HTML',
  'css': 'CSS',
  'scss': 'SCSS',
  'json': 'JSON',
  'yaml': 'YAML',
  'yml': 'YAML',
  'md': 'Markdown',
  'markdown': 'Markdown',
  'sql': 'SQL',
  'sh': 'Shell',
  'bash': 'Bash',
  'bat': 'Batch',
  'batch': 'Batch',
  'go': 'Go',
  'rust': 'Rust',
  'rs': 'Rust',
  'java': 'Java',
  'cpp': 'C++',
  'c': 'C',
  'php': 'PHP',
  'rb': 'Ruby',
  'ruby': 'Ruby',
  'xml': 'XML',
  'text': 'Plain Text'
};

// File extension to icon mapping
const fileIcons: Record<string, string> = {
  'js': '📜',
  'jsx': '⚛️',
  'ts': '📘',
  'tsx': '⚛️',
  'py': '🐍',
  'html': '🌐',
  'css': '🎨',
  'scss': '🎨',
  'json': '📋',
  'yaml': '⚙️',
  'yml': '⚙️',
  'md': '📝',
  'sql': '🗃️',
  'sh': '💻',
  'bash': '💻',
  'bat': '🖥️',
  'go': '🔷',
  'rust': '🦀',
  'rs': '🦀',
  'java': '☕',
  'cpp': '⚡',
  'c': '⚡',
  'php': '🐘',
  'rb': '💎',
  'ruby': '💎',
  'xml': '📰',
  'default': '📄'
};

// Get file icon based on extension
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return fileIcons[ext] || fileIcons['default'];
}

// Enhanced markdown formatter with syntax highlighting
function formatMarkdown(text: string): string {
  let codeBlockId = 0;
  
  return text
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks with language label and copy button
    .replace(/```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g, (match, lang, filename, code) => {
      const id = `code-block-${++codeBlockId}`;
      const displayLang = languageNames[(lang || '').toLowerCase()] || lang || 'Code';
      const fileLabel = filename ? `<span class="code-filename">${filename.trim()}</span>` : '';
      return `<div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang">${displayLang}</span>
          ${fileLabel}
          <button class="copy-code-btn" data-code-id="${id}" onclick="copyCodeBlock('${id}')" title="Copy code">
            <span class="copy-icon">📋</span>
            <span class="copy-text">Copy</span>
          </button>
        </div>
        <pre class="code-block" id="${id}"><code>${escapeHtml(code.trim())}</code></pre>
      </div>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="divider"/>')
    // Line breaks
    .replace(/\n/g, '<br/>');
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Copy code to clipboard (will be called via onclick)
if (typeof window !== 'undefined') {
  (window as any).copyCodeBlock = (id: string) => {
    const codeEl = document.getElementById(id);
    if (codeEl) {
      const code = codeEl.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector(`[data-code-id="${id}"]`);
        if (btn) {
          const textEl = btn.querySelector('.copy-text');
          if (textEl) {
            textEl.textContent = 'Copied!';
            setTimeout(() => {
              textEl.textContent = 'Copy';
            }, 2000);
          }
        }
      });
    }
  };
}

export default WordsToCode;
