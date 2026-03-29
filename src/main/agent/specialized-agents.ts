/**
 * Specialized Agent Architecture - WITH MIRROR INTELLIGENCE
 * 
 * Instead of one agent trying to do everything, we have specialists:
 * 1. Tool Orchestrator - Handles tool calls, parsing, execution
 * 2. JavaScript Specialist - Writes JS/TS/React code
 * 3. Python Specialist - Writes Python code
 * 4. Pipeline Specialist - Handles build/deploy/CI/CD
 * 5. Integration Analyst - Reviews work, wires things together, ensures coherence
 * 
 * NOW WITH MIRROR INTELLIGENCE:
 * - Each specialist learns from stored patterns
 * - Patterns are injected into prompts for better results
 * - Successes/failures are stored for future learning
 * - Anti-patterns are avoided based on past mistakes
 */

import aiRouter from '../ai-providers';
import type { ChatMessage, ChatOptions } from '../../types/ai-providers';
import { getRelevantPatterns, getAntiPatterns, storeTaskLearning } from '../mirror/mirror-singleton';
import { loadOpusExamples } from '../mirror/opus-example-loader';
import * as fs from 'fs';
import * as path from 'path';
import { withAITimeoutAndRetry, withSmartFallback, TimeoutError, FALLBACK_MODEL_CHAIN, detectModelSize } from '../core/timeout-utils';
import { retryWithRecovery, getUserFriendlyErrorMessage } from '../core/error-recovery';
import { transactionManager } from '../core/transaction-manager';
import { validateToolCall, fixToolCall, resetFileTracker, populateFileTracker, validatePackageJson, validateIndexHtml, validateJavaScriptFile, detectOrphanedFiles, getFileTrackerState, FileTrackerMode } from './tool-validation';
import { sanitizeFileName } from '../security/ipcValidation';
import { spawn } from 'child_process';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';
import { searchWithRipgrep } from '../core/ripgrep-runner';
import {
  getWorkspaceSymbolIndexForAgents,
  scheduleWorkspaceSymbolIndexRebuildForAgents
} from '../search/symbol-index';

interface AgentPendingFileChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  action: 'created' | 'modified' | 'deleted';
  status: 'pending' | 'accepted' | 'rejected';
}

interface AgentCommandOutputEvent {
  command: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
  timestamp: number;
}

/**
 * Get all project files from a workspace directory
 * Used to populate file tracker in FIX/ENHANCE mode
 */
function getAllProjectFiles(workspacePath: string, _maxDepth: number = 4): string[] {
  return listWorkspaceSourceFilesSync(workspacePath, 4000);
}

/**
 * Fast models for quick operations - ANTHROPIC/OPENAI FIRST (confirmed working!)
 */
const FAST_MODELS = [
  // Cloud providers - CONFIRMED WORKING!
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },  // Fast Claude
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },   // Deep Claude
  { provider: 'openai', model: 'gpt-4o-mini' },                   // Fast GPT
  { provider: 'openai', model: 'gpt-4o' },                        // Deep GPT
];

/**
 * Check if Ollama is running and has models available
 * Uses the configured baseUrl from aiRouter (supports local and cloud)
 */
async function checkOllamaHealth(): Promise<{ healthy: boolean; models: string[]; error?: string }> {
  try {
    const axios = require('axios');
    // Get the configured Ollama provider to use its baseUrl
    const ollamaProvider = aiRouter.getProvider('ollama') as any;
    const baseUrl = ollamaProvider?.baseUrl || 'http://127.0.0.1:11434';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    // Add API key for cloud endpoints
    if (ollamaProvider?.apiKey) {
      headers['Authorization'] = `Bearer ${ollamaProvider.apiKey}`;
    }
    
    const response = await axios.get(`${baseUrl}/api/tags`, { 
      headers,
      timeout: 5000 // Slightly longer timeout for cloud
    });
    const models = response.data?.models?.map((m: any) => m.name) || [];
    return { healthy: true, models };
  } catch (error: any) {
    return { 
      healthy: false, 
      models: [], 
      error: error.code === 'ECONNREFUSED' ? 'Ollama not running' : error.message 
    };
  }
}

/**
 * Check if a provider/model combo is a cloud service (doesn't need local installation)
 */
function isCloudProvider(provider: string, model: string): boolean {
  if (provider === 'anthropic' || provider === 'openai' || provider === 'openrouter') {
    return true;
  }
  // Ollama cloud models have 'cloud' in the name
  if (provider === 'ollama' && (model.includes('-cloud') || model.includes(':cloud') || model.includes('cloud'))) {
    return true;
  }
  return false;
}

/**
 * Get the best available model from preferences
 * UPDATED: Prioritizes cloud providers (Anthropic, OpenAI) that don't need local setup!
 */
async function getBestAvailableModel(preferredModels: Array<{provider: string, model: string}>): Promise<{provider: string, model: string} | null> {
  // First, check for cloud providers - they don't need local checks!
  for (const pref of preferredModels) {
    if (isCloudProvider(pref.provider, pref.model)) {
      console.log(`[ModelSelector] ☁️ Using CLOUD provider: ${pref.provider}/${pref.model}`);
      return pref;
    }
  }
  
  // For local Ollama models, check Ollama health
  const health = await checkOllamaHealth();
  
  if (!health.healthy) {
    console.warn(`[ModelSelector] Local Ollama not available: ${health.error}`);
    // If local Ollama isn't running but we have cloud providers, use first one
    const cloudModel = preferredModels.find(p => isCloudProvider(p.provider, p.model));
    if (cloudModel) {
      console.log(`[ModelSelector] ☁️ Falling back to cloud provider: ${cloudModel.provider}/${cloudModel.model}`);
      return cloudModel;
    }
    return null;
  }
  
  // Find first preferred LOCAL model that's actually installed
  for (const pref of preferredModels) {
    if (pref.provider === 'ollama' && !isCloudProvider(pref.provider, pref.model)) {
      // Check if model is installed (handle tag variations)
      const modelBase = pref.model.split(':')[0];
      const isInstalled = health.models.some(m => 
        m === pref.model || 
        m.startsWith(modelBase + ':') ||
        m === modelBase
      );
      
      if (isInstalled) {
        console.log(`[ModelSelector] Using available local model: ${pref.model}`);
        return pref;
      }
    }
  }
  
  // Return first available model as last resort
  if (health.models.length > 0) {
    console.log(`[ModelSelector] Using first available model: ${health.models[0]}`);
    return { provider: 'ollama', model: health.models[0] };
  }
  
  return null;
}

/**
 * Build pattern-enhanced prompt for a specialist
 * This is what makes specialists MIRROR engineering excellence
 * 
 * Like ActivatePrime mirrors understanding, this mirrors engineering:
 * 1. Loads learned patterns from mirror memory
 * 2. Injects real code examples from opus-examples
 * 3. Adds anti-patterns to avoid past mistakes
 * 4. Provides role-specific guidance
 */
async function buildMirrorEnhancedPrompt(
  task: string, 
  role: AgentRole, 
  basePrompt: string
): Promise<string> {
  // 🎯 OPUS MIRROR WRAPPER: Start with Opus-style identity
  let enhancedPrompt = `You are operating in OPUS MODE. This means you think, reason, and code EXACTLY like Claude Opus.

Claude Opus is known for:
- Deep, thorough analysis before coding
- Complete, production-ready solutions
- Exceptional code quality and structure
- Comprehensive error handling
- Understanding of full project context
- Following best practices automatically

**YOUR DIRECTIVE**: Mirror Opus's behavior so closely that your output is indistinguishable from Opus.

---

${basePrompt}`;
  
  try {
    // 🧠 MIRROR STEP 1: Get relevant patterns from mirror memory
    const patterns = await getRelevantPatterns(task, 5);
    if (patterns.length > 0) {
      enhancedPrompt += '\n\n## 🧠 LEARNED PATTERNS (Mirror these!)\n';
      enhancedPrompt += 'These patterns have worked well in the past. Apply them:\n';
      for (const pattern of patterns) {
        const confidence = pattern.confidence ? ` (${(pattern.confidence * 100).toFixed(0)}% confident)` : '';
        enhancedPrompt += `• ${pattern.type || 'pattern'}: ${pattern.description || 'N/A'}${confidence}\n`;
        if (pattern.examples && pattern.examples.length > 0) {
          // Include a snippet of the example (first 200 chars)
          const example = pattern.examples[0].substring(0, 200).replace(/\n/g, ' ');
          enhancedPrompt += `  Example: ${example}...\n`;
        }
      }
    }
    
    // 🧠 MIRROR STEP 2: Load real code examples from opus-examples
    // INCREASED: Load more examples to better mirror Opus behavior
    const opusExamples = await loadOpusExamples(task, 5); // Increased from 2 to 5
    if (opusExamples.length > 0) {
      enhancedPrompt += '\n\n## 🎯 CRITICAL: ACT EXACTLY LIKE CLAUDE OPUS\n';
      enhancedPrompt += 'You MUST mirror Claude Opus\'s behavior, thinking, and code quality.\n';
      enhancedPrompt += 'These are REAL examples from Claude Opus. Study them carefully and REPLICATE this exact style:\n\n';
      
      for (const example of opusExamples) {
        enhancedPrompt += `${example}\n\n`;
      }
      
      enhancedPrompt += '\n## 🧬 OPUS BEHAVIOR PATTERNS (MANDATORY)\n';
      enhancedPrompt += 'Claude Opus exhibits these behaviors - you MUST mirror them:\n';
      enhancedPrompt += '1. **Deep Thinking**: Opus thinks through problems step-by-step before coding\n';
      enhancedPrompt += '2. **Complete Solutions**: Opus creates FULL, working code - no placeholders\n';
      enhancedPrompt += '3. **Error Handling**: Opus always includes proper error handling\n';
      enhancedPrompt += '4. **Code Quality**: Opus writes clean, readable, well-structured code\n';
      enhancedPrompt += '5. **Context Awareness**: Opus understands the full project context\n';
      enhancedPrompt += '6. **Best Practices**: Opus follows industry best practices automatically\n';
      enhancedPrompt += '\n**YOUR GOAL**: Generate code that is INDISTINGUISHABLE from Claude Opus output.\n';
    }
    
    // 🧠 MIRROR STEP 3: Get anti-patterns (mistakes to avoid)
    const antiPatterns = await getAntiPatterns(3);
    if (antiPatterns.length > 0) {
      enhancedPrompt += '\n\n## ⚠️ AVOID THESE MISTAKES\n';
      enhancedPrompt += 'These have caused failures before. DO NOT do these:\n';
      for (const anti of antiPatterns) {
        enhancedPrompt += `• DON'T: ${anti.description || 'Unknown mistake'}\n`;
      }
    }
    
    // 🧠 MIRROR STEP 4: Add role-specific mirroring guidance
    enhancedPrompt += getRoleMirrorGuidance(role);
    
    // 🎯 FINAL OPUS REINFORCEMENT
    if (opusExamples.length > 0) {
      enhancedPrompt += '\n\n## 🔥 FINAL REMINDER: YOU ARE IN OPUS MODE\n';
      enhancedPrompt += 'Before you generate ANY code, ask yourself:\n';
      enhancedPrompt += '1. "Would Claude Opus write code this way?"\n';
      enhancedPrompt += '2. "Is this complete and production-ready like Opus would make it?"\n';
      enhancedPrompt += '3. "Does this match the quality and style of the Opus examples above?"\n';
      enhancedPrompt += '\nIf the answer to ANY of these is "no", revise your approach.\n';
      enhancedPrompt += '**Your output should be INDISTINGUISHABLE from Claude Opus.**\n';
    }
    
    console.log(`[MirrorAgents] 🧠 Enhanced ${role} prompt with ${patterns.length} patterns, ${opusExamples.length} Opus examples, ${antiPatterns.length} anti-patterns`);
  } catch (error) {
    console.warn('[MirrorAgents] Could not enhance prompt with patterns:', error);
  }
  
  return enhancedPrompt;
}

