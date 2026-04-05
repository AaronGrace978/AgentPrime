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
import { withAITimeoutAndRetry, withSmartFallback, TimeoutError, FALLBACK_MODEL_CHAIN, detectModelSize, type RuntimeBudgetMode } from '../core/timeout-utils';
import { retryWithRecovery, getUserFriendlyErrorMessage } from '../core/error-recovery';
import { transactionManager } from '../core/transaction-manager';
import { getBudgetAdjustedMaxTokens, getRecommendedMaxTokens } from '../core/model-output-limits';
import { getTelemetryService } from '../core/telemetry-service';
import { validateToolCall, fixToolCall, resetFileTracker, populateFileTracker, validatePackageJson, validateIndexHtml, validateJavaScriptFile, detectOrphanedFiles, getFileTrackerState, FileTrackerMode } from './tool-validation';
import { sanitizeFileName } from '../security/ipcValidation';
import { spawn } from 'child_process';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';
import { searchWithRipgrep } from '../core/ripgrep-runner';
import {
  detectCanonicalTemplateId,
  scaffoldProjectFromTemplate,
  workspaceNeedsDeterministicScaffold,
} from './scaffold-resolver';
import {
  getWorkspaceSymbolIndexForAgents,
  scheduleWorkspaceSymbolIndexRebuildForAgents
} from '../search/symbol-index';
import {
  LEGACY_SPECIALIST_ROLE_MAP,
  getSpecialistDefinition,
  type SpecialistArtifact,
  type SpecialistBlackboard,
  type SpecialistId,
} from './specialist-contracts';
import { resolveAgentAutonomyPolicy } from './autonomy-policy';

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