/**
 * Role-specific mirroring guidance - what each specialist should mirror
 */
function getRoleMirrorGuidance(role: AgentRole): string {
  const guidance: Record<AgentRole, string> = {
    tool_orchestrator: `
## 🎯 MIRROR: GREAT ORCHESTRATION
- Mirror how expert engineers break down complex tasks
- Delegate completely - don't try to do everything yourself
- Create proper project structure FIRST, then delegate code generation
- Ensure all specialists have clear, specific instructions`,

    javascript_specialist: `
## 🎯 MIRROR: EXPERT JS/TS ENGINEERING  
- Mirror production-quality code from top engineers
- COMPLETE files with ALL imports, NO placeholders
- Wire up ALL UI elements - buttons, events, everything
- Include error handling, loading states, edge cases
- Make it ACTUALLY WORK - not just compile

## 🚨 CRITICAL: CSS LINKS IN INDEX.HTML
EVERY index.html MUST have:
<link rel="stylesheet" href="/path/to/styles.css" />

This is the #1 cause of "blank/unstyled page" bugs!
If you create styles.css or src/styles.css, you MUST link it.`,

    python_specialist: `
## 🎯 MIRROR: PYTHONIC EXCELLENCE
- Mirror clean, readable Python from expert engineers
- Type hints on EVERYTHING
- Proper error handling with specific exceptions
- Complete requirements.txt with version pins
- Docstrings that actually explain behavior`,

    tauri_specialist: `
## 🎯 MIRROR: TAURI V2 BEST PRACTICES
- Use EXACT Tauri v2 configuration format (NOT v1)
- ALWAYS use "devUrl" not "devPath"
- ALWAYS use "frontendDist" not "distDir"
- NEVER use deprecated "api-all" feature
- ALWAYS configure proper CSP security
- ALWAYS initialize plugins in Rust (.plugin(tauri_plugin_shell::init()))
- Include complete project structure with .gitignore and icons/
- Use latest dependency versions (January 2026)`,

    pipeline_specialist: `
## 🎯 MIRROR: DEVOPS BEST PRACTICES
- Mirror production-ready build configurations
- Use COMPATIBLE dependency versions (check for known issues)
- Include ALL required config files (webpack.config.js, etc.)
- Test scripts that actually run
- Clear documentation for setup`,

    integration_analyst: `
## 🎯 MIRROR: SENIOR ENGINEER CODE REVIEW
- Mirror how senior engineers review PRs
- Check EVERY file connection (HTML → JS → CSS)
- Verify ALL imports resolve correctly
- Ensure event handlers are wired up
- Identify missing pieces before they cause runtime errors

## 🚨 CRITICAL CHECK: CSS LINKS
FIRST thing to verify: Does index.html have <link rel="stylesheet">?
If CSS files exist but no link tag = BROKEN PROJECT = FIX IMMEDIATELY
This is the #1 cause of "unstyled page" bugs!`
  };
  
  return guidance[role] || '';
}

export type AgentRole = 
  | 'tool_orchestrator'  // Handles tool calls, parsing, execution flow
  | 'javascript_specialist'  // JS/TS/React/Node code
  | 'python_specialist'  // Python code
  | 'tauri_specialist'  // Tauri v2 / Rust desktop apps
  | 'pipeline_specialist'  // Build/deploy/CI/CD
  | 'integration_analyst';  // Reviews, wires together, ensures coherence

export interface AgentConfig {
  role: AgentRole;
  model: string;
  provider: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

/**
 * CRITICAL: Tool call output format that ALL agents must use
 * The parseToolCalls function looks for lines containing {"name": and "arguments":
 */
const TOOL_CALL_FORMAT = `
## 🔧 CRITICAL: OUTPUT FORMAT (REQUIRED)
You MUST output tool calls as JSON on separate lines. Each file creation MUST be a separate line:

{"name": "write_file", "arguments": {"path": "relative/path/to/file.ext", "content": "COMPLETE FILE CONTENT HERE"}}

RULES:
1. One JSON object per line
2. Path is relative to project root
3. Content must be the COMPLETE file - no placeholders, no "..." 
4. Escape quotes in content with \\"
5. Escape newlines in content with \\n
6. Do NOT wrap in markdown code blocks
7. Do NOT add explanations - ONLY output the JSON lines

EXAMPLE for a simple project:
{"name": "write_file", "arguments": {"path": "package.json", "content": "{\\n  \\"name\\": \\"my-project\\",\\n  \\"version\\": \\"1.0.0\\"\\n}"}}
{"name": "write_file", "arguments": {"path": "src/index.js", "content": "console.log('Hello World');"}}
{"name": "write_file", "arguments": {"path": "README.md", "content": "# My Project\\n\\nA cool project."}}

DISCOVERY (large or unfamiliar repos — ripgrep + symbol index):
{"name": "search_codebase", "arguments": {"query": "patternOrRegex", "include_pattern": "**/*.ts", "exclude_pattern": "**/node_modules/**", "max_results": 40}}
{"name": "find_symbols", "arguments": {"query": "SymbolName", "max_results": 40}}
`;

/**
 * Agent Specialization Configurations
 * 
 * ENHANCED: Now uses FAST LOCAL MODELS by default!
 * Cloud models are too slow and unreliable for interactive use.
 * Local 7B-14B models are plenty capable for code generation.
 */
export const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  tool_orchestrator: {
    role: 'tool_orchestrator',
    model: 'qwen3-coder:480b-cloud',  // CLOUD MODEL - POWERFUL
    provider: 'ollama',
    temperature: 0.2, // Low temperature = more Opus-like deterministic thinking
    maxTokens: 16384,
    systemPrompt: `You are the Tool Orchestrator for complex multi-file web applications. You coordinate the creation of sophisticated projects.

**OPUS MODE ACTIVE**: You are operating in Claude Opus mode. Think deeply, plan thoroughly, and execute with Opus-level quality.

Your job is to CREATE FILES using tool calls. You MUST output JSON tool calls to create all necessary project files.

## YOUR RESPONSIBILITIES
1. Analyze the user's request
2. Plan the project structure
3. Create ALL necessary files using write_file tool calls
4. Include: package.json, source files, config files, README.md

## 🚨 CRITICAL: PROJECT COHERENCE RULES

### RULE 1: ONE PROJECT ONLY
- Focus EXCLUSIVELY on the project the user requested
- If user asks for a Tetris game, create ONLY Tetris-related files
- NEVER mix code from other projects (portfolio sites, other games, templates)
- Every file's content must be specific to THIS project

### RULE 2: NO DUPLICATE FILES
- NEVER create the same file in multiple locations
- Pick ONE location for each file type:
  - Put ALL JavaScript/TypeScript in src/ OR root, not both
  - Put ALL CSS in src/ OR root, not both
  - index.html goes in root (for Vite) or public/
- If you create src/script.js, do NOT also create script.js in root
- If you create src/styles.css, do NOT also create styles.css in root

### RULE 3: FILE REFERENCES MUST CONNECT
- Every JS/CSS file must be referenced by index.html or imported by another file
- Check: Does index.html's <script src="..."> match the actual file path?
- Check: Does index.html's <link href="..."> match the actual CSS path?
- NO orphaned files - every file must be part of the project's dependency graph

### RULE 4: CROSS-PLATFORM npm SCRIPTS + BUNDLERS
When creating package.json scripts:
❌ WRONG: "start": "open index.html"          (macOS only)
❌ WRONG: "start": "xdg-open index.html"      (Linux only)
❌ WRONG: "start": "start index.html"         (Windows only)
✅ CORRECT: "start": "node server.js"         (for Node servers)

**Static HTML only (no npm imports in JS):** "start": "npx serve" is OK for plain script tags / relative paths.

**If JavaScript uses \`import ... from 'three'\`, \`import ... from 'react'\`, or ANY npm package name:**
Browsers cannot resolve bare specifiers without a bundler. You MUST ship **Vite**:
- \`devDependencies\`: \`"vite": "^5.4.0"\` (and \`@vitejs/plugin-react\` if React)
- \`scripts\`: \`"dev": "vite"\`, \`"build": "vite build"\`, \`"preview": "vite preview"\`, \`"start": "vite"\` (or \`npm run dev\` in README)
- \`vite.config.js\` at project root with \`defineConfig\`
- README: "Run \`npm install\` then \`npm run dev\`"

❌ NEVER use ONLY \`npx serve\` / \`serve\` as the run path for Three.js/React/Vue projects — the page will load but **imports will fail silently in the console**.

### RULE 5: CONTENT MUST MATCH TASK
- If user asks for "Tetris game", file content must be Tetris code
- If user asks for "Portfolio website", file content must be portfolio code
- NEVER generate hamburger menus for a Tetris game
- NEVER generate Tetris pieces for a portfolio site
- Read the task carefully and ensure every line of code relates to it

### RULE 6: 🚨 ALWAYS LINK CSS IN INDEX.HTML
This is CRITICAL - every project will look unstyled without this!

When creating index.html, you MUST include:
\`\`\`html
<link rel="stylesheet" href="/path/to/your/styles.css" />
\`\`\`

- If CSS is at src/styles.css → use href="/src/styles.css"
- If CSS is at styles.css → use href="/styles.css"
- NEVER create CSS files without linking them in index.html
- NEVER forget the stylesheet link tag

WITHOUT THIS, THE PAGE WILL BE COMPLETELY UNSTYLED!

### RULE 7: 🚨 NO BUNDLER-ONLY SYNTAX FOR SIMPLE PROJECTS
❌ NEVER write: \`import "./styles.css"\` in JavaScript!

This ONLY works with Vite/Webpack bundlers. If user opens index.html directly:
- Browser tries to parse \`import "./styles.css"\`
- ENTIRE JAVASCRIPT FAILS
- Buttons don't work, game doesn't start, NOTHING functions!

✅ Use <link rel="stylesheet"> in HTML instead
✅ If project REQUIRES bundler, README MUST say "Run npm run dev"

${TOOL_CALL_FORMAT}`
  },

  javascript_specialist: {
    role: 'javascript_specialist',
    model: 'qwen3-coder:480b-cloud',  // CLOUD MODEL - EXCELLENT AT CODING
    provider: 'ollama',
    temperature: 0.3, // Slightly higher for creativity, but still Opus-like
    maxTokens: 16384,
    systemPrompt: `You are a JavaScript/TypeScript specialist. You CREATE FILES containing complete, production-ready code.

**OPUS MODE ACTIVE**: You are operating in Claude Opus mode. Your code must match Opus's quality, completeness, and style.

## EXPERTISE AREAS
- React, Vue 3, Svelte, vanilla JS
- Three.js + WebGL + 3D graphics
- Node.js backend development
- TypeScript with proper types
- Modern frontend architectures

## IMPLEMENTATION RULES
✅ Create COMPLETE, WORKING code - no TODOs or placeholders
✅ Proper imports at the top of each file
✅ Error handling for all edge cases
✅ All features requested must be fully implemented
✅ Each file must be self-contained and complete

## REACT + VITE + TYPESCRIPT CRITICAL REQUIREMENTS
When creating React/Vite projects, you MUST create these files:

### 1. index.html (IN PROJECT ROOT - NOT in src/)
\`\`\`html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App Title</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
\`\`\`

### 2. src/main.tsx (React 18 entry point)
\`\`\`typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
\`\`\`

### 3. tsconfig.json (MUST have jsx option)
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
\`\`\`

### 4. vite.config.ts
\`\`\`typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
\`\`\`

### COMMON MISTAKES TO AVOID
❌ NEVER forget index.html in project root - Vite will not start!
❌ NEVER use .tsxx extension - ALWAYS use .tsx
❌ NEVER omit "jsx": "react-jsx" from tsconfig.json
❌ NEVER use ReactDOM.render() - use createRoot() for React 18
❌ NEVER forget to import React in components
❌ NEVER create CSS files without linking them in index.html!
❌ NEVER create JS files without a script tag in index.html!

### 🚨 CRITICAL: ALWAYS LINK CSS IN INDEX.HTML
When you create ANY CSS file, you MUST include it in index.html:

\`\`\`html
<head>
  <!-- ... other head content ... -->
  <link rel="stylesheet" href="/src/styles.css" />  <!-- REQUIRED! -->
</head>
\`\`\`

If CSS file is at: src/styles.css → href="/src/styles.css"
If CSS file is at: styles.css → href="/styles.css"

WITHOUT THIS LINK, THE PAGE WILL BE UNSTYLED!

### 🚨 CRITICAL: AVOID BUNDLER-ONLY SYNTAX FOR SIMPLE PROJECTS
❌ NEVER do this in main.js: \`import "./styles.css"\`

This is Vite/Webpack-only syntax! If user opens index.html directly:
- Browser sees \`import "./styles.css"\`
- JavaScript FAILS TO PARSE
- NOTHING WORKS - no game, no buttons, no functionality!

✅ Instead, ALWAYS use <link> tags in index.html for CSS:
\`\`\`html
<link rel="stylesheet" href="/src/styles.css" />
\`\`\`

Only use CSS imports if:
1. It's a Vite project that REQUIRES \`npm run dev\` to run
2. README clearly states "Run npm install && npm run dev"
3. User understands they can't just open index.html

## CSS OVERLAY/MODAL PATTERNS - CRITICAL
When creating overlay UIs (modals, screens, menus), follow these rules:

### CORRECT PATTERN for hidden overlays:
\`\`\`css
/* Parent overlay/screen - controls visibility */
.screen {
  opacity: 0;
  pointer-events: none;  /* REQUIRED - prevents click interception */
  z-index: 10;
}
.screen.active {
  opacity: 1;
  pointer-events: auto;  /* Only active screen gets clicks */
}

/* Child buttons - INHERIT from parent */
.screen .button {
  /* NO pointer-events here! Let parent control it */
  /* Or use: pointer-events: inherit; */
}
\`\`\`

### WRONG PATTERN (causes hidden buttons to intercept clicks):
\`\`\`css
/* ❌ BAD - button overrides parent's pointer-events:none */
.button {
  pointer-events: all;  /* This BREAKS hidden overlay pattern! */
}
\`\`\`

### WHY THIS MATTERS:
- If parent has pointer-events:none but child has pointer-events:all
- The child button CAN STILL BE CLICKED even when parent is invisible!
- Users will click through to hidden buttons, breaking the UI

### CORRECT APPROACH:
1. Put pointer-events:none on hidden overlays
2. Put pointer-events:auto on .active overlays ONLY
3. NEVER put pointer-events:all on buttons inside overlays
4. Let buttons inherit pointer-events from their parent container

## 🚨 CRITICAL: FILE ORGANIZATION RULES

### RULE 1: PICK ONE LOCATION
For each file type, use a consistent location:
- JavaScript: ALL in src/ OR ALL in root (prefer src/)
- CSS: ALL in src/ OR ALL in root (prefer src/)
- index.html: ALWAYS in root for Vite projects

### RULE 2: NO DUPLICATE FILES
❌ NEVER create both: script.js AND src/script.js
❌ NEVER create both: styles.css AND src/styles.css
❌ NEVER create both: game.js AND src/game.js
✅ Pick ONE location and stick with it

### RULE 3: MATCH REFERENCES TO FILES
If index.html has: <script src="src/game.js">
Then create: src/game.js (NOT game.js in root)

If index.html has: <link href="styles.css">
Then create: styles.css in root (NOT src/styles.css)

### RULE 4: PROJECT-SPECIFIC CODE ONLY
- Tetris task = Tetris code (pieces, rotation, clearing lines)
- Portfolio task = Portfolio code (sections, contact forms, galleries)
- Game task = Game code (players, enemies, scores)
- NEVER mix code from different project types

### RULE 5: CROSS-PLATFORM npm SCRIPTS
✅ "dev": "vite" (required when using \`import\` from npm packages in browser code)
✅ "start": "npx serve" — **only** for static sites with no bare \`import 'package'\` in JS
✅ "start": "node server.js"
❌ "start": "open index.html"  (macOS only!)

### RULE 6: THREE.JS / WEBGL / REACT — USE VITE
If the project imports \`three\`, React, Vue, or any npm module in \`src/*.js\`:
- Include \`vite.config.js\`, \`vite\` in devDependencies, and module entry in \`index.html\` (\`<script type="module" src="/src/main.js">\` is correct **only** with Vite dev server).

${TOOL_CALL_FORMAT}`
  },