export async function bootstrapDeterministicScaffold(
  workspacePath: string,
  task: string,
  callbacks?: SpecialistExecutionCallbacks
): Promise<Array<{ toolCall: any; result: any; specialist: string }>> {
  const templateId = detectCanonicalTemplateId(task);
  if (!templateId || !workspaceNeedsDeterministicScaffold(workspacePath)) {
    return [];
  }
  const scaffolded = await scaffoldProjectFromTemplate(workspacePath, task, {
    callbacks,
    runPostCreate: false,
  });
  if (!scaffolded.success) {
    console.warn(`[MirrorAgents] Deterministic bootstrap skipped: ${scaffolded.error}`);
    return [];
  }

  if (scaffolded.createdFiles.length > 0) {
    populateFileTracker(scaffolded.createdFiles);
    console.log(`[MirrorAgents] 🛡️ Seeded file tracker with ${scaffolded.createdFiles.length} scaffolded file(s)`);
  }

  return scaffolded.createdFiles.map((filePath) => ({
    toolCall: {
      name: 'write_file',
      arguments: { path: filePath }
    },
    result: { action: 'write_file', path: filePath, success: true, scaffolded: scaffolded.templateId },
    specialist: 'deterministic_bootstrap'
  }));
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
  if (provider === 'ollama') {
    // Ollama cloud models often include "cloud" in the model id.
    if (model.includes('-cloud') || model.includes(':cloud') || model.includes('cloud')) {
      return true;
    }

    // Also treat Ollama cloud endpoints as cloud even when model ids don't include ":cloud"
    // (e.g. gemma4, gemma4:31b on https://ollama.com).
    try {
      const ollamaProvider = aiRouter.getProvider('ollama') as any;
      const baseUrl = String(ollamaProvider?.baseUrl || '').toLowerCase();
      if (baseUrl.includes('ollama.com') || baseUrl.includes('deepseek.com')) {
        return true;
      }
    } catch {
      // Ignore provider inspection errors and fall through.
    }
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
 * After a deterministic template is materialized, every model must treat the user's task
 * as the source of truth — not the template's demo (e.g. voxel/Minecraft-style chunks).
 */
function appendScaffoldCustomizationInstructions(
  basePrompt: string,
  scaffoldApplied: boolean,
  scaffoldTemplateId?: string
): string {
  if (!scaffoldApplied) {
    return basePrompt;
  }
  const tid = scaffoldTemplateId || 'template';
  return (
    `${basePrompt}\n\n` +
    `## SCAFFOLD ALREADY ON DISK (${tid})\n` +
    `A Vite + React + Three.js project was already written to the workspace (package.json, vite.config, src/game/*, etc.).\n` +
    `- Do **not** call \`scaffold_project\` again or regenerate the whole repository from scratch.\n` +
    `- The template may include **generic demo gameplay** (block worlds, chunk loaders, placeholder mechanics). Replace it with what the user asked for.\n` +
    `- The user's **task text** defines theme, mechanics, camera, controls, and art direction.\n` +
    `- Prefer \`write_file\` JSON tool lines targeting the files that already exist on disk so \`npm run build\` still passes.\n` +
    `- Reuse the scaffold's exact folder structure. If the workspace has \`src/game/world/World.ts\`, do **not** invent \`src/game/World.ts\`.\n` +
    `- Keep cross-file contracts compatible: preserve inherited method signatures and existing call-site APIs unless you update every affected file in the same pass.\n`
  );
}

/**
 * Build pattern-enhanced prompt for a specialist
 * This is what makes specialists MIRROR engineering excellence
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
    const opusExampleLimit =
      role === 'tool_orchestrator'
        ? 2
        : role === 'integration_analyst'
          ? 1
          : 1;
    const opusExamples = await loadOpusExamples(task, opusExampleLimit);
    if (opusExamples.length > 0) {
      enhancedPrompt += '\n\n## 🎯 CRITICAL: ACT EXACTLY LIKE CLAUDE OPUS\n';
      enhancedPrompt += 'You MUST mirror Claude Opus\'s behavior, thinking, and code quality.\n';
      enhancedPrompt += 'These are REAL examples from Claude Opus. Study them carefully and REPLICATE this exact style:\n\n';
      
      for (const example of opusExamples) {
        enhancedPrompt += `${example}\n\n`;
      }
      
      if (role === 'tool_orchestrator') {
        enhancedPrompt += '\n## 🧬 OPUS BEHAVIOR PATTERNS (MANDATORY)\n';
        enhancedPrompt += 'Claude Opus exhibits these behaviors - you MUST mirror them:\n';
        enhancedPrompt += '1. **Deep Thinking**: Opus thinks through problems step-by-step before coding\n';
        enhancedPrompt += '2. **Complete Solutions**: Opus creates FULL, working code - no placeholders\n';
        enhancedPrompt += '3. **Error Handling**: Opus always includes proper error handling\n';
        enhancedPrompt += '4. **Code Quality**: Opus writes clean, readable, well-structured code\n';
        enhancedPrompt += '5. **Context Awareness**: Opus understands the full project context\n';
        enhancedPrompt += '6. **Best Practices**: Opus follows industry best practices automatically\n';
        enhancedPrompt += '\n**YOUR GOAL**: Generate code that is INDISTINGUISHABLE from Claude Opus output.\n';
      } else {
        enhancedPrompt += '\nMirror the example style, but keep your output concise and implementation-focused.\n';
      }
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

    // 🧠 MIRROR STEP 5: Add discipline reflection loop prompts
    const specialistId =
      role === 'repair_specialist'
        ? 'repair_specialist'
        : LEGACY_SPECIALIST_ROLE_MAP[role as keyof typeof LEGACY_SPECIALIST_ROLE_MAP];
    if (specialistId) {
      const specialistDefinition = getSpecialistDefinition(specialistId);
      if (specialistDefinition.reflectionFocus.length > 0) {
        enhancedPrompt += '\n\n## 🔁 DOMAIN REFLECTION LOOP\n';
        enhancedPrompt += `You are operating as a ${specialistDefinition.discipline} expert.\n`;
        enhancedPrompt += 'Before finalizing your response, reflect on these questions:\n';
        for (const question of specialistDefinition.reflectionFocus) {
          enhancedPrompt += `- ${question}\n`;
        }
        enhancedPrompt += 'If any answer reveals scope drift, weak evidence, or incomplete work, revise before responding.\n';
      }
    }
    
    // 🎯 FINAL OPUS REINFORCEMENT
    if (opusExamples.length > 0 && role === 'tool_orchestrator') {
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

    styling_ux_specialist: `
## 🎯 MIRROR: PRODUCT-QUALITY UX POLISH
- Mirror strong visual hierarchy, spacing, and interaction clarity
- Prefer focused CSS/layout changes over wholesale rewrites
- Make loading, hover, focus, and empty states feel intentional
- Preserve accessibility and readability while improving polish
- NEVER modify gameplay/runtime logic files under src/game/** (.ts/.tsx)`,

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
- Clear documentation for setup

## 🚨 WRITABLE SCOPE (NON-NEGOTIABLE)
You may ONLY create or edit: package manifests/locks, Vite/TS configs, CI workflows, Docker/Make, and root-level launcher scripts (e.g. *.bat).
You must NEVER use write_file or patch_file on application source under \`src/\`, \`backend/\`, or tests—those belong to javascript_specialist, python_specialist, or repair_specialist.
If the task needs fixes in \`src/\`, emit no source writes here; use run_command to verify (npm run build) and describe what another specialist must change.`,

    testing_specialist: `
## 🎯 MIRROR: HIGH-SIGNAL TEST ENGINEERING
- Add the smallest test that proves the requested behavior
- Prefer stable browser and runtime evidence over snapshot churn
- Keep fixtures focused and deterministic
- Avoid tests that just restate implementation details`,

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
This is the #1 cause of "unstyled page" bugs!`,

    repair_specialist: `
## 🎯 MIRROR: SURGICAL REPAIR
- Mirror the smallest, safest fix that resolves the concrete failure
- Touch only the files implicated by verification
- Preserve working code and accepted scaffold structure
- No feature creep, no rewrites, no unrelated cleanup`
  };
  
  return guidance[role] || '';
}

export type AgentRole = 
  | 'tool_orchestrator'  // Handles tool calls, parsing, execution flow
  | 'javascript_specialist'  // JS/TS/React/Node code
  | 'styling_ux_specialist'  // Styling, UX, and visual polish
  | 'python_specialist'  // Python code
  | 'tauri_specialist'  // Tauri v2 / Rust desktop apps
  | 'pipeline_specialist'  // Build/deploy/CI/CD
  | 'testing_specialist'  // Automated tests and browser checks
  | 'integration_analyst'  // Reviews, verifies, and ensures coherence
  | 'repair_specialist';  // Applies narrow fixes after verification failures

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
    model: 'qwen3-coder-next:cloud',  // CLOUD MODEL - STRONG DEFAULT
    provider: 'ollama',
    temperature: 0.2, // Low temperature = more Opus-like deterministic thinking
    maxTokens: getRecommendedMaxTokens('qwen3-coder-next:cloud', 'words_to_code'),
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
    model: 'minimax-m2.7:cloud',  // Faster default for interactive code generation
    provider: 'ollama',
    temperature: 0.3, // Slightly higher for creativity, but still Opus-like
    maxTokens: getRecommendedMaxTokens('minimax-m2.7:cloud', 'specialist'),
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

  styling_ux_specialist: {
    role: 'styling_ux_specialist',
    model: 'minimax-m2.7:cloud',
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: getRecommendedMaxTokens('minimax-m2.7:cloud', 'specialist'),
    systemPrompt: `You are a styling and UX specialist. You improve visual polish, CSS, layout, interaction feedback, and presentation details.

## YOUR JOB
- Refine spacing, hierarchy, and readable visual structure
- Improve hover/focus/active states and empty/loading states
- Keep edits tightly scoped to styling and presentation
- Avoid rewriting unrelated business logic unless strictly necessary for UI wiring

## RULES
- Prefer CSS, markup, and small UI wiring edits over broad rewrites
- Keep the UI accessible and readable
- Do not change backend, packaging, or unrelated pipeline files
- Do NOT edit gameplay/runtime logic in src/game/** (.ts/.tsx). If gameplay logic needs changes, leave it for javascript_specialist or repair_specialist.
- Do NOT edit README.md from this role.

${TOOL_CALL_FORMAT}`
  },

  python_specialist: {
    role: 'python_specialist',
    model: 'qwen3-coder-next:cloud',  // CLOUD MODEL - STRONG DEFAULT
    provider: 'ollama',
    temperature: 0.3,
    maxTokens: getRecommendedMaxTokens('qwen3-coder-next:cloud', 'specialist'),
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
    maxTokens: getRecommendedMaxTokens('deepseek-v3.1:671b-cloud', 'specialist'),
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
    model: 'minimax-m2.7:cloud',  // Faster default for interactive config generation
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: getRecommendedMaxTokens('minimax-m2.7:cloud', 'pipeline'),
    systemPrompt: `You are a DevOps and build pipeline specialist. You CREATE configuration files, build scripts, and deployment setups.

## EXPERTISE
- Build systems (webpack, vite, esbuild)
- CI/CD pipelines (GitHub Actions)
- Docker, containerization
- Package management (npm, pip, cargo)

## FILES YOU MAY EDIT (write_file / patch_file)
Only tooling and project metadata, for example: package.json, lockfiles, vite.config.*, tsconfig*.json, pyproject.toml, requirements*.txt, .github/workflows/**, Dockerfile*, Makefile, and root *.bat launchers.
Do not invent paths outside this role; the executor will reject writes to application source.

## FILES YOU MUST NOT EDIT
Never write or patch application/runtime code under src/, backend/, or tests/ (including games, React, Three.js, APIs). That work is for javascript_specialist, python_specialist, styling_ux_specialist, testing_specialist, or repair_specialist.
You may still run_command for npm install, npm run build, npm test, etc., to surface errors for others to fix.

${TOOL_CALL_FORMAT}`
  },

  testing_specialist: {
    role: 'testing_specialist',
    model: 'minimax-m2.7:cloud',
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: getRecommendedMaxTokens('minimax-m2.7:cloud', 'analysis'),
    systemPrompt: `You are a testing specialist. You add and update focused automated tests and browser checks that prove the requested behavior.

## YOUR JOB
- Add the smallest useful tests that materially reduce regression risk
- Prefer stable integration, runtime, and browser checks over brittle snapshots
- Keep fixtures deterministic and easy to understand
- Avoid noisy tests that restate the implementation

## RULES
- Touch only test harness, test files, and tightly related support scripts unless a repair plan explicitly allows more
- Do not broaden product scope while adding tests
- If a bug can be proven with one focused test, do not add five

${TOOL_CALL_FORMAT}`
  },

  integration_analyst: {
    role: 'integration_analyst',
    model: 'deepseek-v3.1:671b-cloud',  // CLOUD MODEL - SMART FOR ANALYSIS
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: getRecommendedMaxTokens('deepseek-v3.1:671b-cloud', 'analysis'),
    systemPrompt: `You are an integration verifier. Review the project and REPORT any missing files, broken references, or runtime issues.

## YOUR JOB
1. Check if all necessary files exist
2. Identify missing connections or files
3. Report the concrete failures with precise file references
4. Do NOT create or modify files yourself - verification only

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
- If file doesn't exist = REPORT IT
- If path is wrong = REPORT IT

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

Output a clear verification report. Only use read/search/run_command style tools when absolutely necessary.

${TOOL_CALL_FORMAT}`
  },

  repair_specialist: {
    role: 'repair_specialist',
    model: 'minimax-m2.7:cloud',
    provider: 'ollama',
    temperature: 0.2,
    maxTokens: getRecommendedMaxTokens('minimax-m2.7:cloud', 'specialist'),
    systemPrompt: `You are the repair specialist. You only fix concrete failures identified by verification.

## YOUR JOB
1. Read the verifier findings carefully
2. Apply the SMALLEST viable fix
3. Only touch files directly related to the reported failures
4. Do NOT add new features, re-scaffold, or rewrite unrelated areas

## HARD RULES
- If verification mentions missing files, create only those files
- If verification mentions build/runtime errors, patch only the files involved
- Prefer surgical edits over broad rewrites
- Preserve the accepted scaffold and existing working code

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

  const needsStylingUx =
    taskLower.includes('style') ||
    taskLower.includes('styling') ||
    taskLower.includes('ux') ||
    taskLower.includes('ui polish') ||
    taskLower.includes('visual') ||
    taskLower.includes('layout') ||
    taskLower.includes('responsive') ||
    taskLower.includes('animation') ||
    taskLower.includes('theme') ||
    taskLower.includes('accessibility');

  const isGameHeavyTask =
    taskLower.includes('three.js') ||
    taskLower.includes('threejs') ||
    taskLower.includes('webgl') ||
    (taskLower.includes('game') &&
      (taskLower.includes('combat') ||
        taskLower.includes('enemy') ||
        taskLower.includes('player') ||
        taskLower.includes('boss') ||
        taskLower.includes('fantasy') ||
        taskLower.includes('action')));
  const explicitStylingOnlyRequest =
    taskLower.includes('styling only') ||
    taskLower.includes('css only') ||
    taskLower.includes('visual polish only') ||
    taskLower.includes('ui polish only');

  const needsTesting =
    taskLower.includes('test') ||
    taskLower.includes('playwright') ||
    taskLower.includes('smoke') ||
    taskLower.includes('verify') ||
    taskLower.includes('verification') ||
    taskLower.includes('e2e') ||
    taskLower.includes('end-to-end');

  // Add specialists
  if (isJavaScript) {
    roles.push('javascript_specialist');
  }
  if (needsStylingUx && (!isGameHeavyTask || explicitStylingOnlyRequest)) {
    roles.push('styling_ux_specialist');
  } else if (needsStylingUx && isGameHeavyTask) {
    console.log('[RouteToSpecialists] Deferring styling_ux_specialist for game-heavy implementation task');
  }
  if (isPython) {
    roles.push('python_specialist');
  }
  if (needsPipeline) {
    roles.push('pipeline_specialist');
  }
  if (needsTesting) {
    roles.push('testing_specialist');
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

function normalizeToolCallShape(toolCall: any): { name: string; arguments: Record<string, any> } | null {
  if (!toolCall || typeof toolCall !== 'object') {
    return null;
  }

  if (toolCall.function && typeof toolCall.function === 'object') {
    return normalizeToolCallShape(toolCall.function);
  }

  if (toolCall.type === 'tool_use' && typeof toolCall.name === 'string') {
    return {
      name: toolCall.name,
      arguments: (toolCall.input || toolCall.arguments || {}) as Record<string, any>,
    };
  }

  if (typeof toolCall.name === 'string') {
    return {
      name: toolCall.name,
      arguments: (toolCall.arguments || toolCall.input || {}) as Record<string, any>,
    };
  }

  return null;
}

function collectJsonCandidates(content: string): string[] {
  const candidates = new Set<string>();

  const codeBlockPattern = /```(?:json)?\n?([\s\S]*?)```/g;
  let codeBlockMatch: RegExpExecArray | null;
  while ((codeBlockMatch = codeBlockPattern.exec(content)) !== null) {
    const block = codeBlockMatch[1].trim();
    if ((block.startsWith('{') && block.endsWith('}')) || (block.startsWith('[') && block.endsWith(']'))) {
      candidates.add(block);
    }
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        continue;
      }
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.add(content.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return [...candidates];
}

function pushParsedToolCalls(parsed: any, seen: Set<string>, toolCalls: any[]): void {
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      pushParsedToolCalls(entry, seen, toolCalls);
    }
    return;
  }

  const normalized = normalizeToolCallShape(parsed);
  if (!normalized) {
    return;
  }

  const key = JSON.stringify(normalized);
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  toolCalls.push(normalized);
}

/**
 * Parse tool calls from AI response content
 * Supports raw JSON objects, JSON arrays, code blocks, and FILE: markdown fallback.
 */
function parseToolCalls(content: string): any[] {
  const toolCalls: any[] = [];
  const seen = new Set<string>();
  let parseFailures = 0;

  for (const candidate of collectJsonCandidates(content)) {
    try {
      pushParsedToolCalls(JSON.parse(candidate), seen, toolCalls);
    } catch {
      parseFailures++;
    }
  }

  if (toolCalls.length === 0) {
    const filePattern = /FILE:\s*([^\n]+)\n```(\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = filePattern.exec(content)) !== null) {
      const normalized = normalizeToolCallShape({
        name: 'write_file',
        arguments: {
          path: match[1].trim(),
          content: match[3],
        },
      });
      if (normalized) {
        pushParsedToolCalls(normalized, seen, toolCalls);
      }
    }
  }

  console.log(`[parseToolCalls] Extracted ${toolCalls.length} tool calls from response (${parseFailures} JSON candidate parse failures)`);
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

function resolveBlackboardSpecialistId(role: AgentRole): SpecialistId {
  if (role === 'repair_specialist') {
    return 'repair_specialist';
  }

  return LEGACY_SPECIALIST_ROLE_MAP[role as keyof typeof LEGACY_SPECIALIST_ROLE_MAP];
}

function getClaimedFilesForRole(blackboard: SpecialistBlackboard | undefined, role: AgentRole): string[] {
  if (!blackboard) {
    return [];
  }

  const specialistId = resolveBlackboardSpecialistId(role);
  const stepClaims = blackboard.steps
    .filter((step) => step.specialist === specialistId)
    .flatMap((step) => step.claimedFiles);
  const claimed = blackboard.claimedFiles[specialistId] || [];
  return [...new Set([...claimed, ...stepClaims])];
}

function addBlackboardArtifact(
  blackboard: SpecialistBlackboard | undefined,
  artifact: Omit<SpecialistArtifact, 'id' | 'createdAt'>
): void {
  if (!blackboard) {
    return;
  }

  blackboard.artifacts.push({
    id: `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...artifact,
  });
}

function markBlackboardOwner(
  blackboard: SpecialistBlackboard | undefined,
  role: AgentRole,
  status: SpecialistBlackboard['status']
): void {
  if (!blackboard) {
    return;
  }

  const specialistId = resolveBlackboardSpecialistId(role);
  blackboard.currentOwner = specialistId;
  blackboard.status = status;
  const activeStep = blackboard.steps.find((step) => step.specialist === specialistId && step.status !== 'completed');
  if (activeStep) {
    blackboard.activeStepId = activeStep.id;
    if (activeStep.status === 'pending') {
      activeStep.status = 'in_progress';
    }
  }
}

function completeBlackboardStep(
  blackboard: SpecialistBlackboard | undefined,
  role: AgentRole,
  success: boolean
): void {
  if (!blackboard) {
    return;
  }

  const specialistId = resolveBlackboardSpecialistId(role);
  const activeStep = blackboard.steps.find((step) => step.specialist === specialistId && step.status === 'in_progress');
  if (activeStep) {
    activeStep.status = success ? 'completed' : 'failed';
  }
}

async function executeScaffoldProjectTool(
  args: Record<string, any>,
  workspacePath: string,
  taskContext: string | undefined,
  callbacks?: SpecialistExecutionCallbacks
): Promise<any> {
  const projectType = typeof args.project_type === 'string' ? args.project_type : undefined;
  const scaffolded = await scaffoldProjectFromTemplate(workspacePath, taskContext || '', {
    projectType,
    projectName: typeof args.project_name === 'string' ? args.project_name : undefined,
    runPostCreate: false,
    callbacks,
  });

  if (!scaffolded.success) {
    return {
      action: 'scaffold_project',
      success: false,
      error: scaffolded.error || 'Unable to scaffold project',
      project_type: projectType,
    };
  }

  getTelemetryService().track('template_used', {
    templateId: scaffolded.templateId || projectType || 'unknown',
    mode: 'tool_call',
    fileCount: scaffolded.createdFiles.length,
  });

  if (scaffolded.createdFiles.length > 0) {
    populateFileTracker(scaffolded.createdFiles);
    console.log(`[MirrorAgents] 🛡️ Seeded file tracker with ${scaffolded.createdFiles.length} scaffold tool file(s)`);
  }

  return {
    action: 'scaffold_project',
    success: true,
    scaffolded: scaffolded.templateId || projectType,
    project_type: projectType,
    files: scaffolded.createdFiles,
  };
}

async function executeTool(
  toolCall: any,
  workspacePath: string,
  callbacks?: SpecialistExecutionCallbacks,
  taskContext?: string
): Promise<any> {
  const normalizedToolCall = normalizeToolCallShape(toolCall);
  if (!normalizedToolCall) {
    return { action: 'unknown', error: 'Invalid tool call shape', success: false };
  }

  const { name, arguments: args } = normalizedToolCall;

  if (callbacks?.shouldCancel?.()) {
    throw new Error('Specialized agent cancelled by user');
  }

  switch (name) {
    case 'create_file':
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
          return { action: 'write_file', path: sanitizedPath, error: pkgValidation.error, success: false };
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
        const jsValidation = validateJavaScriptFile(args.content || '', sanitizedPath, { workspacePath });
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

        let spawnEnv = { ...process.env };
        try {
          const { getNodeEnv } = require('../core/tool-path-finder');
          spawnEnv = getNodeEnv();
        } catch { /* fallback to process.env */ }
        
        const child = spawn(command, {
          cwd: workDir,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: spawnEnv
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

    case 'scaffold_project':
      return executeScaffoldProjectTool(args, workspacePath, taskContext, callbacks);

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
      f.includes('src/main.tsx') ||
      f.includes('src/App.tsx') ||
      f.includes('Game.ts') ||
      f.includes('World.ts') ||
      f.includes('Controls.ts') ||
      f.includes('InputManager.ts') ||
      f.includes('Entity.ts') ||
      f.includes('Player.ts') ||
      f.includes('Enemy.ts')
    );

    if (keyFiles.length > 0) {
      contextStr += `**KEY FILE CONTENTS (READ THESE!):**\n\n`;
      for (const file of keyFiles.slice(0, 8)) {
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

function buildScaffoldContractContext(context: any): string {
  const files: string[] = Array.isArray(context.files) ? context.files : [];
  if (files.length === 0) {
    return '';
  }

  const canonicalGameplayFiles = [
    'src/game/Game.ts',
    'src/game/world/World.ts',
    'src/game/entities/Entity.ts',
    'src/game/entities/Player.ts',
    'src/game/entities/Enemy.ts',
    'src/game/utils/Controls.ts',
    'src/game/InputManager.ts',
    'src/App.tsx',
  ].filter((filePath) => files.includes(filePath));

  const hasNestedWorld = files.includes('src/game/world/World.ts');
  const hasFlatWorld = files.includes('src/game/World.ts');
  const hasControls = files.includes('src/game/utils/Controls.ts');
  const hasInputManager = files.includes('src/game/InputManager.ts');

  let contextStr = '\n## SCAFFOLD CONTRACTS\n';
  if (canonicalGameplayFiles.length > 0) {
    contextStr += 'Use these existing files and paths as the canonical architecture:\n';
    for (const filePath of canonicalGameplayFiles) {
      contextStr += `- ${filePath}\n`;
    }
  }
  if (hasNestedWorld && !hasFlatWorld) {
    contextStr += '- World implementation already lives at `src/game/world/World.ts`; do not create `src/game/World.ts`.\n';
  }
  if (hasControls) {
    contextStr += '- `src/game/utils/Controls.ts` is an existing call site. Preserve the Player API it uses, or update both files together in one pass.\n';
  }
  if (hasInputManager && !hasControls) {
    contextStr += '- `src/game/InputManager.ts` already exists; keep its imports and Player method calls consistent with Player.ts.\n';
  }
  contextStr += '- If a subclass overrides a base-class method, keep a TypeScript-compatible signature.\n';
  contextStr += '- Do not change one file’s API without updating every importing/calling file in the same edit set.\n\n';

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
  scaffoldApplied?: boolean;
  scaffoldTemplateId?: string;
  skippedGenerativePass?: boolean;
}> {
  const results = new Map<AgentRole, string>();
  const executedTools: any[] = [];
  const successfulPatterns: any[] = [];
  const mistakes: string[] = [];
  let finalAnalysis: string | undefined;
  let scaffoldApplied = false;
  let scaffoldTemplateId: string | undefined;
  const telemetry = getTelemetryService();
  const phaseStarts = new Map<string, number>();
  const beginPhase = (phase: string, data: Record<string, any> = {}) => {
    phaseStarts.set(phase, Date.now());
    telemetry.track('generation_phase', { phase, status: 'start', runtimeBudget, ...data });
  };
  const endPhase = (phase: string, status: 'success' | 'failure', data: Record<string, any> = {}) => {
    const startedAt = phaseStarts.get(phase) || Date.now();
    telemetry.track('generation_phase', {
      phase,
      status,
      durationMs: Date.now() - startedAt,
      runtimeBudget,
      ...data,
    });
  };
  const assertNotCancelled = () => {
    if (callbacks?.shouldCancel?.()) {
      throw new Error('Specialized agent cancelled by user');
    }
  };
  assertNotCancelled();
  const blackboard: SpecialistBlackboard | undefined = context.blackboard;
  const deterministicScaffoldOnly = Boolean(context.deterministicScaffoldOnly);
  const runtimeBudget: RuntimeBudgetMode =
    context.runtimeBudget === 'instant' || context.runtimeBudget === 'deep'
      ? context.runtimeBudget
      : 'standard';
  const autonomyPolicy = resolveAgentAutonomyPolicy(context.autonomyLevel);
  const autonomyUsage = {
    toolCalls: 0,
    commandCalls: 0,
    writtenFiles: new Set<string>(),
  };
  const normalizeTrackedPath = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    return value.replace(/\\/g, '/').replace(/^\.?\//, '');
  };
  const reserveAutonomyBudget = (toolName: string): void => {
    autonomyUsage.toolCalls += 1;
    if (toolName === 'run_command') {
      autonomyUsage.commandCalls += 1;
    }
  };
  const captureAutonomyWriteTargets = (toolName: string, toolArgs: Record<string, any>, result: any): void => {
    if (toolName === 'write_file' || toolName === 'create_file') {
      const trackedPath = normalizeTrackedPath(result?.path ?? toolArgs.path);
      if (trackedPath) {
        autonomyUsage.writtenFiles.add(trackedPath);
      }
      return;
    }

    if (result?.action === 'scaffold_project' && Array.isArray(result.files)) {
      for (const file of result.files) {
        const trackedPath = normalizeTrackedPath(file);
        if (trackedPath) {
          autonomyUsage.writtenFiles.add(trackedPath);
        }
      }
    }
  };
  const getAutonomyBlockReason = (toolName: string, toolArgs: Record<string, any>): string | null => {
    if (autonomyUsage.toolCalls + 1 > autonomyPolicy.maxToolCalls) {
      return `Autonomy level ${autonomyPolicy.level} (${autonomyPolicy.label}) reached its tool-call limit (${autonomyPolicy.maxToolCalls}).`;
    }

    if (toolName === 'run_command') {
      if (!autonomyPolicy.allowRunCommands) {
        return `Autonomy level ${autonomyPolicy.level} (${autonomyPolicy.label}) does not allow shell commands.`;
      }
      if (autonomyUsage.commandCalls + 1 > autonomyPolicy.maxCommandCalls) {
        return `Autonomy level ${autonomyPolicy.level} (${autonomyPolicy.label}) reached its command limit (${autonomyPolicy.maxCommandCalls}).`;
      }
    }

    if (toolName === 'write_file' || toolName === 'create_file') {
      const trackedPath = normalizeTrackedPath(toolArgs.path);
      const nextWriteCount =
        trackedPath && !autonomyUsage.writtenFiles.has(trackedPath)
          ? autonomyUsage.writtenFiles.size + 1
          : autonomyUsage.writtenFiles.size;
      if (nextWriteCount > autonomyPolicy.maxWriteFiles) {
        return `Autonomy level ${autonomyPolicy.level} (${autonomyPolicy.label}) reached its file-write limit (${autonomyPolicy.maxWriteFiles}).`;
      }
    }

    if (toolName === 'scaffold_project' && autonomyUsage.writtenFiles.size >= autonomyPolicy.maxWriteFiles) {
      return `Autonomy level ${autonomyPolicy.level} (${autonomyPolicy.label}) blocked scaffold_project after reaching the file-write limit (${autonomyPolicy.maxWriteFiles}).`;
    }

    return null;
  };
  const policyPrompt = `\n\n## AUTONOMY GUARDRAILS\nAutonomy level ${autonomyPolicy.level} (${autonomyPolicy.label}). ${autonomyPolicy.description}\n- Max tool calls: ${autonomyPolicy.maxToolCalls}\n- Max run_command calls: ${autonomyPolicy.maxCommandCalls}${autonomyPolicy.allowRunCommands ? '' : ' (commands disabled)'}\n- Max unique file writes: ${autonomyPolicy.maxWriteFiles}\nStay within these limits by planning compact, high-signal edits.`;
  const applyBudgetPrompt = (basePrompt: string): string => {
    const withPolicy = `${basePrompt}${policyPrompt}`;
    if (runtimeBudget === 'instant') {
      return `${withPolicy}\n\n## RUNTIME BUDGET\nUse the instant budget. Prefer the smallest viable patch, keep reasoning terse, and skip speculative refactors.`;
    }
    if (runtimeBudget === 'deep') {
      return `${withPolicy}\n\n## RUNTIME BUDGET\nUse the deep budget. Spend extra effort on failure modes, architecture risks, and verifier-facing correctness before finalizing.`;
    }
    return `${withPolicy}\n\n## RUNTIME BUDGET\nUse the standard budget. Stay balanced: complete the task with bounded reflection and no unnecessary detours.`;
  };
  const budgetedTokens = (model: string | undefined, mode: 'analysis' | 'words_to_code' | 'specialist' | 'pipeline') =>
    getBudgetAdjustedMaxTokens(model, mode, runtimeBudget);
  const orderBudgetChain = <T extends { tier?: string }>(entries: T[]): T[] => {
    if (runtimeBudget === 'instant') {
      return [...entries].sort((left, right) => Number(right.tier === 'fast') - Number(left.tier === 'fast'));
    }
    if (runtimeBudget === 'deep') {
      return [...entries].sort((left, right) => Number(right.tier === 'deep') - Number(left.tier === 'deep'));
    }
    return entries;
  };
  addBlackboardArtifact(blackboard, {
    type: 'user_intent',
    author: 'executive_router',
    summary: 'User goal received by specialized execution loop.',
    payload: { task, roles, runtimeBudget, autonomyPolicy },
  });

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

  // Soft health check — warn but don't block if cloud providers are available
  const health = await checkOllamaHealth();
  if (health.healthy) {
    console.log(`[MirrorAgents] ✅ Ollama healthy with ${health.models.length} models available`);
  } else {
    console.warn(`[MirrorAgents] ⚠️ Ollama not reachable (${health.error}). Will use cloud providers if available.`);
  }

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

  const requestedModel =
    typeof context.model === 'string' && context.model.trim().length > 0
      ? context.model.trim()
      : undefined;
  const requestedProvider = requestedModel
    ? aiRouter.inferProviderForModel(requestedModel, 'ollama') || 'ollama'
    : undefined;

  // Get best available model for planning.
  // Ollama cloud models listed first so the agent works out of the box
  // without requiring paid API credits.
  const defaultModelChain = orderBudgetChain([
    { name: 'Qwen3-Coder-Next Cloud', provider: 'ollama', model: 'qwen3-coder-next:cloud', tier: 'deep' },
    { name: 'MiniMax M2.7 Cloud', provider: 'ollama', model: 'minimax-m2.7:cloud', tier: 'fast' },
    { name: 'Gemma 4', provider: 'ollama', model: 'gemma4', tier: 'deep' },
    { name: 'Claude Sonnet', provider: 'anthropic', model: 'claude-sonnet-4-20250514', tier: 'deep' },
    { name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', tier: 'deep' },
    { name: 'Claude Haiku', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
  ]);

  const planningModels = [
    ...(requestedModel && requestedProvider ? [{ provider: requestedProvider, model: requestedModel }] : []),
    ...defaultModelChain.map(m => ({ provider: m.provider, model: m.model }))
  ].filter((entry, index, array) =>
    array.findIndex((candidate) => candidate.provider === entry.provider && candidate.model === entry.model) === index
  );
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
  if (deterministicScaffoldOnly) {
    beginPhase('planning', { skipped: true, deterministicScaffoldOnly: true });
    endPhase('planning', 'success', { skipped: true, deterministicScaffoldOnly: true });
  } else {
    console.log(`[MirrorAgents] 📋 Step 0: Planning with ${planningModel.model}`);
    markBlackboardOwner(blackboard, 'tool_orchestrator', 'planning');
    beginPhase('planning', { requestedProvider: planningModel.provider, requestedModel: planningModel.model });
    aiRouter.setActiveProvider(planningModel.provider, planningModel.model);
    
    const planningOrchestrator = AGENT_CONFIGS.tool_orchestrator;
    const planningPrompt = applyBudgetPrompt(await buildMirrorEnhancedPrompt(
      task,
      'tool_orchestrator',
      planningOrchestrator.systemPrompt
    ));

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
          maxTokens: budgetedTokens(planningModel.model, 'analysis'),
          disableRouterFallback: true
        }),
        'analysis',
        planningModel.model,
        1,
        runtimeBudget
      );
    } catch (error) {
      console.warn('[MirrorAgents] ⚠️ Planning phase failed, continuing without structured plan');
      planningResponse = { success: false };
    }

    if (planningResponse.success) {
      const planContent = planningResponse.content || '';
      const requirements = extractRequirements(planContent);
      sharedContext.requirements = requirements;
      addBlackboardArtifact(blackboard, {
        type: 'execution_plan',
        author: 'task_master',
        summary: `Planning extracted ${requirements.length} requirement(s).`,
        payload: { requirements, planContent },
      });
      console.log(`[MirrorAgents] 📋 Planning complete: ${requirements.length} requirements identified`);
      endPhase('planning', 'success', {
        requestedProvider: planningModel.provider,
        requestedModel: planningModel.model,
        actualProvider: planningResponse.servedBy?.provider || planningModel.provider,
        actualModel: planningResponse.servedBy?.model || planningModel.model,
        requirementCount: requirements.length,
      });
    } else {
      endPhase('planning', 'failure', {
        requestedProvider: planningModel.provider,
        requestedModel: planningModel.model,
      });
    }
  }

  // Create checkpoint after planning
  const planningCheckpoint = transactionManager.createCheckpoint('planning_complete');
  if (planningCheckpoint) {
    console.log(`[MirrorAgents] ✅ Checkpoint created: ${planningCheckpoint}`);
  }

  beginPhase('deterministic_scaffold');
  const bootstrappedTools = await bootstrapDeterministicScaffold(
    context.workspacePath,
    task,
    callbacks
  );
  if (bootstrappedTools.length > 0) {
    scaffoldApplied = true;
    scaffoldTemplateId = bootstrappedTools[0]?.result?.scaffolded;
    addBlackboardArtifact(blackboard, {
      type: 'scaffold_result',
      author: 'template_scaffold_specialist',
      summary: `Deterministic scaffold applied with ${bootstrappedTools.length} file(s).`,
      payload: { templateId: scaffoldTemplateId, files: bootstrappedTools.map((tool) => tool.result?.path).filter(Boolean) },
    });
    console.log(`[MirrorAgents] 🧱 Bootstrapped ${bootstrappedTools.length} template file(s) before specialist generation`);
    executedTools.push(...bootstrappedTools);
    for (const bootstrapped of bootstrappedTools) {
      if (bootstrapped.result.action === 'write_file' && bootstrapped.result.path) {
        sharedContext.filesCreated.set(bootstrapped.result.path, 'deterministic_bootstrap');
      }
    }
    context.files = getAllProjectFiles(context.workspacePath);
    telemetry.track('template_used', {
      templateId: bootstrappedTools[0]?.result?.scaffolded || 'unknown',
      mode: 'deterministic_bootstrap',
      fileCount: bootstrappedTools.length,
    });
    endPhase('deterministic_scaffold', 'success', {
      fileCount: bootstrappedTools.length,
      templateId: bootstrappedTools[0]?.result?.scaffolded || 'unknown',
    });
  } else {
    endPhase('deterministic_scaffold', 'success', { skipped: true });
  }

  if (scaffoldApplied && deterministicScaffoldOnly) {
    console.log('[MirrorAgents] 🧪 Deterministic scaffold-only mode enabled; skipping generative specialists');
    return {
      results,
      finalAnalysis,
      executedTools,
      scaffoldApplied,
      scaffoldTemplateId,
      skippedGenerativePass: true
    };
  }

  // Scaffold supplies a runnable skeleton only — orchestrator + specialists MUST run so
  // gameplay matches the user's prompt (otherwise every "three.js game" looks identical).

  // Step 1: Orchestrator plans and executes initial tools
  // ENHANCED: Use smart fallback with fast local models
  const orchestrator = AGENT_CONFIGS.tool_orchestrator;
  const orchestratorProvider = requestedProvider || orchestrator.provider;
  const orchestratorModel = requestedModel || orchestrator.model;

  // 🧠 MIRROR: Build pattern-enhanced prompt for orchestrator
  const enhancedOrchestratorPrompt = appendScaffoldCustomizationInstructions(
    applyBudgetPrompt(await buildMirrorEnhancedPrompt(task, 'tool_orchestrator', orchestrator.systemPrompt)),
    scaffoldApplied,
    scaffoldTemplateId
  );

  const orchestratorUserContent = scaffoldApplied
    ? `${task}\n\nThe workspace already has a working scaffold. Output JSON tool calls (e.g. write_file) to implement the request above: replace generic template gameplay and align visuals/mechanics with the user's words. Do not re-scaffold the project.\n${buildProjectContext(context)}${buildScaffoldContractContext(context)}`
    : `${task}\n\nCreate ALL necessary files for this project. Output each file as a JSON tool call on its own line.`;

  // Use SMART FALLBACK - tries fast models first, falls back gracefully
  console.log('[MirrorAgents] 🚀 Starting orchestrator with smart fallback...');
  markBlackboardOwner(blackboard, 'tool_orchestrator', 'executing');
  beginPhase('orchestrator', {
    requestedProvider: orchestratorProvider,
    requestedModel: orchestratorModel,
  });
  
  let orchestratorResponse;
  let usedModel = orchestratorModel;
  let usedProvider = orchestratorProvider;
  
  try {
    const result = await withSmartFallback(
      async (provider, model) => {
        aiRouter.setActiveProvider(provider, model);
        usedModel = model;
        const response = await aiRouter.chat(
          [
            { role: 'system', content: enhancedOrchestratorPrompt },
            { role: 'user', content: orchestratorUserContent }
          ],
          {
            model: model,
            temperature: orchestrator.temperature,
            maxTokens: budgetedTokens(model, 'words_to_code'),
            disableRouterFallback: true
          }
        );
        
        // Throw on failure so withSmartFallback can try next model
        if (!response.success) {
          throw new Error(response.error || 'Model returned unsuccessful response');
        }
        return response;
      },
      orchestratorProvider,
      orchestratorModel,
      scaffoldApplied ? 'project' : 'complex',
      runtimeBudget
    );
    
    orchestratorResponse = result.result;
    usedProvider = result.finalProvider || usedProvider;
    if (result.usedFallback) {
      console.log(`[MirrorAgents] ⚡ Used fallback model: ${result.finalProvider}/${result.finalModel} (${result.attempts} attempts)`);
      usedModel = result.finalModel || usedModel;
    }
    endPhase('orchestrator', 'success', {
      requestedProvider: orchestratorProvider,
      requestedModel: orchestratorModel,
      actualProvider: orchestratorResponse.servedBy?.provider || usedProvider,
      actualModel: orchestratorResponse.servedBy?.model || usedModel,
      attempts: result.attempts,
      usedFallback: result.usedFallback,
    });
  } catch (error: any) {
    mistakes.push(`Orchestrator complete failure: ${error.message}`);
    await storeTaskLearning(task, false, [], mistakes);
    endPhase('orchestrator', 'failure', {
      requestedProvider: orchestratorProvider,
      requestedModel: orchestratorModel,
      error: error.message,
    });

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
      const normalizedToolCall = normalizeToolCallShape(toolCall);
      if (!normalizedToolCall) {
        mistakes.push('Tool parsing produced an invalid orchestrator tool call shape');
        continue;
      }

      // Validate tool call before execution
      const validation = validateToolCall(normalizedToolCall, context.workspacePath, task, {
        specialist: 'tool_orchestrator',
        claimedFiles: getClaimedFilesForRole(blackboard, 'tool_orchestrator'),
        blackboard,
      });
      if (!validation.valid) {
        console.error(`[ToolValidation] Orchestrator tool validation failed: ${validation.error}`);
        mistakes.push(`Tool validation failed: ${validation.error}`);
        continue;
      }

      // Fix tool call if needed
      const fixedToolCall = validation.fixedPath 
        ? fixToolCall(normalizedToolCall, validation)
        : normalizedToolCall;

      const normalized = normalizeToolCallShape(fixedToolCall) || normalizedToolCall;
      const toolName = normalized.name || 'unknown_tool';
      const toolArgs = normalized.arguments || {};
      const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
      const autonomyBlockReason = getAutonomyBlockReason(toolName, toolArgs);
      if (autonomyBlockReason) {
        mistakes.push(`Autonomy guardrail: ${autonomyBlockReason}`);
        callbacks?.onToolComplete?.({
          type: toolName,
          title: toolTitle,
          success: false,
          specialist: 'tool_orchestrator',
          error: autonomyBlockReason
        });
        addBlackboardArtifact(blackboard, {
          type: 'verification_report',
          author: 'task_master',
          summary: `Blocked ${toolName} due to autonomy policy.`,
          payload: { toolName, reason: autonomyBlockReason, policy: autonomyPolicy },
        });
        continue;
      }
      reserveAutonomyBudget(toolName);
      callbacks?.onToolStart?.({ type: toolName, title: toolTitle, specialist: 'tool_orchestrator' });
      const result = await executeTool(fixedToolCall, context.workspacePath, callbacks, task);
      captureAutonomyWriteTargets(toolName, toolArgs, result);
      const toolSuccess = result?.success !== false;
      callbacks?.onToolComplete?.({ type: toolName, title: toolTitle, success: toolSuccess, specialist: 'tool_orchestrator' });
      executedTools.push({ toolCall: normalized, result, specialist: 'tool_orchestrator' });
      
      // Track created files in shared context
      if (result.action === 'write_file' && result.path) {
        sharedContext.filesCreated.set(result.path, 'orchestrator');
        addBlackboardArtifact(blackboard, {
          type: 'file_patch_set',
          author: 'task_master',
          summary: `Orchestrator wrote ${result.path}.`,
          payload: { path: result.path, action: result.action },
        });
      } else if (result.action === 'scaffold_project' && Array.isArray(result.files)) {
        for (const file of result.files) {
          sharedContext.filesCreated.set(file, 'orchestrator');
        }
        addBlackboardArtifact(blackboard, {
          type: 'scaffold_result',
          author: 'template_scaffold_specialist',
          summary: `Scaffold tool produced ${result.files.length} file(s).`,
          payload: { files: result.files, scaffolded: result.scaffolded || result.project_type },
        });
      } else if (result.action === 'run_command') {
        addBlackboardArtifact(blackboard, {
          type: 'command_result',
          author: 'task_master',
          summary: `Orchestrator ran command: ${result.command}`,
          payload: result,
        });
      }
    } catch (error) {
      console.warn(`Orchestrator tool execution failed:`, error);
      mistakes.push(`Orchestrator tool execution: ${error}`);
      const normalized = normalizeToolCallShape(toolCall) || { name: 'unknown_tool', arguments: {} };
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
    markBlackboardOwner(
      blackboard,
      role,
      role === 'integration_analyst' ? 'verifying' : role === 'repair_specialist' ? 'repairing' : 'executing'
    );
    const requestedRoleProvider = requestedProvider || config.provider;
    const requestedRoleModel = requestedModel || config.model;
    const phaseName = `specialist:${role}`;
    beginPhase(phaseName, {
      requestedProvider: requestedRoleProvider,
      requestedModel: requestedRoleModel,
    });

    // 🧠 MIRROR: Build pattern-enhanced prompt for this specialist
    const enhancedPrompt = appendScaffoldCustomizationInstructions(
      applyBudgetPrompt(await buildMirrorEnhancedPrompt(task, role, config.systemPrompt)),
      scaffoldApplied,
      scaffoldTemplateId
    );

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
${buildScaffoldContractContext(context)}
${buildSharedContext(sharedContext)}`
            }
          ], {
            model: model,
            temperature: config.temperature,
            maxTokens: budgetedTokens(
              model,
              role === 'integration_analyst' ? 'analysis' : role === 'pipeline_specialist' ? 'pipeline' : 'specialist'
            ),
            disableRouterFallback: true
          });
          
          // Throw on failure so withSmartFallback can try next model
          if (!response.success) {
            throw new Error(response.error || 'Model returned unsuccessful response');
          }
          return response;
        },
        requestedRoleProvider,
        requestedRoleModel,
        scaffoldApplied ? 'project' : 'complex',
        runtimeBudget
      );

      const response = specialistResult.result;
      
      if (specialistResult.usedFallback) {
        console.log(`[MirrorAgents] ⚡ ${role} used fallback: ${specialistResult.finalProvider}/${specialistResult.finalModel}`);
      }

      if (response.success) {
        results.set(role, response.content || '');
        endPhase(phaseName, 'success', {
          requestedProvider: requestedRoleProvider,
          requestedModel: requestedRoleModel,
          actualProvider: response.servedBy?.provider || specialistResult.finalProvider || requestedRoleProvider,
          actualModel: response.servedBy?.model || specialistResult.finalModel || requestedRoleModel,
          attempts: specialistResult.attempts,
          usedFallback: specialistResult.usedFallback,
        });
        
        // 🔧 CRITICAL FIX: Parse and execute tool calls from specialists too!
        const specialistTools = parseToolCalls(response.content || '');
        console.log(`[MirrorAgents] Specialist ${role} returned ${specialistTools.length} tool calls`);
        
        for (const toolCall of specialistTools) {
          assertNotCancelled();
          try {
            const normalizedToolCall = normalizeToolCallShape(toolCall);
            if (!normalizedToolCall) {
              mistakes.push(`${role} produced an invalid tool call shape`);
              continue;
            }

            // Validate tool call before execution
            const validation = validateToolCall(normalizedToolCall, context.workspacePath, task, {
              specialist: role,
              claimedFiles: getClaimedFilesForRole(blackboard, role),
              blackboard,
            });
            if (!validation.valid) {
              console.error(`[ToolValidation] ${role} tool validation failed: ${validation.error}`);
              mistakes.push(`${role} tool validation failed: ${validation.error}`);
              continue;
            }

            // Fix tool call if needed
            const fixedToolCall = validation.fixedPath 
              ? fixToolCall(normalizedToolCall, validation)
              : normalizedToolCall;

            const normalized = normalizeToolCallShape(fixedToolCall) || normalizedToolCall;
            const toolName = normalized.name || 'unknown_tool';
            const toolArgs = normalized.arguments || {};
            const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
            const autonomyBlockReason = getAutonomyBlockReason(toolName, toolArgs);
            if (autonomyBlockReason) {
              mistakes.push(`Autonomy guardrail: ${autonomyBlockReason}`);
              callbacks?.onToolComplete?.({
                type: toolName,
                title: toolTitle,
                success: false,
                specialist: role,
                error: autonomyBlockReason
              });
              addBlackboardArtifact(blackboard, {
                type: 'verification_report',
                author: resolveBlackboardSpecialistId(role),
                summary: `Blocked ${toolName} due to autonomy policy.`,
                payload: { toolName, reason: autonomyBlockReason, policy: autonomyPolicy },
              });
              continue;
            }
            reserveAutonomyBudget(toolName);
            callbacks?.onToolStart?.({ type: toolName, title: toolTitle, specialist: role });
            const result = await executeTool(fixedToolCall, context.workspacePath, callbacks, task);
            captureAutonomyWriteTargets(toolName, toolArgs, result);
            const toolSuccess = result?.success !== false;
            callbacks?.onToolComplete?.({ type: toolName, title: toolTitle, success: toolSuccess, specialist: role });
            executedTools.push({ toolCall: normalized, result, specialist: role });
            
            // Track created files in shared context
            if (result.action === 'write_file' && result.path) {
              sharedContext.filesCreated.set(result.path, role);
              console.log(`[MirrorAgents] ✅ ${role} created file: ${result.path}`);
              addBlackboardArtifact(blackboard, {
                type: 'file_patch_set',
                author: resolveBlackboardSpecialistId(role),
                summary: `${role} wrote ${result.path}.`,
                payload: { path: result.path, action: result.action },
              });
            } else if (result.action === 'scaffold_project' && Array.isArray(result.files)) {
              for (const file of result.files) {
                sharedContext.filesCreated.set(file, role);
                console.log(`[MirrorAgents] ✅ ${role} scaffolded file: ${file}`);
              }
              addBlackboardArtifact(blackboard, {
                type: 'scaffold_result',
                author: 'template_scaffold_specialist',
                summary: `${role} scaffolded ${result.files.length} file(s).`,
                payload: { files: result.files, scaffolded: result.scaffolded || result.project_type },
              });
            } else if (result.action === 'run_command') {
              addBlackboardArtifact(blackboard, {
                type: 'command_result',
                author: resolveBlackboardSpecialistId(role),
                summary: `${role} ran command: ${result.command}`,
                payload: result,
              });
            }
          } catch (error) {
            console.warn(`[MirrorAgents] ${role} tool execution failed:`, error);
            mistakes.push(`${role} tool execution: ${error}`);
            const normalized = normalizeToolCallShape(toolCall) || { name: 'unknown_tool', arguments: {} };
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
        completeBlackboardStep(blackboard, role, true);
      } else {
        console.warn(`[MirrorAgents] Agent ${role} failed: ${response.error}`);
        mistakes.push(`Agent ${role} failed: ${response.error}`);
        results.set(role, `Failed: ${response.error}`);
        endPhase(phaseName, 'failure', {
          requestedProvider: requestedRoleProvider,
          requestedModel: requestedRoleModel,
          error: response.error,
          attempts: specialistResult.attempts,
        });
        completeBlackboardStep(blackboard, role, false);
      }
    } catch (error: any) {
      console.warn(`[MirrorAgents] Agent ${role} failed completely: ${error.message}`);
      mistakes.push(`Agent ${role} failed: ${error.message}`);
      results.set(role, `Failed: ${error.message}`);
      endPhase(phaseName, 'failure', {
        requestedProvider: requestedRoleProvider,
        requestedModel: requestedRoleModel,
        error: error.message,
      });
      completeBlackboardStep(blackboard, role, false);
      // Continue with other specialists even if one fails
    }
  }

  // Step 3: Integration analyst reviews everything
  // ENHANCED: Use smart fallback for analyst too
  if (roles.includes('integration_analyst')) {
    const analyst = AGENT_CONFIGS.integration_analyst;
    beginPhase('integration_analysis', {
      requestedProvider: analyst.provider,
      requestedModel: analyst.model,
    });

    // 🧠 MIRROR: Build pattern-enhanced prompt for analyst
    const enhancedAnalystPrompt = appendScaffoldCustomizationInstructions(
      applyBudgetPrompt(await buildMirrorEnhancedPrompt(task, 'integration_analyst', analyst.systemPrompt)),
      scaffoldApplied,
      scaffoldTemplateId
    );

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
            maxTokens: budgetedTokens(model, 'analysis'),
            disableRouterFallback: true
          });
          
          // Throw on failure so withSmartFallback can try next model
          if (!response.success) {
            throw new Error(response.error || 'Model returned unsuccessful response');
          }
          return response;
        },
        analyst.provider,
        analyst.model,
        'analysis',
        runtimeBudget
      );
      
      analysis = analysisResult.result;
      if (analysisResult.usedFallback) {
        console.log(`[MirrorAgents] ⚡ Analyst used fallback: ${analysisResult.finalProvider}/${analysisResult.finalModel}`);
      }
      endPhase('integration_analysis', 'success', {
        requestedProvider: analyst.provider,
        requestedModel: analyst.model,
        actualProvider: analysis.servedBy?.provider || analysisResult.finalProvider || analyst.provider,
        actualModel: analysis.servedBy?.model || analysisResult.finalModel || analyst.model,
        attempts: analysisResult.attempts,
        usedFallback: analysisResult.usedFallback,
      });
    } catch (error: any) {
      console.warn(`[MirrorAgents] Integration analyst failed: ${error.message}`);
      analysis = { success: false, error: error.message };
      endPhase('integration_analysis', 'failure', {
        requestedProvider: analyst.provider,
        requestedModel: analyst.model,
        error: error.message,
      });
    }

    if (analysis.success) {
      console.log('[MirrorAgents] ✅ Integration analysis complete');
      finalAnalysis = analysis.content || undefined;

      // Execute any tools the analyst wants to run
      const analystTools = parseToolCalls(analysis.content || '');
      for (const toolCall of analystTools) {
        assertNotCancelled();
        try {
          const normalizedToolCall = normalizeToolCallShape(toolCall);
          if (!normalizedToolCall) {
            mistakes.push('Analyst produced an invalid tool call shape');
            continue;
          }

          // Validate tool call
          const validation = validateToolCall(normalizedToolCall, context.workspacePath, task, {
            specialist: 'integration_analyst',
            claimedFiles: getClaimedFilesForRole(blackboard, 'integration_analyst'),
            blackboard,
          });
          if (!validation.valid) {
            console.error(`[ToolValidation] Analyst tool validation failed: ${validation.error}`);
            mistakes.push(`Analyst tool validation failed: ${validation.error}`);
            continue;
          }

          const fixedToolCall = validation.fixedPath
            ? fixToolCall(normalizedToolCall, validation)
            : normalizedToolCall;

          const normalized = normalizeToolCallShape(fixedToolCall) || normalizedToolCall;
          const toolName = normalized.name || 'unknown_tool';
          const toolArgs = normalized.arguments || {};
          const toolTitle = `${toolName}(${toolArgs.path || toolArgs.command || '...'})`;
          const autonomyBlockReason = getAutonomyBlockReason(toolName, toolArgs);
          if (autonomyBlockReason) {
            mistakes.push(`Autonomy guardrail: ${autonomyBlockReason}`);
            callbacks?.onToolComplete?.({
              type: toolName,
              title: toolTitle,
              success: false,
              specialist: 'integration_analyst',
              error: autonomyBlockReason
            });
            addBlackboardArtifact(blackboard, {
              type: 'verification_report',
              author: 'integration_verifier',
              summary: `Blocked ${toolName} due to autonomy policy.`,
              payload: { toolName, reason: autonomyBlockReason, policy: autonomyPolicy },
            });
            continue;
          }
          reserveAutonomyBudget(toolName);
          callbacks?.onToolStart?.({ type: toolName, title: toolTitle, specialist: 'integration_analyst' });
          const result = await executeTool(fixedToolCall, context.workspacePath, callbacks, task);
          captureAutonomyWriteTargets(toolName, toolArgs, result);
          const toolSuccess = result?.success !== false;
          callbacks?.onToolComplete?.({ type: toolName, title: toolTitle, success: toolSuccess, specialist: 'integration_analyst' });
          executedTools.push({ toolCall: normalized, result, specialist: 'integration_analyst' });

          if (result.action === 'write_file' && result.path) {
            sharedContext.filesCreated.set(result.path, 'integration_analyst');
          } else if (result.action === 'scaffold_project' && Array.isArray(result.files)) {
            for (const file of result.files) {
              sharedContext.filesCreated.set(file, 'integration_analyst');
            }
          } else if (result.action === 'run_command') {
            addBlackboardArtifact(blackboard, {
              type: 'command_result',
              author: 'integration_verifier',
              summary: `Integration verifier ran command: ${result.command}`,
              payload: result,
            });
          }
        } catch (error) {
          console.warn(`Analyst tool execution failed:`, error);
          mistakes.push(`Analyst tool execution: ${error}`);
          const normalized = normalizeToolCallShape(toolCall) || { name: 'unknown_tool', arguments: {} };
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
    }
  }

  // 🛡️ POST-EXECUTION VALIDATION: Check for missing CSS links in index.html
  // This runs AFTER all files are created to catch the common "forgot to link CSS" mistake
  const createdFiles = getFileTrackerState();
  const trackedPaths = Array.from(createdFiles.values())
    .flat()
    .map((filePath) => filePath.replace(/\\/g, '/'));
  const indexHtmlPaths = trackedPaths.filter((filePath) => filePath.endsWith('index.html'));
  
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
          const cssFiles = trackedPaths.filter((filePath) => filePath.endsWith('.css'));
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
  const analysisContentForSuccess = finalAnalysis?.toLowerCase() || '';
  const overallSuccess =
    executedTools.length > 0 &&
    mistakes.length === 0 &&
    !analysisContentForSuccess.includes('missing') &&
    !analysisContentForSuccess.includes('incomplete') &&
    !analysisContentForSuccess.includes('error');
  await storeTaskLearning(task, overallSuccess, successfulPatterns, mistakes);
  blackboard && (blackboard.status = overallSuccess ? 'completed' : blackboard.status);

  console.log(`[MirrorAgents] 🧠 Task completed. Tools executed: ${executedTools.length}, Mistakes: ${mistakes.length}`);

  return {
    results,
    finalAnalysis,
    executedTools,
    scaffoldApplied,
    scaffoldTemplateId,
    skippedGenerativePass: false
  };
}