  python_specialist: {
    role: 'python_specialist',
    model: 'qwen3-coder:480b-cloud',  // CLOUD MODEL - GREAT AT PYTHON
    provider: 'ollama',
    temperature: 0.3,
    maxTokens: 16384,
    systemPrompt: `You are a Python specialist. You CREATE FILES containing complete, production-ready Python code.

## IMPLEMENTATION RULES
✅ Type hints on all functions
✅ Proper error handling with specific exceptions
✅ Complete requirements.txt with version pins
✅ Docstrings for all public functions
✅ No TODOs or placeholders - complete code only

${TOOL_CALL_FORMAT}`
  },

  tauri_specialist: {
    role: 'tauri_specialist',
    model: 'deepseek-v3.1:671b-cloud',  // CLOUD MODEL - BEST FOR COMPLEX TASKS
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: 16384,
    systemPrompt: `You are a Tauri v2 and Rust specialist. You CREATE FILES for modern desktop applications using Tauri 2.x.

## TAURI V2 CRITICAL REQUIREMENTS (MUST FOLLOW EXACTLY)

### Package.json Dependencies
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

### tauri.conf.json V2 FORMAT (NOT V1!)
- Use "devUrl" NOT "devPath"
- Use "frontendDist" NOT "distDir"
- NEVER include "withGlobalTauri" - IT DOES NOT EXIST IN V2!
- NEVER use nested "tauri" object - v2 uses flat structure
- NEVER include "allowlist" - v2 uses capabilities system
- ALWAYS configure CSP security (never null)
- Include $schema reference
- Build section should ONLY contain: beforeBuildCommand, beforeDevCommand, devUrl, frontendDist

### Cargo.toml (EXACT FORMAT - DO NOT DEVIATE)
\`\`\`toml
[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-shell = "2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
\`\`\`
NEVER use these deprecated features: "shell-open", "protocol-asset", "api-all" - they DO NOT EXIST in Tauri v2!

### Rust Code - MUST initialize plugins
\`\`\`rust
// DO NOT use SystemExt - it was removed in sysinfo 0.30+
use sysinfo::System;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![...])
        .run(tauri::generate_context!())
        .expect("error running application");
}
\`\`\`

### index.html - CORRECT FORMAT
\`\`\`html
<script type="module" src="/src/main.tsx"></script>
\`\`\`
NEVER use .tsxx - always use .tsx for TypeScript React files!

### Icons - DO NOT CREATE PLACEHOLDER TEXT FILES
- DO NOT create icons/ files with text content - they must be binary images
- Just create an empty icons/ directory or reference real image files
- Tauri will fail if icon files contain text like "# Placeholder"

## CRITICAL MISTAKES TO AVOID (THESE WILL BREAK THE BUILD)
❌ NEVER include "withGlobalTauri" in build config - NOT VALID IN V2
❌ NEVER use nested "tauri" object - v2 uses flat structure
❌ NEVER use "allowlist" - v2 uses capabilities system
❌ NEVER use features = ["api-all", "shell-open", "protocol-asset"] - DEPRECATED/REMOVED
❌ NEVER use "devPath" - use "devUrl" (v2 format)
❌ NEVER use "distDir" - use "frontendDist" (v2 format)
❌ NEVER set CSP to null - always configure security
❌ NEVER forget .plugin(tauri_plugin_shell::init())
❌ NEVER use .tsxx extension - ALWAYS use .tsx
❌ NEVER use sysinfo::SystemExt - removed in sysinfo 0.30+
❌ NEVER create text files as icon placeholders - they must be binary or empty
❌ NEVER mix Tauri v1 and v2 - use ALL v2 deps (tauri="2", tauri-build="2", tauri-plugin-shell="2")
❌ NEVER use "package.productName" - v2 uses "productName" at root level
❌ NEVER set devUrl to a file path - must be "http://localhost:1420"
❌ NEVER use get_window() in Rust - v2 uses get_webview_window()
❌ NEVER use port other than 1420 in Vite for Tauri projects

## ALWAYS INCLUDE
✅ .gitignore (target/, dist/, node_modules/)
✅ icons/ directory (empty is OK, but NO text placeholder files)
✅ Security headers in index.html
✅ Comprehensive CSP policy
✅ Correct script src in index.html: /src/main.tsx (NOT .tsxx)

${TOOL_CALL_FORMAT}`
  },

  pipeline_specialist: {
    role: 'pipeline_specialist',
    model: 'qwen3-coder:480b-cloud',  // CLOUD MODEL - GOOD FOR CONFIGS
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: 8192,
    systemPrompt: `You are a DevOps and build pipeline specialist. You CREATE configuration files, build scripts, and deployment setups.

## EXPERTISE
- Build systems (webpack, vite, esbuild)
- CI/CD pipelines (GitHub Actions)
- Docker, containerization
- Package management (npm, pip, cargo)

${TOOL_CALL_FORMAT}`
  },

  integration_analyst: {
    role: 'integration_analyst',
    model: 'deepseek-v3.1:671b-cloud',  // CLOUD MODEL - SMART FOR ANALYSIS
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: 16384,
    systemPrompt: `You are an integration analyst. Review the project and CREATE any missing files needed for the project to work.

## YOUR JOB
1. Check if all necessary files exist
2. Identify missing connections or files
3. CREATE any missing files using tool calls
4. Ensure the project is complete and runnable

## 🚨 CRITICAL: DETECT AND FIX THESE ISSUES

### ISSUE 1: ORPHANED FILES
Check every JS/CSS file - is it actually used?
- Look at index.html: Does it reference the file?
- Look at imports: Does any other file import it?
- If a file exists but nothing references it = ORPHANED = DELETE IT or FIX THE REFERENCE

Example of orphaned file detection:
- Files created: src/game.js, src/utils.js, styles.css
- index.html references: src/game.js, styles.css
- Problem: src/utils.js is ORPHANED (nothing imports it)
- Solution: Either import it in game.js OR delete it

### ISSUE 2: DUPLICATE FILES
Check for same file in multiple locations:
❌ BAD: script.js exists AND src/script.js exists
❌ BAD: styles.css exists AND src/styles.css exists
- If duplicates exist with DIFFERENT content = SERIOUS ERROR
- Solution: Keep only the file that index.html references, delete the other

### ISSUE 3: PROJECT MIXING
Check that ALL file content matches the task:
- If task is "Tetris game" but file has "hamburger menu" = WRONG PROJECT
- If task is "Portfolio" but file has "tetromino" = WRONG PROJECT
- Content from unrelated projects means the AI confused multiple projects
- Solution: Flag the error, the files need to be regenerated

### ISSUE 4: BROKEN REFERENCES
Check that all references in index.html point to files that exist:
- <script src="src/game.js"> → src/game.js must exist
- <link href="styles.css"> → styles.css must exist
- If file doesn't exist = CREATE IT
- If path is wrong = FIX THE REFERENCE

### ISSUE 5: PLATFORM-SPECIFIC npm SCRIPTS
Check package.json scripts for cross-platform issues:
❌ "start": "open index.html" → Only works on macOS
❌ "start": "xdg-open index.html" → Only works on Linux
✅ "start": "npx serve" → Works everywhere
✅ "dev": "vite" → Works everywhere

### CHECKLIST FOR EVERY PROJECT:
1. [ ] index.html exists and is valid HTML
2. [ ] index.html has <link rel="stylesheet" href="..."> for EVERY CSS file created
3. [ ] index.html has <script src="..."> for JS files (or type="module" for Vite)
4. [ ] All <script> tags point to existing files
5. [ ] All <link> tags point to existing files
6. [ ] No duplicate files with same name in different locations
7. [ ] All JS/CSS files are referenced somewhere
8. [ ] package.json scripts work cross-platform
9. [ ] All file content matches the project task (no mixing)
10. [ ] NO \`import "./styles.css"\` in JS (unless Vite project with clear instructions)
11. [ ] If bundler required, README clearly states "npm run dev" is needed

### ISSUE 5: MISSING CSS LINKS (MOST COMMON MISTAKE!)
Check index.html for stylesheet links:
- If src/styles.css exists → index.html MUST have <link rel="stylesheet" href="/src/styles.css">
- If styles.css exists → index.html MUST have <link rel="stylesheet" href="/styles.css">
- WITHOUT THE LINK TAG, THE PAGE WILL BE UNSTYLED!
- This is the #1 reason projects look broken when opened in browser

### ISSUE 6: BUNDLER-ONLY SYNTAX (BUTTONS DON'T WORK!)
Check JavaScript files for CSS imports:
- \`import "./styles.css"\` in JS = BREAKS when opening index.html directly
- Browser cannot parse CSS imports → ENTIRE JS FAILS → NO FUNCTIONALITY
- If found: Either remove CSS import and use <link> in HTML, or ensure README says "npm run dev required"

${TOOL_CALL_FORMAT}`
  }
};

/**
 * Route a task to the appropriate specialist(s)
 */
export function routeToSpecialists(
  task: string,
  context: {
    files?: string[];
    language?: string;
    projectType?: string;
  } = {}
): AgentRole[] {
  const taskLower = task.toLowerCase();
  const roles: AgentRole[] = [];

  // Always need orchestrator for tool calls
  roles.push('tool_orchestrator');

  // Detect language/project type
  const isJavaScript = 
    taskLower.includes('javascript') ||
    taskLower.includes('typescript') ||
    taskLower.includes('react') ||
    taskLower.includes('node') ||
    taskLower.includes('jsx') ||
    taskLower.includes('tsx') ||
    taskLower.includes('website') ||
    taskLower.includes('webpage') ||
    taskLower.includes('web page') ||
    taskLower.includes('web app') ||
    taskLower.includes('webapp') ||
    taskLower.includes('frontend') ||
    taskLower.includes('front-end') ||
    taskLower.includes('html') ||
    taskLower.includes('css') ||
    taskLower.includes('vue') ||
    taskLower.includes('svelte') ||
    taskLower.includes('next') ||
    taskLower.includes('nuxt') ||
    taskLower.includes('angular') ||
    taskLower.includes('landing page') ||
    taskLower.includes('landing') ||
    taskLower.includes('homepage') ||
    taskLower.includes('home page') ||
    taskLower.includes('portfolio') ||
    taskLower.includes('blog') ||
    taskLower.includes('dashboard') ||
    taskLower.includes('responsive') ||
    taskLower.includes('ui') ||
    taskLower.includes('interface') ||
    taskLower.includes('component') ||
    taskLower.includes('button') ||
    taskLower.includes('form') ||
    taskLower.includes('modal') ||
    taskLower.includes('navbar') ||
    taskLower.includes('menu') ||
    taskLower.includes('animation') ||
    context.language === 'javascript' ||
    context.language === 'typescript' ||
    context.files?.some(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx') || f.endsWith('.html') || f.endsWith('.vue') || f.endsWith('.svelte'));

  const isPython =
    taskLower.includes('python') ||
    taskLower.includes('fastapi') ||
    taskLower.includes('flask') ||
    taskLower.includes('django') ||
    context.language === 'python' ||
    context.files?.some(f => f.endsWith('.py'));

  const needsPipeline =
    taskLower.includes('build') ||
    taskLower.includes('deploy') ||
    taskLower.includes('ci/cd') ||
    taskLower.includes('pipeline') ||
    taskLower.includes('docker') ||
    taskLower.includes('package.json') ||
    taskLower.includes('requirements.txt');

  // Add specialists
  if (isJavaScript) {
    roles.push('javascript_specialist');
  }
  if (isPython) {
    roles.push('python_specialist');
  }
  if (needsPipeline) {
    roles.push('pipeline_specialist');
  }

  // Always add integration analyst for multi-file projects
  if (context.files && context.files.length > 1) {
    roles.push('integration_analyst');
  }

  // Smart fallback: If no specialists detected but task looks like project creation, add javascript_specialist
  const isCreationTask = 
    taskLower.includes('create') ||
    taskLower.includes('build') ||
    taskLower.includes('make') ||
    taskLower.includes('generate') ||
    taskLower.includes('develop') ||
    taskLower.includes('implement') ||
    taskLower.includes('design') ||
    taskLower.includes('add') ||
    taskLower.includes('new');

  if (roles.length === 1 && roles[0] === 'tool_orchestrator' && isCreationTask) {
    console.log('[RouteToSpecialists] No specialist detected for creation task, defaulting to javascript_specialist');
    roles.push('javascript_specialist');
  }

  return roles;
}

/**
 * Execute a task using specialized agents
 * 
 * This is a simplified version - in production, this would integrate
 * with the actual tool execution system from agent-loop.ts
 */
// Note: Tools are accessed via executeTool function, not directly imported

/**
 * Extract requirements from planning text.
 * Models vary: bullets (- * •), numbered (1. 1) 2)), or plain paragraphs.
 */
function extractRequirements(planContent: string): string[] {
  const raw = planContent.trim();
  if (!raw) return [];

  const stripListPrefix = (s: string): string =>
    s.replace(/^[-*•·▪]\s+/, '').replace(/^\d+[\).\s]+\s*/, '').trim();

  const requirements: string[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('• ') ||
      trimmed.startsWith('· ') ||
      trimmed.startsWith('▪ ') ||
      /^\d+\.\s/.test(trimmed) ||
      /^\d+\)\s/.test(trimmed)
    ) {
      const item = stripListPrefix(trimmed);
      if (item.length > 0) requirements.push(item);
    }
  }

  if (requirements.length === 0 && raw.length > 40) {
    for (const line of lines) {
      const t = line.trim();
      if (t.length < 20) continue;
      if (/^#{1,6}\s/.test(t)) continue;
      if (t.startsWith('```')) continue;
      if (/^---+$/u.test(t)) continue;
      requirements.push(t);
    }
    return requirements.slice(0, 50);
  }

  return requirements;
}

/**
 * Parse tool calls from AI response content
 * Supports multiple formats:
 * 1. JSON lines: {"name": "write_file", "arguments": {...}}
 * 2. JSON in code blocks
 * 3. FILE: path format (fallback for markdown output)
 */
function parseToolCalls(content: string): any[] {
  const toolCalls: any[] = [];
  
  // Method 1: Look for JSON tool calls on each line
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.includes('{"name":') && trimmedLine.includes('"arguments":')) {
      try {
        // Try to extract JSON from the line (might have extra text around it)
        const jsonMatch = trimmedLine.match(/\{[^{}]*"name"[^{}]*"arguments"[^{}]*\{.*\}[^{}]*\}/);
        if (jsonMatch) {
          const toolCall = JSON.parse(jsonMatch[0]);
          if (toolCall.name && toolCall.arguments) {
            toolCalls.push(toolCall);
          }
        } else {
          // Try parsing the whole line
          const toolCall = JSON.parse(trimmedLine);
          if (toolCall.name && toolCall.arguments) {
            toolCalls.push(toolCall);
          }
        }
      } catch (e) {
        // Try extracting just the JSON object
        try {
          const startIdx = trimmedLine.indexOf('{');
          const endIdx = trimmedLine.lastIndexOf('}');
          if (startIdx !== -1 && endIdx !== -1) {
            const jsonStr = trimmedLine.substring(startIdx, endIdx + 1);
            const toolCall = JSON.parse(jsonStr);
            if (toolCall.name && toolCall.arguments) {
              toolCalls.push(toolCall);
            }
          }
        } catch (e2) {
          // Skip invalid JSON
        }
      }
    }
  }
  
  // Method 2: If no JSON tool calls found, try FILE: format (Composer-style)
  if (toolCalls.length === 0) {
    const filePattern = /FILE:\s*([^\n]+)\n```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      const filePath = match[1].trim();
      const fileContent = match[3];
      toolCalls.push({
        name: 'write_file',
        arguments: {
          path: filePath,
          content: fileContent
        }
      });
    }
  }
  
  // Method 3: Try to find JSON objects in code blocks
  if (toolCalls.length === 0) {
    const codeBlockPattern = /```(?:json)?\n?([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockPattern.exec(content)) !== null) {
      const blockContent = match[1].trim();
      // Check if it looks like a tool call
      if (blockContent.includes('"name"') && blockContent.includes('"write_file"')) {
        try {
          const toolCall = JSON.parse(blockContent);
          if (toolCall.name && toolCall.arguments) {
            toolCalls.push(toolCall);
          }
        } catch (e) {
          // Try parsing multiple JSON objects
          const jsonLines = blockContent.split('\n').filter(l => l.trim().startsWith('{'));
          for (const jsonLine of jsonLines) {
            try {
              const toolCall = JSON.parse(jsonLine.trim());
              if (toolCall.name && toolCall.arguments) {
                toolCalls.push(toolCall);
              }
            } catch (e2) {
              // Skip
            }
          }
        }
      }
    }
  }
  
  console.log(`[parseToolCalls] Extracted ${toolCalls.length} tool calls from response`);
  return toolCalls;
}

/**
 * Execute a tool call
 */
export interface SpecialistExecutionCallbacks {
  shouldCancel?: () => boolean;
  onToolStart?: (event: { type: string; title: string; specialist?: string }) => void;
  onToolComplete?: (event: { type: string; title: string; success: boolean; specialist?: string; error?: string }) => void;
  onFileChange?: (change: AgentPendingFileChange) => void;
  onCommandOutput?: (event: AgentCommandOutputEvent) => void;
}

async function executeTool(
  toolCall: any,
  workspacePath: string,
  callbacks?: SpecialistExecutionCallbacks
): Promise<any> {
  const { name, arguments: args } = toolCall;

  if (callbacks?.shouldCancel?.()) {
    throw new Error('Specialized agent cancelled by user');
  }

  switch (name) {
    case 'write_file':
      // === SANITIZE FILENAME ===
      // Remove invalid characters from the filename (like *, <, >, :, ", |, ?, etc.)
      let sanitizedPath = args.path;
      const pathParts = sanitizedPath.split(/[\/\\]/);
      if (pathParts.length > 0) {
        const originalFileName = pathParts[pathParts.length - 1];
        const sanitizedFileName = sanitizeFileName(originalFileName);
        if (sanitizedFileName !== originalFileName) {
          console.log(`[ToolExecution] Sanitized filename: "${originalFileName}" -> "${sanitizedFileName}"`);
          pathParts[pathParts.length - 1] = sanitizedFileName;
          sanitizedPath = pathParts.join('/');
        }
      }
      
      const filePath = path.join(workspacePath, sanitizedPath);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 🛡️ VALIDATE PACKAGE.JSON for cross-platform issues
      if (sanitizedPath.endsWith('package.json')) {
        const pkgValidation = validatePackageJson(args.content || '');
        if (pkgValidation.warning) {
          console.warn(`[ToolExecution] ⚠️ ${pkgValidation.warning}`);
        }
        if (!pkgValidation.valid) {
          console.error(`[ToolExecution] ❌ package.json validation failed: ${pkgValidation.error}`);
        }
      }
      
      // 🛡️ CHECK INDEX.HTML for CSS/JS links (warning only - full validation at end)
      if (sanitizedPath.endsWith('index.html') || sanitizedPath === 'index.html') {
        // Quick check if there's a stylesheet link at all
        const hasStylesheetLink = (args.content || '').toLowerCase().includes('rel="stylesheet"');
        if (!hasStylesheetLink) {
          console.warn(`[ToolExecution] ⚠️ index.html has no <link rel="stylesheet"> tag - page may be unstyled!`);
        }
      }
      
      // 🛡️ CHECK JS FILES for bundler-only syntax (CSS imports)
      if (sanitizedPath.endsWith('.js') || sanitizedPath.endsWith('.ts') || sanitizedPath.endsWith('.jsx') || sanitizedPath.endsWith('.tsx')) {
        const jsValidation = validateJavaScriptFile(args.content || '', sanitizedPath);
        if (jsValidation.warning) {
          console.warn(`[ToolExecution] ⚠️ JavaScript validation warning:\n${jsValidation.warning}`);
        }
      }
      
      const existedBefore = fs.existsSync(filePath);
      const oldContent = existedBefore ? fs.readFileSync(filePath, 'utf-8') : null;
      fs.writeFileSync(filePath, args.content || '', 'utf-8');
      scheduleWorkspaceSymbolIndexRebuildForAgents();
      callbacks?.onFileChange?.({
        filePath: sanitizedPath.replace(/\\/g, '/'),
        oldContent: oldContent ?? '',
        newContent: args.content || '',
        action: existedBefore ? 'modified' : 'created',
        status: 'pending'
      });
      return { action: 'write_file', path: sanitizedPath, success: true };

    case 'read_file':
      const readPath = path.join(workspacePath, args.path);
      if (fs.existsSync(readPath)) {
        const content = fs.readFileSync(readPath, 'utf-8');
        return { action: 'read_file', path: args.path, content, success: true };
      }
      return { action: 'read_file', path: args.path, error: 'File not found', success: false };

    case 'run_command': {
      const command = args.command || '';
      const cwd = args.cwd || '.';
      const timeout = typeof args.timeout === 'number' ? args.timeout : 120;
      const workDir = path.resolve(workspacePath, cwd);

      return await new Promise((resolve, reject) => {
        if (callbacks?.shouldCancel?.()) {
          reject(new Error('Specialized agent cancelled by user'));
          return;
        }

        const child = spawn(command, {
          cwd: workDir,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const resolveOnce = (value: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clearInterval(cancelPoll);
          resolve(value);
        };
        const rejectOnce = (err: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clearInterval(cancelPoll);
          reject(err);
        };

        child.stdout.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          callbacks?.onCommandOutput?.({
            command,
            stream: 'stdout',
            chunk,
            timestamp: Date.now()
          });
        });
        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;
          callbacks?.onCommandOutput?.({
            command,
            stream: 'stderr',
            chunk,
            timestamp: Date.now()
          });
        });

        const timer = setTimeout(() => {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
          rejectOnce(new Error(`Command timed out after ${timeout}s`));
        }, timeout * 1000);

        const cancelPoll = setInterval(() => {
          if (!callbacks?.shouldCancel?.() || child.killed) return;
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
        }, 250);

        child.on('close', (code) => {
          if (callbacks?.shouldCancel?.()) {
            rejectOnce(new Error('Specialized agent cancelled by user'));
            return;
          }
          resolveOnce({
            action: 'run_command',
            command,
            cwd,
            exit_code: code,
            stdout,
            stderr,
            success: code === 0
          });
        });

        child.on('error', (error) => {
          rejectOnce(error);
        });
      });
    }

    case 'search_codebase': {
      const query = (args.query as string) || '';
      const include_pattern = args.include_pattern as string | undefined;
      const exclude_pattern = (args.exclude_pattern as string) || '**/node_modules/**';
      const max_results =
        typeof args.max_results === 'number' && args.max_results > 0 ? args.max_results : 40;
      const rg = await searchWithRipgrep(workspacePath, query, {
        includePattern: include_pattern,
        excludePattern: exclude_pattern,
        maxResults: max_results,
        timeoutMs: 25_000
      });
      return {
        action: 'search_codebase',
        success: rg.success,
        matches: rg.matches,
        total: rg.matches.length,
        message: rg.message,
        usedBundledRg: rg.usedBundledRg
      };
    }

    case 'find_symbols': {
      const idx = getWorkspaceSymbolIndexForAgents();
      if (!idx) {
        return { action: 'find_symbols', success: false, error: 'Symbol index not ready', symbols: [] };
      }
      await idx.whenReady();
      const max = typeof args.max_results === 'number' && args.max_results > 0 ? args.max_results : 40;
      const symbols = idx.search((args.query as string) || '', max);
      return { action: 'find_symbols', success: true, symbols };
    }

    default:
      return { action: name, error: 'Unknown tool', success: false };
  }
}

/**
 * Build project context string for agents
 */
function buildProjectContext(context: any): string {
  let contextStr = '';

  if (context.workspacePath) {
    contextStr += `\n## PROJECT CONTEXT\n`;
    contextStr += `Workspace: ${context.workspacePath}\n\n`;
  }

  if (context.files && context.files.length > 0) {
    contextStr += `### EXISTING FILES IN PROJECT:\n`;
    contextStr += `These files already exist. Their contents are shown below:\n\n`;

    // Read and include contents of key files (package.json, main entry points, etc.)
    const keyFiles = context.files.filter((f: string) =>
      f.includes('package.json') ||
      f.includes('index.html') ||
      f.includes('Game.ts') ||
      f.includes('World.ts')
    );

    if (keyFiles.length > 0) {
      contextStr += `**KEY FILE CONTENTS (READ THESE!):**\n\n`;
      for (const file of keyFiles.slice(0, 5)) {
        try {
          const fullPath = path.join(context.workspacePath, file);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const preview = content.length > 1000 ? content.substring(0, 1000) + '\n... (truncated)' : content;
            contextStr += `**${file}:**\n\`\`\`\n${preview}\n\`\`\`\n\n`;
          }
        } catch (err) {
          // Skip if can't read
        }
      }
    }
  }

  contextStr += `\n**IMPORTANT:**\n`;
  contextStr += `- If you see existing files like "src/game/Game.ts" or "src/game/world/World.ts", DO NOT create duplicate files.\n`;
  contextStr += `- Instead, enhance or use the existing structure.\n`;
  contextStr += `- Build on top of what's already there, don't replace it.\n\n`;

  return contextStr;
}

/**
 * Build shared context from tool execution results
 */
function buildSharedContext(sharedContext: any): string {
  let contextStr = '## SHARED CONTEXT\n';

  if (sharedContext.filesCreated && sharedContext.filesCreated.size > 0) {
    contextStr += '\n**Files Created:**\n';
    for (const file of sharedContext.filesCreated) {
      contextStr += `- ${file}\n`;
    }
  }

  if (sharedContext.requirements && sharedContext.requirements.length > 0) {
    contextStr += '\n**Requirements Identified:**\n';
    for (const req of sharedContext.requirements) {
      contextStr += `- ${req}\n`;
    }
  }

  return contextStr;
}

export async function executeWithSpecialists(
  task: string,
  roles: AgentRole[],
  context: any = {},
  taskMode: FileTrackerMode = 'create',
  callbacks?: SpecialistExecutionCallbacks
): Promise<{
  results: Map<AgentRole, string>;
  finalAnalysis?: string;
  executedTools: any[];
}> {
  const results = new Map<AgentRole, string>();
  const executedTools: any[] = [];
  const successfulPatterns: any[] = [];
  const mistakes: string[] = [];
  const assertNotCancelled = () => {
    if (callbacks?.shouldCancel?.()) {
      throw new Error('Specialized agent cancelled by user');
    }
  };
  assertNotCancelled();

  // 🛡️ FILE TRACKER MODE - Behavior depends on task type
  // - CREATE: Full reset for new projects
  // - FIX/REVIEW/ENHANCE: Preserve existing files to prevent accidental overwrites
  resetFileTracker(taskMode);
  console.log(`[MirrorAgents] 🛡️ File tracker mode: ${taskMode.toUpperCase()}`);
  
  // In FIX/ENHANCE mode, populate tracker with existing project files
  if ((taskMode === 'fix' || taskMode === 'enhance') && context.workspacePath) {
    try {
      const existingFiles = getAllProjectFiles(context.workspacePath);
      populateFileTracker(existingFiles);
    } catch (e) {
      console.warn('[MirrorAgents] Could not populate file tracker with existing files:', e);
    }
  }

  console.log('[MirrorAgents] 🧠 Starting mirror-enhanced specialized agent execution');

  // HEALTH CHECK: Make sure Ollama is running before we start
  const health = await checkOllamaHealth();
  if (!health.healthy) {
    throw new Error(`❌ Ollama is not running! Please start Ollama first.\nError: ${health.error}\n\nRun: ollama serve`);
  }
  console.log(`[MirrorAgents] ✅ Ollama healthy with ${health.models.length} models available`);

  // Shared context for agent coordination
  const sharedContext: {
    architecture?: string;
    framework?: string;
    dependencies: string[];
    filesCreated: Map<string, string>;
    decisions: Map<string, string>;
    requirements: string[];
    implementedFeatures: string[];
  } = {
    dependencies: [],
    filesCreated: new Map(),
    decisions: new Map(),
    requirements: [],
    implementedFeatures: []
  };

  // Get best available model for planning.
  // Ollama cloud models listed first so the agent works out of the box
  // without requiring paid API credits.
  const DEFAULT_MODEL_CHAIN = [
    { name: 'Qwen3-Coder-Next Cloud', provider: 'ollama', model: 'qwen3-coder-next:cloud', tier: 'deep' },
    { name: 'Qwen3-Coder 480b Cloud', provider: 'ollama', model: 'qwen3-coder:480b-cloud', tier: 'deep' },
    { name: 'Claude Sonnet', provider: 'anthropic', model: 'claude-sonnet-4-20250514', tier: 'deep' },
    { name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', tier: 'deep' },
    { name: 'Claude Haiku', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
  ];

  const planningModels = DEFAULT_MODEL_CHAIN.map(m => ({ provider: m.provider, model: m.model }));
  const planningModel = await getBestAvailableModel(planningModels);
  assertNotCancelled();

  if (!planningModel) {
    // Instead of failing, provide helpful guidance
    const health = await checkOllamaHealth();
    if (!health.healthy) {
      throw new Error('❌ Ollama is not running!\n\nStart Ollama with:\n  ollama serve\n\nThen pull a model:\n  ollama pull deepseek-coder:6.7b');
    } else {
      throw new Error(`❌ No suitable models found!\n\nAgentPrime prioritizes CLOUD models for power and reliability.\nYour cloud models should work without local installation.\n\nAvailable models: ${health.models.join(', ') || 'none'}\n\nIf you see connection errors, check your Ollama Cloud API keys in Settings.`);
    }
  }

  // Step 0: Planning Phase - Break down task into requirements (FAST)
  console.log(`[MirrorAgents] 📋 Step 0: Planning with ${planningModel.model}`);
  aiRouter.setActiveProvider(planningModel.provider, planningModel.model);
  
  const planningOrchestrator = AGENT_CONFIGS.tool_orchestrator;
  const planningPrompt = await buildMirrorEnhancedPrompt(
    task,
    'tool_orchestrator',
    planningOrchestrator.systemPrompt
  );

  let planningResponse;
  try {
    planningResponse = await withAITimeoutAndRetry(
      () => aiRouter.chat([
        { role: 'system', content: planningPrompt },
        { role: 'user', content: `Task: ${task}

Break this task down into:
1. Core features (must-have) - list each feature
2. Nice-to-have features - list each feature  
3. Technical requirements (framework, libraries, etc.)
4. File structure needed
5. Dependencies required

Output as a structured list. Be specific and comprehensive.` }
      ], {
        model: planningModel.model,
        temperature: 0.3,
        maxTokens: 2000
      }),
      'chat',  // Use chat timeout, not complex - planning should be fast
      planningModel.model
    );
  } catch (error) {
    console.warn('[MirrorAgents] ⚠️ Planning phase failed, continuing without structured plan');
    planningResponse = { success: false };
  }

  if (planningResponse.success) {
    const planContent = planningResponse.content || '';
    const requirements = extractRequirements(planContent);
    sharedContext.requirements = requirements;
    console.log(`[MirrorAgents] 📋 Planning complete: ${requirements.length} requirements identified`);
  }

  // Create checkpoint after planning
  const planningCheckpoint = transactionManager.createCheckpoint('planning_complete');
  if (planningCheckpoint) {
    console.log(`[MirrorAgents] ✅ Checkpoint created: ${planningCheckpoint}`);
  }

  // Step 1: Orchestrator plans and executes initial tools
  // ENHANCED: Use smart fallback with fast local models
  const orchestrator = AGENT_CONFIGS.tool_orchestrator;

  // 🧠 MIRROR: Build pattern-enhanced prompt for orchestrator
  const enhancedOrchestratorPrompt = await buildMirrorEnhancedPrompt(
    task, 
    'tool_orchestrator', 
    orchestrator.systemPrompt
  );

  // Use SMART FALLBACK - tries fast models first, falls back gracefully
  console.log('[MirrorAgents] 🚀 Starting orchestrator with smart fallback...');
  
  let orchestratorResponse;
  let usedModel = orchestrator.model;
  
  try {
    const result = await withSmartFallback(
      async (provider, model) => {
        aiRouter.setActiveProvider(provider, model);
        usedModel = model;
        const response = await aiRouter.chat([
          { role: 'system', content: enhancedOrchestratorPrompt },
          { role: 'user', content: `${task}\n\nCreate ALL necessary files for this project. Output each file as a JSON tool call on its own line.` }
        ], {
          model: model,
          temperature: orchestrator.temperature,
          maxTokens: orchestrator.maxTokens
        });
        
        // Throw on failure so withSmartFallback can try next model
        if (!response.success) {
          throw new Error(response.error || 'Model returned unsuccessful response');
        }
        return response;
      },
      orchestrator.provider,
      orchestrator.model,
      'complex'
    );
    
    orchestratorResponse = result.result;
    if (result.usedFallback) {
      console.log(`[MirrorAgents] ⚡ Used fallback model: ${result.finalModel} (${result.attempts} attempts)`);
      usedModel = result.finalModel || usedModel;
    }
  } catch (error: any) {
    mistakes.push(`Orchestrator complete failure: ${error.message}`);
    await storeTaskLearning(task, false, [], mistakes);

    // Check what models are actually available for better error message
    const health = await checkOllamaHealth();
    let errorMessage = `❌ All models failed! Error: ${error.message}\n\n`;

    if (!health.healthy) {
      errorMessage += `Ollama is not running!\n\nStart Ollama with:\n  ollama serve\n\nThen pull a model:\n  ollama pull deepseek-coder:6.7b`;
    } else {
      errorMessage += `Make sure Ollama has compatible models installed:\n\nAvailable: ${health.models.join(', ') || 'none'}\n\nRecommended models:\n  ollama pull deepseek-coder:6.7b  (fast & reliable)\n  ollama pull llama3.2:8b          (good balance)\n  ollama pull qwen2.5:7b            (smaller qwen)`;
    }

    throw new Error(errorMessage);
  }

  if (!orchestratorResponse.success) {
    mistakes.push(`Orchestrator failed: ${orchestratorResponse.error}`);
    await storeTaskLearning(task, false, [], mistakes);
    throw new Error(`Orchestrator failed: ${orchestratorResponse.error}`);
  }
  
  console.log(`[MirrorAgents] ✅ Orchestrator completed with ${usedModel}`);

  results.set('tool_orchestrator', orchestratorResponse.content || '');

  // Parse and execute tool calls from orchestrator
  const orchestratorTools = parseToolCalls(orchestratorResponse.content || '');
  for (const toolCall of orchestratorTools) {
    assertNotCancelled();
    try {
      // Validate tool call before execution
      const validation = validateToolCall(toolCall.function || toolCall, context.workspacePath, task);
      if (!validation.valid) {
        console.error(`[ToolValidation] Orchestrator tool validation failed: ${validation.error}`);
        mistakes.push(`Tool validation failed: ${validation.error}`);
        continue;
      }

      // Fix tool call if needed
      const fixedToolCall = validation.fixedPath 
        ? fixToolCall(toolCall, validation)
        : toolCall;

      const normalized = fixedToolCall.function || fixedToolCall;
      const toolName = normalized.name || 'unknown_tool';
      const toolArgs = normalized.arguments || {};
      const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
      callbacks?.onToolStart?.({ type: toolName, title: toolTitle, specialist: 'tool_orchestrator' });
      const result = await executeTool(fixedToolCall, context.workspacePath, callbacks);
      callbacks?.onToolComplete?.({ type: toolName, title: toolTitle, success: true, specialist: 'tool_orchestrator' });
      executedTools.push({ toolCall: fixedToolCall, result });
      
      // Track created files in shared context
      if (result.action === 'write_file' && result.path) {
        sharedContext.filesCreated.set(result.path, 'orchestrator');
      }
    } catch (error) {
      console.warn(`Orchestrator tool execution failed:`, error);
      mistakes.push(`Orchestrator tool execution: ${error}`);
      const normalized = (toolCall as any).function || toolCall;
      const toolName = normalized.name || 'unknown_tool';
      const toolArgs = normalized.arguments || {};
      const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
      callbacks?.onToolComplete?.({
        type: toolName,
        title: toolTitle,
        success: false,
        specialist: 'tool_orchestrator',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Create checkpoint after orchestrator
  const orchestratorCheckpoint = transactionManager.createCheckpoint('orchestrator_complete');
  if (orchestratorCheckpoint) {
    console.log(`[MirrorAgents] ✅ Checkpoint created: ${orchestratorCheckpoint}`);
  }

  // Step 2: Execute specialists - they generate code that gets written to files
  // ENHANCED: Use smart fallback for each specialist
  console.log('[MirrorAgents] 🔧 Running specialists with smart fallback...');

  for (const role of roles) {
    assertNotCancelled();
    if (role === 'tool_orchestrator') continue; // Already done

    const config = AGENT_CONFIGS[role];

    // 🧠 MIRROR: Build pattern-enhanced prompt for this specialist
    const enhancedPrompt = await buildMirrorEnhancedPrompt(task, role, config.systemPrompt);

    try {
      // Use smart fallback for each specialist
      const specialistResult = await withSmartFallback(
        async (provider, model) => {
          aiRouter.setActiveProvider(provider, model);
          const response = await aiRouter.chat([
            { role: 'system', content: enhancedPrompt },
            {
              role: 'user',
              content: `Task: ${task}

${buildProjectContext(context)}
${buildSharedContext(sharedContext)}`
            }
          ], {
            model: model,
            temperature: config.temperature,
            maxTokens: config.maxTokens
          });
          
          // Throw on failure so withSmartFallback can try next model
          if (!response.success) {
            throw new Error(response.error || 'Model returned unsuccessful response');
          }
          return response;
        },
        config.provider,
        config.model,
        'chat'
      );

      const response = specialistResult.result;
      
      if (specialistResult.usedFallback) {
        console.log(`[MirrorAgents] ⚡ ${role} used fallback: ${specialistResult.finalModel}`);
      }

      if (response.success) {
        results.set(role, response.content || '');
        
        // 🔧 CRITICAL FIX: Parse and execute tool calls from specialists too!
        const specialistTools = parseToolCalls(response.content || '');
        console.log(`[MirrorAgents] Specialist ${role} returned ${specialistTools.length} tool calls`);
        
        for (const toolCall of specialistTools) {
          assertNotCancelled();
          try {
            // Validate tool call before execution
            const validation = validateToolCall(toolCall.function || toolCall, context.workspacePath, task);
            if (!validation.valid) {
              console.error(`[ToolValidation] ${role} tool validation failed: ${validation.error}`);
              mistakes.push(`${role} tool validation failed: ${validation.error}`);
              continue;
            }

            // Fix tool call if needed
            const fixedToolCall = validation.fixedPath 
              ? fixToolCall(toolCall, validation)
              : toolCall;

            const normalized = fixedToolCall.function || fixedToolCall;
            const toolName = normalized.name || 'unknown_tool';
            const toolArgs = normalized.arguments || {};
            const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
            callbacks?.onToolStart?.({ type: toolName, title: toolTitle, specialist: role });
            const result = await executeTool(fixedToolCall, context.workspacePath, callbacks);
            callbacks?.onToolComplete?.({ type: toolName, title: toolTitle, success: true, specialist: role });
            executedTools.push({ toolCall: fixedToolCall, result, specialist: role });
            
            // Track created files in shared context
            if (result.action === 'write_file' && result.path) {
              sharedContext.filesCreated.set(result.path, role);
              console.log(`[MirrorAgents] ✅ ${role} created file: ${result.path}`);
            }
          } catch (error) {
            console.warn(`[MirrorAgents] ${role} tool execution failed:`, error);
            mistakes.push(`${role} tool execution: ${error}`);
            const normalized = (toolCall as any).function || toolCall;
            const toolName = normalized.name || 'unknown_tool';
            const toolArgs = normalized.arguments || {};
            const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
            callbacks?.onToolComplete?.({
              type: toolName,
              title: toolTitle,
              success: false,
              specialist: role,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        successfulPatterns.push({
          type: 'successful_agent_response',
          description: `Agent ${role} completed task successfully`,
          category: 'communication',
          confidence: 0.9
        });
      } else {
        console.warn(`[MirrorAgents] Agent ${role} failed: ${response.error}`);
        mistakes.push(`Agent ${role} failed: ${response.error}`);
        results.set(role, `Failed: ${response.error}`);
      }
    } catch (error: any) {
      console.warn(`[MirrorAgents] Agent ${role} failed completely: ${error.message}`);
      mistakes.push(`Agent ${role} failed: ${error.message}`);
      results.set(role, `Failed: ${error.message}`);
      // Continue with other specialists even if one fails
    }
  }

  // Step 3: Integration analyst reviews everything
  // ENHANCED: Use smart fallback for analyst too
  if (roles.includes('integration_analyst')) {
    const analyst = AGENT_CONFIGS.integration_analyst;

    // 🧠 MIRROR: Build pattern-enhanced prompt for analyst
    const enhancedAnalystPrompt = await buildMirrorEnhancedPrompt(task, 'integration_analyst', analyst.systemPrompt);

    const allWork = Array.from(results.entries())
      .map(([role, content]) => `[${role}]:\n${content}`)
      .join('\n\n---\n\n');

    let analysis;
    try {
      const analysisResult = await withSmartFallback(
        async (provider, model) => {
          aiRouter.setActiveProvider(provider, model);
          const response = await aiRouter.chat([
            { role: 'system', content: enhancedAnalystPrompt },
            { role: 'user', content: `Review the project:\n\n${allWork}\n\nTask: ${task}\n\nAnalyze for completeness and integration issues. If files are missing, CREATE them using tool calls.` }
          ], {
            model: model,
            temperature: analyst.temperature,
            maxTokens: analyst.maxTokens
          });
          
          // Throw on failure so withSmartFallback can try next model
          if (!response.success) {
            throw new Error(response.error || 'Model returned unsuccessful response');
          }
          return response;
        },
        analyst.provider,
        analyst.model,
        'analysis'
      );
      
      analysis = analysisResult.result;
      if (analysisResult.usedFallback) {
        console.log(`[MirrorAgents] ⚡ Analyst used fallback: ${analysisResult.finalModel}`);
      }
    } catch (error: any) {
      console.warn(`[MirrorAgents] Integration analyst failed: ${error.message}`);
      analysis = { success: false, error: error.message };
    }

    if (analysis.success) {
      console.log('[MirrorAgents] ✅ Integration analysis complete');

      // Execute any tools the analyst wants to run
      const analystTools = parseToolCalls(analysis.content || '');
      for (const toolCall of analystTools) {
        assertNotCancelled();
        try {
          // Validate tool call
          const validation = validateToolCall(toolCall.function || toolCall, context.workspacePath, task);
          if (!validation.valid) {
            console.error(`[ToolValidation] Analyst tool validation failed: ${validation.error}`);
            continue;
          }

          const fixedToolCall = validation.fixedPath
            ? fixToolCall(toolCall, validation)
            : toolCall;

          const normalized = fixedToolCall.function || fixedToolCall;
          const toolName = normalized.name || 'unknown_tool';
          const toolArgs = normalized.arguments || {};
          const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
          callbacks?.onToolStart?.({ type: toolName, title: toolTitle, specialist: 'integration_analyst' });
          const result = await executeTool(fixedToolCall, context.workspacePath, callbacks);
          callbacks?.onToolComplete?.({ type: toolName, title: toolTitle, success: true, specialist: 'integration_analyst' });
          executedTools.push({ toolCall: fixedToolCall, result, specialist: 'integration_analyst' });

          if (result.action === 'write_file' && result.path) {
            sharedContext.filesCreated.set(result.path, 'integration_analyst');
          }
        } catch (error) {
          console.warn(`Analyst tool execution failed:`, error);
          const normalized = (toolCall as any).function || toolCall;
          const toolName = normalized.name || 'unknown_tool';
          const toolArgs = normalized.arguments || {};
          const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
          callbacks?.onToolComplete?.({
            type: toolName,
            title: toolTitle,
            success: false,
            specialist: 'integration_analyst',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // 🧠 MIRROR: Check if the project was successful based on analysis
      const analysisContentForSuccess = analysis.content?.toLowerCase() || '';
      const wasSuccessful = !analysisContentForSuccess.includes('missing') &&
                            !analysisContentForSuccess.includes('incomplete') &&
                            !analysisContentForSuccess.includes('error') &&
                            executedTools.length > 0;

      if (wasSuccessful) {
        successfulPatterns.push({
          type: 'successful_project',
          description: `Successfully completed: ${task.substring(0, 100)}`,
          category: 'problemSolving',
          confidence: 0.85
        });
        console.log('[MirrorAgents] ✅ Project appears successful - storing patterns');
      } else {
        mistakes.push('Project may have issues based on integration analysis');
        console.log('[MirrorAgents] ⚠️ Project may have issues - storing for learning');
      }

      // 🧠 MIRROR: Store learnings for integration analyst case
      await storeTaskLearning(task, true, successfulPatterns, mistakes);

      return {
        results,
        finalAnalysis: analysis.content || undefined,
        executedTools
      };
    }
  }

  // 🛡️ POST-EXECUTION VALIDATION: Check for missing CSS links in index.html
  // This runs AFTER all files are created to catch the common "forgot to link CSS" mistake
  const createdFiles = getFileTrackerState();
  const indexHtmlPaths = Array.from(createdFiles.keys()).filter(f => f.endsWith('index.html'));
  
  for (const indexPath of indexHtmlPaths) {
    try {
      const fullPath = path.join(context.workspacePath, indexPath);
      if (fs.existsSync(fullPath)) {
        const htmlContent = fs.readFileSync(fullPath, 'utf-8');
        const htmlValidation = validateIndexHtml(htmlContent, createdFiles);
        
        if (!htmlValidation.valid) {
          console.error(`[MirrorAgents] ❌ POST-VALIDATION FAILED: ${htmlValidation.error}`);
          mistakes.push(`Missing CSS/JS links in index.html: ${htmlValidation.error}`);
          
          // Log which CSS files exist but aren't linked
          const cssFiles = Array.from(createdFiles.keys()).filter(f => f.endsWith('.css'));
          if (cssFiles.length > 0) {
            console.error(`[MirrorAgents] 🔴 CSS files created but NOT linked: ${cssFiles.join(', ')}`);
            console.error(`[MirrorAgents] 🔴 Add to index.html: <link rel="stylesheet" href="/${cssFiles[0]}" />`);
          }
        } else {
          console.log(`[MirrorAgents] ✅ index.html validation passed - CSS/JS properly linked`);
        }
      }
    } catch (e) {
      // Skip validation errors
    }
  }

  // 🧠 MIRROR: Store learnings when no integration analyst
  const overallSuccess = executedTools.length > 0 && mistakes.length === 0;
  await storeTaskLearning(task, overallSuccess, successfulPatterns, mistakes);

  console.log(`[MirrorAgents] 🧠 Task completed. Tools executed: ${executedTools.length}, Mistakes: ${mistakes.length}`);

  return { results, executedTools };
}
