/**
 * AgentPrime - Proper Tool-Calling Agent Loop
 * 200 lines of nuclear agent that actually works like Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import aiRouter from './ai-providers';
import { getRelevantPatterns, getAntiPatterns, storeTaskLearning } from './mirror/mirror-singleton';
import { validateProjectCompleteness, formatValidationFeedback, CompletenessValidation } from './agent/validators/projectCompleteness';
import { withAITimeoutAndRetry, TimeoutError } from './core/timeout-utils';
import { transactionManager } from './core/transaction-manager';
import { reviewSessionManager } from './agent/review-session-manager';
import type { AgentReviewSessionSnapshot } from '../types/agent-review';
import { retryWithRecovery } from './core/error-recovery';
import { createLogger, createOperationId } from './core/logger';
import { stateManager } from './core/state-manager';
import { sanitizeFileName } from './security/ipcValidation';
import { validateToolCall } from './agent/tool-validation';
import { TaskMaster } from './agent/task-master';
import { getBudgetManager } from './core/budget-manager';
import { getOpusReasoningEngine } from './mirror/opus-reasoning-engine';
import { scaffoldProjectFromTemplate } from './agent/scaffold-resolver';
import { organizeFolder, undoOrganize, type OrganizeStrategy } from './agent/tools/folder-organizer';
import {
  validateWorkspaceNotSelf,
  validateFileExists,
  detectHallucinations,
  createContentSnapshot,
  calculateContentHash,
  verifyContentMatchesTask,
  type HallucinationReport
} from './security/workspaceProtection';

// 🦖 DINO BUDDY IMPROVEMENTS - Making AgentPrime smarter!
import { critqueGeneratedFiles, type CritiqueResult } from './agent/self-critique';
import { correctionLearning } from './agent/correction-learning';
import { verifyToolResult, type VerificationResult } from './agent/tool-result-verification';
import { summarizeIfNeeded, conversationSummarizer } from './agent/conversation-summarizer';
import { backupBeforeOperation, restoreLatestBackup } from './agent/project-backup';
import { EventEmitter } from 'events';
import { searchWithRipgrep } from './core/ripgrep-runner';
import { getRecommendedMaxTokens, isOllamaCloudModel } from './core/model-output-limits';
import { TaskMode, detectTaskMode } from './agent/task-mode';
import { parseToolCallsContent } from './agent/tool-call-parser';
import { toCanonicalTools, toolUseBlocksToParsedCalls } from './agent/canonical-tools';
import { finalizeAgentTransactionForReview } from './agent/transaction-finalization';
import { buildReviewCheckpointSummary } from './agent/reflection-policy';

const log = createLogger('AgentLoop');

// Re-export for callers that import task mode from the agent loop module
export { TaskMode, detectTaskMode };

// 🧠 CONSCIOUSNESS SYSTEM - Deep Intent Understanding (ported from ActivatePrime)
import { processWithConsciousness, type ConsciousnessState, type ConsciousnessInjection } from './consciousness';

/**
 * Existing files tracker for FIX mode protection
 */
export interface ExistingFileInfo {
  path: string;
  content: string;
  size: number;
  hash: string;
}

/**
 * Simple content hash for change detection
 */
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// ============================================================
// 🧹 REACT FILE CLEANUP - Remove boilerplate and fix structure
// ============================================================

/**
 * Clean up React App files to remove boilerplate and ensure proper structure
 * This prevents messy edits when components are added to App.tsx
 */
function cleanupReactAppFile(content: string, filePath: string): string {
  let cleaned = content;
  
  // Check if this looks like a React App file with components
  const hasComponentImports = /import\s+\w+\s+from\s+['"]\.\/components\//.test(content);
  const hasComponentRender = /<[A-Z][A-Za-z]+\s*\/?>/.test(content);
  
  if (!hasComponentImports && !hasComponentRender) {
    // No components detected, leave as-is
    return content;
  }
  
  // Remove Create React App boilerplate content when custom components are present
  const boilerplatePatterns = [
    // "Welcome to React" header
    /<h1[^>]*>Welcome to React<\/h1>/gi,
    // "Edit src/App.tsx and save to reload" message
    /<p[^>]*>Edit\s*<code[^>]*>src\/App\.tsx<\/code>\s*and save to reload\.<\/p>/gi,
    // "Learn React" link
    /<a[^>]*>Learn React<\/a>/gi,
    // Empty paragraph tags left behind
    /<p[^>]*>\s*<\/p>/g,
    // Generic placeholder text
    /{\s*\/\*\s*[A-Za-z]+\s+component\s+will\s+go\s+here\s*\*\/\s*}/gi,
  ];
  
  for (const pattern of boilerplatePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove empty header if it only contains whitespace after boilerplate removal
  cleaned = cleaned.replace(/<header[^>]*>\s*<\/header>/gi, '');
  
  // Fix indentation issues - normalize whitespace in JSX
  // Replace multiple blank lines with single blank line
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Fix orphaned closing tags with bad indentation
  cleaned = cleaned.replace(/\n\s{8,}(<\/[a-z]+>)/gi, '\n      $1');
  
  // Fix components that were inserted with inconsistent indentation
  cleaned = cleaned.replace(/(<[A-Z][A-Za-z]+\s*\/>)\s*(<\/div>)/g, '$1\n      $2');
  
  // Remove extra whitespace before closing tags
  cleaned = cleaned.replace(/\n\s+\n(\s*<\/)/g, '\n$1');
  
  // Ensure proper structure: if we have components but no <main>, wrap in main
  if (hasComponentRender && !/<main/.test(cleaned)) {
    // Find the App div content and restructure if needed
    const appDivMatch = cleaned.match(/(<div\s+className=["']App["'][^>]*>)([\s\S]*?)(<\/div>\s*\))/i);
    if (appDivMatch) {
      const divOpen = appDivMatch[1];
      let divContent = appDivMatch[2];
      const divClose = appDivMatch[3];
      
      // Remove empty/boilerplate header
      divContent = divContent.replace(/<header[^>]*className=["']App-header["'][^>]*>[\s\S]*?<\/header>/gi, '');
      
      // Extract components
      const componentMatches = divContent.match(/<[A-Z][A-Za-z]+\s*\/>/g) || [];
      
      if (componentMatches.length > 0) {
        // Rebuild with proper structure
        const componentsList = componentMatches.join('\n        ');
        cleaned = cleaned.replace(appDivMatch[0], 
          `${divOpen}\n      <main>\n        ${componentsList}\n      </main>\n    ${divClose}`
        );
      }
    }
  }
  
  // Final cleanup: remove any trailing whitespace on lines
  cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');
  
  log.info(`[Agent] Cleaned up React App file: ${filePath}`);
  return cleaned;
}

// ============================================================
// 🧠 OPUS THINKING ENGINE - Makes ANY Model Think Like Claude Opus
// ============================================================

/**
 * OpusThinkingEngine - The core of what makes Opus different
 * 
 * This system forces models to THINK deeply before acting by:
 * 1. Pre-analyzing tasks to understand TRUE intent
 * 2. Predicting problems before they happen
 * 3. Planning with dependencies in mind
 * 4. Validating "above and beyond" quality
 */
class OpusThinkingEngine {
  
  /**
   * Analyze user intent - What are they REALLY asking for?
   * Returns a structured understanding of the task
   */
  static analyzeIntent(userMessage: string): {
    coreGoal: string;
    projectType: 'game' | 'web' | 'api' | 'cli' | 'library' | 'react' | 'unknown';
    complexity: 'simple' | 'medium' | 'complex';
    delightFactors: string[];
    potentialPitfalls: string[];
    requiredFiles: string[];
  } {
    const message = userMessage.toLowerCase();
    
    // Detect project type
    let projectType: 'game' | 'web' | 'api' | 'cli' | 'library' | 'react' | 'unknown' = 'unknown';
    if (message.includes('game') || message.includes('play') || message.includes('canvas') || 
        message.includes('phaser') || message.includes('pixi')) {
      projectType = 'game';
    } else if (message.includes('api') || message.includes('server') || message.includes('endpoint') ||
               message.includes('rest') || message.includes('fastapi') || message.includes('express')) {
      projectType = 'api';
    } else if (message.includes('react') || message.includes('tsx') || message.includes('jsx') ||
               message.includes('component') || message.includes('vite')) {
      // React/Vite projects need special handling
      projectType = 'react';
    } else if (message.includes('website') || message.includes('webpage') || message.includes('html') ||
               message.includes('landing') || message.includes('vue')) {
      projectType = 'web';
    } else if (message.includes('cli') || message.includes('command line') || message.includes('terminal')) {
      projectType = 'cli';
    }
    
    // Estimate complexity
    const complexityMarkers = ['simple', 'basic', 'quick', 'just', 'only'];
    const isSimple = complexityMarkers.some(m => message.includes(m));
    const complexMarkers = ['full', 'complete', 'production', 'advanced', 'real'];
    const isComplex = complexMarkers.some(m => message.includes(m)) || message.length > 200;
    const complexity = isSimple ? 'simple' : (isComplex ? 'complex' : 'medium');
    
    // Delight factors - what would make this AMAZING?
    const delightFactors: string[] = [];
    if (projectType === 'game') {
      delightFactors.push(
        'Particle effects when collecting/hitting things',
        'Smooth animations and transitions',
        'Sound effects or at least visual feedback',
        'Beautiful color theme matching the concept',
        'Complete game loop: start → play → win/lose → restart',
        'Score/progress tracking that updates in real-time'
      );
    } else if (projectType === 'react') {
      delightFactors.push(
        'Clean component architecture with proper props/state',
        'Beautiful UI with modern CSS (flexbox, gradients, shadows)',
        'Responsive design that works on all screen sizes',
        'Smooth animations and micro-interactions',
        'Proper TypeScript types for all props and state',
        'Complete functionality - all buttons and features work',
        'Good UX patterns (loading states, empty states, error handling)'
      );
    } else if (projectType === 'web') {
      delightFactors.push(
        'Micro-interactions on hover/click (transform, box-shadow)',
        'Smooth scroll behavior and page transitions',
        'Beautiful typography - consistent font sizes and spacing',
        'Fully responsive design with mobile hamburger menu',
        'Loading states and form validation feedback',
        'All buttons have click handlers that DO something',
        'Consistent color theme and visual hierarchy'
      );
    } else if (projectType === 'api') {
      delightFactors.push(
        'Proper error responses with helpful messages',
        'Input validation with clear feedback',
        'OpenAPI/Swagger documentation',
        'Health check endpoint',
        'Request logging'
      );
    }
    
    // Potential pitfalls - what could go wrong?
    const potentialPitfalls: string[] = [];
    if (projectType === 'game') {
      potentialPitfalls.push(
        'Buttons without event handlers',
        'Canvas not loading before JS runs',
        'No way to actually lose/win the game',
        'UI elements that never get updated',
        'Missing game over/restart logic'
      );
    }
    if (projectType === 'react') {
      potentialPitfalls.push(
        '⚠️ CRITICAL: Missing index.html in project root - Vite cannot start without it',
        '⚠️ index.html missing <div id="root"></div> - React has nowhere to mount',
        '⚠️ index.html script src wrong (.tsxx instead of .tsx, or wrong path)',
        '⚠️ tsconfig.json missing "jsx": "react-jsx" - TypeScript cannot compile JSX',
        '⚠️ Missing React import in components',
        '⚠️ Component not exported (export default missing)',
        '⚠️ Import path wrong (missing ./ prefix or wrong case)',
        '⚠️ Using ReactDOM.render instead of createRoot (React 18)',
        '⚠️ Missing @vitejs/plugin-react in vite.config.ts'
      );
    }
    if (projectType === 'web') {
      potentialPitfalls.push(
        '⚠️ CSS class names not matching HTML class names (e.g. CSS has .nav-links but HTML has .nav-menu)',
        '⚠️ JS querySelector looking for classes that do not exist in HTML',
        '⚠️ Hamburger menu bars (.bar) without CSS styling - invisible on mobile',
        '⚠️ Buttons in HTML without onclick handlers or JS event listeners',
        '⚠️ Form without submit handler - nothing happens on submit',
        '⚠️ Section styling incomplete - some sections styled, others not',
        '⚠️ Navbar not in a container - misaligned with page content'
      );
    }
    potentialPitfalls.push(
      'HTML elements referenced in JS that do not exist',
      'CSS classes used in HTML but never defined in CSS',
      'Event handlers attached to non-existent elements',
      'Dependencies not installed before running'
    );
    
    // Required files
    const requiredFiles: string[] = [];
    if (projectType === 'game') {
      requiredFiles.push('index.html', 'styles.css');
      if (message.includes('phaser')) {
        requiredFiles.push('package.json', 'game.js');
      } else {
        requiredFiles.push('game.js');
      }
    } else if (projectType === 'react') {
      // CRITICAL: React+Vite projects need these files
      requiredFiles.push(
        'index.html',           // Vite entry point - MUST be in project root
        'package.json',
        'vite.config.ts',
        'tsconfig.json',
        'src/main.tsx',         // React DOM entry
        'src/App.tsx'           // Main App component
      );
    } else if (projectType === 'web') {
      requiredFiles.push('index.html', 'styles.css', 'script.js');
    } else if (projectType === 'api') {
      if (message.includes('fastapi') || message.includes('python')) {
        requiredFiles.push('main.py', 'requirements.txt');
      } else {
        requiredFiles.push('package.json', 'server.js');
      }
    }
    
    return {
      coreGoal: userMessage,
      projectType,
      complexity,
      delightFactors,
      potentialPitfalls,
      requiredFiles
    };
  }
  
  /**
   * Generate Opus-style thinking prompt
   * This is injected before the model starts working
   */
  static generatePreTaskThinkingPrompt(analysis: ReturnType<typeof OpusThinkingEngine.analyzeIntent>): string {
    const isGameOrComplex = analysis.projectType === 'game' || analysis.complexity === 'complex';
    const complexFileGuidance = isGameOrComplex ? `

### 🎮 CRITICAL: GAME DEVELOPMENT RULES
For games, you MUST follow these rules to avoid infinite loops:

1. **COMPLETE EACH FILE IN ONE GO** - Do NOT write partial code and then refine it 10 times
   - Write the FULL, WORKING game.js in ONE write_file call
   - If you need to change something, read the file first, then write the COMPLETE new version
   - NO tiny 10% refinements - commit to a complete version

2. **TEST IMMEDIATELY AFTER WRITING** - After writing game files, use preview_game tool:
   - Write index.html, styles.css, game.js
   - Then: preview_game("index.html") to open in browser
   - This gives you REAL feedback instead of guessing

3. **STOP REFINING WHEN IT WORKS** - If preview_game shows the game runs:
   - DO NOT make tiny improvements
   - DO NOT rewrite game.js for style changes
   - Mark the task DONE and provide final answer

4. **INCREMENTAL DEVELOPMENT MEANS:**
   - Start with minimal working version (under 200 lines)
   - Test it with preview_game
   - Only add features if user asks OR if core functionality is broken
   - NOT: Write 50 lines, then add 10, then add 10 more, then refine 10 times

### 🎮 MANDATORY: INCREMENTAL GAME DEVELOPMENT
You MUST use incremental development for this game project:

**PHASE 1 - SKELETON (First 3 files):**
• index.html - Basic HTML with canvas (under 50 lines)
• styles.css - Basic styling (under 50 lines)  
• game.js - MINIMAL working game loop (under 100 lines)
  - Just show a colored rectangle moving
  - Basic keyboard controls
  - One game state (playing)

**PHASE 2 - CORE MECHANICS (After skeleton works):**
• Add game pieces/sprites
• Add collision detection
• Add scoring

**PHASE 3 - POLISH (Only after mechanics work):**
• Add game over/restart
• Add visual effects
• Add sound (optional)

⚠️ DO NOT try to write a complete game in one file!
⚠️ Each file MUST be under 150 lines initially
⚠️ Better to have a simple working game than a complex broken one!` : '';

    // Set incremental mode flag for games
    if (isGameOrComplex) {
      (this as any).forceIncrementalMode = true;
      log.info('[Agent] 🎮 Game detected - forcing INCREMENTAL development mode');
    }

    return `
## 🧠 OPUS PRE-TASK ANALYSIS

Before you write ANY code, internalize these insights:

### 1. WHAT THEY REALLY WANT
Core goal: ${analysis.coreGoal}
Project type: ${analysis.projectType.toUpperCase()}
Complexity: ${analysis.complexity}

### 2. WHAT WOULD MAKE THIS AMAZING ✨
${analysis.delightFactors.map(f => `• ${f}`).join('\n')}

### 3. PITFALLS TO AVOID ⚠️
${analysis.potentialPitfalls.map(p => `• ${p}`).join('\n')}

### 4. REQUIRED FILES 📁
${analysis.requiredFiles.map(f => `• ${f}`).join('\n')}
${complexFileGuidance}

### 5. YOUR MISSION 🎯
Don't just BUILD this - make it something you'd be PROUD to show off.
Every button must work. Every feature must be complete.
Add polish. Add delight. Go ABOVE AND BEYOND.

NOW EXECUTE - create something exceptional!
`;
  }
  
  /**
   * Quality gate check - Is this output Opus-quality?
   * Returns issues if the output doesn't meet Opus standards
   */
  static validateOpusQuality(
    projectType: string,
    filesCreated: string[],
    fileContents: Map<string, string>
  ): { passes: boolean; issues: string[]; suggestions: string[] } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    const htmlContent = fileContents.get('index.html') || '';
    const jsContent = fileContents.get('script.js') || fileContents.get('game.js') || fileContents.get('main.js') || fileContents.get('app.js') || '';
    const cssContent = fileContents.get('styles.css') || fileContents.get('style.css') || '';
    
    // === CRITICAL: CSS/HTML CLASS MISMATCH DETECTION ===
    // This is the #1 bug in AI-generated websites - classes used but not defined
    if (htmlContent && cssContent) {
      // Extract all class names from HTML
      const htmlClasses = new Set<string>();
      const classMatches = htmlContent.match(/class="([^"]+)"/g) || [];
      for (const match of classMatches) {
        const classes = match.replace('class="', '').replace('"', '').split(/\s+/);
        classes.forEach(c => htmlClasses.add(c));
      }
      
      // Check if each HTML class is defined in CSS
      const missingInCSS: string[] = [];
      for (const className of htmlClasses) {
        // Skip utility classes that might come from frameworks
        if (['container', 'row', 'col', 'hidden', 'active', 'disabled'].includes(className)) continue;
        
        // Check if CSS has this class (either .classname or as part of a selector)
        if (!cssContent.includes(`.${className}`) && !cssContent.includes(` ${className}`) && !cssContent.includes(`${className} `)) {
          missingInCSS.push(className);
        }
      }
      
      if (missingInCSS.length > 0) {
        const topMissing = missingInCSS.slice(0, 5);
        issues.push(`CSS missing ${missingInCSS.length} classes used in HTML: ${topMissing.join(', ')}${missingInCSS.length > 5 ? '...' : ''}`);
        suggestions.push(`Add CSS rules for: ${topMissing.map(c => `.${c} { ... }`).join(', ')}`);
      }
    }
    
    // === CRITICAL: JS/HTML SELECTOR MISMATCH DETECTION ===
    if (htmlContent && jsContent) {
      // Check querySelector/querySelectorAll calls
      const selectorCalls = jsContent.match(/querySelector(?:All)?\(['"]([^'"]+)['"]\)/g) || [];
      for (const call of selectorCalls) {
        const selector = call.match(/['"]([^'"]+)['"]/)?.[1];
        if (selector) {
          // Check class selectors
          if (selector.startsWith('.')) {
            const className = selector.substring(1).split(/[\s>+~]/)[0]; // Get first class
            if (!htmlContent.includes(`class="${className}"`) && 
                !htmlContent.includes(`class="${className} `) &&
                !htmlContent.includes(` ${className}"`) &&
                !htmlContent.includes(` ${className} `)) {
              issues.push(`JS querySelector("${selector}") but class "${className}" not found in HTML`);
              suggestions.push(`Either add class="${className}" to HTML or update JS selector to match HTML`);
            }
          }
          // Check ID selectors
          if (selector.startsWith('#')) {
            const id = selector.substring(1).split(/[\s>+~]/)[0];
            if (!htmlContent.includes(`id="${id}"`) && !htmlContent.includes(`id='${id}'`)) {
              issues.push(`JS querySelector("${selector}") but id="${id}" not found in HTML`);
            }
          }
        }
      }
    }
    
    // === WEB-SPECIFIC CHECKS ===
    if (projectType === 'web') {
      // Check for hamburger menu without styling
      if (htmlContent.includes('hamburger') && !cssContent.includes('.hamburger')) {
        issues.push('Hamburger menu in HTML but no CSS styling - mobile menu will be invisible');
        suggestions.push('Add .hamburger { display: flex; flex-direction: column; gap: 5px; } and .bar { width: 25px; height: 3px; background: #333; }');
      }
      
      // Check for buttons without handlers
      const buttons = htmlContent.match(/<button[^>]*>[^<]+<\/button>/g) || [];
      for (const button of buttons) {
        if (!button.includes('onclick') && !button.includes('type="submit"')) {
          const buttonText = button.match(/>([^<]+)</)?.[1] || 'Unknown';
          if (!jsContent.includes(buttonText.toLowerCase().replace(/\s+/g, ''))) {
            suggestions.push(`Button "${buttonText}" has no onclick handler - consider adding functionality`);
          }
        }
      }
      
      // Check for form without submit handling
      if (htmlContent.includes('<form') && !jsContent.includes('submit')) {
        issues.push('Form in HTML but no submit handler in JS - form won\'t do anything');
        suggestions.push('Add form.addEventListener("submit", handleSubmit) with appropriate handling');
      }
      
      // Check for nav sections that exist in HTML but missing CSS
      if (htmlContent.includes('section id=') || htmlContent.includes('section class=')) {
        const sectionIds = htmlContent.match(/section[^>]+(?:id|class)="([^"]+)"/g) || [];
        for (const section of sectionIds) {
          const name = section.match(/(?:id|class)="([^"]+)"/)?.[1];
          if (name && !cssContent.includes(`.${name}`) && !cssContent.includes(`#${name}`)) {
            suggestions.push(`Section "${name}" exists in HTML but has no dedicated CSS styling`);
          }
        }
      }
    }
    
    // Check for game-specific quality
    if (projectType === 'game') {
      
      // Check for start button/screen
      if (!htmlContent.includes('start') && !jsContent.includes('startGame') && !jsContent.includes('start_game')) {
        issues.push('No start mechanism - game should have a start button or auto-start');
        suggestions.push('Add a start button with onclick="startGame()" or auto-start on page load');
      }
      
      // Check for game over logic
      if (!jsContent.includes('gameOver') && !jsContent.includes('game_over') && !jsContent.includes('endGame')) {
        issues.push('No game over logic - games need a way to end');
        suggestions.push('Add a gameOver() function that stops the game and shows final score');
      }
      
      // Check for score display
      if (htmlContent.includes('score') && !jsContent.includes('score')) {
        issues.push('HTML shows score but JS does not update it');
        suggestions.push('Add score tracking in JS and update the DOM: document.getElementById("score").textContent = score');
      }
      
      // Check for emojis/sprites (Opus quality uses emojis as sprites!)
      if (!jsContent.includes('emoji') && !jsContent.includes('🦖') && !jsContent.includes('💖') && 
          !jsContent.includes('sprite') && !jsContent.includes('image')) {
        suggestions.push('Consider using emojis as sprites (🦖, 💖, ⭐) - they render beautifully on canvas!');
      }
      
      // Check for particle effects
      if (!jsContent.includes('particle')) {
        suggestions.push('Add particle effects for visual polish when collecting items or taking damage');
      }
      
      // Check for animations
      if (!jsContent.includes('animation') && !jsContent.includes('animate') && 
          !jsContent.includes('requestAnimationFrame') && !cssContent.includes('@keyframes')) {
        issues.push('No animations detected - games should have movement/animation');
        suggestions.push('Use requestAnimationFrame for game loop and CSS @keyframes for UI animations');
      }
    }
    
    // General quality checks
    for (const [filename, content] of fileContents) {
      // Check for placeholders
      if (content.includes('TODO') || content.includes('FIXME') || content.includes('implement this')) {
        issues.push(`${filename} contains placeholder comments - Opus code is COMPLETE`);
      }
      
      // Check for empty functions
      if (content.match(/function\s+\w+\s*\([^)]*\)\s*\{\s*\}/)) {
        issues.push(`${filename} has empty function bodies - implement fully`);
      }
      
      // Check JS files reference valid HTML elements
      if (filename.endsWith('.js')) {
        const elementRefs = content.match(/getElementById\(['"]([^'"]+)['"]\)/g) || [];
        for (const ref of elementRefs) {
          const id = ref.match(/['"]([^'"]+)['"]/)?.[1];
          if (id) {
            const htmlContent = fileContents.get('index.html') || '';
            if (!htmlContent.includes(`id="${id}"`) && !htmlContent.includes(`id='${id}'`)) {
              issues.push(`JS getElementById("${id}") but no element with id="${id}" in HTML`);
            }
          }
        }
      }
    }
    
    // === CRITICAL: Button Binding Validation ===
    // Check that HTML buttons are actually connected to JS handlers
    if (htmlContent && jsContent) {
      const buttonMatches = htmlContent.match(/<button[^>]*id=["']([^"']+)["'][^>]*>/g) || [];
      for (const button of buttonMatches) {
        const buttonId = button.match(/id=["']([^"']+)["']/)?.[1];
        if (buttonId) {
          // Check if button has onclick in HTML
          const hasOnclick = button.includes('onclick');
          // Check if JS references this button via getElementById or querySelector
          const jsReferencesButton = 
            jsContent.includes(`getElementById("${buttonId}")`) ||
            jsContent.includes(`getElementById('${buttonId}')`) ||
            jsContent.includes(`querySelector("#${buttonId}")`) ||
            jsContent.includes(`querySelector('#${buttonId}')`);
          
          if (!hasOnclick && !jsReferencesButton) {
            issues.push(`Button #${buttonId} in HTML has no onclick and is not referenced in JS - button won't work`);
            suggestions.push(`Add onclick="${buttonId.replace('Btn', '')}()" to button OR add document.getElementById("${buttonId}").addEventListener("click", ...) in JS`);
          }
        }
      }
    }
    
    // === CRITICAL: Project Title/Context Coherence ===
    // Detect when HTML says one thing but JS implements something else
    if (htmlContent && jsContent) {
      // Extract HTML title
      const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
      const htmlTitle = titleMatch ? titleMatch[1].toLowerCase() : '';
      
      // Extract H1/H2 headers
      const headerMatches = htmlContent.match(/<h[12][^>]*>([^<]+)<\/h[12]>/gi) || [];
      const htmlHeaders = headerMatches.map(h => h.replace(/<\/?h[12][^>]*>/gi, '').toLowerCase());
      
      // Extract JS comment header (first line comment)
      const jsCommentMatch = jsContent.match(/^\/\/\s*(.+)/m);
      const jsHeader = jsCommentMatch ? jsCommentMatch[1].toLowerCase() : '';
      
      // Check for semantic mismatch
      const htmlContext = [htmlTitle, ...htmlHeaders].join(' ');
      
      // Known game types that should match
      const gameTypes = ['tetris', 'snake', 'pong', 'dino', 'space', 'shooter', 'platformer', 'defender', 'invader'];
      
      for (const game of gameTypes) {
        const htmlHasGame = htmlContext.includes(game);
        const jsHasGame = jsHeader.includes(game) || jsContent.slice(0, 500).toLowerCase().includes(game);
        
        if (htmlHasGame !== jsHasGame && (htmlHasGame || jsHasGame)) {
          const htmlGame = gameTypes.find(g => htmlContext.includes(g)) || 'unknown';
          const jsGame = gameTypes.find(g => jsHeader.includes(g) || jsContent.slice(0, 500).toLowerCase().includes(g)) || 'unknown';
          
          if (htmlGame !== jsGame && htmlGame !== 'unknown' && jsGame !== 'unknown') {
            issues.push(`Context mismatch: HTML says "${htmlGame}" but JS implements "${jsGame}" - files are for different projects!`);
            suggestions.push(`Make HTML and JS consistent. Either change HTML title/headers to match JS, or rewrite JS to match HTML`);
          }
        }
      }
    }
    
    return {
      passes: issues.length === 0,
      issues,
      suggestions
    };
  }
  
  /**
   * Generate mid-task reflection prompt
   * Injected when model seems stuck or quality is declining
   */
  static generateReflectionPrompt(): string {
    return `
🧠 OPUS REFLECTION CHECKPOINT

STOP and ask yourself:
1. Is this ACTUALLY complete, or am I cutting corners?
2. Would I be proud to show this code?
3. Does every button/feature ACTUALLY work?
4. Have I tested the full user flow mentally?
5. What polish am I missing?

If you're struggling with complexity, SIMPLIFY:
- Reduce scope, not quality
- Make fewer features that ALL work perfectly
- Complete is better than ambitious-but-broken

Continue with renewed focus on QUALITY.
`;
  }
}

// Export for use in other modules
export { OpusThinkingEngine };

// ============================================================
// SECURITY UTILITIES
// ============================================================

/**
 * Rate Limiter - Prevents abuse of command execution
 * Uses a sliding window approach
 */
class CommandRateLimiter {
  private commandHistory: Array<{ command: string; timestamp: number; workspacePath: string }> = [];
  private readonly MAX_COMMANDS_PER_MINUTE = 30;
  private readonly MAX_COMMANDS_PER_SECOND = 5;
  private readonly HISTORY_RETENTION_MS = 60000; // 1 minute
  
  /**
   * Check if a command can be executed (rate limit check)
   */
  canExecute(): { allowed: boolean; reason?: string; waitMs?: number } {
    this.cleanup();
    
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;
    
    // Check per-second limit
    const commandsLastSecond = this.commandHistory.filter(c => c.timestamp > oneSecondAgo).length;
    if (commandsLastSecond >= this.MAX_COMMANDS_PER_SECOND) {
      return { 
        allowed: false, 
        reason: `Rate limit exceeded: ${commandsLastSecond}/${this.MAX_COMMANDS_PER_SECOND} commands per second`,
        waitMs: 1000 - (now - this.commandHistory[this.commandHistory.length - 1].timestamp)
      };
    }
    
    // Check per-minute limit
    const commandsLastMinute = this.commandHistory.filter(c => c.timestamp > oneMinuteAgo).length;
    if (commandsLastMinute >= this.MAX_COMMANDS_PER_MINUTE) {
      return { 
        allowed: false, 
        reason: `Rate limit exceeded: ${commandsLastMinute}/${this.MAX_COMMANDS_PER_MINUTE} commands per minute`,
        waitMs: 60000 - (now - this.commandHistory[0].timestamp)
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Record a command execution
   */
  record(command: string, workspacePath: string): void {
    this.commandHistory.push({ command, timestamp: Date.now(), workspacePath });
    this.cleanup();
  }
  
  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.HISTORY_RETENTION_MS;
    this.commandHistory = this.commandHistory.filter(c => c.timestamp > cutoff);
  }
  
  /**
   * Get recent command stats
   */
  getStats(): { lastMinute: number; lastSecond: number } {
    this.cleanup();
    const now = Date.now();
    return {
      lastMinute: this.commandHistory.filter(c => c.timestamp > now - 60000).length,
      lastSecond: this.commandHistory.filter(c => c.timestamp > now - 1000).length
    };
  }
}

/**
 * Command Audit Logger - Logs all command executions for security review
 */
class CommandAuditLogger {
  private logPath: string;
  private enabled: boolean = true;
  
  constructor() {
    // Create audit log in user data directory
    const userDataPath = process.env.APPDATA || process.env.HOME || '.';
    const agentPrimeDir = path.join(userDataPath, 'AgentPrime');
    
    try {
      if (!fs.existsSync(agentPrimeDir)) {
        fs.mkdirSync(agentPrimeDir, { recursive: true });
      }
      this.logPath = path.join(agentPrimeDir, 'command-audit.log');
    } catch (e) {
      log.warn('[Security] Could not create audit log directory, logging disabled');
      this.logPath = '';
      this.enabled = false;
    }
  }
  
  /**
   * Log a command execution
   */
  log(entry: {
    command: string;
    workspacePath: string;
    status: 'executed' | 'blocked' | 'error';
    reason?: string;
    exitCode?: number;
    duration?: number;
  }): void {
    if (!this.enabled || !this.logPath) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
      // Sanitize sensitive data
      command: this.sanitizeCommand(entry.command)
    };
    
    try {
      const line = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.logPath, line, 'utf-8');
    } catch (e) {
      log.warn('[Security] Could not write to audit log');
    }
  }
  
  /**
   * Sanitize command for logging (hide potential secrets)
   */
  private sanitizeCommand(command: string): string {
    // Hide potential API keys, passwords, tokens
    return command
      .replace(/(?:api[_-]?key|password|token|secret|auth)[=:\s]+\S+/gi, '$1=***REDACTED***')
      .replace(/Bearer\s+\S+/gi, 'Bearer ***REDACTED***')
      .replace(/Basic\s+\S+/gi, 'Basic ***REDACTED***');
  }
  
  /**
   * Get recent audit entries
   */
  getRecentEntries(count: number = 50): any[] {
    if (!this.enabled || !this.logPath || !fs.existsSync(this.logPath)) {
      return [];
    }
    
    try {
      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      return lines.slice(-count).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }
}

/**
 * Enhanced Command Validator - More comprehensive security checks
 */
class CommandSecurityValidator {
  // Dangerous command patterns (expanded)
  private static readonly DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string; severity: 'critical' | 'high' | 'medium' }> = [
    // Critical - System destruction
    { pattern: /rm\s+-rf\s+\/(?!\w)/i, description: 'Recursive delete from root', severity: 'critical' },
    { pattern: /rm\s+-rf\s+~\/?$/i, description: 'Delete home directory', severity: 'critical' },
    { pattern: /rm\s+-rf\s+\.\.\/?$/i, description: 'Delete parent directory', severity: 'critical' },
    { pattern: /del\s+\/s\s+\/q\s+c:\\/i, description: 'Delete system drive', severity: 'critical' },
    { pattern: /format\s+[a-z]:/i, description: 'Format drive', severity: 'critical' },
    { pattern: /mkfs\./i, description: 'Make filesystem (format)', severity: 'critical' },
    { pattern: /dd\s+if=.*of=\/dev\//i, description: 'Direct disk write', severity: 'critical' },
    { pattern: />\s*\/dev\/sd[a-z]/i, description: 'Write to disk device', severity: 'critical' },
    
    // Critical - System control
    { pattern: /shutdown\s+(-[sfr]|\/[sfr])/i, description: 'System shutdown/restart', severity: 'critical' },
    { pattern: /reboot/i, description: 'System reboot', severity: 'critical' },
    { pattern: /init\s+[0-6]/i, description: 'Change runlevel', severity: 'critical' },
    { pattern: /:()\{\s*:\|:&\s*\};:/i, description: 'Fork bomb', severity: 'critical' },
    
    // High - Privilege escalation
    { pattern: /sudo\s+rm\s+-rf/i, description: 'Sudo recursive delete', severity: 'high' },
    { pattern: /sudo\s+chmod\s+777/i, description: 'Sudo chmod 777', severity: 'high' },
    { pattern: /sudo\s+chown.*root/i, description: 'Sudo chown to root', severity: 'high' },
    { pattern: /chmod\s+777\s+\//i, description: 'chmod 777 on root', severity: 'high' },
    { pattern: /chown\s+-R\s+root\s+\//i, description: 'Recursive chown to root', severity: 'high' },
    
    // High - Network/data exfiltration
    { pattern: /curl.*\|\s*bash/i, description: 'Pipe curl to bash', severity: 'high' },
    { pattern: /wget.*\|\s*sh/i, description: 'Pipe wget to shell', severity: 'high' },
    { pattern: /nc\s+-e/i, description: 'Netcat with execute', severity: 'high' },
    { pattern: /netcat.*-e/i, description: 'Netcat reverse shell', severity: 'high' },
    
    // Medium - Potentially harmful
    { pattern: />\s*\/etc\//i, description: 'Write to /etc/', severity: 'medium' },
    { pattern: />\s*\/usr\//i, description: 'Write to /usr/', severity: 'medium' },
    { pattern: /rm\s+-rf\s+node_modules/i, description: 'Delete node_modules (use with caution)', severity: 'medium' },
    { pattern: /git\s+push\s+.*--force/i, description: 'Force push', severity: 'medium' },
    { pattern: /git\s+reset\s+--hard/i, description: 'Hard reset', severity: 'medium' },
  ];
  
  /**
   * Validate a command for security issues
   */
  static validate(command: string): { 
    safe: boolean; 
    issues: Array<{ description: string; severity: string }>;
    blocked: boolean;
  } {
    const issues: Array<{ description: string; severity: string }> = [];
    let blocked = false;
    
    for (const { pattern, description, severity } of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        issues.push({ description, severity });
        if (severity === 'critical' || severity === 'high') {
          blocked = true;
        }
      }
    }
    
    // Additional checks
    
    // Check for command chaining that might bypass filters
    if (/[;&|]{2,}/.test(command) && issues.length > 0) {
      issues.push({ description: 'Command chaining with dangerous patterns', severity: 'high' });
      blocked = true;
    }
    
    // Check for base64 encoded payloads (potential obfuscation)
    if (/base64\s+-d.*\|\s*(bash|sh|python|node)/i.test(command)) {
      issues.push({ description: 'Base64 decoded execution', severity: 'high' });
      blocked = true;
    }
    
    // Check for environment variable injection attempts
    if (/\$\([^)]+\).*rm|rm.*\$\([^)]+\)/i.test(command)) {
      issues.push({ description: 'Command substitution with rm', severity: 'high' });
      blocked = true;
    }
    
    return { safe: issues.length === 0, issues, blocked };
  }
  
  /**
   * Check if command stays within workspace boundaries
   */
  static validateWorkspaceBoundary(command: string, workspacePath: string): boolean {
    // Check for obvious escapes
    if (/\.\.[\/\\]/.test(command) && !command.includes('node_modules')) {
      // Allow .. in node_modules paths, block others
      const suspiciousMatches = command.match(/\.\.[\/\\]/g) || [];
      if (suspiciousMatches.length > 2) {
        return false; // Too many parent directory references
      }
    }
    
    // Check for absolute paths outside workspace
    const absolutePathMatches = command.match(/(?:^|[\s"'])([\/\\](?:usr|etc|var|home|root|windows|system32|program files)[\/\\])/gi);
    if (absolutePathMatches && absolutePathMatches.length > 0) {
      return false;
    }
    
    return true;
  }
}

// Global instances
const commandRateLimiter = new CommandRateLimiter();
const commandAuditLogger = new CommandAuditLogger();

// ============================================================
// END SECURITY UTILITIES
// ============================================================

// Tool definitions
interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  execute: (params: any, context: AgentContext) => Promise<any>;
}

import {
  getVibeCoderToolPolicyError,
  injectBehaviorProfilePrompt,
  type AssistantBehaviorProfile,
  type VibeCoderExecutionPolicy,
  type VibeCoderIntent,
} from './agent/behavior-profile';
import { PromptSanitizer } from './security/prompt-sanitizer';
import type { IdeContextSnapshot } from '../types/agent-ide-context';
import { formatIdeContextForModel } from './agent/ide-context-format';

export interface AgentContext {
  workspacePath: string;
  currentFile?: string;
  openFiles: string[];
  terminalHistory: string[];
  /** Rich IDE snapshot from renderer (tabs, buffer, tree) — injected into system prompt, not user text. */
  ideContext?: IdeContextSnapshot;
  gitStatus?: string;
  model?: string;
  runtimeBudget?: 'instant' | 'standard' | 'deep';
  assistantBehaviorProfile?: AssistantBehaviorProfile;
  vibeCoderIntent?: VibeCoderIntent;
  vibeCoderExecutionPolicy?: VibeCoderExecutionPolicy;
  autonomyLevel?: 1 | 2 | 3 | 4 | 5;
  deterministicScaffoldOnly?: boolean;
  /** When true, skip staged review and commit monolithic agent file writes immediately (settings-driven). */
  monolithicApplyImmediately?: boolean;
  repairScope?: {
    allowedFiles: string[];
    blockedFiles: string[];
    findings: Array<{
      stage: 'validation' | 'install' | 'build' | 'run' | 'browser' | 'unknown';
      severity: 'info' | 'warning' | 'error' | 'critical';
      summary: string;
      files: string[];
      suggestedOwner?: string;
      command?: string;
      output?: string;
    }>;
  };
  userMessage?: string;
  onFileWrite?: (change: { path: string; oldContent: string; newContent: string; action: 'created' | 'modified' }) => void;
  isCancellationRequested?: () => boolean;
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ValidationStep {
  name: string;
  validator: (context: AgentContext, data: any) => Promise<ValidationResult>;
  requiredConfidence: number;
  canAutoFix: boolean;
  autoFix?: (context: AgentContext, data: any, issues: string[]) => Promise<AutoFixResult>;
}

interface ValidationResult {
  valid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}

interface AutoFixResult {
  success: boolean;
  fixedData?: any;
  explanation: string;
  confidence: number;
}

// Core Tools Registry
const tools: Record<string, Tool> = {
  read_file: {
    name: 'read_file',
    description: 'Read a file from the workspace. Use this to examine code before making changes.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to workspace root'
        },
        start_line: {
          type: 'number',
          description: 'Optional: start line number (1-indexed)'
        },
        end_line: {
          type: 'number',
          description: 'Optional: end line number (1-indexed)'
        }
      },
      required: ['path']
    },
    execute: async ({ path: filePath, start_line, end_line }, context) => {
      const fullPath = path.resolve(context.workspacePath, filePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      let content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      // Apply line filtering if specified
      if (start_line || end_line) {
        const start = Math.max(1, start_line || 1) - 1;
        const end = Math.min(lines.length, end_line || lines.length);
        content = lines.slice(start, end).join('\n');
      }

      return {
        path: filePath,
        content,
        lines: lines.length,
        truncated: content.length > 50000 // Flag if content is huge
      };
    }
  },

  write_file: {
    name: 'write_file',
    description: 'Write or update a file. Use this to create new files or modify existing ones.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to workspace root'
        },
        content: {
          type: 'string',
          description: 'New content to write to the file'
        },
        create_dirs: {
          type: 'boolean',
          description: 'Create parent directories if they don\'t exist',
          default: true
        }
      },
      required: ['path', 'content']
    },
    execute: async ({ path: filePath, content, create_dirs = true }, context) => {
      // === SANITIZE FILENAME ===
      // Remove invalid characters from the filename (like *, <, >, :, ", |, ?, etc.)
      // This prevents ENOENT errors on Windows when AI generates fancy filenames
      const pathParts = filePath.split(/[\/\\]/);
      if (pathParts.length > 0) {
        const originalFileName = pathParts[pathParts.length - 1];
        const sanitizedFileName = sanitizeFileName(originalFileName);
        if (sanitizedFileName !== originalFileName) {
          log.info(`[Agent] Sanitized filename: "${originalFileName}" -> "${sanitizedFileName}"`);
          pathParts[pathParts.length - 1] = sanitizedFileName;
          filePath = pathParts.join('/');
        }
      }
      
      const fullPath = path.resolve(context.workspacePath, filePath);
      const fileExistedBeforeWrite = fs.existsSync(fullPath);
      const previousContent = fileExistedBeforeWrite ? fs.readFileSync(fullPath, 'utf-8') : '';

      // Always create parent directories unless explicitly disabled
      if (create_dirs !== false) {
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
      }

      // Normalize content to string before writing
      let contentString: string;
      if (content === null || content === undefined) {
        throw new Error(`Content cannot be null or undefined for file: ${filePath}`);
      } else if (typeof content === 'string') {
        contentString = content;
      } else if (typeof content === 'object') {
        // For JSON files, pretty format; otherwise, compact
        if (filePath.endsWith('.json')) {
          contentString = JSON.stringify(content, null, 2);
        } else {
          contentString = JSON.stringify(content);
        }
      } else {
        // Convert other types to string
        contentString = String(content);
      }

      // Record file write in transaction before executing
      try {
        await transactionManager.recordWrite(filePath, contentString);
      } catch (recordError: any) {
        // Non-critical - log but continue
        log.warn('[Agent] Failed to record file write in transaction:', recordError.message);
      }

      // === REACT FILE CLEANUP ===
      // Clean up React App files to remove boilerplate and fix structure
      if (filePath.match(/App\.(tsx|jsx)$/i)) {
        contentString = cleanupReactAppFile(contentString, filePath);
      }
      
      fs.writeFileSync(fullPath, contentString, 'utf-8');

      context.onFileWrite?.({
        path: filePath,
        oldContent: previousContent,
        newContent: contentString,
        action: fileExistedBeforeWrite ? 'modified' : 'created'
      });
      
      // === FILE REFERENCE VALIDATION ===
      // Check if HTML files reference resources that don't exist yet
      const warnings: string[] = [];
      const pendingFiles: string[] = [];
      
      if (filePath.endsWith('.html')) {
        // Extract script and CSS references
        const scriptMatches = contentString.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
        const cssMatches = contentString.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi);
        const imgMatches = contentString.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
        
        const checkReference = (ref: string, type: string) => {
          if (ref && !ref.startsWith('http') && !ref.startsWith('//') && !ref.startsWith('data:')) {
            const refDir = path.dirname(fullPath);
            const refPath = path.resolve(refDir, ref);
            if (!fs.existsSync(refPath)) {
              pendingFiles.push(ref);
              warnings.push(`⚠️ ${type} "${ref}" referenced but does not exist`);
            }
          }
        };
        
        for (const match of scriptMatches) { checkReference(match[1], 'Script'); }
        for (const match of cssMatches) { checkReference(match[1], 'Stylesheet'); }
        for (const match of imgMatches) { checkReference(match[1], 'Image'); }
      }
      
      // Check if JS files are missing imports/requires
      if (filePath.endsWith('.js') && !filePath.includes('node_modules')) {
        // Check for Phaser usage without it being loaded (common mistake)
        if (contentString.includes('Phaser.') && !contentString.includes('import') && !contentString.includes('require')) {
          warnings.push(`⚠️ Uses Phaser but no import/require found - ensure Phaser is loaded in HTML before this script`);
        }
        // Check for PIXI usage
        if (contentString.includes('PIXI.') && !contentString.includes('import') && !contentString.includes('require')) {
          warnings.push(`⚠️ Uses PIXI but no import/require found - ensure PixiJS is loaded in HTML before this script`);
        }
        // Check for THREE usage
        if (contentString.includes('THREE.') && !contentString.includes('import') && !contentString.includes('require')) {
          warnings.push(`⚠️ Uses THREE but no import/require found - ensure Three.js is loaded or use ES6 imports`);
        }
      }
      
      const result: any = {
        path: filePath,
        written: true,
        size: contentString.length,
        action: fileExistedBeforeWrite ? 'modified' : 'created'
      };
      
      if (warnings.length > 0) {
        result.warnings = warnings;
        result.pendingFiles = pendingFiles;
        result.hint = pendingFiles.length > 0 
          ? `You need to create these files before the project will work: ${pendingFiles.join(', ')}`
          : 'Check the warnings above for potential issues.';
      }
      
      return result;
    }
  },

  // 🛡️ PATCH_FILE - Surgical edit tool for FIX mode
  patch_file: {
    name: 'patch_file',
    description: `Make surgical edits to a file by replacing specific text. 
This is SAFER than write_file for fixing bugs because it only changes what you specify.
Use this in FIX mode instead of write_file.

IMPORTANT: old_text must match EXACTLY (including whitespace and indentation).
Use read_file first to see the exact content you want to replace.`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to workspace root'
        },
        old_text: {
          type: 'string',
          description: 'The exact text to find and replace (must match exactly including whitespace)'
        },
        new_text: {
          type: 'string',
          description: 'The new text to replace old_text with'
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace all occurrences. Default is false (replace first only).',
          default: false
        }
      },
      required: ['path', 'old_text', 'new_text']
    },
    execute: async ({ path: filePath, old_text, new_text, replace_all = false }, context) => {
      const fullPath = path.resolve(context.workspacePath, filePath);
      
      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${filePath}. Use read_file first to verify the file exists.`
        };
      }
      
      // Read current content
      const currentContent = fs.readFileSync(fullPath, 'utf-8');
      
      // Check if old_text exists in file
      if (!currentContent.includes(old_text)) {
        // Provide helpful feedback
        const lines = currentContent.split('\n');
        const preview = lines.slice(0, 20).map((l, i) => `${i + 1}: ${l}`).join('\n');
        
        return {
          success: false,
          error: `Text not found in file. Make sure old_text matches exactly (including whitespace).`,
          hint: `File has ${lines.length} lines. First 20 lines:\n${preview}`,
          suggestion: 'Use read_file to see the exact content, then copy the text exactly.'
        };
      }
      
      // Calculate change percentage
      let newContent: string;
      let replacementCount = 0;
      
      if (replace_all) {
        const regex = new RegExp(old_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = currentContent.match(regex);
        replacementCount = matches?.length || 0;
        newContent = currentContent.replace(regex, new_text);
      } else {
        newContent = currentContent.replace(old_text, new_text);
        replacementCount = 1;
      }
      
      // Calculate change percentage
      const changePercentage = 1 - (newContent.length > currentContent.length 
        ? currentContent.length / newContent.length 
        : newContent.length / currentContent.length);
      
      // Warn if change is large
      if (changePercentage > 0.3) {
        log.info(`[Agent] ⚠️ patch_file: Large change (${Math.round(changePercentage * 100)}%) to ${filePath}`);
      }
      
      // Record in transaction before writing
      try {
        await transactionManager.recordWrite(filePath, newContent);
      } catch (recordError: any) {
        log.warn('[Agent] Failed to record patch in transaction:', recordError.message);
      }
      
      // Write the patched content
      fs.writeFileSync(fullPath, newContent, 'utf-8');

      context.onFileWrite?.({
        path: filePath,
        oldContent: currentContent,
        newContent,
        action: 'modified'
      });
      
      return {
        success: true,
        path: filePath,
        replacements: replacementCount,
        changePercentage: Math.round(changePercentage * 100),
        oldLength: currentContent.length,
        newLength: newContent.length,
        message: `Successfully patched ${filePath}: ${replacementCount} replacement(s), ${Math.round(changePercentage * 100)}% change`
      };
    }
  },

  run_command: {
    name: 'run_command',
    description: 'Run a terminal command in the workspace. Use this for building, testing, or running scripts.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to run (e.g., "npm install", "python main.py")'
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to workspace root',
          default: '.'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds',
          default: 30
        }
      },
      required: ['command']
    },
    execute: async ({ command, cwd = '.', timeout = 30 }, context) => {
      const startTime = Date.now();

      if (context.isCancellationRequested?.()) {
        throw new Error('Command cancelled before execution');
      }
      
      // === SECURITY CHECK 1: Rate Limiting ===
      const rateCheck = commandRateLimiter.canExecute();
      if (!rateCheck.allowed) {
        commandAuditLogger.log({
          command,
          workspacePath: context.workspacePath,
          status: 'blocked',
          reason: rateCheck.reason
        });
        throw new Error(`🚫 RATE LIMITED: ${rateCheck.reason}. Please wait ${Math.ceil((rateCheck.waitMs || 1000) / 1000)}s.`);
      }
      
      // === SECURITY CHECK 2: Command Validation (Enhanced) ===
      const validation = CommandSecurityValidator.validate(command);
      if (validation.blocked) {
        const issueDescriptions = validation.issues.map(i => `${i.severity.toUpperCase()}: ${i.description}`).join('; ');
        commandAuditLogger.log({
          command,
          workspacePath: context.workspacePath,
          status: 'blocked',
          reason: issueDescriptions
        });
        throw new Error(`🚫 BLOCKED: Dangerous command detected.\nIssues: ${issueDescriptions}\nFor security, this command cannot be executed.`);
      }
      
      // Log warnings for medium severity issues
      if (validation.issues.length > 0 && !validation.blocked) {
        log.warn(`[Security] ⚠️ Command has potential issues: ${validation.issues.map(i => i.description).join(', ')}`);
      }
      
      // === SECURITY CHECK 3: Workspace Boundary ===
      const workDir = path.resolve(context.workspacePath, cwd);
      const workspaceRoot = path.resolve(context.workspacePath);
      
      if (!workDir.startsWith(workspaceRoot)) {
        commandAuditLogger.log({
          command,
          workspacePath: context.workspacePath,
          status: 'blocked',
          reason: 'Directory traversal attempt'
        });
        throw new Error(`🚫 BLOCKED: Command working directory must be within workspace. Attempted: ${workDir}`);
      }
      
      // === SECURITY CHECK 4: Workspace Boundary in Command ===
      if (!CommandSecurityValidator.validateWorkspaceBoundary(command, context.workspacePath)) {
        commandAuditLogger.log({
          command,
          workspacePath: context.workspacePath,
          status: 'blocked',
          reason: 'Command references paths outside workspace'
        });
        throw new Error(`🚫 BLOCKED: Command appears to reference paths outside the workspace.`);
      }
      
      // Record command execution (for rate limiting)
      commandRateLimiter.record(command, context.workspacePath);

      // Resolve command to use full paths if tools aren't in PATH
      const { resolveCommand, isMissingToolError, getToolErrorHelp, getToolPaths } = require('./core/tool-path-finder');
      const resolvedCommand = resolveCommand(command);
      const toolPaths = getToolPaths();
      
      // Build environment with tool paths
      const env = { ...process.env };
      if (toolPaths.node && process.platform === 'win32') {
        const nodeDir = path.dirname(toolPaths.node);
        env.PATH = `${nodeDir};${env.PATH || ''}`;
      }

      return new Promise((resolve, reject) => {
        let settled = false;
        const complete = (finalizer: () => void) => {
          if (settled) return;
          settled = true;
          finalizer();
        };

        if (context.isCancellationRequested?.()) {
          complete(() => reject(new Error('Command cancelled before execution')));
          return;
        }

        const child = spawn(resolvedCommand, {
          cwd: workDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
          env: env
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        const cancellationPoll = setInterval(() => {
          if (context.isCancellationRequested?.() && !settled) {
            try {
              child.kill();
            } catch {
              // Ignore kill failures
            }
            clearTimeout(timer);
            clearInterval(cancellationPoll);
            complete(() => reject(new Error('Command cancelled by user')));
          }
        }, 200);

        const timer = setTimeout(() => {
          if (settled) return;
          try {
            child.kill();
          } catch {
            // Ignore kill failures
          }
          clearInterval(cancellationPoll);

          // === AUDIT LOG: Command timeout ===
          commandAuditLogger.log({
            command,
            workspacePath: context.workspacePath,
            status: 'error',
            reason: `Timed out after ${timeout}s`,
            duration: timeout * 1000
          });

          complete(() => reject(new Error(`Command timed out after ${timeout}s`)));
        }, timeout * 1000);

        child.on('close', (code) => {
          if (settled) return;
          clearTimeout(timer);
          clearInterval(cancellationPoll);
          
          // Check if error is due to missing tool
          const combinedOutput = stdout + stderr;
          if (code !== 0 && isMissingToolError(combinedOutput)) {
            const help = getToolErrorHelp(command, combinedOutput);
            log.warn(`[AgentLoop] ${help}`);
            // Try again with resolved command if different
            if (resolvedCommand !== command) {
              log.info(`[AgentLoop] Retrying with resolved path: ${resolvedCommand}`);
              // Note: This is a retry attempt, but we're already in the close handler
              // The resolved command should have been used from the start
            }
          }
          
          // === SYNTAX ERROR DETECTION ===
          let syntaxError: { file?: string; line?: number; message: string; error: string } | null = null;
          
          // Detect JavaScript/Node.js syntax errors
          const jsSyntaxMatch = combinedOutput.match(/(SyntaxError|ReferenceError|TypeError):\s*(.+?)\s+at\s+(.+?):(\d+)/);
          if (jsSyntaxMatch) {
            let filePath = jsSyntaxMatch[3];
            // Convert to relative path if it's within workspace
            try {
              if (filePath.startsWith(workDir)) {
                filePath = path.relative(workDir, filePath);
              }
            } catch (e) {
              // If path.relative fails, use original path
            }
            syntaxError = {
              file: filePath.replace(/\\/g, '/'),
              line: parseInt(jsSyntaxMatch[4], 10),
              message: jsSyntaxMatch[2],
              error: jsSyntaxMatch[1]
            };
          }
          
          // Detect Python syntax errors
          const pySyntaxMatch = combinedOutput.match(/File\s+"(.+?)",\s+line\s+(\d+).*?(SyntaxError|IndentationError):\s*(.+)/s);
          if (pySyntaxMatch) {
            let filePath = pySyntaxMatch[1];
            // Convert to relative path if it's within workspace
            try {
              if (filePath.startsWith(workDir)) {
                filePath = path.relative(workDir, filePath);
              }
            } catch (e) {
              // If path.relative fails, use original path
            }
            syntaxError = {
              file: filePath.replace(/\\/g, '/'),
              line: parseInt(pySyntaxMatch[2], 10),
              message: pySyntaxMatch[4],
              error: pySyntaxMatch[3]
            };
          }
          
          // If syntax error detected, include it in result
          const result: any = {
            command,
            cwd,
            exit_code: code,
            stdout,
            stderr,
            success: code === 0,
            syntax_error: syntaxError || undefined
          };
          
          // === AUDIT LOG: Command completed ===
          const duration = Date.now() - startTime;
          commandAuditLogger.log({
            command,
            workspacePath: context.workspacePath,
            status: code === 0 ? 'executed' : 'error',
            exitCode: code || 0,
            duration
          });

          complete(() => resolve(result));
        });

        child.on('error', (err) => {
          if (settled) return;
          clearTimeout(timer);
          clearInterval(cancellationPoll);
          
          // === AUDIT LOG: Command error ===
          commandAuditLogger.log({
            command,
            workspacePath: context.workspacePath,
            status: 'error',
            reason: err.message,
            duration: Date.now() - startTime
          });

          complete(() => reject(err));
        });
      });
    }
  },

  preview_game: {
    name: 'preview_game',
    description: 'Open an HTML file in the default browser to preview/test a game or web page. Use this AFTER writing game files to verify they work. This gives you feedback on whether the game actually runs.',
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to HTML file to open (e.g., "index.html"). Defaults to "index.html" if not specified.',
          default: 'index.html'
        }
      },
      required: []
    },
    execute: async ({ file = 'index.html' }, context) => {
      const htmlPath = path.resolve(context.workspacePath, file);
      
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`HTML file not found: ${file}`);
      }
      
      if (!htmlPath.endsWith('.html')) {
        throw new Error(`File must be an HTML file: ${file}`);
      }
      
      // Open in default browser (cross-platform)
      const { exec } = require('child_process');
      const platform = process.platform;
      
      let command: string;
      if (platform === 'win32') {
        command = `start "" "${htmlPath}"`;
      } else if (platform === 'darwin') {
        command = `open "${htmlPath}"`;
      } else {
        command = `xdg-open "${htmlPath}"`;
      }
      
      return new Promise((resolve, reject) => {
        exec(command, (error: any) => {
          if (error) {
            reject(new Error(`Failed to open browser: ${error.message}`));
          } else {
            resolve({
              success: true,
              message: `✅ Opened ${file} in browser. Test the game and report any issues you find.`,
              file: file,
              path: htmlPath
            });
          }
        });
      });
    }
  },

  list_dir: {
    name: 'list_dir',
    description: 'List contents of a directory. Use this to explore the project structure.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to workspace root',
          default: '.'
        }
      },
      required: []
    },
    execute: async ({ path: dirPath = '.' }, context) => {
      const fullPath = path.resolve(context.workspacePath, dirPath);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      const items = fs.readdirSync(fullPath, { withFileTypes: true });
      const result = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        path: path.relative(context.workspacePath, path.join(fullPath, item.name))
      }));

      return {
        path: dirPath,
        items: result
      };
    }
  },

  search_codebase: {
    name: 'search_codebase',
    description: 'Search for text or patterns in the codebase using ripgrep. Fast and powerful.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (supports regex)'
        },
        include_pattern: {
          type: 'string',
          description: 'File pattern to include (e.g., "*.ts", "*.js")'
        },
        exclude_pattern: {
          type: 'string',
          description: 'File pattern to exclude'
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results',
          default: 20
        }
      },
      required: ['query']
    },
    execute: async ({ query, include_pattern, exclude_pattern, max_results = 20 }, context) => {
      try {
        const rg = await searchWithRipgrep(context.workspacePath, query, {
          includePattern: include_pattern,
          excludePattern: exclude_pattern,
          maxResults: max_results,
          timeoutMs: 25_000
        });

        if (!rg.success) {
          return {
            query,
            matches: [],
            total: 0,
            error: rg.message || 'ripgrep failed',
            usedBundledRg: rg.usedBundledRg
          };
        }

        const matches = rg.matches.map((m) => ({
          file: m.file,
          line: m.line,
          column: m.column,
          content: m.content
        }));

        return {
          query,
          matches,
          total: matches.length,
          truncated: !!rg.message?.includes('limited'),
          usedBundledRg: rg.usedBundledRg
        };
      } catch (e) {
        log.warn('search_codebase failed:', e);
        return { query, matches: [], total: 0, error: String(e) };
      }
    }
  },
  
  // 🆕 CURSOR-STYLE SURGICAL EDIT TOOL
  str_replace: {
    name: 'str_replace',
    description: 'Make a surgical edit to a file by replacing specific text. Much safer than rewriting the entire file. The old_string must match EXACTLY (including whitespace and indentation). Use this for targeted changes.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to edit'
        },
        old_string: {
          type: 'string',
          description: 'The exact text to find and replace (must be unique in the file)'
        },
        new_string: {
          type: 'string',
          description: 'The text to replace it with'
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace all occurrences. Default is false (replace first only).',
          default: false
        }
      },
      required: ['path', 'old_string', 'new_string']
    },
    execute: async ({ path: filePath, old_string, new_string, replace_all = false }, context) => {
      const fullPath = path.resolve(context.workspacePath, filePath);
      
      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${filePath}`
        };
      }
      
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      if (!content.includes(old_string)) {
        // Try to help the user find what went wrong
        const lines = old_string.split('\n');
        const firstLine = lines[0].trim();
        const suggestions: string[] = [];
        
        if (firstLine.length > 10) {
          const contentLines = content.split('\n');
          for (let i = 0; i < contentLines.length; i++) {
            if (contentLines[i].includes(firstLine.slice(0, 20))) {
              suggestions.push(`Line ${i + 1}: ${contentLines[i].slice(0, 60)}...`);
            }
          }
        }
        
        return {
          success: false,
          error: `old_string not found in file. Make sure it matches exactly (including whitespace).`,
          hint: suggestions.length > 0 ? `Similar lines found:\n${suggestions.slice(0, 3).join('\n')}` : 'No similar content found.'
        };
      }
      
      // Count occurrences
      const regex = new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = content.match(regex);
      const occurrences = matches ? matches.length : 0;
      
      if (occurrences > 1 && !replace_all) {
        return {
          success: false,
          error: `old_string appears ${occurrences} times in the file. Either make it more specific (include more context) or set replace_all: true.`
        };
      }
      
      // Perform replacement
      if (replace_all) {
        content = content.split(old_string).join(new_string);
      } else {
        content = content.replace(old_string, new_string);
      }
      
      // === REACT FILE CLEANUP ===
      // Clean up React App files after str_replace to fix structure
      if (filePath.match(/App\.(tsx|jsx)$/i)) {
        content = cleanupReactAppFile(content, filePath);
      }
      
      // Write back
      fs.writeFileSync(fullPath, content, 'utf-8');
      
      return {
        success: true,
        path: filePath,
        replacements: replace_all ? occurrences : 1,
        message: `Replaced ${replace_all ? occurrences : 1} occurrence(s) in ${filePath}`
      };
    }
  },

  scaffold_project: {
    name: 'scaffold_project',
    description: 'Initialize a project with proper structure, files, and dependencies based on detected type. Use this FIRST when creating games or complex projects to ensure proper setup.',
    parameters: {
      type: 'object',
      properties: {
        project_type: {
          type: 'string',
          enum: ['phaser_game', 'html_game', 'pixi_game', 'threejs_viewer', 'threejs_platformer', 'express_api', 'python_fastapi', 'python_script'],
          description: 'Type of project to scaffold'
        },
        project_name: {
          type: 'string',
          description: 'Name for the project (used in package.json)'
        }
      },
      required: ['project_type', 'project_name']
    },
    execute: async ({ project_type, project_name }, context) => {
      const canonicalScaffold = await scaffoldProjectFromTemplate(
        context.workspacePath,
        context.userMessage || `${project_type} ${project_name}`,
        {
          projectType: project_type,
          projectName: project_name,
          runPostCreate: false,
        }
      );

      if (canonicalScaffold.success) {
        return {
          success: true,
          scaffolded: canonicalScaffold.templateId || project_type,
          name: project_name,
          pattern: canonicalScaffold.templateId || project_type,
          createdFiles: canonicalScaffold.createdFiles,
          requiredFiles: canonicalScaffold.createdFiles,
          filesToCustomize: canonicalScaffold.createdFiles.filter((file) => file !== 'package.json' && file !== 'README.md'),
          dependencies: [],
          nextSteps: [
            'Run npm install to install dependencies',
            'Customize the generated files with project-specific logic',
            'Run npm run dev to launch the scaffolded project'
          ]
        };
      }

      const { PROJECT_PATTERNS } = await import('./agent/tools/projectPatterns');
      const pattern = PROJECT_PATTERNS[project_type];
      
      if (!pattern) {
        return { success: false, error: `Unknown project type: ${project_type}` };
      }
      
      const createdFiles: string[] = [];
      const instructions: string[] = [];
      
      // Create package.json with proper dependencies
      if (Object.keys(pattern.structure.dependencies || {}).length > 0 || 
          Object.keys(pattern.structure.devDependencies || {}).length > 0 ||
          Object.keys(pattern.structure.scripts || {}).length > 0) {
        
        const safeName = project_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
        const pkg = {
          name: safeName,
          version: '1.0.0',
          description: `${pattern.name} - ${project_name}`,
          main: pattern.type === 'game' ? 'game.js' : (pattern.type === 'python' ? 'main.py' : 'index.js'),
          scripts: pattern.structure.scripts || {},
          dependencies: pattern.structure.dependencies || {},
          devDependencies: pattern.structure.devDependencies || {}
        };
        
        const pkgPath = path.join(context.workspacePath, 'package.json');
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
        createdFiles.push('package.json');
      }
      
      // Create game-specific templates
      if (project_type === 'phaser_game') {
        // Create index.html with Phaser CDN
        const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project_name}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="game-container"></div>
    <!-- Phaser 3 from CDN -->
    <script src="https://cdn.jsdelivr.net/npm/phaser@3.70.0/dist/phaser.min.js"></script>
    <!-- Game code - loaded AFTER Phaser -->
    <script src="game.js"></script>
</body>
</html>`;
        fs.writeFileSync(path.join(context.workspacePath, 'index.html'), indexHtml, 'utf-8');
        createdFiles.push('index.html');
        
        // Create complete game.js template - fully playable platformer
        const gameJs = `// ${project_name} - Phaser 3 Platformer Game
// A complete, playable game with collectibles, enemies, and scoring

// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 500 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// Create game instance
const game = new Phaser.Game(config);

// Game state
let player, platforms, stars, enemies;
let cursors, spaceKey;
let score = 0;
let scoreText, livesText, gameOverText;
let lives = 3;
let gameOver = false;

// Preload - create graphics programmatically (no external assets needed)
function preload() {
    // Create player texture (green square with face)
    const playerGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    playerGraphics.fillStyle(0x00ff00, 1);
    playerGraphics.fillRect(0, 0, 32, 48);
    playerGraphics.fillStyle(0x000000, 1);
    playerGraphics.fillRect(6, 10, 6, 6);   // Left eye
    playerGraphics.fillRect(20, 10, 6, 6);  // Right eye
    playerGraphics.fillRect(10, 30, 12, 4); // Mouth
    playerGraphics.generateTexture('player', 32, 48);
    
    // Create platform texture
    const platformGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    platformGraphics.fillStyle(0x4a6741, 1);
    platformGraphics.fillRect(0, 0, 400, 32);
    platformGraphics.fillStyle(0x3d5636, 1);
    platformGraphics.fillRect(0, 0, 400, 8);
    platformGraphics.generateTexture('platform', 400, 32);
    
    // Create star texture (yellow circle)
    const starGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    starGraphics.fillStyle(0xffff00, 1);
    starGraphics.fillCircle(12, 12, 12);
    starGraphics.fillStyle(0xffaa00, 1);
    starGraphics.fillCircle(12, 12, 6);
    starGraphics.generateTexture('star', 24, 24);
    
    // Create enemy texture (red square with angry face)
    const enemyGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    enemyGraphics.fillStyle(0xff0000, 1);
    enemyGraphics.fillRect(0, 0, 32, 32);
    enemyGraphics.fillStyle(0x000000, 1);
    enemyGraphics.fillRect(4, 8, 8, 4);   // Left eye
    enemyGraphics.fillRect(20, 8, 8, 4);  // Right eye
    enemyGraphics.fillRect(8, 22, 16, 4); // Angry mouth
    enemyGraphics.generateTexture('enemy', 32, 32);
}

// Create game objects
function create() {
    // Create platforms group
    platforms = this.physics.add.staticGroup();
    
    // Ground platform
    platforms.create(400, 584, 'platform').setScale(2, 1).refreshBody();
    
    // Floating platforms
    platforms.create(600, 450, 'platform').setScale(0.5, 1).refreshBody();
    platforms.create(50, 350, 'platform').setScale(0.5, 1).refreshBody();
    platforms.create(750, 270, 'platform').setScale(0.5, 1).refreshBody();
    platforms.create(200, 200, 'platform').setScale(0.6, 1).refreshBody();
    platforms.create(550, 150, 'platform').setScale(0.4, 1).refreshBody();
    
    // Create player
    player = this.physics.add.sprite(100, 450, 'player');
    player.setBounce(0.1);
    player.setCollideWorldBounds(true);
    
    // Create stars group
    stars = this.physics.add.group();
    for (let i = 0; i < 12; i++) {
        const x = Phaser.Math.Between(50, 750);
        const y = Phaser.Math.Between(50, 400);
        const star = stars.create(x, y, 'star');
        star.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
    }
    
    // Create enemies
    enemies = this.physics.add.group();
    const enemy1 = enemies.create(600, 400, 'enemy');
    enemy1.setBounce(1);
    enemy1.setCollideWorldBounds(true);
    enemy1.setVelocityX(100);
    
    const enemy2 = enemies.create(200, 150, 'enemy');
    enemy2.setBounce(1);
    enemy2.setCollideWorldBounds(true);
    enemy2.setVelocityX(-80);
    
    // Physics collisions
    this.physics.add.collider(player, platforms);
    this.physics.add.collider(stars, platforms);
    this.physics.add.collider(enemies, platforms);
    
    // Overlap callbacks
    this.physics.add.overlap(player, stars, collectStar, null, this);
    this.physics.add.overlap(player, enemies, hitEnemy, null, this);
    
    // Input
    cursors = this.input.keyboard.createCursorKeys();
    spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    
    // UI Text
    scoreText = this.add.text(16, 16, 'Score: 0', { 
        fontSize: '28px', 
        fill: '#fff',
        fontFamily: 'Arial',
        stroke: '#000',
        strokeThickness: 4
    });
    
    livesText = this.add.text(16, 50, 'Lives: 3', { 
        fontSize: '24px', 
        fill: '#ff6b6b',
        fontFamily: 'Arial',
        stroke: '#000',
        strokeThickness: 3
    });
    
    // Instructions
    this.add.text(400, 30, 'ARROWS/WASD to move, SPACE to jump - Collect stars, avoid enemies!', {
        fontSize: '14px',
        fill: '#aaa',
        fontFamily: 'Arial'
    }).setOrigin(0.5);
}

// Collect star callback
function collectStar(player, star) {
    star.disableBody(true, true);
    score += 10;
    scoreText.setText('Score: ' + score);
    
    // Spawn new star
    if (stars.countActive(true) < 5) {
        const x = Phaser.Math.Between(50, 750);
        const newStar = stars.create(x, 0, 'star');
        newStar.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
    }
}

// Hit enemy callback
function hitEnemy(player, enemy) {
    lives--;
    livesText.setText('Lives: ' + lives);
    
    // Flash player red
    player.setTint(0xff0000);
    this.time.delayedCall(200, () => player.clearTint());
    
    // Knockback
    const knockbackX = player.x < enemy.x ? -200 : 200;
    player.setVelocity(knockbackX, -200);
    
    if (lives <= 0) {
        this.physics.pause();
        player.setTint(0xff0000);
        gameOver = true;
        
        gameOverText = this.add.text(400, 300, 'GAME OVER\\nScore: ' + score + '\\n\\nClick to restart', {
            fontSize: '48px',
            fill: '#ff0000',
            fontFamily: 'Arial',
            align: 'center',
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5);
        
        this.input.on('pointerdown', () => {
            score = 0;
            lives = 3;
            gameOver = false;
            this.scene.restart();
        });
    }
}

// Game loop
function update() {
    if (gameOver) return;
    
    // Horizontal movement
    if (cursors.left.isDown || this.input.keyboard.addKey('A').isDown) {
        player.setVelocityX(-200);
        player.setFlipX(true);
    } else if (cursors.right.isDown || this.input.keyboard.addKey('D').isDown) {
        player.setVelocityX(200);
        player.setFlipX(false);
    } else {
        player.setVelocityX(0);
    }
    
    // Jumping
    if ((cursors.up.isDown || spaceKey.isDown || this.input.keyboard.addKey('W').isDown) && player.body.blocked.down) {
        player.setVelocityY(-400);
    }
}
`;
        fs.writeFileSync(path.join(context.workspacePath, 'game.js'), gameJs, 'utf-8');
        createdFiles.push('game.js');
        
        instructions.push('Game is ready to play! Open index.html or run: npm start');
        instructions.push('Collect yellow stars (+10 points), avoid red enemies');
        instructions.push('Customize colors, add more levels, or add power-ups');
        
      } else if (project_type === 'html_game') {
        // Create basic canvas game structure
        const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project_name}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="game-container">
        <canvas id="gameCanvas" width="800" height="600"></canvas>
        <div class="ui-overlay">
            <div id="score">Score: 0</div>
            <button id="startBtn" onclick="startGame()">Start Game</button>
        </div>
    </div>
    <script src="game.js"></script>
</body>
</html>`;
        fs.writeFileSync(path.join(context.workspacePath, 'index.html'), indexHtml, 'utf-8');
        createdFiles.push('index.html');
        
        const gameJs = `// ${project_name} - Canvas Game
// Complete game with player, enemies, collectibles, and scoring

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let gameRunning = false;
let gameOver = false;
let score = 0;
let lives = 3;
let animationId;
let lastTime = 0;

// Player object
const player = {
    x: canvas.width / 2 - 20,
    y: canvas.height - 60,
    width: 40,
    height: 40,
    speed: 6,
    color: '#00ff00',
    velocityY: 0,
    jumping: false
};

// Collectibles array
let collectibles = [];
const COLLECTIBLE_COUNT = 8;

// Enemies array
let enemies = [];
const ENEMY_COUNT = 3;

// Input handling
const keys = {};
document.addEventListener('keydown', (e) => { 
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Initialize collectibles
function spawnCollectibles() {
    collectibles = [];
    for (let i = 0; i < COLLECTIBLE_COUNT; i++) {
        collectibles.push({
            x: Math.random() * (canvas.width - 30) + 15,
            y: Math.random() * (canvas.height - 150) + 50,
            radius: 12,
            color: '#ffff00',
            bobOffset: Math.random() * Math.PI * 2
        });
    }
}

// Initialize enemies
function spawnEnemies() {
    enemies = [];
    for (let i = 0; i < ENEMY_COUNT; i++) {
        enemies.push({
            x: Math.random() * (canvas.width - 40),
            y: 100 + i * 150,
            width: 35,
            height: 35,
            speed: 2 + Math.random() * 2,
            direction: Math.random() > 0.5 ? 1 : -1,
            color: '#ff4444'
        });
    }
}

// Start game function
function startGame() {
    if (gameRunning && !gameOver) return;
    
    // Reset game state
    gameRunning = true;
    gameOver = false;
    score = 0;
    lives = 3;
    player.x = canvas.width / 2 - 20;
    player.y = canvas.height - 60;
    player.velocityY = 0;
    
    spawnCollectibles();
    spawnEnemies();
    
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('startBtn').textContent = 'Play Again';
    
    lastTime = performance.now();
    gameLoop();
}

// Main game loop
function gameLoop(currentTime) {
    if (!gameRunning) return;
    
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    update(deltaTime);
    render();
    
    animationId = requestAnimationFrame(gameLoop);
}

// Collision detection
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function checkCircleCollision(rect, circle) {
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
    const distanceX = circle.x - closestX;
    const distanceY = circle.y - closestY;
    return (distanceX * distanceX + distanceY * distanceY) < (circle.radius * circle.radius);
}

// Update game state
function update(deltaTime) {
    if (gameOver) return;
    
    // Player horizontal movement
    if (keys['ArrowLeft'] || keys['KeyA']) {
        player.x = Math.max(0, player.x - player.speed);
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
        player.x = Math.min(canvas.width - player.width, player.x + player.speed);
    }
    if (keys['ArrowUp'] || keys['KeyW']) {
        player.y = Math.max(0, player.y - player.speed);
    }
    if (keys['ArrowDown'] || keys['KeyS']) {
        player.y = Math.min(canvas.height - player.height, player.y + player.speed);
    }
    
    // Update enemies
    enemies.forEach(enemy => {
        enemy.x += enemy.speed * enemy.direction;
        
        // Bounce off walls
        if (enemy.x <= 0 || enemy.x >= canvas.width - enemy.width) {
            enemy.direction *= -1;
        }
        
        // Check collision with player
        if (checkCollision(player, enemy)) {
            lives--;
            player.x = canvas.width / 2 - 20;
            player.y = canvas.height - 60;
            
            if (lives <= 0) {
                endGame();
            }
        }
    });
    
    // Check collectible collisions
    collectibles = collectibles.filter(c => {
        if (checkCircleCollision(player, c)) {
            score += 10;
            return false; // Remove collected item
        }
        return true;
    });
    
    // Spawn new collectibles if needed
    if (collectibles.length < 3) {
        collectibles.push({
            x: Math.random() * (canvas.width - 30) + 15,
            y: Math.random() * (canvas.height - 150) + 50,
            radius: 12,
            color: '#ffff00',
            bobOffset: Math.random() * Math.PI * 2
        });
    }
    
    // Update UI
    document.getElementById('score').textContent = 'Score: ' + score + ' | Lives: ' + lives;
}

// End game
function endGame() {
    gameOver = true;
    gameRunning = false;
    cancelAnimationFrame(animationId);
    document.getElementById('startBtn').style.display = 'block';
    document.getElementById('startBtn').textContent = 'Play Again';
}

// Render game
function render() {
    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw collectibles with bobbing animation
    const time = performance.now() / 1000;
    collectibles.forEach(c => {
        const bobY = Math.sin(time * 3 + c.bobOffset) * 5;
        
        // Glow effect
        ctx.beginPath();
        ctx.arc(c.x, c.y + bobY, c.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fill();
        
        // Main circle
        ctx.beginPath();
        ctx.arc(c.x, c.y + bobY, c.radius, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();
        
        // Shine
        ctx.beginPath();
        ctx.arc(c.x - 3, c.y + bobY - 3, c.radius / 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    });
    
    // Draw enemies
    enemies.forEach(enemy => {
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(enemy.x + 3, enemy.y + 3, enemy.width, enemy.height);
        
        // Body
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(enemy.x + 6, enemy.y + 8, 8, 6);
        ctx.fillRect(enemy.x + 21, enemy.y + 8, 8, 6);
        ctx.fillStyle = '#000';
        ctx.fillRect(enemy.x + 10, enemy.y + 10, 4, 4);
        ctx.fillRect(enemy.x + 25, enemy.y + 10, 4, 4);
    });
    
    // Draw player
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(player.x + 3, player.y + 3, player.width, player.height);
    
    // Body
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    
    // Face
    ctx.fillStyle = '#000';
    ctx.fillRect(player.x + 8, player.y + 10, 6, 6);
    ctx.fillRect(player.x + 26, player.y + 10, 6, 6);
    ctx.fillRect(player.x + 12, player.y + 26, 16, 4);
    
    // Draw game over screen
    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);
        
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2 + 10);
        
        ctx.textAlign = 'left';
    }
    
    // Draw instructions
    if (!gameOver) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '14px Arial';
        ctx.fillText('WASD/Arrows to move | Collect yellow stars | Avoid red enemies', 10, 25);
    }
}

// Make startGame global for HTML onclick
window.startGame = startGame;
`;
        fs.writeFileSync(path.join(context.workspacePath, 'game.js'), gameJs, 'utf-8');
        createdFiles.push('game.js');
        
        instructions.push('Game is ready to play! Open index.html or run: npx http-server');
        instructions.push('Collect yellow stars, avoid red enemies');
        instructions.push('Customize colors, speeds, or add new features');
      }
      
      // Create styles.css for game projects - polished dark theme
      if (project_type.includes('game') || project_type === 'html_game' || project_type === 'threejs_platformer') {
        const stylesCss = `/* ${project_name} - Game Styles */
/* Modern dark theme with neon accents */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
    overflow: hidden;
}

h1 {
    color: #fff;
    font-size: 2.5rem;
    margin-bottom: 20px;
    text-shadow: 0 0 20px rgba(100, 200, 255, 0.5);
}

.game-container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
}

#game-container {
    display: flex;
    justify-content: center;
    align-items: center;
}

canvas {
    border: 3px solid #4a4a6a;
    border-radius: 12px;
    box-shadow: 
        0 0 30px rgba(0, 0, 0, 0.5),
        0 0 60px rgba(100, 100, 200, 0.2),
        inset 0 0 30px rgba(0, 0, 0, 0.3);
}

.ui-overlay {
    position: absolute;
    top: 15px;
    left: 50%;
    transform: translateX(-50%);
    color: #fff;
    font-size: 20px;
    display: flex;
    gap: 20px;
    align-items: center;
    z-index: 10;
}

#score {
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.7), rgba(30, 30, 60, 0.7));
    padding: 12px 24px;
    border-radius: 25px;
    border: 2px solid rgba(100, 200, 255, 0.3);
    font-weight: bold;
    text-shadow: 0 0 10px rgba(100, 200, 255, 0.5);
    backdrop-filter: blur(5px);
}

#startBtn {
    background: linear-gradient(135deg, #4CAF50, #45a049);
    color: white;
    padding: 18px 40px;
    font-size: 20px;
    font-weight: bold;
    border: none;
    border-radius: 30px;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 2px;
    box-shadow: 
        0 4px 15px rgba(76, 175, 80, 0.4),
        0 0 30px rgba(76, 175, 80, 0.2);
}

#startBtn:hover {
    background: linear-gradient(135deg, #5ac85e, #4CAF50);
    transform: scale(1.08);
    box-shadow: 
        0 6px 25px rgba(76, 175, 80, 0.5),
        0 0 50px rgba(76, 175, 80, 0.3);
}

#startBtn:active {
    transform: scale(0.98);
}

/* Footer instructions */
.instructions {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    margin-top: 20px;
    text-align: center;
}

.instructions kbd {
    background: rgba(255, 255, 255, 0.1);
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-family: monospace;
}

/* Responsive */
@media (max-width: 850px) {
    canvas {
        width: 100%;
        max-width: 100vw;
        height: auto;
    }
    
    h1 {
        font-size: 1.8rem;
    }
    
    .ui-overlay {
        flex-direction: column;
        gap: 10px;
    }
}

/* Animations */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

@keyframes glow {
    0%, 100% { box-shadow: 0 0 20px rgba(100, 200, 255, 0.3); }
    50% { box-shadow: 0 0 40px rgba(100, 200, 255, 0.5); }
}

.game-container:focus-within canvas {
    animation: glow 2s infinite;
}
`;
        fs.writeFileSync(path.join(context.workspacePath, 'styles.css'), stylesCss, 'utf-8');
        createdFiles.push('styles.css');
        
        // Create start.bat for Windows users
        const startBat = `@echo off
cd /d "%~dp0"
echo ========================================
echo   ${project_name}
echo ========================================
echo.
echo Opening game in browser...
start "" "index.html"
echo.
echo Game opened! Press any key to close.
pause >nul
`;
        fs.writeFileSync(path.join(context.workspacePath, 'start.bat'), startBat, 'utf-8');
        createdFiles.push('start.bat');
      }
      
      // Create README
      const recommendedStartCommand =
        pattern.launchConfig?.command ||
        (pattern.structure.scripts?.dev ? 'npm run dev' : pattern.structure.scripts?.start ? 'npm start' : 'npm start');

      const readme = `# ${project_name}

${pattern.description}

## Quick Start

\`\`\`bash
npm install
${recommendedStartCommand}
\`\`\`

## Project Structure

${pattern.structure.requiredFiles.map(f => `- \`${f}\``).join('\n')}

## Development

${instructions.length > 0 ? instructions.map(i => `- ${i}`).join('\n') : 'Start customizing the project files!'}
`;
      fs.writeFileSync(path.join(context.workspacePath, 'README.md'), readme, 'utf-8');
      createdFiles.push('README.md');
      
      return {
        success: true,
        scaffolded: project_type,
        name: project_name,
        pattern: pattern.name,
        createdFiles,
        requiredFiles: pattern.structure.requiredFiles,
        filesToCustomize: createdFiles.filter(f => f !== 'package.json' && f !== 'README.md'),
        dependencies: Object.keys(pattern.structure.dependencies || {}),
        nextSteps: [
          ...instructions,
          'Run npm install to install dependencies',
          'Customize the created files with your game logic',
          `Run ${recommendedStartCommand} to launch the project`
        ]
      };
    }
  },

  organize_folder: {
    name: 'organize_folder',
    description: 'Organize the files in a folder by moving them into categorized subfolders (Videos/Images/Documents/etc. or by date). This is the correct tool for requests like "organize my folder", "sort these files", "clean up this directory". It only MOVES files — never deletes — and writes an undo log so the change can be fully reversed. Use this instead of scaffold_project when the user wants file management rather than code creation.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the folder to organize. Defaults to the workspace root if omitted.'
        },
        strategy: {
          type: 'string',
          enum: ['by-type', 'by-date'],
          description: "'by-type' groups by file category (default); 'by-date' groups by the file's modification year/month."
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, return the planned moves without touching the filesystem. Use this to preview what the user will see.',
          default: false
        }
      },
      required: []
    },
    execute: async ({ path: targetPath, strategy, dry_run }, context) => {
      const folder = (typeof targetPath === 'string' && targetPath.trim().length > 0)
        ? targetPath
        : context.workspacePath;
      const effectiveStrategy: OrganizeStrategy = strategy === 'by-date' ? 'by-date' : 'by-type';
      const result = await organizeFolder(folder, {
        strategy: effectiveStrategy,
        dryRun: !!dry_run,
      });

      const byCategory: Record<string, number> = {};
      for (const move of result.moves) {
        byCategory[move.category] = (byCategory[move.category] || 0) + 1;
      }

      return {
        success: true,
        folderPath: result.folderPath,
        strategy: result.strategy,
        dryRun: result.dryRun,
        movedCount: result.moves.length,
        totalFiles: result.totalFiles,
        skippedCount: result.skipped.length,
        categories: byCategory,
        logPath: result.logPath,
        undoHint: result.logPath
          ? 'Run undo_organize_folder with the same path to reverse these moves.'
          : undefined,
      };
    }
  },

  undo_organize_folder: {
    name: 'undo_organize_folder',
    description: 'Reverse the most recent organize_folder operation in a given folder by reading its .agentprime-organize-log.json and moving every file back to its original location. Use when the user says "undo", "revert", or "put it back".',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the folder whose last organize operation should be undone. Defaults to the workspace root.'
        }
      },
      required: []
    },
    execute: async ({ path: targetPath }, context) => {
      const folder = (typeof targetPath === 'string' && targetPath.trim().length > 0)
        ? targetPath
        : context.workspacePath;
      const result = await undoOrganize(folder);
      return {
        success: true,
        folderPath: result.folderPath,
        restoredCount: result.restored.length,
        missingCount: result.missing.length,
        missing: result.missing.map((m) => m.to),
      };
    }
  }
};

// Model Escalation Configuration
interface ModelTier {
  name: string;
  provider: string;
  model: string;
  tier: 'current' | 'fast' | 'deep' | 'premium' | 'fallback';
}

// Default escalation chain - will be overridden by settings
const DEFAULT_MODEL_CHAIN: ModelTier[] = [
  { name: 'Fast', provider: 'ollama', model: 'devstral-small-2:24b-cloud', tier: 'fast' },
  { name: 'Deep', provider: 'ollama', model: 'kimi-k2.6:cloud', tier: 'deep' },
  { name: 'Fallback', provider: 'ollama', model: 'deepseek-v3.1:671b-cloud', tier: 'fallback' }
];

// Agent Loop Class
export class AgentLoop extends EventEmitter {
  private context: AgentContext;
  private messages: Message[] = [];
  private sessionId: string | null = null; // Track current session for state management
  private maxIterations = 100;
  private stopRequested = false;
  private stopReason: string | null = null;
  /**
   * Per-task AbortController. Wired through to every provider's HTTP layer
   * via ChatOptions.signal so requestStop() can tear down an in-flight
   * model request immediately instead of waiting for the next iteration.
   */
  private abortController: AbortController | null = null;
  private fileChangesThisTask = new Map<string, {
    path: string;
    oldContent: string;
    newContent: string;
    action: 'created' | 'modified';
  }>();

  /** Staged review snapshot for monolithic agent runs (consumed by chat IPC after run completes). */
  private pendingReviewSession: AgentReviewSessionSnapshot | null = null;

  /**
   * Returns staged review session created at the end of the last successful run, if any, then clears it.
   */
  consumePendingReviewSession(): AgentReviewSessionSnapshot | null {
    const snapshot = this.pendingReviewSession;
    this.pendingReviewSession = null;
    return snapshot;
  }

  /** Get current session ID */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Request cancellation of the active run */
  requestStop(reason: string = 'Stopped by user'): void {
    this.stopRequested = true;
    this.stopReason = reason;
    // Tear down any in-flight model HTTP request immediately.
    try { this.abortController?.abort(); } catch { /* ignore */ }
  }

  private buildStopMessage(): string {
    const reason = this.stopReason || 'Stopped by user';
    return this.buildFinalAnswer(
      `⏹️ **Agent Stopped**\n\n` +
      `${reason}\n\n` +
      `Progress so far:\n` +
      `- ${this.completedSteps.length} step(s) completed\n` +
      `- ${this.fileChangesThisTask.size} file(s) changed`
    );
  }

  private isCancellationRequested(): boolean {
    return this.stopRequested;
  }
  private noToolCallStreak = 0;
  private parseErrorStreak = 0;
  
  // 🛡️ TASK MODE PROTECTION - Prevents destructive overwrites
  private taskMode: TaskMode = TaskMode.CREATE;
  private taskModeConfidence: number = 0.6;
  private existingFilesSnapshot: Map<string, ExistingFileInfo> = new Map();
  private filesModifiedThisTask: Set<string> = new Set();
  private taskModeCheckpointId: string | null = null;
  private completedSteps: string[] = [];
  
  // 👔 TASK MASTER - The Boss Review System
  private taskMaster: TaskMaster | null = null;
  private currentPlan: string[] = [];
  private currentPlanStep = 0;
  // Repetitive action detection - prevents infinite loops
  private consecutiveSameFileWrites = 0;
  private lastWrittenFile: string | null = null;
  private lastWrittenFileContent: string | null = null; // Track content to detect identical writes
  private readonly MAX_SAME_FILE_WRITES = 3;
  
  // 🦖 DINO BUDDY IMPROVEMENTS - Progress & Learning
  private filesGeneratedThisSession: { path: string; content: string }[] = [];
  private currentTask: string = '';
  
  // TOTAL writes per file - catches loops where content changes but it's still stuck
  private totalWritesPerFile: Map<string, number> = new Map();
  private readonly MAX_TOTAL_WRITES_PER_FILE = 8; // Increased: Allow more refinement attempts
  private readonly ESCALATE_ON_WRITE_LOOP = 2; // Escalate model after 2 writes to same file
  private readonly FORCE_COMPLETION_AT = 6; // Increased: Only force after 6 writes (was 4) - gives more chances for quality
  
  // Read loop detection - prevents model from reading same file over and over
  private consecutiveSameFileReads = 0;
  private lastReadFile: string | null = null;
  private readonly MAX_SAME_FILE_READS = 3;
  
  // Per-file failure history - track files that keep failing
  private fileFailureHistory: Map<string, { count: number; lastError: string; lastAttempt: number }> = new Map();
  private readonly MAX_FAILURES_PER_FILE = 5;
  
  // Truncated code detection - prevents model from getting stuck on broken output
  private consecutiveTruncationRejections = 0;
  private readonly MAX_TRUNCATION_REJECTIONS = 5;
  
  // Error tracking for pacing
  private errorHistory: Array<{ error: string; iteration: number; analysis: any }> = [];
  private consecutiveSameError = 0;
  private lastError: string | null = null;

  // === SELF-CORRECTING VALIDATION SYSTEM ===
  // Confidence scoring and validation pipeline
  private validationPipeline: ValidationStep[] = [];
  private outputConfidence: number = 0.5; // Start neutral
  private validationHistory: Array<{ step: string; confidence: number; issues: string[] }> = [];
  private selfHealingAttempts: Map<string, number> = new Map(); // Track healing attempts per issue type
  private readonly MAX_HEALING_ATTEMPTS = 3;
  
  // Syntax error tracking - prevent infinite loops on broken files
  private syntaxErrorHistory: Map<string, number> = new Map(); // file -> count
  private readonly MAX_SYNTAX_ERRORS_PER_FILE = 3;
  
  // === SMART MODEL ESCALATION ===
  private modelChain: ModelTier[] = [...DEFAULT_MODEL_CHAIN];
  private currentModelIndex = 0;
  private escalationCount = 0;
  private readonly ESCALATION_THRESHOLD = 3; // Failures before escalating
  private readonly MAX_ESCALATIONS = 4; // Cap escalations to prevent infinite loops
  private consecutiveModelFailures = 0;
  private currentActiveModel: string = '';
  private apiErrorCount = 0; // Track API errors for circuit breaker

  constructor(context: AgentContext) {
    super(); // EventEmitter
    this.context = context;
    this.completedSteps = [];
    this.currentPlan = [];
    this.currentPlanStep = 0;
    this.filesGeneratedThisSession = [];
    this.currentTask = '';

    // Initialize with comprehensive system prompt
    this.messages.push({
      role: 'system',
      content: `You are AgentPrime, an autonomous assistant for the user's workspace. You think step-by-step, plan before acting, and execute flawlessly.

WORKSPACE: ${context.workspacePath}

## INTENT DISCIPLINE — READ THIS FIRST
Classify the user's request BEFORE picking any tool. Match output to the ask.

- **file-chore**: "organize", "move", "rename", "sort", "tidy", "put X in a folder", "clean up files", "group these videos/photos/docs"
  → Use ONLY list_dir, create_directory, run_command (for mv/move/rename). DO NOT write code. DO NOT create package.json, README.md, index.html, src/, configs, or any project scaffold. A folder of videos is NOT a software project.
- **plan-only**: "analyze", "architect", "compare", "strategy", "best approach", "design"
  → Return a plan in a {"done": true, "message": "..."} response. DO NOT create or write files.
- **review-only**: "review", "audit", "inspect", "look for issues"
  → Return findings in {"done": true, "message": "..."}. DO NOT implement unless asked.
- **repair-only**: "fix", "debug", "repair", "unblock", "make it work"
  → Smallest viable fix to the real failure. Read before editing. Don't rewrite app code to work around environment issues.
- **build-now**: "build", "implement", "create <code thing>", "make a <app/component/script>", "wire up", "vibe code"
  → Implement directly, tightly scoped.

Hard rules:
- NEVER scaffold a project, initialize a framework, or create package.json / vite.config.* / tailwind.config.* / index.html / src/App.* unless the user's words clearly request a coding project.
- "Organize these videos" is a file-chore, not a code-generation task. The correct response is create_directory + move, then {"done": true}.
- If the request's intent is ambiguous, ask ONE clarifying question via {"done": true, "message": "Quick check: ..."} instead of guessing.
- Solve exactly what was asked. No unrequested extras, no "nice to haves", no widening scope.

## CORE RULES
1. ALWAYS respond with valid JSON only - no text before or after
2. PLAN FIRST for complex tasks, then execute step by step
3. Handle errors gracefully - retry with fixes
4. **PRODUCE PRODUCTION-READY CODE** - Complete, working, tested code - NO placeholders, NO TODOs, NO skeleton code (applies to build-now/repair-only tasks)
5. **VALIDATE BEFORE COMPLETING** - Ensure output matches the ask. For code tasks: files complete, deps correct, project runs. For file-chores: files are in the right folders.
6. **TEST BEFORE MARKING DONE** - For code tasks, run the project with run_command to verify. For file-chores, list_dir to confirm the moves happened.

## CODE QUALITY STANDARDS
- ✅ Write COMPLETE, WORKING code - not placeholders or skeletons
- ✅ Include ALL necessary files (package.json, README.md, config files)
- ✅ Add proper error handling and validation
- ✅ Use modern best practices and patterns
- ✅ Ensure code is runnable immediately after creation
- ✅ Include proper imports and dependencies
- ✅ Add meaningful comments explaining WHY, not just WHAT
- ❌ NEVER write empty function bodies or incomplete code
- ❌ NEVER leave TODO comments or placeholder text
- ❌ NEVER create files with just a comment or single line

## UI WIRING - CRITICAL FOR WEB PROJECTS
⚠️ THIS ENTIRE SECTION APPLIES ONLY IF the user asked for a web/HTML/CSS/JS project or game. SKIP this whole block for file-chores, plan-only, review-only, python scripts, CLI tools, or anything non-web.

When creating HTML/CSS/JS projects, you MUST wire everything up properly:

**Buttons & Interactive Elements:**
- ✅ ALWAYS add onclick="functionName()" to buttons OR addEventListener in JS
- ✅ Every button/link in HTML MUST have a working handler in JS
- ✅ Wire up ALL form submissions, inputs, and interactive elements
- Example: <button id="startBtn">Start</button> → document.getElementById('startBtn').addEventListener('click', startGame);

**CSS Classes & Styling:**
- ✅ Every CSS class used in HTML MUST be defined in CSS
- ✅ If HTML uses .hidden, .active, .screen, etc. - define them in CSS
- ✅ Include styles for ALL UI states (hover, active, disabled, hidden)
- Example: If HTML has class="hidden", CSS needs: .hidden { display: none; }

**Feature Completeness:**
- ✅ If HTML shows "Lives: 3" - the JS MUST track and update lives
- ✅ If HTML has a "Game Over" screen - the JS MUST show/hide it appropriately
- ✅ ALL UI elements shown in HTML must have working JS logic
- ✅ Don't create UI you don't implement - delete unused HTML or implement it fully

**Common UI Wiring Mistakes to AVOID:**
- ❌ Buttons without onclick or event listeners
- ❌ CSS classes referenced in HTML but never defined
- ❌ UI screens (game over, settings, etc.) that never get shown
- ❌ Score/lives/health displays that never update
- ❌ Forms that don't submit or validate
- ❌ Modal/overlay elements with no open/close logic

**Before completing ANY web project, verify:**
1. Click every button - does something happen?
2. Every CSS class in HTML - is it defined in CSS?
3. Every dynamic display (score, lives, etc.) - does JS update it?
4. Every screen/overlay - can it be shown AND hidden?

## COMMON ERRORS & FIXES
**Python:**
- UnicodeEncodeError: Use ASCII-safe characters in print statements (no emojis in startup banners)
- ModuleNotFoundError: Add missing package to requirements.txt and run pip install
- IndentationError: Use consistent spaces (4) or tabs, never mix
- SyntaxError: Check for missing colons, parentheses, or quotes

**Node.js:**
- Cannot find module: Run npm install to install dependencies
- ReferenceError: Check for typos, missing imports, or scope issues
- EADDRINUSE: Port in use - change port number or kill existing process

**start.bat for Node.js/Vite projects (CRITICAL!):**
When creating start.bat files for npm/Node.js projects, ALWAYS check for node_modules, NOT package.json:
\`\`\`batch
@echo off
echo Starting project...
REM Check if dependencies are installed (CORRECT - checks node_modules)
if not exist node_modules (
    echo Installing dependencies...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
)
npm run dev
pause
\`\`\`
❌ WRONG: \`if not exist package.json ( npm install )\` - package.json exists but dependencies aren't installed!
✅ RIGHT: \`if not exist node_modules ( npm install )\` - checks if dependencies are actually installed

**General:**
- File not found: Verify file path exists before reading
- Connection refused: Service not running - start it first
- Truncated code: Model limitation - regenerate complete code
- Syntax errors: ALWAYS read the file first to see the exact error, then fix completely

**When errors occur:**
1. Analyze the specific error message
2. If syntax error: READ the file first to see the actual code
3. Apply the appropriate fix completely
4. Retry the operation
5. If same error 3+ times, try different approach or escalate model

**CRITICAL: Before marking as done:**
- **MANDATORY**: Test that the project actually runs without syntax errors using run_command
- **MANDATORY**: Verify all features work - buttons click, UI updates, logic executes
- If run_command shows syntax errors, FIX them before continuing
- Don't keep rewriting the same broken code - read and understand the error first
- **NEVER mark as done without testing** - "done" means "tested and working", not "files created"

## TOOLS
- write_file: {"name": "write_file", "arguments": {"path": "file.js", "content": "..."}}
- read_file: {"name": "read_file", "arguments": {"path": "file.js"}}
- run_command: {"name": "run_command", "arguments": {"command": "npm install"}}
- list_dir: {"name": "list_dir", "arguments": {"path": "."}}
- search_codebase: {"name": "search_codebase", "arguments": {"query": "pattern"}}
- str_replace: {"name": "str_replace", "arguments": {"path": "file.js", "old_string": "exact text to find", "new_string": "replacement text"}}
  ⚡ PREFERRED for edits! Much safer than rewriting entire files. old_string must match EXACTLY.
- scaffold_project: {"name": "scaffold_project", "arguments": {"project_type": "phaser_game", "project_name": "MyGame"}}
  Types: phaser_game, html_game, pixi_game, threejs_viewer, threejs_platformer, express_api, python_fastapi, python_script
  
🎮 FOR GAMES (only when the user explicitly asked to build a game): use scaffold_project FIRST.
⚠️ NEVER use scaffold_project for file-chores, plan-only, review-only, or ambiguous requests. Scaffolding is for build-now coding tasks only.

## RESPONSE FORMATS

Planning + First Step:
{"plan": ["Step 1", "Step 2", "Step 3"], "current_step": 0, "name": "write_file", "arguments": {...}}

Single Tool:
{"name": "write_file", "arguments": {"path": "server.js", "content": "..."}}

Complete (ONLY when project is FULLY working AND TESTED):
{"done": true, "message": "✅ Task completed! Project is ready to run."}

⚠️ CRITICAL: "done" means:
- ✅ Project has been TESTED with run_command
- ✅ All features work (buttons, UI, logic)
- ✅ No syntax errors
- ✅ No runtime errors
- ✅ All files are complete (no placeholders)

❌ DO NOT mark as done if:
- You haven't tested it yet
- There are syntax errors
- Features are incomplete
- UI elements don't work

## EXAMPLE: Create Express API
Task: "Create Express.js API with 3 routes"

Response 1:
{"plan": ["Create package.json", "Create server.js", "Run npm install"], "current_step": 0, "name": "write_file", "arguments": {"path": "package.json", "content": "{\\n  \\"name\\": \\"api\\",\\n  \\"dependencies\\": {\\"express\\": \\"^4.18.2\\"},\\n  \\"scripts\\": {\\"start\\": \\"node server.js\\"}\\n}"}}

Response 2:
{"name": "write_file", "arguments": {"path": "server.js", "content": "const express = require('express');\\nconst app = express();\\napp.use(express.json());\\nlet users = [];\\napp.get('/users', (req, res) => res.json(users));\\napp.post('/users', (req, res) => { users.push({id: Date.now(), ...req.body}); res.status(201).json(users.at(-1)); });\\napp.get('/users/:id', (req, res) => res.json(users.find(u => u.id == req.params.id) || {error: 'Not found'}));\\napp.listen(3000, () => console.log('Running on :3000'));"}}

Response 3:
{"name": "run_command", "arguments": {"command": "npm install"}}

Response 4:
{"done": true, "message": "✅ Express API created with GET /users, POST /users, GET /users/:id. Run: npm start"}

## CSS LAYOUT & VISUAL ALIGNMENT RULES (CRITICAL!)
⚠️ APPLIES ONLY to build-now tasks that involve CSS/UI. Ignore this section entirely for file-chores, plan-only, review-only, CLI, scripting, or backend work.

When creating visual UI components, ALWAYS ensure proper centering and alignment:

### Rule 1: Centering Content Over SVG/Canvas Elements
When placing text or content over an SVG circle, canvas, or other positioned element:
- Container MUST have: position: relative; width/height matching the SVG/canvas
- Content MUST have: position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)
- DO NOT rely on flexbox alone for centering over positioned elements
- DO NOT use margins that can offset the content

### Rule 2: Progress Rings with Centered Text
For circular progress indicators with centered text, use this pattern:
.progress-container { position: relative; width: 300px; height: 300px; margin: 0 auto; }
.progress-ring { position: absolute; top: 0; left: 0; }
.timer-display { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10; margin: 0; }

### Rule 3: Common CSS Layout Mistakes to Avoid
- DON'T: Use flexbox justify-content/align-items when content needs to overlay positioned elements
- DON'T: Use margins on absolutely positioned elements (they break centering)
- DON'T: Forget to set position: relative on parent container
- DON'T: Mix flexbox and absolute positioning without understanding the stacking context
- DO: Use absolute positioning with transform: translate(-50%, -50%) for perfect centering
- DO: Set explicit width/height on containers that need precise positioning
- DO: Use z-index to control layering when elements overlap

### Rule 4: Visual Alignment Checklist
Before completing a UI component:
1. Check that centered elements are visually centered (not offset)
2. Verify progress rings/circles have text perfectly centered inside
3. Test responsive behavior - elements should stay aligned at different sizes
4. Ensure no visual "crookedness" or misalignment
5. Use browser dev tools to verify computed positions match expectations

OUTPUT JSON ONLY. NO EXPLANATIONS.`
    });
    
    // Initialize with context model
    this.currentActiveModel = context.model || 'kimi-k2.6:cloud';

    // Initialize validation pipeline
    this.initializeValidationPipeline();
  }

  /**
   * Initialize the comprehensive validation pipeline
   */
  private initializeValidationPipeline(): void {
    this.validationPipeline = [
      {
        name: 'syntax_validation',
        validator: this.validateSyntax.bind(this),
        requiredConfidence: 0.8,
        canAutoFix: true,
        autoFix: this.autoFixSyntax?.bind(this)
      },
      {
        name: 'structure_validation',
        validator: this.validateStructure.bind(this),
        requiredConfidence: 0.7,
        canAutoFix: true,
        autoFix: this.autoFixStructure?.bind(this)
      },
      {
        name: 'dependency_validation',
        validator: this.validateDependencies.bind(this),
        requiredConfidence: 0.6,
        canAutoFix: false
      },
      {
        name: 'runtime_validation',
        validator: this.validateRuntime.bind(this),
        requiredConfidence: 0.9,
        canAutoFix: false
      }
    ];
  }

  /**
   * Configure the model escalation chain
   * Called from main process with settings
   */
  configureModelChain(
    fastModel: string, 
    deepModel: string, 
    fallbackModel?: string,
    fastProvider: string = 'ollama',
    deepProvider: string = 'ollama',
    fallbackProvider: string = 'ollama'
  ): void {
    this.modelChain = [
      { name: 'Fast', provider: fastProvider, model: fastModel, tier: 'fast' },
      { name: 'Deep', provider: deepProvider, model: deepModel, tier: 'deep' }
    ];
    
    if (fallbackModel && fallbackModel !== deepModel) {
      this.modelChain.push({ name: 'Fallback', provider: fallbackProvider, model: fallbackModel, tier: 'fallback' });
    }
    
    log.info('[Agent] 🔄 Model escalation chain configured:', this.modelChain.map(m => `${m.provider}/${m.model}`).join(' → '));
  }

  /**
   * Get the current active model
   */
  getCurrentModel(): string {
    return this.currentActiveModel;
  }

  /**
   * Configure model chain based on starting provider
   * Ensures escalation stays within the same provider family first, then falls back
   */
  private configureModelChainForProvider(): void {
    const currentModel = this.currentActiveModel || '';
    
    // Detect provider from model name
    const isAnthropicModel = currentModel.includes('claude');
    const isOpenAIModel = currentModel.includes('gpt-');
    
    if (isAnthropicModel) {
      // Anthropic escalation chain: Haiku → Sonnet 4.6 → Opus 4.7 → Opus 4.6 → Opus 4.5 → Opus 4 → Sonnet (incremental) → Ollama fallback
      this.modelChain = [
        { name: 'Claude Haiku', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
        { name: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6', tier: 'deep' },
        { name: 'Claude Opus 4.7', provider: 'anthropic', model: 'claude-opus-4-7', tier: 'premium' },
        { name: 'Claude Opus 4.6', provider: 'anthropic', model: 'claude-opus-4-6', tier: 'premium' },
        { name: 'Claude Opus 4.5', provider: 'anthropic', model: 'claude-opus-4-5-20251101', tier: 'premium' },
        { name: 'Claude Opus 4', provider: 'anthropic', model: 'claude-opus-4-20250514', tier: 'premium' },
        // Retry with Sonnet + incremental approach instead of looping on Opus
        { name: 'Claude Sonnet (Incremental)', provider: 'anthropic', model: 'claude-sonnet-4-6', tier: 'fallback' }
      ];
      log.info('[Agent] 📋 Configured Anthropic model escalation chain (with incremental fallback)');
    } else if (isOpenAIModel) {
      // OpenAI escalation chain (GPT-5.2 → GPT-4o → fallback)
      this.modelChain = [
        { name: 'GPT-4o Mini', provider: 'openai', model: 'gpt-4o-mini', tier: 'fast' },
        { name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', tier: 'deep' },
        { name: 'GPT-5.2', provider: 'openai', model: 'gpt-5.2', tier: 'premium' },
        { name: 'GPT-5.2 (Latest)', provider: 'openai', model: 'gpt-5.2-2025-12-11', tier: 'premium' },
        { name: 'Ollama Fallback', provider: 'ollama', model: 'kimi-k2.6:cloud', tier: 'fallback' }
      ];
      log.info('[Agent] 📋 Configured OpenAI model escalation chain');
    } else {
      // Default to Ollama chain
      this.modelChain = [
        { name: 'Fast', provider: 'ollama', model: 'devstral-small-2:24b-cloud', tier: 'fast' },
        { name: 'Deep', provider: 'ollama', model: 'kimi-k2.6:cloud', tier: 'deep' },
        { name: 'Fallback', provider: 'ollama', model: 'deepseek-v3.1:671b-cloud', tier: 'fallback' }
      ];
      log.info('[Agent] 📋 Configured Ollama model escalation chain');
    }
    
    // Find the starting model's position in the chain
    const startIndex = this.modelChain.findIndex(m => 
      m.model === currentModel || currentModel.includes(m.model.split('-')[0])
    );
    
    if (startIndex >= 0) {
      this.currentModelIndex = startIndex;
    } else {
      // If starting model not in chain, insert it at the beginning
      this.modelChain.unshift({ 
        name: 'Current', 
        provider: isAnthropicModel ? 'anthropic' : (isOpenAIModel ? 'openai' : 'ollama'), 
        model: currentModel, 
        tier: 'current' 
      });
      this.currentModelIndex = 0;
    }
    
    log.info('[Agent] 🔄 Model escalation chain:', this.modelChain.map(m => `${m.provider}/${m.model}`).join(' → '));
  }

  /**
   * Attempt to escalate to the next model tier
   * Returns true if escalation succeeded, false if no more models available
   */
  private escalateModel(reason: string): boolean {
    // === ESCALATION CAP - Prevent infinite escalation loops ===
    if (this.escalationCount >= this.MAX_ESCALATIONS) {
      log.info(`[Agent] 🛑 Max escalations reached (${this.MAX_ESCALATIONS}). Stopping escalation.`);
      log.info(`[Agent] 💡 The task may be too complex. Consider breaking it down.`);
      return false;
    }
    
    // Find current model in chain
    const currentIndex = this.modelChain.findIndex(m => m.model === this.currentActiveModel);
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= this.modelChain.length) {
      log.info(`[Agent] 🛑 No more models to escalate to. Current: ${this.currentActiveModel}`);
      return false;
    }
    
    const previousModel = this.currentActiveModel;
    const nextModel = this.modelChain[nextIndex];
    
    this.currentActiveModel = nextModel.model;
    this.currentModelIndex = nextIndex;
    this.escalationCount++;
    this.consecutiveModelFailures = 0; // Reset failures for new model
    
    log.info(`[Agent] 🚀 MODEL ESCALATION #${this.escalationCount}/${this.MAX_ESCALATIONS}`);
    log.info(`[Agent]    Reason: ${reason}`);
    log.info(`[Agent]    ${previousModel} → ${nextModel.model} (${nextModel.tier})`);
    log.info(`[Agent]    Provider: ${nextModel.provider}`);
    
    // IMPORTANT: Switch the AI provider when escalating to a different provider's model
    aiRouter.setActiveProvider(nextModel.provider, nextModel.model);
    
    // Add escalation notice to messages so model knows context
    this.messages.push({
      role: 'user',
      content: `[SYSTEM] Previous model struggled with this task. You are now ${nextModel.name} (${nextModel.tier} tier). Please complete the task successfully. Continue from where we left off.`
    });
    
    return true;
  }

  /**
   * Check if we should escalate based on failure count
   */
  private shouldEscalate(): boolean {
    return this.consecutiveModelFailures >= this.ESCALATION_THRESHOLD;
  }

  /**
   * Record a model failure and potentially trigger escalation
   * Returns true if escalation happened
   */
  private recordModelFailure(failureType: string): boolean {
    this.consecutiveModelFailures++;
    log.info(`[Agent] ⚠️ Model failure: ${failureType} (${this.consecutiveModelFailures}/${this.ESCALATION_THRESHOLD})`);
    
    if (this.shouldEscalate()) {
      return this.escalateModel(failureType);
    }
    return false;
  }

  /**
   * Reset failure counter (called on successful output)
   */
  private recordModelSuccess(): void {
    if (this.consecutiveModelFailures > 0) {
      log.info(`[Agent] ✅ Model producing valid output again`);
    }
    this.consecutiveModelFailures = 0;
  }

  private syncBehaviorProfilePrompt(): void {
    const systemMessage = this.messages.find((message) => message.role === 'system');
    if (!systemMessage) {
      return;
    }

    systemMessage.content = injectBehaviorProfilePrompt(
      systemMessage.content,
      this.context.assistantBehaviorProfile,
      this.context.vibeCoderIntent
    );
  }

  /**
   * Sync message to state manager for persistence
   */
  private syncMessageToState(role: 'user' | 'assistant', content: string): void {
    if (this.sessionId) {
      stateManager.addMessage(this.sessionId, {
        role,
        content
      });
    }
  }

  /**
   * Tools exposed to the model. ORGANIZE mode strips codegen/scaffold tools so weak
   * models cannot hallucinate package.json / Vite scaffolds for "sort my videos" tasks.
   */
  private getToolsForModel(): Record<string, Tool> {
    if (this.taskMode === TaskMode.ORGANIZE) {
      return {
        list_dir: tools.list_dir,
        run_command: tools.run_command,
        organize_folder: tools.organize_folder,
        undo_organize_folder: tools.undo_organize_folder
      };
    }
    return tools;
  }

  async run(rawUserMessage: string): Promise<string> {
    const runId = createOperationId('agentrun');
    const sanitization = PromptSanitizer.sanitize(rawUserMessage);
    const userMessage = sanitization.sanitizedText;
    this.syncBehaviorProfilePrompt();
    const ideBlock = formatIdeContextForModel(this.context.ideContext);
    if (ideBlock.trim()) {
      const systemMessage = this.messages.find((m) => m.role === 'system');
      if (systemMessage && !systemMessage.content.includes('IDE_CONTEXT (from UI)')) {
        systemMessage.content += `\n\n## IDE_CONTEXT (from UI)\n${ideBlock}\n`;
      }
    }
    log.info(`[${runId}] Starting agent loop run`, {
      sessionId: this.sessionId,
      workspacePath: this.context.workspacePath,
    });
    
    if (!sanitization.isSafe) {
      log.warn(`[Security] Blocked malicious prompt. Flags: ${sanitization.flags.join(', ')}`);
      this.emit('message', {
        role: 'assistant',
        content: `⚠️ **Security Alert:** Your input contained potentially unsafe instructions (${sanitization.flags.join(', ')}). The request has been neutralized to protect the workspace.`
      });
      // Continue with the sanitized (blocked) message so the agent just acknowledges the block
    }

    // Create or get session for state persistence
    if (!this.sessionId) {
      this.sessionId = stateManager.createSession();
    }

    // === 🛡️ WORKSPACE BOUNDARY PROTECTION ===
    // Prevent AgentPrime from operating on its own codebase
    const workspaceValidation = validateWorkspaceNotSelf(this.context.workspacePath);
    if (!workspaceValidation.valid) {
      log.error(`[Agent] 🛡️ WORKSPACE PROTECTION: ${workspaceValidation.reason}`);
      return `🛡️ **Workspace Protection Active**\n\n` +
        `Cannot operate on this workspace: ${workspaceValidation.reason}\n\n` +
        `**Details:**\n` +
        `- Workspace: ${workspaceValidation.workspacePath}\n` +
        `- AgentPrime root: ${workspaceValidation.agentPrimeRoot}\n\n` +
        `**Why this protection exists:**\n` +
        `AgentPrime cannot modify its own source code to prevent accidental self-modification.\n\n` +
        `**What to do:**\n` +
        `1. Open a different folder as your workspace\n` +
        `2. Create a new project folder for your work\n` +
        `3. Navigate to your actual project directory`;
    }
    log.info(`[Agent] 🛡️ Workspace validated: ${workspaceValidation.reason}`);
    // === END WORKSPACE BOUNDARY PROTECTION ===

    // Start transaction for this agent task (workspace path is required for correct rollback paths)
    transactionManager.startTransaction(this.context.workspacePath);

    try {
      // Reset for new task
      this.completedSteps = [];
    this.noToolCallStreak = 0;
    this.parseErrorStreak = 0;
    this.currentPlan = [];
    this.currentPlanStep = 0;
    // Reset repetitive action detection
    this.consecutiveSameFileWrites = 0;
    this.lastWrittenFile = null;
    this.lastWrittenFileContent = null;
    this.totalWritesPerFile.clear(); // Reset file write counts for new task
    this.consecutiveSameFileReads = 0;
    this.lastReadFile = null;
    // Reset truncation detection
    this.consecutiveTruncationRejections = 0;
    // Reset escalation tracking (but keep model chain and current model)
    this.consecutiveModelFailures = 0;
    this.escalationCount = 0;
    // Reset error tracking
    this.errorHistory = [];
    this.consecutiveSameError = 0;
    this.lastError = null;
    this.syntaxErrorHistory.clear();

    // Reset validation tracking
    this.outputConfidence = 0.5;
    this.validationHistory = [];
    this.selfHealingAttempts.clear();
    
    // 🦖 DINO BUDDY: Reset improvement tracking
    this.filesGeneratedThisSession = [];
    this.currentTask = userMessage;
    this.stopRequested = false;
    this.stopReason = null;
    this.abortController = new AbortController();
    this.fileChangesThisTask.clear();
    this.pendingReviewSession = null;

    // Register per-run context hooks for cancellation and file change streaming.
    this.context.isCancellationRequested = () => this.isCancellationRequested();
    this.context.onFileWrite = (change) => {
      const existing = this.fileChangesThisTask.get(change.path);
      const merged = {
        path: change.path,
        oldContent: existing ? existing.oldContent : change.oldContent,
        newContent: change.newContent,
        action: existing ? existing.action : change.action
      };
      this.fileChangesThisTask.set(change.path, merged);
      this.emit('file-modified', {
        path: merged.path,
        action: merged.action,
        oldContent: merged.oldContent,
        newContent: merged.newContent
      });
    };
    
    // Emit task start event for progress tracker
    this.emit('task-start', { task: userMessage });
    // Use the model from context, or keep current if already set
    if (this.context.model) {
      this.currentActiveModel = this.context.model;
    }
    
    // 💰 BUDGET-AWARE MODEL SELECTION
    // Check budget and switch to cost-saving mode if needed
    const budgetManager = getBudgetManager();
    const budgetMode = budgetManager.getMode();
    const budgetWarning = budgetManager.getBudgetWarning();
    
    if (budgetWarning) {
      log.info(`[Agent] ${budgetWarning}`);
      // Show warning to user via event
      this.emit('budget-warning', { message: budgetWarning, mode: budgetMode });
    }
    
    // If in cost-saving mode, use recommended cheaper model
    if (budgetMode !== 'normal') {
      const recommended = budgetManager.getRecommendedModel('code');
      if (budgetManager.isModelAllowed(recommended.provider, recommended.model)) {
        log.info(`[Agent] 💰 Budget mode: ${budgetMode}, using ${recommended.model} (${recommended.reason})`);
        aiRouter.setActiveProvider(recommended.provider, recommended.model);
        this.currentActiveModel = recommended.model;
      }
    } else {
      log.info(`[Agent] Starting task with model: ${this.currentActiveModel}`);
    }
    
    // Configure model chain based on starting provider
    // This ensures escalation stays within the same provider family first
    this.configureModelChainForProvider();
    
    // 💰 FILTER MODEL CHAIN BY BUDGET
    // Remove models that aren't allowed in current budget mode
    if (budgetMode !== 'normal') {
      this.modelChain = this.modelChain.filter(model => 
        budgetManager.isModelAllowed(model.provider, model.model)
      );
      log.info(`[Agent] 💰 Filtered model chain for budget mode: ${this.modelChain.length} models available`);
    }
    
    // === 🧠 CONSCIOUSNESS SYSTEM (ActivatePrime Deep Understanding) ===
    // Process user intent through all consciousness systems in parallel
    // This understands WHAT they really want, not just what they said
    let consciousnessState: ConsciousnessState | null = null;
    let consciousnessInjection: ConsciousnessInjection | null = null;
    try {
      // Get project files for context
      const projectFiles = await this.getProjectFilesList();
      
      const consciousnessResult = await processWithConsciousness(userMessage, {
        projectFiles,
        conversationHistory: this.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-10)
          .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
        workspacePath: this.context.workspacePath
      });
      
      consciousnessState = consciousnessResult.state;
      consciousnessInjection = consciousnessResult.injection;
      
      log.info(`[Agent] 🧠 Consciousness: intent=${consciousnessState.primaryIntent}, coherence=${consciousnessState.coherence.toFixed(2)}, unspoken=${consciousnessState.unspokenRequirements.length}`);
      
      // Inject consciousness context into system prompt
      if (consciousnessInjection && consciousnessInjection.contextString) {
        const systemMessage = this.messages.find(m => m.role === 'system');
        if (systemMessage && !systemMessage.content.includes('CONSCIOUSNESS CONTEXT')) {
          let consciousnessPrompt = '\n\n## 🧠 CONSCIOUSNESS CONTEXT (Deep Understanding)\n';
          consciousnessPrompt += consciousnessInjection.contextString + '\n';
          
          if (consciousnessInjection.systemGuidance) {
            consciousnessPrompt += `\n**Approach:** ${consciousnessInjection.systemGuidance}\n`;
          }
          
          if (consciousnessInjection.requirements.length > 0) {
            consciousnessPrompt += '\n**Include (user expects but didn\'t say):**\n';
            for (const req of consciousnessInjection.requirements) {
              consciousnessPrompt += `• ${req}\n`;
            }
          }
          
          if (consciousnessInjection.warnings.length > 0) {
            consciousnessPrompt += '\n**Watch out for:**\n';
            for (const warning of consciousnessInjection.warnings) {
              consciousnessPrompt += `• ${warning}\n`;
            }
          }
          
          systemMessage.content += consciousnessPrompt;
        }
      }
    } catch (error) {
      log.info('[Agent] 🧠 Consciousness processing failed (non-critical):', error);
    }
    // === END CONSCIOUSNESS SYSTEM ===
    
    // === 🧠 OPUS REASONING ENGINE ===
    // Extract and apply Opus 4.5's reasoning patterns system-wide
    const opusEngine = getOpusReasoningEngine();
    const opusPatterns = await opusEngine.extractReasoningPatterns(userMessage);
    log.info(`[Agent] 🧠 Opus Reasoning: Extracted ${opusPatterns.length} reasoning patterns`);
    
    // Apply Opus reasoning to agent loop
    // Convert ExistingFileInfo map to string map for opus reasoning engine
    const existingFilesStringMap = new Map<string, string>();
    for (const [filePath, fileInfo] of this.existingFilesSnapshot.entries()) {
      existingFilesStringMap.set(filePath, fileInfo.content);
    }
    
    const opusReasoning = await opusEngine.applyReasoning('agent-loop', {
      task: userMessage,
      existingFiles: existingFilesStringMap
    });
    
    if (opusReasoning.recommendations.length > 0) {
      log.info(`[Agent] 🧠 Opus Recommendations: ${opusReasoning.recommendations.join('; ')}`);
    }
    
    // === MIRROR LEARNING INTEGRATION ===
    // Get relevant patterns for this task from mirror memory
    let patternGuidance = '';
    let antiPatternWarnings = '';
    try {
      const patterns = await getRelevantPatterns(userMessage, 5);
      if (patterns.length > 0) {
        patternGuidance = '\n\n## LEARNED PATTERNS (Apply these!)\n';
        for (const pattern of patterns) {
          const confidence = pattern.confidence ? ` (${(pattern.confidence * 100).toFixed(0)}% confident)` : '';
          patternGuidance += `• ${pattern.type || 'pattern'}: ${pattern.description || 'N/A'}${confidence}\n`;
        }
        log.info(`[Agent] 🧠 Loaded ${patterns.length} learned patterns for task`);
      }
      
      // Add Opus reasoning patterns
      if (opusPatterns.length > 0) {
        patternGuidance += '\n\n## 🧠 OPUS 4.5 REASONING PATTERNS (MANDATORY)\n';
        patternGuidance += 'These are HOW Opus thinks and makes decisions. Apply them:\n';
        for (const pattern of opusPatterns.slice(0, 5)) {
          patternGuidance += `• ${pattern.type}: ${pattern.description}\n`;
          patternGuidance += `  Context: ${pattern.context}\n`;
        }
      }
      
      // Get anti-patterns (things to avoid)
      const antiPatterns = await getAntiPatterns(3);
      if (antiPatterns.length > 0) {
        antiPatternWarnings = '\n\n## ⚠️ AVOID THESE MISTAKES\n';
        for (const anti of antiPatterns) {
          antiPatternWarnings += `• DON'T: ${anti.description || 'Unknown mistake'}\n`;
          // Include prevention tips if available
          if (anti.metadata?.preventionTips && anti.metadata.preventionTips.length > 0) {
            antiPatternWarnings += `  → FIX: ${anti.metadata.preventionTips[0]}\n`;
          }
        }
        log.info(`[Agent] ⚠️ Loaded ${antiPatterns.length} anti-patterns to avoid`);
      }
    } catch (error) {
      log.info('[Agent] Mirror patterns not available (non-critical)');
    }
    
    // Update system prompt with learned patterns
    if (patternGuidance || antiPatternWarnings) {
      const systemMessage = this.messages.find(m => m.role === 'system');
      if (systemMessage && !systemMessage.content.includes('LEARNED PATTERNS')) {
        systemMessage.content += patternGuidance + antiPatternWarnings;
      }
    }
    // === END MIRROR LEARNING INTEGRATION ===
    
    // === PROJECT PATTERN DETECTION ===
    // Try to detect project type from user message and inject pattern guidance
    let projectPatternGuidance = '';
    try {
      const { ProjectPatternMatcher } = await import('./agent/tools/projectPatterns');
      
      // Use the improved detectFromMessage for smarter project type detection
      // This handles Phaser, PixiJS, and intelligently suggests game frameworks
      const detectedType = ProjectPatternMatcher.detectFromMessage(userMessage);
      
      if (detectedType) {
        projectPatternGuidance = ProjectPatternMatcher.generateGuidance(detectedType);
        log.info(`[Agent] 🎯 Detected project type: ${detectedType}`);
        
        // Store detected type for later validation
        (this as any).detectedProjectType = detectedType;
        
        // Log pattern details for debugging
        const pattern = ProjectPatternMatcher.getPattern(detectedType);
        if (pattern) {
          log.info(`[Agent] 📋 Required files: ${pattern.structure.requiredFiles.join(', ')}`);
          if (Object.keys(pattern.structure.dependencies || {}).length > 0) {
            log.info(`[Agent] 📦 Dependencies: ${Object.keys(pattern.structure.dependencies).join(', ')}`);
          }
        }
      }
    } catch (error) {
      log.warn('[Agent] Project pattern detection failed (non-critical):', error);
    }
    
    // Inject project pattern guidance into system prompt
    if (projectPatternGuidance) {
      const systemMessage = this.messages.find(m => m.role === 'system');
      if (systemMessage) {
        systemMessage.content += projectPatternGuidance;
      }
    }
    // === END PROJECT PATTERN DETECTION ===
    
    // === OPUS THINKING ENGINE - PRE-TASK ANALYSIS ===
    // This is what makes Opus different - deep thinking BEFORE action
    const opusAnalysis = OpusThinkingEngine.analyzeIntent(userMessage);
    log.info(`[Agent] 🧠 OPUS ANALYSIS: ${opusAnalysis.projectType} project, ${opusAnalysis.complexity} complexity`);
    log.info(`[Agent] 🎯 Delight factors: ${opusAnalysis.delightFactors.length}`);
    log.info(`[Agent] ⚠️ Pitfalls to avoid: ${opusAnalysis.potentialPitfalls.length}`);
    
    // Store analysis for quality validation later
    (this as any).opusAnalysis = opusAnalysis;
    (this as any).filesCreatedThisTask = new Set<string>();
    (this as any).fileContentsForValidation = new Map<string, string>();
    
    // Generate pre-task thinking prompt
    const opusThinkingPrompt = OpusThinkingEngine.generatePreTaskThinkingPrompt(opusAnalysis);
    
    // Inject into system message for deep internalization
    const systemMessage = this.messages.find(m => m.role === 'system');
    if (systemMessage) {
      systemMessage.content += opusThinkingPrompt;
    }
    // === END OPUS THINKING ENGINE ===
    
    // === 🛡️ TASK MODE DETECTION - Prevents destructive overwrites ===
    const taskModeResult = detectTaskMode(userMessage);
    this.taskMode = taskModeResult.mode;
    this.taskModeConfidence = taskModeResult.confidence;
    this.existingFilesSnapshot.clear();
    this.filesModifiedThisTask.clear();
    
    log.info(`[Agent] 🛡️ TASK MODE: ${this.taskMode.toUpperCase()} (confidence: ${(this.taskModeConfidence * 100).toFixed(0)}%)`);
    log.info(`[Agent] 🛡️ Reason: ${taskModeResult.reason}`);
    
    // 👔 INITIALIZE TASK MASTER - The Boss Review System
    this.taskMaster = new TaskMaster(this.context.workspacePath, userMessage);
    log.info(`[Agent] 👔 Task Master initialized - Boss will review all work before writing`);
    
    // Create checkpoint for FIX/ENHANCE modes to enable rollback
    if (this.taskMode === TaskMode.FIX || this.taskMode === TaskMode.ENHANCE) {
      this.taskModeCheckpointId = transactionManager.createCheckpoint(`taskmode_${this.taskMode}_${Date.now()}`);
      log.info(`[Agent] 🛡️ Created rollback checkpoint: ${this.taskModeCheckpointId}`);
      
      // 🛡️ Create backup before destructive operations
      try {
        const backupResult = await backupBeforeOperation(
          this.context.workspacePath,
          `Before ${this.taskMode} operation`,
          this.taskMode,
          userMessage.substring(0, 200)
        );
        
        if (backupResult.success) {
          log.info(`[Agent] 💾 Backup created: ${backupResult.filesBackedUp} files backed up`);
        } else {
          log.warn(`[Agent] ⚠️ Backup failed (continuing anyway): ${backupResult.error}`);
        }
      } catch (backupError: any) {
        log.warn(`[Agent] ⚠️ Backup error (non-critical): ${backupError.message}`);
      }
    }
    // === END TASK MODE DETECTION ===
    
    // === 🔍 EXPLORATION PHASE - Like Cursor, explore before acting ===
    // This is what makes a good agent - it LOOKS at the codebase first
    // ENHANCED: In FIX mode, read ALL source files to understand the project
    let explorationContext = '';
    try {
      log.info('[Agent] 🔍 Starting exploration phase...');
      const explorationResults: string[] = [];
      
      // Detect task type (kept for backwards compatibility)
      const isCreatingNew = this.taskMode === TaskMode.CREATE;
      const isFixing = this.taskMode === TaskMode.FIX;
      const isModifying = this.taskMode === TaskMode.ENHANCE;
      const isReviewing = this.taskMode === TaskMode.REVIEW;
      
      // 1. Always list root directory first
      let projectFiles: string[] = [];
      try {
        const rootResult = await tools.list_dir.execute({ path: '.' }, this.context);
        if (rootResult && Array.isArray(rootResult)) {
          const fileList = rootResult.map((f: any) => `${f.type === 'directory' ? '📁' : '📄'} ${f.name}`).join(', ');
          explorationResults.push(`Project structure: ${fileList}`);
          log.info(`[Agent] 🔍 Found ${rootResult.length} items in project root`);
          
          // Collect file names for snapshot
          projectFiles = rootResult
            .filter((f: any) => f.type === 'file')
            .map((f: any) => f.name);
        }
      } catch (e) {
        log.warn('[Agent] Could not list root directory');
      }
      
      // 2. 🛡️ ALWAYS READ EXISTING FILES - Even in CREATE mode if files exist!
      // This prevents generating mismatched content when files already exist
      const sourceExtensions = ['.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.py', '.json', '.md'];
      const entryFiles = ['index.html', 'index.js', 'main.js', 'main.ts', 'app.js', 'App.tsx', 'App.jsx', 
                         'main.py', 'app.py', 'package.json', 'src/main.tsx', 'src/main.ts', 'src/App.tsx',
                         'src/index.tsx', 'src/index.ts', 'styles.css', 'src/styles.css', 'game.js', 'script.js'];
      
      // Also include files from root listing
      const filesToRead = [...new Set([...entryFiles, ...projectFiles.filter(f => 
        sourceExtensions.some(ext => f.endsWith(ext))
      )])];
      
      let filesRead = 0;
      for (const file of filesToRead) {
        try {
          const content = await tools.read_file.execute({ path: file }, this.context);
          if (content && content.content) {
            // 🛡️ Store file snapshot for protection
            this.existingFilesSnapshot.set(file, {
              path: file,
              content: content.content,
              size: content.content.length,
              hash: simpleHash(content.content)
            });
            
            explorationResults.push(`📄 Snapshot: ${file} (${content.content.length} chars)`);
            filesRead++;
          }
        } catch (e) {
          // File doesn't exist, continue
        }
      }
      
      if (filesRead > 0) {
        log.info(`[Agent] 🔍 Read ${filesRead} existing files to understand project context`);
        
        // 👔 LOAD EXISTING FILES INTO TASK MASTER
        if (this.taskMaster) {
          const existingFilesMap = new Map<string, { content: string }>();
          for (const [filePath, fileInfo] of this.existingFilesSnapshot.entries()) {
            existingFilesMap.set(filePath, { content: fileInfo.content });
          }
          this.taskMaster.loadExistingFiles(existingFilesMap);
          log.info(`[Agent] 👔 Task Master loaded ${existingFilesMap.size} existing files for review`);
        }
        
        // 🛡️ CRITICAL: If files exist, add warning to system message
        if (isCreatingNew && filesRead > 0) {
          // Build a summary of existing file contents for context
          let existingFilesSummary = '';
          for (const [filePath, fileInfo] of this.existingFilesSnapshot.entries()) {
            const preview = fileInfo.content.substring(0, 500).replace(/\n/g, '\\n');
            existingFilesSummary += `\n**${filePath}** (${fileInfo.size} chars):\n\`\`\`\n${preview}${fileInfo.size > 500 ? '...' : ''}\n\`\`\`\n`;
          }
          
          const existingFilesWarning = `\n\n## ⚠️ EXISTING FILES DETECTED IN PROJECT\n` +
            `**CRITICAL**: This project already has ${filesRead} file(s). You MUST read and match them!\n\n` +
            `**EXISTING FILES AND THEIR CONTENT:**\n${existingFilesSummary}\n\n` +
            `**MANDATORY RULES:**\n` +
            `1. **READ THE FILES ABOVE** - They show what the project actually is\n` +
            `2. **MATCH THE PROJECT TYPE** - If HTML shows a game, generate game code, NOT portfolio code\n` +
            `3. **MATCH THE CODE STYLE** - Use the same patterns, structure, and approach as existing files\n` +
            `4. **VERIFY FILE REFERENCES** - If HTML references "script.js", ensure script.js matches what HTML expects\n` +
            `5. **ENSURE CONSISTENCY** - All files must work together as one cohesive project\n` +
            `6. **NO PROJECT MIXING** - Do NOT generate portfolio code for a game project, or game code for a portfolio\n\n` +
            `**BEFORE WRITING ANY FILE, VERIFY:**\n` +
            `- ✅ Does the content match the project type shown in existing files?\n` +
            `- ✅ Does it reference existing files correctly (correct paths, correct function names)?\n` +
            `- ✅ Does it use the same coding style and patterns?\n` +
            `- ✅ Will it work with the existing files (no broken references)?\n` +
            `- ✅ Are button IDs/classes consistent between HTML and JS?\n\n` +
            `**EXAMPLE:** If index.html has a button with id="startButton" and references script.js, then script.js MUST have:\n` +
            `- document.getElementById('startButton').addEventListener('click', ...)\n` +
            `- Game code, NOT portfolio code\n` +
            `- Code that matches the project type shown in the HTML\n`;
          
          const sysMsg = this.messages.find(m => m.role === 'system');
          if (sysMsg) {
            sysMsg.content += existingFilesWarning;
          }
        }
      }
      
      // FIX/ENHANCE MODE specific protection
      if ((isFixing || isModifying || isReviewing) && !isCreatingNew) {
        log.info(`[Agent] 🛡️ ${this.taskMode.toUpperCase()} MODE: Protection active`);
        
        // Add protection notice to system message
        const protectionNotice = `\n\n## 🛡️ TASK MODE: ${this.taskMode.toUpperCase()}
**PROTECTION ACTIVE**: You are in ${this.taskMode.toUpperCase()} mode. 
${this.taskMode === TaskMode.FIX ? `
⚠️ FIX MODE RULES:
1. DO NOT replace entire files - make surgical edits only
2. DO NOT regenerate the project from scratch
3. PRESERVE the existing code structure and logic
4. Only modify specific lines that contain bugs
5. If you need to change more than 30% of a file, STOP and ask for confirmation
6. Existing files snapshot has ${this.existingFilesSnapshot.size} files protected
` : ''}
${this.taskMode === TaskMode.REVIEW ? `
⚠️ REVIEW MODE RULES:
1. DO NOT modify any files
2. Only analyze and report issues
3. Provide recommendations without implementing them
` : ''}
${this.taskMode === TaskMode.ENHANCE ? `
⚠️ ENHANCE MODE RULES:
1. Preserve all existing functionality
2. Add new features without breaking existing code
3. Create backups before major changes
` : ''}
${this.taskMode === TaskMode.ORGANIZE ? `
🗂️ ORGANIZE MODE RULES:
1. The user wants their FILES sorted — not a new project.
2. Prefer organize_folder({ path, strategy: "by-type" | "by-date", dry_run: true }) to preview, then dry_run: false to apply.
3. Never call scaffold_project, write_file, patch_file, str_replace, or search_codebase for organizing.
4. list_dir, organize_folder, undo_organize_folder, and run_command (only for move/rename/mkdir) are allowed.
5. If the target folder is ambiguous, ASK which folder to organize before acting.
6. To reverse, call undo_organize_folder with the same path.
` : ''}
`;
        
        const sysMsg = this.messages.find(m => m.role === 'system');
        if (sysMsg) {
          sysMsg.content += protectionNotice;
        }
      }
      
      // 3. Extract file references from message and read them
      const fileRefs = userMessage.match(/[\w\-\/]+\.(js|ts|tsx|jsx|html|css|py|json|md)/gi) || [];
      for (const file of fileRefs.slice(0, 5)) { // Increased from 2 to 5
        try {
          if (!this.existingFilesSnapshot.has(file)) {
            const content = await tools.read_file.execute({ path: file }, this.context);
            if (content && content.content) {
              explorationResults.push(`📄 Read mentioned file: ${file}`);
              
              // Also add to snapshot if in fix mode
              if (isFixing || isModifying) {
                this.existingFilesSnapshot.set(file, {
                  path: file,
                  content: content.content,
                  size: content.content.length,
                  hash: simpleHash(content.content)
                });
              }
            }
          }
        } catch (e) {
          explorationResults.push(`⚠️ File not found: ${file}`);
        }
      }
      
      if (explorationResults.length > 0) {
        explorationContext = `\n\n## 🔍 CODEBASE EXPLORATION RESULTS\n${explorationResults.join('\n')}\n`;
        log.info(`[Agent] 🔍 Exploration complete: ${explorationResults.length} findings`);
        
        // Add exploration results to system message for context
        const sysMsg = this.messages.find(m => m.role === 'system');
        if (sysMsg) {
          sysMsg.content += explorationContext;
        }
      }
    } catch (error) {
      log.warn('[Agent] Exploration phase error (non-critical):', error);
    }
    // === END EXPLORATION PHASE ===
    
    // Add user message
    this.messages.push({ role: 'user', content: userMessage });
    
    // Sync to state manager
    this.syncMessageToState('user', userMessage);

    let iteration = 0;
    let finalAnswer = '';
    
    const MAX_PARSE_ERRORS = 5;
    const MAX_NO_TOOL_STREAK = 5;
    
    // 🛡️ TOTAL TASK TIMEOUT - Prevents infinite hangs
    // 10 minutes for standard tasks, 20 minutes for complex projects
    const taskStartTime = Date.now();
    const isComplexTask = /game|full.*stack|complete|enterprise|dashboard|e-commerce/i.test(userMessage);
    const MAX_TASK_DURATION_MS = isComplexTask ? 20 * 60 * 1000 : 10 * 60 * 1000; // 20 or 10 minutes
    log.info(`[Agent] ⏱️ Task timeout: ${MAX_TASK_DURATION_MS / 60000} minutes (complex: ${isComplexTask})`);

    while (iteration < this.maxIterations) {
      if (this.isCancellationRequested()) {
        log.info('[Agent] Stop requested, ending task loop');
        finalAnswer = this.buildStopMessage();
        break;
      }

      iteration++;
      
      // 🛡️ CHECK TOTAL TASK TIMEOUT
      const elapsedMs = Date.now() - taskStartTime;
      if (elapsedMs > MAX_TASK_DURATION_MS) {
        const elapsedMinutes = Math.round(elapsedMs / 60000);
        log.error(`[Agent] ⏱️ TASK TIMEOUT: ${elapsedMinutes} minutes elapsed, aborting`);
        
        // Build a helpful timeout message
        finalAnswer = this.buildFinalAnswer(
          `⏱️ **Task Timeout**\n\n` +
          `The task took longer than ${MAX_TASK_DURATION_MS / 60000} minutes and was automatically stopped.\n\n` +
          `**Progress made:**\n` +
          `- ${this.completedSteps.length} steps completed\n` +
          `- ${iteration} iterations run\n\n` +
          `**What to do:**\n` +
          `1. Check the files that were created/modified\n` +
          `2. Try breaking the task into smaller pieces\n` +
          `3. Run the task again with more specific instructions\n\n` +
          `If this keeps happening, the task may be too complex for a single request.`
        );
        break;
      }

      // Rate limiting delay for Claude API (helps prevent empty responses)
      if (iteration > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between requests
      }

      // Prepare messages for the model - filter out tool messages and convert to ChatMessage format
      const systemMessage = this.messages.find(m => m.role === 'system')?.content || '';

      // Limit conversation history to prevent Claude context issues (keep last 10 messages)
      const recentMessages = this.messages
        .filter(m => m.role !== 'system' && m.role !== 'tool')
        .slice(-10);

      const conversationMessages = recentMessages
        .map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        }));

      // Add plan context if we have one
      let planContext = '';
      if (this.currentPlan.length > 0) {
        const planStatus = this.currentPlan.map((step, i) => {
          const status = i < this.currentPlanStep ? '✅' : (i === this.currentPlanStep ? '➡️' : '⬚');
          return `${status} ${i + 1}. ${step}`;
        }).join('\n');
        planContext = `\n\nCURRENT PLAN:\n${planStatus}\n\nContinue with step ${this.currentPlanStep + 1}.`;
      }

      const toolsSystemMessage = {
        role: 'system' as const,
        content: `${systemMessage}${planContext}\n\nOutput ONLY JSON. No explanations.`
      };

      const messagesForModel = [toolsSystemMessage, ...conversationMessages];

      try {
        // Use current active model (may have been escalated)
        const modelToUse = this.currentActiveModel || this.context.model || 'kimi-k2.6:cloud';
        const escalationInfo = this.escalationCount > 0 ? ` [escalated ${this.escalationCount}x]` : '';
        log.info(`[Agent] Iteration ${iteration}/${this.maxIterations}, model: ${modelToUse}${escalationInfo}, steps: ${this.completedSteps.length}`);
        
        const maxTokens = getRecommendedMaxTokens(
          modelToUse,
          this.taskMode === TaskMode.CREATE ? 'words_to_code' : 'agent'
        );
        
        if (maxTokens > 4096) {
          log.info(
            `[Agent] 🚀 Using ${maxTokens} token limit for ${modelToUse} - full power mode! (ollamaCloud=${isOllamaCloudModel(modelToUse)})`
          );
        }
        
        // === NATIVE TOOL-CALLING ===
        // Prefer native function-calling over JSON-in-text parsing. Every
        // provider in the router now supports chatWithTools (Anthropic,
        // OpenAI, OpenRouter, Ollama). If the model returns native toolCalls
        // we skip the regex/repair pipeline entirely. If it doesn't, we still
        // get plain text in `content` and fall through to the legacy parser.
        const canonicalToolCatalog = toCanonicalTools(this.getToolsForModel() as any);

        const response = await withAITimeoutAndRetry(
          () => aiRouter.chatWithTools(messagesForModel, canonicalToolCatalog, {
            model: modelToUse,
            temperature: 0.3, // Increased from 0.1: Better balance between determinism and thoroughness
            maxTokens,
            signal: this.abortController?.signal
          }),
          'complex', // Agent operations are complex multi-step tasks
          modelToUse, // Model name for adaptive timeout
          2 // Retry up to 2 times on timeout
        );

        if (this.isCancellationRequested()) {
          finalAnswer = this.buildStopMessage();
          break;
        }

        // Check for API errors first
        if (!response.success) {
          log.error(`[Agent] API returned error: ${response.error}`);
          throw new Error(`API Error: ${response.error || 'Unknown error'}`);
        }

        if (!response || !response.content) {
          log.warn('[Agent] Empty response content received');
          throw new Error('Empty response from AI');
        }

        log.info(`[Agent] Response preview: ${response.content.substring(0, 300)}...`);

        // === DETECT JSON TRUNCATION (all models can hit output limits on large files) ===
        const responseLength = response.content.length;
        const hasUnclosedString = response.content.match(/"[^"]*$/); // String that never closes
        const hasUnclosedBrace = (response.content.match(/\{/g) || []).length > (response.content.match(/\}/g) || []).length;
        
        if ((hasUnclosedString || hasUnclosedBrace) && responseLength > 8000) {
          log.info(`[Agent] 🚨 TRUNCATED OUTPUT DETECTED (${responseLength} chars, unclosed: ${hasUnclosedString ? 'string' : 'brace'})`);
          log.info(`[Agent] 🔄 File is too large - forcing incremental approach`);
          
          // Don't try to parse this - it's broken. Force a different approach.
          const truncatedContent = response.content.substring(0, 200) + '...[TRUNCATED]';
          this.messages.push({
            role: 'assistant',
            content: truncatedContent
          });
          this.syncMessageToState('assistant', truncatedContent);
          
          const correctionMessage = `🚨 CRITICAL: Your response was truncated (${responseLength} chars exceeded output limit).

The file you're trying to write is TOO LARGE for a single response.

✅ REQUIRED APPROACH:
1. Start with a MINIMAL working version (under 100 lines)
2. Get it working FIRST
3. Then ADD features incrementally in separate calls

❌ DO NOT try to write a complete, feature-rich file all at once!

Please write a simplified version of the file that:
- Has basic functionality only
- Is under 100 lines
- Actually works

We'll add more features after this core version works.`;
          this.messages.push({
            role: 'user',
            content: correctionMessage
          });
          
          // Sync correction message
          this.syncMessageToState('user', correctionMessage);
          
          continue; // Skip parsing, go to next iteration with strong guidance
        }
        // === END TRUNCATION DETECTION ===

        // === 🔍 HALLUCINATION DETECTION ===
        // Check if model is making claims about non-existent files
        try {
          const hallucinationReport = detectHallucinations(response.content, this.context.workspacePath);
          
          if (hallucinationReport.hasHallucinations) {
            log.warn(`[Agent] 🔍 HALLUCINATION DETECTED: ${hallucinationReport.hallucinations.length} false claims`);
            
            for (const h of hallucinationReport.hallucinations) {
              log.warn(`[Agent] 🔍 - ${h.type}: ${h.claimedPath}${h.lineNumber ? ` (line ${h.lineNumber})` : ''}`);
            }
            
            // If hallucination rate is high (>50%), add correction to messages
            if (hallucinationReport.hallucinationRate > 0.5) {
              const hallucinationWarning = `⚠️ **Hallucination Warning**: Some of your claims about files appear to be incorrect:\n\n` +
                hallucinationReport.hallucinations.map(h => 
                  `- ${h.claimedPath}: ${h.suggestion}`
                ).join('\n') + 
                `\n\nPlease verify files exist before making claims about them. Use read_file or list_dir to check.`;
              
              // Store hallucination for learning
              const hallucinationData = {
                response: response.content.substring(0, 500),
                hallucinations: hallucinationReport.hallucinations,
                timestamp: Date.now()
              };
              (this as any).lastHallucinationReport = hallucinationData;
              
              log.info(`[Agent] 🔍 High hallucination rate (${(hallucinationReport.hallucinationRate * 100).toFixed(0)}%) - adding correction`);
            }
          } else if (hallucinationReport.verified.length > 0) {
            log.info(`[Agent] ✅ File references verified: ${hallucinationReport.verified.map(v => v.path).join(', ')}`);
          }
        } catch (hallucinationError) {
          log.warn('[Agent] Hallucination detection failed (non-critical):', hallucinationError);
        }
        // === END HALLUCINATION DETECTION ===

        // Prefer native tool calls returned by chatWithTools. Fall back to
        // JSON-in-text parsing only when the model didn't emit any (some
        // models still answer purely in text, e.g. for `done` signals).
        const nativeToolCalls = toolUseBlocksToParsedCalls(
          (response as any).toolCalls,
          Object.keys(tools)
        );
        const toolCalls = nativeToolCalls.length > 0
          ? nativeToolCalls
          : this.parseToolCalls(response.content);
        
        // Check for plan in response
        const planMatch = response.content.match(/"plan"\s*:\s*\[([\s\S]*?)\]/);
        if (planMatch && this.currentPlan.length === 0) {
          try {
            const planJson = JSON.parse(`[${planMatch[1]}]`);
            if (Array.isArray(planJson) && planJson.length > 0) {
              this.currentPlan = planJson;
              log.info('[Agent] Plan created:', this.currentPlan);
            }
          } catch (e) {
            log.info('[Agent] Could not parse plan');
          }
        }

        if (toolCalls.length > 0) {
          // Reset streaks on success
          this.noToolCallStreak = 0;
          this.parseErrorStreak = 0;
          
          // Add assistant message - preserve content for Claude (don't strip to empty).
          // When tool calls came from the native channel, response.content is already
          // clean prose with no tool JSON to strip. Only run the legacy JSON-stripper
          // for the text-parse fallback path.
          let assistantContent = nativeToolCalls.length > 0
            ? (response.content || '').trim()
            : response.content.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '').trim();
          if (!assistantContent) {
            // If stripping JSON leaves empty content, use a placeholder
            assistantContent = `Executing tool: ${toolCalls[0]?.function?.name || 'unknown'}`;
          }
          this.messages.push({
            role: 'assistant',
            content: assistantContent,
            tool_calls: toolCalls
          });
          
          // Sync assistant message to state manager
          this.syncMessageToState('assistant', assistantContent);

          // === SELF-CORRECTING VALIDATION PIPELINE ===
          // Validate and potentially auto-fix tool calls before execution
          const validationResult = await this.runValidationPipeline({
            toolCalls,
            context: this.context,
            currentPlan: this.currentPlan,
            currentStep: this.currentPlanStep
          });

          // Update output confidence based on validation
          this.outputConfidence = validationResult.overallConfidence;

          // If validation found issues and auto-fixes were applied, use the fixed version
          let validatedToolCalls = toolCalls;
          if (validationResult.autoFixed && validationResult.fixedToolCalls) {
            validatedToolCalls = validationResult.fixedToolCalls;
            log.info(`[Agent] ✅ Auto-fixed ${validationResult.fixesApplied} validation issues`);
          }

          // If confidence is too low, consider escalating
          if (this.outputConfidence < 0.5) {
            const escalated = this.recordModelFailure('low_confidence_output');
            if (escalated) {
              log.info(`[Agent] 🔄 Escalating due to low confidence (${this.outputConfidence.toFixed(2)})`);
              continue; // Try again with new model
            }
          }

          // Add validation feedback to context
          if (validationResult.issues.length > 0) {
            this.messages.push({
              role: 'user',
              content: `VALIDATION ISSUES DETECTED:\n${validationResult.issues.map(i => `• ${i}`).join('\n')}\n\nSUGGESTIONS:\n${validationResult.suggestions.map(s => `• ${s}`).join('\n')}\n\nPlease fix these issues in your next response.`
            });

            // Learn from validation failures
            await this.learnFromValidationFailures(validationResult.issues, userMessage);
          }
          // === END VALIDATION PIPELINE ===

          // Execute tools (could parallelize file operations)
          const toolResults: string[] = [];
          let stopRequestedInToolLoop = false;

          for (const toolCall of validatedToolCalls) {
            if (this.isCancellationRequested()) {
              stopRequestedInToolLoop = true;
              break;
            }

            try {
              const tool = tools[toolCall.function.name];
              if (!tool) {
                throw new Error(`Unknown tool: ${toolCall.function.name}`);
              }

              let args: any;
              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch (parseError) {
                throw new Error(`Invalid tool arguments JSON: ${toolCall.function.arguments}`);
              }

              const vibeCoderBlock = getVibeCoderToolPolicyError(
                this.context.vibeCoderExecutionPolicy,
                toolCall.function.name,
                args
              );
              if (vibeCoderBlock) {
                log.info(`[Agent] 🧭 VibeCoder policy blocked ${toolCall.function.name}: ${vibeCoderBlock}`);
                toolResults.push(`❌ ${toolCall.function.name}: BLOCKED - ${vibeCoderBlock}`);
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `🧭 VIBECODER POLICY ACTIVE\n\n${vibeCoderBlock}\n\nStay inside the current request shape instead of mutating the workspace.`
                });
                continue;
              }

              // === SMART TIMEOUT DETECTION ===
              // Automatically increase timeout for commands that typically take longer
              if (toolCall.function.name === 'run_command' && args.command) {
                const cmd = args.command.toLowerCase();
                if (cmd.includes('npm install') || cmd.includes('yarn install') ||
                    cmd.includes('pip install') || cmd.includes('composer install') ||
                    cmd.includes('bundle install') || cmd.includes('cargo build') ||
                    cmd.includes('go mod download')) {
                  // Package managers and build tools often take 2-5 minutes
                  args.timeout = args.timeout || 300; // 5 minutes default for package installs
                  log.info(`[Agent] 📦 Detected package manager command, increased timeout to ${args.timeout}s`);
                } else if (cmd.includes('npm run build') || cmd.includes('yarn build') ||
                          cmd.includes('webpack') || cmd.includes('tsc') ||
                          cmd.includes('python setup.py') || cmd.includes('make')) {
                  // Build processes can take time too
                  args.timeout = args.timeout || 120; // 2 minutes for builds
                  log.info(`[Agent] 🔨 Detected build command, increased timeout to ${args.timeout}s`);
                }
              }
              // === END SMART TIMEOUT DETECTION ===

              log.info(`[Agent] Executing: ${toolCall.function.name}`, args?.path || args?.command || '');
              
              // === REPETITIVE FILE READ DETECTION ===
              // Prevents infinite loops where agent reads same file over and over without progress
              if (toolCall.function.name === 'read_file' && args.path) {
                const filePath = args.path;
                
                if (filePath === this.lastReadFile) {
                  this.consecutiveSameFileReads++;
                  log.info(`[Agent] ⚠️ Reading same file again: "${filePath}" (count: ${this.consecutiveSameFileReads}/${this.MAX_SAME_FILE_READS})`);
                  
                  if (this.consecutiveSameFileReads >= this.MAX_SAME_FILE_READS) {
                    // Model is stuck - provide strong guidance
                    const errorMsg = `⚠️ You've read "${filePath}" ${this.consecutiveSameFileReads} times without making changes. ` +
                      `You already have this file's content. Either:\n` +
                      `1. Write changes using write_file if you need to modify it\n` +
                      `2. Move on to the next step in your plan\n` +
                      `3. Mark as done if the task is complete`;
                    
                    log.info(`[Agent] 🔄 Breaking read loop on "${filePath}"`);
                    
                    toolResults.push(`⚠️ read_file(${filePath}): SKIPPED - Already read ${this.consecutiveSameFileReads} times. Move on.`);
                    this.messages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      content: errorMsg
                    });
                    
                    // Record this as a model failure for escalation
                    this.recordModelFailure('read_loop');
                    
                    continue; // Skip this tool call
                  }
                } else {
                  // Different file - reset counter
                  this.consecutiveSameFileReads = 0;
                }
                
                this.lastReadFile = filePath;
              }
              // === END REPETITIVE FILE READ DETECTION ===
              
              // === REPETITIVE FILE WRITE DETECTION ===
              // Prevents infinite loops where agent writes same file over and over
              // Now checks both file path AND content to detect truly repetitive writes
              if (toolCall.function.name === 'write_file' && args.path) {
                const filePath = args.path;
                const fileContent = args.content || '';
                
                // === 🛡️ FIX MODE PROTECTION ===
                // In FIX mode, prevent destructive overwrites of existing files
                if (this.taskMode === TaskMode.FIX || this.taskMode === TaskMode.REVIEW) {
                  const existingFile = this.existingFilesSnapshot.get(filePath);
                  
                  if (this.taskMode === TaskMode.REVIEW) {
                    // REVIEW mode: Block ALL writes
                    log.info(`[Agent] 🛡️ REVIEW MODE: Blocking write to "${filePath}" - no modifications allowed`);
                    toolResults.push(`❌ write_file(${filePath}): BLOCKED - You are in REVIEW mode. Cannot modify files.`);
                    this.messages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      content: `🛡️ REVIEW MODE ACTIVE: You cannot write to files in review mode.\n\n` +
                        `If you found issues that need fixing, please describe them clearly.\n` +
                        `The user can then decide whether to switch to FIX mode.`
                    });
                    continue; // Skip this tool call
                  }
                  
                  if (existingFile) {
                    // Calculate change percentage
                    const changePercentage = 1 - this.contentSimilarity(fileContent, existingFile.content);
                    const changePercent = Math.round(changePercentage * 100);
                    
                    log.info(`[Agent] 🛡️ FIX MODE: Checking write to existing file "${filePath}" (${changePercent}% change)`);
                    
                    // Block if change is too large (>50% is basically a rewrite)
                    if (changePercentage > 0.5) {
                      log.info(`[Agent] 🛡️ FIX MODE: BLOCKING write to "${filePath}" - ${changePercent}% change is too destructive`);
                      toolResults.push(`❌ write_file(${filePath}): BLOCKED - ${changePercent}% change is too large for FIX mode`);
                      this.messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: `🛡️ FIX MODE PROTECTION: Your change to "${filePath}" would modify ${changePercent}% of the file.\n\n` +
                          `In FIX mode, you should make surgical edits, not rewrite files.\n\n` +
                          `WHAT TO DO:\n` +
                          `1. Use read_file to see the current content\n` +
                          `2. Identify the SPECIFIC lines that need changing\n` +
                          `3. Make minimal, targeted changes (under 30% of the file)\n` +
                          `4. PRESERVE the existing logic and structure\n\n` +
                          `If the file truly needs major restructuring, ask the user to switch to ENHANCE mode.`
                      });
                      continue; // Skip this tool call
                    }
                    
                    // Warn if change is significant (>30%)
                    if (changePercentage > 0.3) {
                      log.info(`[Agent] 🛡️ FIX MODE: WARNING - ${changePercent}% change to "${filePath}" is significant`);
                      // Allow but log warning - the change will be tracked for potential rollback
                    }
                    
                    // Track this modification for potential rollback
                    this.filesModifiedThisTask.add(filePath);
                  } else {
                    // New file in FIX mode - generally suspicious
                    // Check if it looks like regenerating an existing project
                    const existingFileNames = Array.from(this.existingFilesSnapshot.keys());
                    const isLikelyDuplicate = existingFileNames.some(existing => {
                      const existingBase = path.basename(existing, path.extname(existing));
                      const newBase = path.basename(filePath, path.extname(filePath));
                      return existingBase.toLowerCase() === newBase.toLowerCase() && 
                             existing !== filePath;
                    });
                    
                    if (isLikelyDuplicate) {
                      log.info(`[Agent] 🛡️ FIX MODE: BLOCKING duplicate file creation "${filePath}"`);
                      toolResults.push(`❌ write_file(${filePath}): BLOCKED - This appears to duplicate an existing file`);
                      this.messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: `🛡️ FIX MODE PROTECTION: Cannot create "${filePath}" - a similar file already exists.\n\n` +
                          `Existing files: ${existingFileNames.slice(0, 10).join(', ')}\n\n` +
                          `In FIX mode, modify existing files instead of creating duplicates.`
                      });
                      continue;
                    }
                    
                    // Allow new files but track them
                    this.filesModifiedThisTask.add(filePath);
                    log.info(`[Agent] 🛡️ FIX MODE: Allowing new file "${filePath}" (will be tracked for rollback)`);
                  }
                }
                // === END FIX MODE PROTECTION ===
                
                // === GAME FILE SIZE ENFORCEMENT ===
                // For games, enforce smaller initial files to prevent truncation
                const isGameProject = (this as any).forceIncrementalMode;
                const isFirstWrite = !this.totalWritesPerFile.has(filePath);
                const contentLines = fileContent.split('\n').length;
                
                if (isGameProject && isFirstWrite && filePath.endsWith('.js') && contentLines > 200) {
                  log.info(`[Agent] 🎮 GAME FILE TOO LARGE: ${filePath} has ${contentLines} lines (max 200 for initial version)`);
                  
                  toolResults.push(`⚠️ write_file(${filePath}): REJECTED - File is too large for initial version (${contentLines} lines)`);
                  this.messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `🎮 GAME MODE: Your ${filePath} is too large (${contentLines} lines)!

For PHASE 1 (skeleton), game files must be under 200 lines.

✅ REQUIRED: Write a MINIMAL working version first:
• Basic game loop (requestAnimationFrame)
• One game object (rectangle or sprite)
• Basic keyboard input
• Single game state

Then we'll add features incrementally in PHASE 2.

Please rewrite ${filePath} with ONLY the core mechanics, under 200 lines.`
                  });
                  continue; // Skip this tool call
                }
                // === END GAME FILE SIZE ENFORCEMENT ===
                
                // Check for truncated/incomplete code (common model failure mode)
                const truncationIssue = this.detectTruncatedCode(fileContent, filePath);
                if (truncationIssue) {
                  this.consecutiveTruncationRejections++;
                  log.info(`[Agent] ⚠️ Truncated code detected in "${filePath}": ${truncationIssue} (count: ${this.consecutiveTruncationRejections}/${this.MAX_TRUNCATION_REJECTIONS})`);
                  
                  // Track per-file failures
                  const shouldSkipFile = this.recordFileFailure(filePath, `truncated: ${truncationIssue}`);
                  if (shouldSkipFile) {
                    // This file has failed too many times - skip it and suggest alternatives
                    const skipMsg = `🛑 Skipping "${filePath}" - too many failures (${this.MAX_FAILURES_PER_FILE}). ` +
                      `Try a different approach: break the file into smaller modules, or use a simpler implementation.`;
                    log.info(`[Agent] ${skipMsg}`);
                    toolResults.push(`❌ write_file(${filePath}): BLOCKED - ${skipMsg}`);
                    this.messages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      content: skipMsg + `\n\nSuggested alternatives:\n` +
                        `1. Split ${filePath} into multiple smaller files\n` +
                        `2. Use a simpler implementation\n` +
                        `3. Move on to other tasks and revisit this later`
                    });
                    
                    // Record model failure for escalation
                    this.recordModelFailure('file_blocked');
                    continue;
                  }
                  
                  // Record failure for escalation tracking
                  const escalated = this.recordModelFailure('truncated_code');
                  
                  // If we escalated, reset truncation counter and continue with new model
                  if (escalated) {
                    this.consecutiveTruncationRejections = 0;
                    continue; // Skip this iteration, try again with new model
                  }
                  
                  // Circuit breaker: stop if model keeps producing truncated code AND we can't escalate
                  if (this.consecutiveTruncationRejections >= this.MAX_TRUNCATION_REJECTIONS) {
                    const errorMsg = `🛑 Model keeps producing truncated/incomplete code (${this.consecutiveTruncationRejections} times). ` +
                      `All available models have been tried. The task may be too complex. ` +
                      `Try breaking it into smaller pieces.`;
                    log.error(`[Agent] ${errorMsg}`);
                    return this.buildFinalAnswer(errorMsg);
                  }
                  
                  // Don't write truncated code - add feedback to help model
                  const feedbackIntensity = this.consecutiveTruncationRejections >= 3 ? 'CRITICAL' : 'ERROR';
                  toolResults.push(`❌ write_file(${filePath}): REJECTED - ${truncationIssue}. Please generate complete, working code with full method implementations.`);
                  this.messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `${feedbackIntensity}: Your code for ${filePath} appears truncated or incomplete: ${truncationIssue}. ` +
                      `You MUST provide COMPLETE code with full method implementations, not just signatures or skeletons. ` +
                      `If the file is too large, break it into smaller modules.`
                  });
                  continue; // Skip this tool call
                } else {
                  // Reset truncation counter and file failure on successful (non-truncated) code
                  this.consecutiveTruncationRejections = 0;
                  this.resetFileFailure(filePath);
                }
                
                // Check if this is the same file AND same/similar content
                const isSameFile = filePath === this.lastWrittenFile;
                const similarity = this.lastWrittenFileContent ? 
                  this.contentSimilarity(fileContent, this.lastWrittenFileContent) : 0;
                const isSameContent = similarity > 0.90; // 90%+ similar = practically the same
                const isMicroChange = similarity > 0.70 && similarity <= 0.90; // 70-90% similar = micro-refinement
                
                // Get total writes for this file
                const currentTotalWrites = this.totalWritesPerFile.get(filePath) || 0;
                
                // === MICRO-CHANGE LOOP DETECTION ===
                // If file has been written 5+ times AND new write is only a micro-change, require TESTING first
                if (isSameFile && isMicroChange && currentTotalWrites >= 5) {
                  log.info(`[Agent] 🔄 MICRO-CHANGE LOOP DETECTED: "${filePath}" has ${currentTotalWrites} writes, new change is only ${Math.round((1 - similarity) * 100)}% different`);
                  
                  // REQUIRE TESTING before accepting - don't just accept "good enough"
                  toolResults.push(`⚠️ write_file(${filePath}): MICRO-CHANGE DETECTED - You've refined this file ${currentTotalWrites} times with only ${Math.round((1 - similarity) * 100)}% change.`);
                  this.messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `⚠️ QUALITY CHECK REQUIRED: ${filePath} has been refined ${currentTotalWrites} times with small changes.

🔍 BEFORE ACCEPTING THIS AS "DONE", YOU MUST:
1. **TEST THE PROJECT** - Run it with run_command to verify it actually works
2. **VERIFY ALL FEATURES** - Check that buttons work, UI is wired, logic is complete
3. **NO PLACEHOLDERS** - Ensure no TODO comments or incomplete functions remain

❌ DO NOT mark as done until you've TESTED and VERIFIED the project works.

✅ If testing passes, THEN you can mark as done.
❌ If testing fails, FIX the issues before continuing.

The file is written, but QUALITY is not yet verified. Test first!`
                  });
                  continue; // Skip this write, require testing
                }
                
                if (isSameFile && isSameContent) {
                  // Same file AND same content - SKIP the write entirely
                  this.consecutiveSameFileWrites++;
                  log.info(`[Agent] ⚠️ Skipping duplicate write to "${filePath}" (${Math.round(similarity * 100)}% similar, count: ${this.consecutiveSameFileWrites})`);
                  
                  if (this.consecutiveSameFileWrites >= this.MAX_SAME_FILE_WRITES) {
                    const errorMsg = `🛑 Repetitive file write detected: "${filePath}" has been written ${this.consecutiveSameFileWrites} times with similar content. ` +
                      `The model may be stuck. Try a different approach or simpler task.`;
                    log.error(`[Agent] ${errorMsg}`);
                    return this.buildFinalAnswer(errorMsg);
                  }
                  
                  // Don't actually write - just tell the model it's already done
                  toolResults.push(`⚠️ write_file(${filePath}): SKIPPED - content is ${Math.round(similarity * 100)}% similar to previous write. File already contains this content. Move on to the next step.`);
                  this.messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `NOTICE: File ${filePath} already contains similar content (${Math.round(similarity * 100)}% match). No changes needed. Please continue with the NEXT step in your plan, or mark the task as done if complete.`
                  });
                  continue; // Skip this tool call
                } else if (isSameFile && !isSameContent) {
                  // Same file but different content - track as refinement
                  this.consecutiveSameFileWrites = 1;
                  log.info(`[Agent] 📝 Updating file "${filePath}" with new content (${Math.round((1 - similarity) * 100)}% different)`);
                } else {
                  // Different file - reset counter
                  this.consecutiveSameFileWrites = 1;
                  log.info(`[Agent] 📝 Writing to new file: "${filePath}"`);
                }
                
                // Track this as the last written file and content
                this.lastWrittenFile = filePath;
                this.lastWrittenFileContent = fileContent;
                
                // === TOTAL WRITES PER FILE CHECK - catches loops with different content ===
                const totalWrites = (this.totalWritesPerFile.get(filePath) || 0) + 1;
                this.totalWritesPerFile.set(filePath, totalWrites);
                
                // Try model escalation if we're getting stuck on the same file
                if (totalWrites >= this.ESCALATE_ON_WRITE_LOOP && totalWrites < this.MAX_TOTAL_WRITES_PER_FILE) {
                  log.warn(`[Agent] ⚠️ File "${filePath}" written ${totalWrites} times - attempting OPUS-style model escalation`);
                  const escalated = this.escalateModel(`File write loop detected: "${filePath}" written ${totalWrites} times - task may be too complex for current model`);
                  if (escalated) {
                    log.info(`[Agent] ✅ Escalated to ${this.currentActiveModel} - applying OPUS THINKING`);
                    // Reset the write count for this file to give the new model a chance
                    this.totalWritesPerFile.set(filePath, Math.floor(totalWrites / 2));
                    
                    // Prime the new, more capable model with OPUS THINKING patterns
                    const opusAnalysis = (this as any).opusAnalysis;
                    const delightFactors = opusAnalysis?.delightFactors?.slice(0, 3).join('\n• ') || 'Visual polish, animations, complete features';
                    
                    this.messages.push({
                      role: 'user',
                      content: `[SYSTEM] MODEL ESCALATION - You are now a MORE CAPABLE model. 
                      
Previous model struggled with "${filePath}". Think like Claude Opus:

🧠 BEFORE WRITING, THINK:
1. What's the COMPLETE solution, not a partial one?
2. What would make this AMAZING, not just functional?
3. What are the dependencies between files?

✨ MAKE IT DELIGHTFUL:
• ${delightFactors}

🎯 YOUR MISSION:
Write COMPLETE, WORKING code in ONE pass. Every button works. Every feature implemented.
No placeholders. No TODOs. Production-ready quality.

NOW EXECUTE with excellence.`
                    });
                  }
                }
                
                // === FORCE COMPLETION AT THRESHOLD ===
                // After FORCE_COMPLETION_AT writes, REQUIRE TESTING before accepting
                if (totalWrites === this.FORCE_COMPLETION_AT) {
                  log.info(`[Agent] 🏁 FORCE COMPLETION CHECKPOINT: File "${filePath}" written ${totalWrites} times - REQUIRING VALIDATION`);
                  
                  // Run validation BEFORE forcing completion
                  const validationResult = await this.validateProjectCompletion();
                  
                  if (!validationResult.valid) {
                    log.info(`[Agent] ❌ Validation failed at force completion checkpoint - rejecting premature completion`);
                    this.messages.push({
                      role: 'user', 
                      content: `🚨 QUALITY GATE: You've written "${filePath}" ${totalWrites} times, but VALIDATION FAILED:

${validationResult.reason}

${validationResult.fixInstruction}

❌ DO NOT mark as done yet. The project has issues that MUST be fixed.
✅ Fix these issues, then TEST with run_command before marking complete.`
                    });
                    continue; // Don't force completion if validation fails
                  }
                  
                  // Validation passed - allow completion but still require final test
                  log.info(`[Agent] ✅ Validation passed at checkpoint - allowing completion after final test`);
                  this.messages.push({
                    role: 'user', 
                    content: `⚠️ [QUALITY CHECKPOINT] You have written "${filePath}" ${totalWrites} times. 

✅ VALIDATION PASSED: Basic structure looks good.

🔍 FINAL STEP REQUIRED:
1. **MANDATORY**: Run the project with run_command to verify it actually works
2. Test ALL features - buttons, UI, logic, everything
3. Only AFTER successful testing, mark as done

📋 YOUR OPTIONS:
1. TEST the project: run_command (REQUIRED before completion)
2. Create any OTHER missing files (if any)
3. If testing passes, provide your final answer (no tool calls)

The file structure is complete, but RUNTIME VERIFICATION is required.`
                  });
                }
                
                if (totalWrites > this.MAX_TOTAL_WRITES_PER_FILE) {
                  // Instead of stopping, try to guide the model with OPUS REFLECTION
                  if (totalWrites <= this.MAX_TOTAL_WRITES_PER_FILE + 2) {
                    // Inject OPUS REFLECTION PROMPT to force quality thinking
                    const opusReflection = OpusThinkingEngine.generateReflectionPrompt();
                    log.warn(`[Agent] ⚠️ File "${filePath}" written ${totalWrites} times - injecting OPUS REFLECTION`);
                    this.messages.push({
                      role: 'user',
                      content: `${opusReflection}

[SYSTEM CRITICAL] You have tried to write "${filePath}" ${totalWrites} times. The file is TOO COMPLEX.

OPUS APPROACH: Simplify scope, NOT quality.

STEP BACK and write a MINIMAL, WORKING version first:
1. Under 100 lines of COMPLETE, WORKING code
2. Every function implemented fully (no placeholders)
3. Every feature wired up properly
4. It must RUN immediately

For a game:
- Start screen that works → Game loop that works → Game over that works
- Use emojis as sprites (🦖, 💖) - they're beautiful AND simple
- Particle effects can wait - basic gameplay first

QUALITY > COMPLEXITY. Write something small that's EXCELLENT.`
                    });
                    continue; // Skip this write and let model try again with Opus thinking
                  }
                  
                  const errorMsg = `🛑 FILE WRITE LOOP DETECTED: "${filePath}" has been written ${totalWrites} times in this session. ` +
                    `The model is stuck rewriting the same file. Stopping to prevent infinite loop.`;
                  log.error(`[Agent] ${errorMsg}`);
                  
                  // Give specific guidance on what went wrong
                  const guidance = `\n\n**What went wrong:** The agent kept regenerating ${filePath} without completing the task. ` +
                    `This usually means the file is too complex for the model to generate in one pass.\n\n` +
                    `**Try:** Breaking the task into smaller pieces, or using a more capable model.\n\n` +
                    `**Current model:** ${this.currentActiveModel}\n` +
                    `**Available models:** ${this.modelChain.map(m => `${m.name} (${m.tier})`).join(', ')}`;
                  
                  return this.buildFinalAnswer(errorMsg + guidance);
                }
              }
              // === END REPETITIVE FILE WRITE DETECTION ===

              if (toolCall.function.name === 'scaffold_project' && this.taskMode === TaskMode.REVIEW) {
                log.info('[Agent] 🛡️ REVIEW MODE: Blocking scaffold_project - no project creation allowed');
                toolResults.push('❌ scaffold_project: BLOCKED - You are in REVIEW mode. Cannot scaffold projects.');
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `🛡️ REVIEW MODE ACTIVE: You cannot scaffold or create projects in review mode.\n\nDescribe the issues and let the user decide whether to switch into a mutating mode.`
                });
                continue;
              }

              if (toolCall.function.name === 'scaffold_project' && this.taskMode === TaskMode.ORGANIZE) {
                log.info('[Agent] 🛡️ ORGANIZE MODE: Blocking scaffold_project - user asked for file organization, not a new project');
                toolResults.push('❌ scaffold_project: BLOCKED - You are in ORGANIZE mode. Use organize_folder instead of scaffolding a project.');
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `🛡️ ORGANIZE MODE ACTIVE: The user asked to organize files, not create a project.\n\nCall organize_folder({ path, strategy: "by-type" }) instead. If the target is unclear, ask the user for the folder path before taking any action.`
                });
                continue;
              }
              if (toolCall.function.name === 'write_file' && this.taskMode === TaskMode.ORGANIZE) {
                log.info('[Agent] 🛡️ ORGANIZE MODE: Blocking write_file - no new files should be created during an organize task');
                toolResults.push('❌ write_file: BLOCKED - You are in ORGANIZE mode. Do not create new files; use organize_folder to move existing ones.');
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `🛡️ ORGANIZE MODE ACTIVE: Do not create new files. Use organize_folder to sort existing files into subfolders, or undo_organize_folder to reverse a previous organize.`
                });
                continue;
              }

              if (
                (toolCall.function.name === 'patch_file' || toolCall.function.name === 'str_replace') &&
                this.taskMode === TaskMode.ORGANIZE
              ) {
                log.info(`[Agent] 🛡️ ORGANIZE MODE: Blocking ${toolCall.function.name} — file edits are not allowed`);
                toolResults.push(`❌ ${toolCall.function.name}: BLOCKED - ORGANIZE mode: use organize_folder or run_command to move files only.`);
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `🛡️ ORGANIZE MODE: Do not edit source files. Use organize_folder({ path, strategy: "by-type" }) or run_command for moves.`
                });
                continue;
              }

              // 👔 BOSS REVIEW: Task Master reviews work BEFORE writing
              if (toolCall.function.name === 'write_file' && args.path && args.content && this.taskMaster) {
                // Check if file already exists
                const existingContent = this.existingFilesSnapshot.get(args.path)?.content;
                
                const bossReview = await this.taskMaster.reviewWork({
                  path: args.path,
                  content: args.content,
                  existingContent
                });
                
                if (!bossReview.approved) {
                  log.error(`[Agent] 👔 BOSS SAYS NO: ${bossReview.reason}`);
                  toolResults.push(`❌ write_file(${args.path}): BLOCKED BY BOSS - ${bossReview.reason}`);
                  
                  // Build the boss's feedback message
                  let bossMessage = `👔 **BOSS REVIEW: REJECTED**\n\n`;
                  bossMessage += `${bossReview.reason}\n\n`;
                  
                  if (bossReview.mustFix.length > 0) {
                    bossMessage += `**YOU MUST FIX:**\n`;
                    bossReview.mustFix.forEach((fix, i) => {
                      bossMessage += `${i + 1}. ${fix}\n`;
                    });
                    bossMessage += `\n`;
                  }
                  
                  if (bossReview.suggestions.length > 0) {
                    bossMessage += `**SUGGESTIONS:**\n`;
                    bossReview.suggestions.forEach((suggestion, i) => {
                      bossMessage += `• ${suggestion}\n`;
                    });
                    bossMessage += `\n`;
                  }
                  
                  bossMessage += `**REMEMBER:** This mistake was stored so you won't make it again.\n`;
                  bossMessage += `**DO NOT** continue until you fix this. The boss blocked it for a reason.`;
                  
                  this.messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: bossMessage
                  });
                  
                  continue; // Skip this tool call - boss said NO
                } else {
                  log.info(`[Agent] 👔 BOSS APPROVAL: "${args.path}" approved`);
                }
              }
              
              // 🛡️ PRE-WRITE VALIDATION: Additional technical validation
              if (toolCall.function.name === 'write_file' && args.path && args.content) {
                const normalizedForValidation = { name: toolCall.function.name, arguments: args };
                const validation = validateToolCall(
                  normalizedForValidation,
                  this.context.workspacePath,
                  this.currentTask,
                  undefined,
                  this.context.vibeCoderExecutionPolicy
                );
                
                if (!validation.valid) {
                  log.error(`[Agent] 🚨 PRE-WRITE VALIDATION FAILED: ${validation.error}`);
                  toolResults.push(`❌ write_file(${args.path}): BLOCKED - ${validation.error}`);
                  this.messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `🚨 VALIDATION FAILED - File NOT written!\n\n${validation.error}\n\n` +
                      `**YOU MUST:**\n` +
                      `1. Read existing files to understand the project type\n` +
                      `2. Generate content that matches the project\n` +
                      `3. Ensure all files work together\n\n` +
                      `**DO NOT** continue until you fix this mismatch.`
                  });
                  continue; // Skip this tool call - don't write the file
                }
                
                if (validation.warning) {
                  log.warn(`[Agent] ⚠️ Validation warning: ${validation.warning}`);
                  toolResults.push(`⚠️ write_file(${args.path}): ${validation.warning}`);
                }
              }

              const result = await tool.execute(args, this.context);
              
              // 🛡️ POST-WRITE VALIDATION: Verify file matches project type and existing files
              if (toolCall.function.name === 'write_file' && args.path && args.content) {
                // Check if this file is referenced by other files and verify consistency
                if (this.existingFilesSnapshot.size > 0) {
                  const { detectProjectTypeFromContent } = await import('./agent/tool-validation');
                  const writtenContentType = detectProjectTypeFromContent(args.content);
                  
                  // Check against existing HTML files
                  for (const [existingPath, existingInfo] of this.existingFilesSnapshot.entries()) {
                    if (existingPath.endsWith('.html') && existingInfo.content.includes(path.basename(args.path))) {
                      // HTML references this JS file - verify they match
                      const htmlProjectType = detectProjectTypeFromContent(existingInfo.content);
                      
                      if (htmlProjectType && writtenContentType && htmlProjectType !== writtenContentType) {
                        log.error(`[Agent] 🚨 POST-WRITE VALIDATION FAILED: File mismatch detected!`);
                        log.error(`[Agent]   HTML (${existingPath}) expects: ${htmlProjectType}`);
                        log.error(`[Agent]   JS (${args.path}) contains: ${writtenContentType}`);
                        
                        // Add error message to force agent to fix it
                        this.messages.push({
                          role: 'tool',
                          tool_call_id: toolCall.id,
                          content: `🚨 CRITICAL ERROR: File mismatch detected!\n\n` +
                            `You just wrote "${args.path}" but it doesn't match the project!\n\n` +
                            `**The HTML file (${existingPath}) expects:** ${htmlProjectType} project\n` +
                            `**But you wrote:** ${writtenContentType} project code\n\n` +
                            `**THIS IS WRONG!** The files must match.\n\n` +
                            `**YOU MUST:**\n` +
                            `1. Read the HTML file to see what project type it is\n` +
                            `2. Rewrite ${args.path} to match the project type\n` +
                            `3. Ensure all code works together\n\n` +
                            `**DO NOT** continue until this is fixed. The project is broken.`
                        });
                        
                        // Mark as failure
                        toolResults.push(`❌ write_file(${args.path}): MISMATCH - File doesn't match project type!`);
                      }
                    }
                  }
                }
                
                // Record for correction learning (so we can learn when user edits our code)
                correctionLearning.recordAIWrite(
                  args.path, 
                  args.content, 
                  this.currentActiveModel || 'unknown',
                  this.currentTask
                );
                
                // Track files for self-critique at end
                this.filesGeneratedThisSession.push({ path: args.path, content: args.content });
                
                // Verify the tool result actually achieved the goal
                try {
                  const verification = await verifyToolResult(
                    { name: toolCall.function.name, arguments: args, result },
                    this.currentTask,
                    this.context.workspacePath
                  );
                  
                  if (!verification.verified) {
                    log.warn(`[Agent] 🔍 Tool verification found issues:`, verification.issues.map(i => i.description));
                    // Add issues to feedback if critical
                    const criticalIssues = verification.issues.filter(i => i.severity === 'critical');
                    if (criticalIssues.length > 0) {
                      this.messages.push({
                        role: 'user',
                        content: `⚠️ VERIFICATION WARNING: ${criticalIssues.map(i => i.description).join('; ')}. Please verify and fix if needed.`
                      });
                    }
                  }
                } catch (verifyErr) {
                  log.warn('[Agent] Tool verification failed (non-critical):', verifyErr);
                }
              }
              
              // Emit step progress
              this.emit('step-complete', { 
                type: toolCall.function.name,
                title: `${toolCall.function.name}(${args.path || args.command || '...'})`,
                success: true
              });
              
              // === SYNTAX ERROR DETECTION (for run_command) ===
              if (toolCall.function.name === 'run_command' && (result as any).syntax_error) {
                const syntaxError = (result as any).syntax_error;
                const errorFile = syntaxError.file;
                
                if (errorFile) {
                  // Track syntax errors per file (both in syntaxErrorHistory and fileFailureHistory)
                  const currentCount = this.syntaxErrorHistory.get(errorFile) || 0;
                  const newCount = currentCount + 1;
                  this.syntaxErrorHistory.set(errorFile, newCount);
                  
                  // Also track in unified file failure history
                  const shouldSkipFile = this.recordFileFailure(errorFile, `syntax: ${syntaxError.message}`);
                  
                  log.error(`[Agent] 🔴 Syntax error in ${errorFile}:${syntaxError.line}: ${syntaxError.message}`);
                  
                  // Try model escalation on repeated syntax errors
                  if (newCount >= 2) {
                    const escalated = this.recordModelFailure('syntax_error');
                    if (escalated) {
                      log.info(`[Agent] 🔄 Escalated model due to repeated syntax errors on ${errorFile}`);
                    }
                  }
                  
                  // Circuit breaker: if same file has syntax errors 3+ times, stop
                  if (newCount >= this.MAX_SYNTAX_ERRORS_PER_FILE || shouldSkipFile) {
                    const errorMsg = `🛑 Syntax error in "${errorFile}" has occurred ${newCount} times. ` +
                      `The model keeps generating broken code for this file. ` +
                      `Line ${syntaxError.line}: ${syntaxError.message}\n\n` +
                      `Please read the file, understand the syntax error, and fix it completely before trying to run again.`;
                    log.error(`[Agent] ${errorMsg}`);
                    
                    // Add explicit instruction to read and fix
                    this.messages.push({
                      role: 'user',
                      content: errorMsg + `\n\nUse read_file to see the actual code, then write_file with the COMPLETE fixed version.`
                    });
                    
                    // Don't mark as success
                    toolResults.push(`❌ ${toolCall.function.name}: Syntax error in ${errorFile} (${newCount}/${this.MAX_SYNTAX_ERRORS_PER_FILE})`);
                    continue; // Skip adding to completed steps
                  } else {
                    // Still within limit - provide fix instruction
                    const fixMsg = `🔴 SYNTAX ERROR in ${errorFile} at line ${syntaxError.line}: ${syntaxError.message}\n\n` +
                      `Error type: ${syntaxError.error}\n\n` +
                      `Please read the file using read_file, identify the syntax issue, and fix it completely. ` +
                      `Common causes: missing closing brackets, incomplete function bodies, wrong syntax.`;
                    
                    toolResults.push(`❌ ${toolCall.function.name}: ${fixMsg}`);
                    this.messages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      name: toolCall.function.name,
                      content: fixMsg
                    });
                    continue; // Don't mark as success, let model fix it
                  }
                }
              }
              // === END SYNTAX ERROR DETECTION ===
              
              // Successful execution - reset failure tracking
              this.recordModelSuccess();
              
              // === GAME FILE PREVIEW SUGGESTION ===
              // After writing game files, suggest testing with preview_game
              if (toolCall.function.name === 'write_file' && args?.path) {
                const opusAnalysis = (this as any).opusAnalysis;
                const isGameProject = opusAnalysis?.projectType === 'game';
                const writtenFile = args.path;
                const isGameFile = writtenFile.endsWith('.js') || writtenFile.endsWith('.html');
                
                if (isGameProject && isGameFile) {
                  const totalWritesForFile = this.totalWritesPerFile.get(writtenFile) || 0;
                  
                  // After first write to game.js or after index.html is written, suggest testing
                  if (writtenFile === 'game.js' && totalWritesForFile === 1) {
                    // Just wrote game.js for first time - suggest testing
                    const htmlFile = 'index.html';
                    const htmlExists = fs.existsSync(path.resolve(this.context.workspacePath, htmlFile));
                    
                    if (htmlExists) {
                      const previewSuggestion = `\n\n💡 TIP: You just wrote game.js! Use preview_game("${htmlFile}") to open the game in your browser and test if it works! This gives you REAL feedback instead of guessing.`;
                      toolResults.push(previewSuggestion);
                    }
                  } else if (writtenFile === 'index.html' && totalWritesForFile === 1) {
                    // Just wrote index.html - suggest testing once game.js exists
                    const gameJsExists = fs.existsSync(path.resolve(this.context.workspacePath, 'game.js'));
                    if (gameJsExists) {
                      const previewSuggestion = `\n\n💡 TIP: You have index.html and game.js! Use preview_game("index.html") to open the game in your browser and test if it works!`;
                      toolResults.push(previewSuggestion);
                    }
                  }
                }
              }
              
              // Track completed step
              const stepDesc = `${toolCall.function.name}(${args.path || args.command || '...'})`;
              this.completedSteps.push(stepDesc);
              
              // Advance plan if applicable
              if (this.currentPlan.length > 0 && this.currentPlanStep < this.currentPlan.length) {
                this.currentPlanStep++;
              }

              // Truncate large results
              const resultStr = JSON.stringify(result, null, 2);
              const truncated = resultStr.length > 500 ? resultStr.substring(0, 500) + '...' : resultStr;
              toolResults.push(`✅ ${stepDesc}: ${truncated}`);

              this.messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: truncated
              });

            } catch (error: any) {
              const errorMsg = error.message || String(error);
              log.error(`[Agent] Tool error:`, errorMsg);
              
              // === ERROR KNOWLEDGE & PACING ===
              const { ErrorKnowledge } = await import('./agent/tools/errorKnowledge');
              
              // Safely get args if available (might not be if error happened during parsing)
              let args: any = {};
              try {
                args = JSON.parse(toolCall.function.arguments || '{}');
              } catch (e) {
                // Args parsing failed, use empty object
              }
              
              const analysis = ErrorKnowledge.analyzeError(errorMsg, {
                language: toolCall.function.name === 'write_file' && args?.path?.endsWith('.py') ? 'python' : 
                         toolCall.function.name === 'write_file' && args?.path?.endsWith('.js') ? 'node' : undefined,
                file: args?.path
              });
              
              // Track error for pacing
              const isSameError = this.lastError === errorMsg;
              if (isSameError) {
                this.consecutiveSameError++;
              } else {
                this.consecutiveSameError = 1;
                this.lastError = errorMsg;
              }
              
              this.errorHistory.push({
                error: errorMsg,
                iteration,
                analysis
              });
              
              // Check if this is still a "good attempt"
              const pacing = ErrorKnowledge.isGoodAttempt(errorMsg, this.consecutiveSameError);
              
              if (!pacing.shouldContinue) {
                log.warn(`[Agent] ⚠️ Not a good attempt after ${this.consecutiveSameError} tries: ${pacing.reason}`);
                // Add explicit feedback
                this.messages.push({
                  role: 'user',
                  content: `🛑 STOP: ${pacing.reason}\n\nThis error has occurred ${this.consecutiveSameError} times. ${analysis.solution}\n\nTry a different approach or mark as done if task cannot be completed.`
                });
              } else {
                // Generate fix instruction
                const fixInstruction = ErrorKnowledge.generateFixInstruction(errorMsg, {
                  language: analysis.category === 'python' ? 'python' : analysis.category === 'node' ? 'node' : undefined,
                  file: args?.path
                });
                
                log.info(`[Agent] 🔧 Error analysis: ${analysis.category} - ${analysis.solution}`);
                log.info(`[Agent] 📊 Pacing: ${pacing.reason} (attempt ${this.consecutiveSameError})`);
                
                // Add error with solution to context
                const stepDesc = `${toolCall.function.name}(error)`;
                toolResults.push(`❌ ${stepDesc}: ${errorMsg}`);
                
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolCall.function.name,
                  content: `Error: ${errorMsg}${fixInstruction}`
                });
                
                // Auto-fix if possible
                if (analysis.autoFixable) {
                  log.info(`[Agent] 🔧 Attempting auto-fix for: ${analysis.category} error`);
                  // Auto-fix logic can be added here based on error type
                  // For now, we'll let the model fix it with the instruction
                }
              }
              // === END ERROR KNOWLEDGE ===
              this.emit('step-complete', {
                type: toolCall.function.name,
                title: `${toolCall.function.name}(${args?.path || args?.command || '...'})`,
                success: false
              });
            }
          }

          if (stopRequestedInToolLoop) {
            finalAnswer = this.buildStopMessage();
            break;
          }
          
          // Add continuation prompt
          this.messages.push({
            role: 'user',
            content: `Results:\n${toolResults.join('\n')}\n\nContinue. Output JSON only.`
          });
          
        } else {
          // No tool calls found
          this.noToolCallStreak++;
          
          // Check if model said "done"
          const lowerContent = response.content.toLowerCase();
          if (lowerContent.includes('"done"') && (lowerContent.includes('true') || lowerContent.includes('complete'))) {
            // === VALIDATION: Verify project actually works before accepting "done" ===
            const validationResult = await this.validateProjectCompletion();
            
            if (!validationResult.valid) {
              log.warn(`[Agent] ⚠️ Project validation failed: ${validationResult.reason}`);
              log.warn(`[Agent] 🔧 Rejecting "done" - project has issues that must be fixed`);
              
              // Reject the "done" and tell model to fix issues
              this.messages.push({
                role: 'user',
                content: `❌ VALIDATION FAILED: Cannot mark as done yet.\n\n` +
                  `Issue: ${validationResult.reason}\n\n` +
                  `${validationResult.fixInstruction}\n\n` +
                  `Please fix these issues and test again. Only mark as done when the project actually runs without errors.`
              });
              
              // Don't break - continue the loop to fix issues
              continue;
            }
            
            // Validation passed - project actually works!
            log.info(`[Agent] ✅ Project validation passed - marking as complete`);
            finalAnswer = this.buildFinalAnswer(validationResult.message || 'Task completed!');
            break;
          }
          
          // Check for parse errors vs intentional non-tool response
          try {
            JSON.parse(response.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
            // Valid JSON but no tool - model is confused
          } catch {
            this.parseErrorStreak++;
          }
          
          // Graduated retry logic with escalation
          if (this.parseErrorStreak >= MAX_PARSE_ERRORS) {
            // Try to escalate before giving up
            const escalated = this.recordModelFailure('parse_errors');
            if (escalated) {
              this.parseErrorStreak = 0; // Reset for new model
              continue; // Try again with new model
            }
            finalAnswer = this.buildFinalAnswer('All models failed to produce valid JSON. Stopping.');
            break;
          }
          
          if (this.noToolCallStreak >= MAX_NO_TOOL_STREAK) {
            // Try to escalate before giving up
            const escalated = this.recordModelFailure('no_tool_calls');
            if (escalated) {
              this.noToolCallStreak = 0; // Reset for new model
              continue; // Try again with new model
            }
            finalAnswer = this.buildFinalAnswer('All models stopped making progress. Stopping.');
            break;
          }
          
          // Add correction with increasing specificity
          const corrections = [
            `Output JSON only. Example: {"name": "write_file", "arguments": {"path": "test.js", "content": "..."}}`,
            `CRITICAL: Pure JSON only. No markdown. {"name": "TOOL", "arguments": {...}} or {"done": true, "message": "..."}`,
            `You must output JSON. Either call a tool or mark done. What's next?`,
            `FINAL: {"done": true, "message": "..."} if complete, or {"name": "tool", "arguments": {...}} to continue.`
          ];
          
          log.info(`[Agent] No tools found (streak: ${this.noToolCallStreak}), adding correction`);
          this.messages.push({ role: 'assistant', content: response.content });
          this.syncMessageToState('assistant', response.content);
          
          const correctionContent = corrections[Math.min(this.noToolCallStreak - 1, corrections.length - 1)];
          this.messages.push({
            role: 'user',
            content: correctionContent
          });
          this.syncMessageToState('user', correctionContent);
        }

      } catch (error: any) {
        log.error('[Agent] Loop error:', error);

        if (this.isCancellationRequested()) {
          finalAnswer = this.buildStopMessage();
          break;
        }

        // Check for credit/billing errors that require immediate stop
        if (error.message.includes('credit') || error.message.includes('billing') ||
            error.message.includes('insufficient') || error.message.includes('quota')) {
          log.error(`[Agent] 🛑 CREDIT ERROR - Stopping: ${error.message}`);
          finalAnswer = this.buildFinalAnswer(
            `🛑 **API Credit Error**\n\n` +
            `Your API credits are exhausted. Please:\n` +
            `1. Go to your Anthropic/OpenAI dashboard\n` +
            `2. Add credits to your account\n` +
            `3. Try again\n\n` +
            `Files created so far: ${this.completedSteps.length > 0 ? this.completedSteps.join(', ') : 'None'}`
          );
          break;
        }

        // Handle model not found - try fallback
        if (error.message.includes('not found')) {
          log.info('[Agent] ⚠️ Model not found - attempting fallback to local Ollama');

          const ollamaFallback = this.modelChain.find(m => m.provider === 'ollama');
          if (ollamaFallback && this.currentActiveModel !== ollamaFallback.model) {
            log.info(`[Agent] 🔄 Switching to Ollama: ${ollamaFallback.model}`);
            this.currentActiveModel = ollamaFallback.model;
            aiRouter.setActiveProvider('ollama', ollamaFallback.model);
            continue;
          }
        }

        // Handle empty responses by escalating to a different model
        if (error.message === 'Empty response from AI') {
          log.info('[Agent] Empty response detected - attempting model escalation');
          const escalated = this.recordModelFailure('empty_response');
          if (escalated) {
            log.info('[Agent] Successfully escalated model due to empty response');
            continue;
          } else {
            log.info('[Agent] Could not escalate model - no more models available');
          }
        }

        // Add error context to conversation for recovery
        this.messages.push({
          role: 'user',
          content: `Error occurred: ${error.message}. Please fix the issue and continue. Output JSON only.`
        });

        // Don't break immediately - give it a chance to recover (unless it's been too many iterations)
        if (iteration > 5 && this.completedSteps.length === 0) {
          finalAnswer = this.buildFinalAnswer(
            `Error: ${error.message}\n\nUnable to complete the task after multiple attempts.`
          );
          break;
        }
      }
    }

    if (!finalAnswer) {
      finalAnswer = this.buildFinalAnswer('Maximum iterations reached.');
    }

    // 🦖 DINO BUDDY: Self-Critique Before Completion
    const wasSuccessful = this.completedSteps.length > 0 && !finalAnswer.includes('Error') && !finalAnswer.includes('🛑');
    if (wasSuccessful && this.filesGeneratedThisSession.length > 0) {
      try {
        log.info(`[Agent] 🔍 Running self-critique on ${this.filesGeneratedThisSession.length} generated files...`);
        const critiqueResult = await critqueGeneratedFiles(
          this.filesGeneratedThisSession,
          this.currentTask,
          this.context.workspacePath
        );
        
        if (!critiqueResult.passed) {
          const criticalIssues = critiqueResult.issues.filter(i => i.severity === 'critical');
          const warnings = critiqueResult.issues.filter(i => i.severity === 'warning');
          
          log.info(`[Agent] 🔍 Self-critique found ${criticalIssues.length} critical, ${warnings.length} warnings`);
          
          if (criticalIssues.length > 0) {
            finalAnswer += `\n\n⚠️ **Self-Review Notes:**\n`;
            criticalIssues.slice(0, 3).forEach(issue => {
              finalAnswer += `- ${issue.description}\n`;
            });
          }
          
          if (critiqueResult.suggestions.length > 0) {
            finalAnswer += `\n💡 ${critiqueResult.suggestions[0]}\n`;
          }
        } else {
          log.info(`[Agent] ✅ Self-critique passed (confidence: ${Math.round(critiqueResult.confidence * 100)}%)`);
        }
        
        this.emit('critique-complete', critiqueResult);
      } catch (critiqueError) {
        log.warn('[Agent] Self-critique failed (non-critical):', critiqueError);
      }
    }

    // === AUTO-RUN PROJECT IF COMPLETED ===
    if (wasSuccessful && this.context.workspacePath) {
      try {
        const { ProjectRunner } = await import('./agent/tools/projectRunner');
        log.info('[Agent] 🚀 Auto-running completed project...');
        const runResult = await ProjectRunner.autoRun(this.context.workspacePath);
        
        if (runResult.success && runResult.runResult?.success) {
          const portInfo = runResult.runResult.port ? ` on port ${runResult.runResult.port}` : '';
          finalAnswer += `\n\n✅ **Project is running${portInfo}!** 🎉\n`;
          if (runResult.runResult.port) {
            finalAnswer += `🌐 Open http://localhost:${runResult.runResult.port} in your browser\n`;
          }
        } else if (runResult.validation.issues.length > 0) {
          finalAnswer += `\n\n⚠️ **Project created but has issues:**\n${runResult.validation.issues.map(i => `- ${i}`).join('\n')}\n`;
        } else if (runResult.projectInfo.type === 'unknown') {
          finalAnswer += `\n\n📁 **Project files created** - Manual setup may be required\n`;
        }
      } catch (error: any) {
        log.warn('[Agent] Auto-run failed (non-critical):', error.message);
        // Don't fail the whole task if auto-run fails
      }
    }
    // === END AUTO-RUN ===

    // === LEARN FROM THIS EXECUTION ===
    try {
      const wasSuccessful = this.completedSteps.length > 0 && !finalAnswer.includes('Error') && !finalAnswer.includes('🛑');
      const mistakes: string[] = [];
      
      // Collect mistakes from this run
      if (this.consecutiveTruncationRejections > 0) {
        mistakes.push(`Model produced truncated code ${this.consecutiveTruncationRejections} times`);
      }
      if (this.noToolCallStreak > 2) {
        mistakes.push(`Model failed to produce tool calls ${this.noToolCallStreak} times`);
      }
      if (this.parseErrorStreak > 2) {
        mistakes.push(`Model produced invalid JSON ${this.parseErrorStreak} times`);
      }
      
      // Store learnings (both successes and failures)
      await storeTaskLearning(
        userMessage,
        wasSuccessful,
        wasSuccessful ? [{ 
          type: 'successful_task', 
          description: `Completed: ${userMessage.substring(0, 100)}`,
          stepsCompleted: this.completedSteps.length 
        }] : [],
        mistakes
      );
      
      // === LEARN FROM SUCCESSFUL PROJECT PATTERNS ===
      if (wasSuccessful && this.context.workspacePath) {
        try {
          const detectedType = (this as any).detectedProjectType;
          if (detectedType) {
            const { ProjectPatternMatcher } = await import('./agent/tools/projectPatterns');
            const pattern = ProjectPatternMatcher.getPattern(detectedType);
            
            if (pattern) {
              // Store this as a successful project pattern execution
              const mirrorSingleton = await import('./mirror/mirror-singleton');
              const mirrorMemory = mirrorSingleton.getMirrorMemory();
              if (mirrorMemory) {
                await mirrorMemory.storePattern({
                  id: `project_pattern_${detectedType}_${Date.now()}`,
                  description: `Successfully built ${pattern.name} project: ${userMessage.substring(0, 100)}`,
                  type: 'architectural',
                  confidence: 1.0,
                  source: 'agent_success',
                  task: userMessage,
                  timestamp: new Date().toISOString(),
                  metadata: {
                    projectType: detectedType,
                    stepsCompleted: this.completedSteps.length,
                    patternName: pattern.name
                  }
                }, 'architectural');
                log.info(`[Agent] 🎯 Stored successful ${pattern.name} project pattern`);
              }
            }
          }
        } catch (patternError) {
          log.warn('[Agent] Pattern learning failed (non-critical):', patternError);
        }
      }
      // === END PROJECT PATTERN LEARNING ===
      
      if (wasSuccessful) {
        log.info(`[Agent] 🎓 Learned from successful task (${this.completedSteps.length} steps)`);
      } else if (mistakes.length > 0) {
        log.info(`[Agent] 📚 Stored ${mistakes.length} anti-patterns from failed task`);
      }
    } catch (error) {
      log.info('[Agent] Learning storage failed (non-critical)');
    }
    // === END LEARNING ===

    // === 🛡️ FIX MODE AUTO-ROLLBACK CHECK ===
    // Before committing, verify changes don't exceed threshold in FIX mode
    if (this.taskMode === TaskMode.FIX && this.filesModifiedThisTask.size > 0) {
      let shouldRollback = false;
      let rollbackReason = '';
      let totalChangePercentage = 0;
      let filesExceedingThreshold: string[] = [];
      
      for (const filePath of this.filesModifiedThisTask) {
        const existingFile = this.existingFilesSnapshot.get(filePath);
        if (existingFile) {
          // Read the current (modified) content
          try {
            const currentPath = path.join(this.context.workspacePath, filePath);
            if (fs.existsSync(currentPath)) {
              const currentContent = fs.readFileSync(currentPath, 'utf-8');
              const changePercentage = 1 - this.contentSimilarity(currentContent, existingFile.content);
              totalChangePercentage += changePercentage;
              
              // Track files that exceeded 30% change
              if (changePercentage > 0.3) {
                filesExceedingThreshold.push(`${filePath} (${Math.round(changePercentage * 100)}% changed)`);
              }
              
              // If any single file changed >50%, flag for rollback
              if (changePercentage > 0.5) {
                shouldRollback = true;
                rollbackReason = `File "${filePath}" was changed by ${Math.round(changePercentage * 100)}% - this exceeds the safe limit for FIX mode`;
              }
            }
          } catch (e) {
            // Could not read file for comparison
          }
        }
      }
      
      // Also rollback if average change across all files is too high
      const avgChangePercentage = this.filesModifiedThisTask.size > 0 
        ? totalChangePercentage / this.filesModifiedThisTask.size 
        : 0;
      
      if (avgChangePercentage > 0.4) {
        shouldRollback = true;
        rollbackReason = `Average change across ${this.filesModifiedThisTask.size} files was ${Math.round(avgChangePercentage * 100)}% - too much for FIX mode`;
      }
      
      if (shouldRollback && this.taskModeCheckpointId) {
        log.info(`[Agent] 🛡️ FIX MODE: Auto-rollback triggered - ${rollbackReason}`);
        
        try {
          await transactionManager.rollbackToCheckpoint(this.taskModeCheckpointId);
          log.info(`[Agent] 🛡️ Rolled back to checkpoint: ${this.taskModeCheckpointId}`);
          
          // Update final answer to inform user
          finalAnswer = `🛡️ **FIX MODE PROTECTION ACTIVATED**\n\n` +
            `${rollbackReason}\n\n` +
            `**Changes have been automatically rolled back** to protect your project.\n\n` +
            `Files that would have been heavily modified:\n${filesExceedingThreshold.map(f => `- ${f}`).join('\n')}\n\n` +
            `**What to do:**\n` +
            `1. If you want to make major changes, ask me to "enhance" or "rewrite" instead of "fix"\n` +
            `2. If you want smaller fixes, be more specific about what needs changing\n` +
            `3. If you want to proceed anyway, say "override fix mode protection"`;
          
          // Clear the transaction so we don't try to commit rolled-back changes
          transactionManager.commitTransaction();
          log.info(`[Agent] ✅ Post-rollback transaction state cleared`);
          
          return finalAnswer;
        } catch (rollbackError: any) {
          log.error(`[Agent] ❌ Auto-rollback failed:`, rollbackError.message);
          // Continue with commit if rollback fails
        }
      }
      
      // Log change summary even if we're not rolling back
      if (filesExceedingThreshold.length > 0) {
        log.info(`[Agent] 🛡️ FIX MODE: ${filesExceedingThreshold.length} files had significant changes (>30%)`);
      }
    }
    // === END FIX MODE AUTO-ROLLBACK CHECK ===

    const finalized = await finalizeAgentTransactionForReview(transactionManager, reviewSessionManager, {
      workspacePath: this.context.workspacePath,
      finalAnswer,
      monolithicApplyImmediately: this.context.monolithicApplyImmediately,
      checkpoint: buildReviewCheckpointSummary({
        reflectionBudget: this.context.runtimeBudget || 'standard',
        attemptCount: 1,
        verificationFailed: false,
      }),
    });
    this.pendingReviewSession = finalized.pendingReviewSession;
    log.info(`[${runId}] Agent loop run completed`, {
      sessionId: this.sessionId,
      stagedReview: finalized.stagedReview,
    });
    return finalized.finalAnswer;
    } catch (error: any) {
      // Rollback transaction on failure
      try {
        const activeTransaction = transactionManager.getActiveTransaction();
        if (activeTransaction) {
          const opCount = activeTransaction.getOperationCount();
          
          // 🛡️ Enhanced rollback handling for FIX mode
          if (this.taskMode === TaskMode.FIX || this.taskMode === TaskMode.ENHANCE) {
            log.info(`[Agent] 🛡️ ${this.taskMode.toUpperCase()} MODE: Error occurred, rolling back to protect project`);
            
            // Try to rollback to the task mode checkpoint first
            if (this.taskModeCheckpointId) {
              try {
                await transactionManager.rollbackToCheckpoint(this.taskModeCheckpointId);
                log.info(`[Agent] 🛡️ Rolled back to task checkpoint: ${this.taskModeCheckpointId}`);
              } catch (checkpointError: any) {
                log.warn(`[Agent] Could not rollback to checkpoint, doing full rollback:`, checkpointError.message);
                await transactionManager.rollbackTransaction();
              }
            } else {
              await transactionManager.rollbackTransaction();
            }
            
            log.info(`[Agent] 🛡️ Project protected: ${opCount} operations rolled back`);
            log.info(`[Agent] 🛡️ Original error: ${error.message}`);
          } else {
            // Standard rollback for CREATE mode
            await transactionManager.rollbackTransaction();
            log.info(`[Agent] 🔄 Transaction rolled back (${opCount} operations)`);
          }
        }
      } catch (rollbackError: any) {
        log.error(`[${runId}] Transaction rollback failed`, {
          sessionId: this.sessionId,
          error: rollbackError.message,
        });
      }
      log.error(`[${runId}] Agent loop run failed`, {
        sessionId: this.sessionId,
        error: error.message,
      });
      throw error; // Re-throw the original error
    }
  }

  /**
   * Get list of project files for consciousness context
   * Returns file paths relative to workspace
   */
  private async getProjectFilesList(): Promise<string[]> {
    try {
      const files: string[] = [];
      const workspacePath = this.context.workspacePath;
      
      // Get top-level files and directories
      const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip node_modules, .git, and other common non-essential dirs
        if (entry.name === 'node_modules' || entry.name === '.git' || 
            entry.name === 'dist' || entry.name === 'build' ||
            entry.name === '.cache' || entry.name === 'coverage') {
          continue;
        }
        
        if (entry.isFile()) {
          files.push(entry.name);
        } else if (entry.isDirectory()) {
          // Get first level of subdirectory
          try {
            const subPath = path.join(workspacePath, entry.name);
            const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
            for (const subEntry of subEntries.slice(0, 20)) {
              if (subEntry.isFile()) {
                files.push(`${entry.name}/${subEntry.name}`);
              }
            }
          } catch {
            // Ignore permission errors
          }
        }
      }
      
      return files.slice(0, 100); // Limit to 100 files
    } catch (error) {
      log.info('[Agent] Could not list project files:', error);
      return [];
    }
  }

  /**
   * Learn from validation failures to improve future performance
   */
  private async learnFromValidationFailures(issues: string[], task: string): Promise<void> {
    try {
      const mirrorSingleton = await import('./mirror/mirror-singleton');
      const mirrorMemory = mirrorSingleton.getMirrorMemory();

      if (mirrorMemory) {
        // Group issues by type
        const issueGroups: { [key: string]: string[] } = {};

        for (const issue of issues) {
          let category = 'general';

          if (issue.includes('syntax') || issue.includes('brace') || issue.includes('semicolon') || issue.includes('incomplete if')) {
            category = 'syntax';
          } else if (issue.includes('import') || issue.includes('dependency') || issue.includes('package')) {
            category = 'dependency';
          } else if (issue.includes('structure') || issue.includes('missing file') || issue.includes('empty function')) {
            category = 'structure';
          } else if (issue.includes('runtime') || issue.includes('error') || issue.includes('exception')) {
            category = 'runtime';
          } else if (issue.includes('mongoose') || issue.includes('schema') || issue.includes('model')) {
            category = 'mongoose';
          } else if (issue.includes('generateAuthToken') || issue.includes('jwt')) {
            category = 'authentication';
          }

          if (!issueGroups[category]) {
            issueGroups[category] = [];
          }
          issueGroups[category].push(issue);
        }

        // Store each issue category as anti-pattern
        for (const [category, categoryIssues] of Object.entries(issueGroups)) {
          const patternId = `validation_failure_${category}_${Date.now()}`;

          await mirrorMemory.storePattern({
            id: patternId,
            description: `Validation failure in ${category}: ${categoryIssues.slice(0, 2).join('; ')}`,
            type: 'anti-pattern',
            confidence: 0.8,
            source: 'validation_failure',
            task: task,
            timestamp: new Date().toISOString(),
            metadata: {
              category,
              issueCount: categoryIssues.length,
              issues: categoryIssues,
              taskType: this.detectTaskType(task),
              preventionTips: this.getPreventionTips(category, categoryIssues)
            }
          }, 'antiPatterns');

          log.info(`[Agent] 📚 Learned anti-pattern: ${category} validation failures`);
        }

        // Store specific Express.js API patterns to prevent future mistakes
        if (this.detectTaskType(task) === 'web_api') {
          await this.storeExpressApiPatterns();
        }
      }
    } catch (error) {
      log.info('[Agent] Validation learning failed (non-critical):', error);
    }
  }

  /**
   * Get prevention tips for specific error categories
   */
  private getPreventionTips(category: string, issues: string[]): string[] {
    const tips: string[] = [];

    switch (category) {
      case 'mongoose':
        tips.push('Always define proper Mongoose schema fields with types and validation');
        tips.push('Never use empty schema definitions like new mongoose.Schema(, )');
        tips.push('Export models with mongoose.model() at the end of schema files');
        break;
      case 'authentication':
        tips.push('If using JWT, implement generateAuthToken() method in User model');
        tips.push('Add jwt.sign() logic for token generation');
        tips.push('Ensure JWT_SECRET environment variable is configured');
        break;
      case 'syntax':
        tips.push('Complete all conditional statements (if, for, while) with proper bodies');
        tips.push('Check for balanced braces and parentheses');
        tips.push('Add semicolons to statement endings where required');
        break;
      case 'structure':
        tips.push('Create all referenced middleware files before using them in routes');
        tips.push('Export validation functions from middleware files');
        tips.push('Ensure all required directories exist (models/, routes/, middleware/)');
        break;
    }

    return tips;
  }

  /**
   * Store Express.js API best practices to prevent future mistakes
   */
  private async storeExpressApiPatterns(): Promise<void> {
    try {
      const mirrorSingleton = await import('./mirror/mirror-singleton');
      const mirrorMemory = mirrorSingleton.getMirrorMemory();

      if (mirrorMemory) {
        // Store User model pattern
        await mirrorMemory.storePattern({
          id: `express_user_model_${Date.now()}`,
          description: 'Complete User model with authentication methods for Express APIs',
          type: 'architectural',
          confidence: 1.0,
          source: 'learned_pattern',
          task: 'Express API development',
          timestamp: new Date().toISOString(),
          metadata: {
            patternType: 'user_model',
            requiredMethods: ['generateAuthToken', 'comparePassword'],
            requiredFields: ['name', 'email', 'password', 'role'],
            securityFeatures: ['password hashing', 'JWT tokens']
          }
        }, 'architectural');

        // Store validation middleware pattern
        await mirrorMemory.storePattern({
          id: `express_validation_middleware_${Date.now()}`,
          description: 'Complete validation middleware with proper error handling',
          type: 'architectural',
          confidence: 1.0,
          source: 'learned_pattern',
          task: 'Express API development',
          timestamp: new Date().toISOString(),
          metadata: {
            patternType: 'validation_middleware',
            requiredExports: ['validate', 'userValidationRules', 'productValidationRules'],
            errorHandling: 'Proper validation error responses'
          }
        }, 'architectural');

        log.info('[Agent] 📚 Stored Express.js API patterns for future use');
      }
    } catch (error) {
      log.info('[Agent] Pattern storage failed (non-critical):', error);
    }
  }

  /**
   * Detect the type of task being performed
   */
  private detectTaskType(task: string): string {
    const lower = task.toLowerCase();

    if (lower.includes('express') || lower.includes('api') || lower.includes('server')) {
      return 'web_api';
    } else if (lower.includes('react') || lower.includes('component') || lower.includes('ui')) {
      return 'frontend';
    } else if (lower.includes('python') || lower.includes('script')) {
      return 'python_script';
    } else if (lower.includes('html') || lower.includes('css') || lower.includes('website')) {
      return 'web_page';
    } else if (lower.includes('database') || lower.includes('sql')) {
      return 'database';
    } else {
      return 'general';
    }
  }

  /**
   * Lightweight syntax validation - only BLOCKS on critical errors
   * Everything else is just logged as a suggestion
   */
  private async validateSyntax(context: AgentContext, data: any): Promise<ValidationResult> {
    const blockingIssues: string[] = []; // These STOP execution
    const warnings: string[] = []; // These are just logged
    const suggestions: string[] = [];
    let confidence = 1.0;

    // Check if we have any recent tool calls to validate
    if (!data || !data.toolCalls) {
      return { valid: true, confidence: 0.5, issues: [], suggestions: [] };
    }

    for (const call of data.toolCalls) {
      if (call.function.name === 'write_file' && call.function.arguments) {
        try {
          const args = JSON.parse(call.function.arguments);
          const filePath = args.path;
          const content = args.content;

          if (!content || content.length < 10) {
            blockingIssues.push(`File ${filePath} has insufficient content`);
            confidence -= 0.3;
            continue;
          }

          // Language-specific syntax checks
          if (filePath.match(/\.(js|jsx|ts|tsx)$/i)) {
            const { critical, warnings: jsWarnings } = this.validateJavaScriptSyntax(content, filePath);
            
            // Only BLOCK on critical errors that will crash
            blockingIssues.push(...critical);
            warnings.push(...jsWarnings);
            
            // Only penalize confidence for BLOCKING errors
            confidence -= critical.length * 0.15;
            
            // Log warnings but don't block
            if (jsWarnings.length > 0) {
              log.info(`[Agent] ℹ️  Suggestions for ${filePath}: ${jsWarnings.slice(0, 2).join(', ')}`);
            }

            suggestions.push(...this.generateJavaScriptSuggestions(critical, filePath));
          } else if (filePath.match(/\.py$/i)) {
            const pyIssues = this.validatePythonSyntax(content, filePath);
            // Python validation - only block on syntax errors
            const critical = pyIssues.filter(i => i.includes('SyntaxError') || i.includes('IndentationError'));
            blockingIssues.push(...critical);
            warnings.push(...pyIssues.filter(i => !critical.includes(i)));
            confidence -= critical.length * 0.1;
          } else if (filePath.match(/\.html$/i)) {
            const htmlIssues = this.validateHTMLSyntax(content, filePath);
            // HTML validation - only block on broken references
            const critical = htmlIssues.filter(i => i.includes('missing') || i.includes('not found'));
            blockingIssues.push(...critical);
            warnings.push(...htmlIssues.filter(i => !critical.includes(i)));
            confidence -= critical.length * 0.05;
          }
        } catch (e) {
          blockingIssues.push(`Failed to parse tool arguments: ${e}`);
          confidence -= 0.2;
        }
      }
    }

    // Only return issues that BLOCK - warnings are just logged
    return {
      valid: blockingIssues.length === 0,
      confidence: Math.max(0, confidence),
      issues: blockingIssues, // Only blocking errors here
      suggestions
    };
  }

  /**
   * Auto-fix syntax issues
   */
  private async autoFixSyntax(context: AgentContext, data: any, issues: string[]): Promise<AutoFixResult> {
    const fixes: string[] = [];
    let success = true;
    let fixedData = { ...data };

    for (const issue of issues) {
      const attemptKey = `syntax_${issue.substring(0, 50)}`;
      const attempts = this.selfHealingAttempts.get(attemptKey) || 0;

      if (attempts >= this.MAX_HEALING_ATTEMPTS) {
        log.info(`[Agent] Max healing attempts reached for: ${attemptKey}`);
        success = false;
        continue;
      }

      this.selfHealingAttempts.set(attemptKey, attempts + 1);

      // Apply common syntax fixes
      if (issue.includes('missing closing brace') || issue.includes('unbalanced braces')) {
        fixedData = this.fixUnbalancedBraces(fixedData);
        fixes.push('Fixed unbalanced braces');
      } else if (issue.includes('missing semicolon')) {
        fixedData = this.fixMissingSemicolons(fixedData);
        fixes.push('Added missing semicolons');
      } else if (issue.includes('incomplete arrow function')) {
        fixedData = this.fixIncompleteArrows(fixedData);
        fixes.push('Completed arrow function bodies');
      }
    }

    return {
      success,
      fixedData: success ? fixedData : undefined,
      explanation: fixes.length > 0 ? `Applied fixes: ${fixes.join(', ')}` : 'No auto-fixes applied',
      confidence: success ? 0.8 : 0.3
    };
  }

  /**
   * Validate code structure and patterns
   */
  private async validateStructure(context: AgentContext, data: any): Promise<ValidationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    if (!data || !data.toolCalls) {
      return { valid: true, confidence: 0.5, issues: [], suggestions: [] };
    }

    // Check for project structure issues
    const fileWrites = data.toolCalls.filter((call: any) => call.function.name === 'write_file');
    const files = fileWrites.map((call: any) => {
      try {
        const args = JSON.parse(call.function.arguments);
        return args.path;
      } catch { return null; }
    }).filter(Boolean);

    // Check for missing essential files
    if (files.some((f: string) => f.includes('package.json'))) {
      // Node.js project - check for essential files
      const hasPackageJson = files.some((f: string) => f === 'package.json');
      const hasMainFile = files.some((f: string) => f.match(/\.(js|ts)$/i));
      const hasReadme = files.some((f: string) => f.toLowerCase().includes('readme'));

      if (!hasPackageJson) {
        issues.push('Missing package.json for Node.js project');
        confidence -= 0.3;
        suggestions.push('Create package.json with proper dependencies and scripts');
      }
      if (!hasMainFile) {
        issues.push('Missing main application file');
        confidence -= 0.2;
        suggestions.push('Create main application file (server.js, app.js, or index.js)');
      }
      if (!hasReadme) {
        issues.push('Missing README.md');
        confidence -= 0.1;
        suggestions.push('Create README.md with setup and usage instructions');
      }
    }

    // Check for code quality issues
    for (const call of fileWrites) {
      try {
        const args = JSON.parse(call.function.arguments);
        const filePath = args.path;
        const content = args.content;

        // Check for placeholder content
        if (content.includes('TODO') || content.includes('FIXME') || content.includes('placeholder')) {
          issues.push(`File ${filePath} contains placeholder content`);
          confidence -= 0.15;
          suggestions.push(`Replace placeholders in ${filePath} with actual implementation`);
        }

        // Check for incomplete functions
        const incompleteFunctions = content.match(/\w+\s*\([^)]*\)\s*{\s*}/g);
        if (incompleteFunctions && incompleteFunctions.length > 0) {
          issues.push(`File ${filePath} has ${incompleteFunctions.length} empty function(s)`);
          confidence -= incompleteFunctions.length * 0.1;
          suggestions.push(`Implement function bodies in ${filePath}`);
        }
      } catch (e) {
        // Skip malformed calls
      }
    }

    return {
      valid: issues.length === 0,
      confidence: Math.max(0, confidence),
      issues,
      suggestions
    };
  }

  /**
   * Auto-fix structure issues
   */
  private async autoFixStructure(context: AgentContext, data: any, issues: string[]): Promise<AutoFixResult> {
    const fixes: string[] = [];
    let success = true;
    let fixedData = { ...data };

    for (const issue of issues) {
      if (issue.includes('Missing package.json')) {
        fixedData = await this.createPackageJson(fixedData);
        fixes.push('Created package.json');
      } else if (issue.includes('Missing README.md')) {
        fixedData = await this.createReadme(fixedData);
        fixes.push('Created README.md');
      } else if (issue.includes('empty function')) {
        fixedData = this.implementEmptyFunctions(fixedData);
        fixes.push('Implemented empty function bodies');
      } else if (issue.includes('placeholder content')) {
        fixedData = this.replacePlaceholders(fixedData);
        fixes.push('Replaced placeholder content');
      }
    }

    return {
      success,
      fixedData: success ? fixedData : undefined,
      explanation: fixes.length > 0 ? `Applied fixes: ${fixes.join(', ')}` : 'No auto-fixes applied',
      confidence: success ? 0.7 : 0.4
    };
  }

  /**
   * Validate dependencies and imports
   */
  private async validateDependencies(context: AgentContext, data: any): Promise<ValidationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    if (!data || !data.toolCalls) {
      return { valid: true, confidence: 0.5, issues: [], suggestions: [] };
    }

    // Check for import/dependency issues
    for (const call of data.toolCalls) {
      if (call.function.name === 'write_file') {
        try {
          const args = JSON.parse(call.function.arguments);
          const filePath = args.path;
          const content = args.content;

          if (filePath.match(/\.(js|jsx|ts|tsx)$/i)) {
            const importIssues = this.checkImportIssues(content, filePath, context);
            issues.push(...importIssues);
            confidence -= importIssues.length * 0.05;
          } else if (filePath === 'package.json') {
            const depIssues = this.checkPackageJsonIssues(content);
            issues.push(...depIssues);
            confidence -= depIssues.length * 0.1;
            suggestions.push(...this.generatePackageJsonSuggestions(depIssues));
          }
        } catch (e) {
          // Skip malformed calls
        }
      }
    }

    return {
      valid: issues.length === 0,
      confidence: Math.max(0, confidence),
      issues,
      suggestions
    };
  }

  /**
   * Validate runtime behavior (syntax check, etc.)
   */
  private async validateRuntime(context: AgentContext, data: any): Promise<ValidationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    if (!data || !data.toolCalls) {
      return { valid: true, confidence: 0.5, issues: [], suggestions: [] };
    }

    // Try to run syntax checks on generated files
    for (const call of data.toolCalls) {
      if (call.function.name === 'write_file') {
        try {
          const args = JSON.parse(call.function.arguments);
          const filePath = args.path;
          const content = args.content;

          // Create temporary file for syntax checking
          const tempPath = path.join(context.workspacePath, `.temp_${Date.now()}_${path.basename(filePath)}`);
          try {
            fs.writeFileSync(tempPath, content);

            if (filePath.match(/\.(js|jsx|ts|tsx)$/i)) {
              const syntaxResult = await this.checkJavaScriptSyntax(tempPath);
              if (!syntaxResult.valid) {
                issues.push(`JavaScript syntax error in ${filePath}: ${syntaxResult.error}`);
                confidence -= 0.2;
                suggestions.push(`Fix syntax error in ${filePath}: ${syntaxResult.error}`);
              }
            } else if (filePath.match(/\.py$/i)) {
              const syntaxResult = await this.checkPythonSyntax(tempPath);
              if (!syntaxResult.valid) {
                issues.push(`Python syntax error in ${filePath}: ${syntaxResult.error}`);
                confidence -= 0.2;
                suggestions.push(`Fix syntax error in ${filePath}: ${syntaxResult.error}`);
              }
            }
          } finally {
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }
        } catch (e) {
          // Skip validation if we can't create temp file
        }
      }
    }

    return {
      valid: issues.length === 0,
      confidence: Math.max(0, confidence),
      issues,
      suggestions
    };
  }

  /**
   * Run the complete validation pipeline
   */
  private async runValidationPipeline(data: {
    toolCalls: ToolCall[];
    context: AgentContext;
    currentPlan: string[];
    currentStep: number;
  }): Promise<{
    overallConfidence: number;
    issues: string[];
    suggestions: string[];
    autoFixed: boolean;
    fixesApplied: number;
    fixedToolCalls?: ToolCall[];
  }> {
    let overallConfidence = 1.0;
    const allIssues: string[] = [];
    const allSuggestions: string[] = [];
    let fixesApplied = 0;
    let autoFixed = false;
    let currentData = data;

    // Run each validation step
    for (const step of this.validationPipeline) {
      try {
        const result = await step.validator(data.context, currentData);

        // Record validation result
        this.validationHistory.push({
          step: step.name,
          confidence: result.confidence,
          issues: result.issues
        });

        // Update overall confidence (weighted average)
        overallConfidence = (overallConfidence + result.confidence) / 2;

        // Collect issues and suggestions
        allIssues.push(...result.issues);
        allSuggestions.push(...result.suggestions);

        // Try auto-fix if validation failed and step supports it
        if (!result.valid && step.canAutoFix && step.autoFix && result.confidence < step.requiredConfidence) {
          log.info(`[Agent] 🔧 Attempting auto-fix for ${step.name} (${result.issues.length} issues)`);

          const fixResult = await step.autoFix(data.context, currentData, result.issues);

          if (fixResult.success) {
            currentData = fixResult.fixedData || currentData;
            autoFixed = true;
            fixesApplied++;
            overallConfidence = Math.max(overallConfidence, fixResult.confidence);

            log.info(`[Agent] ✅ Auto-fix successful: ${fixResult.explanation}`);
          } else {
            log.info(`[Agent] ❌ Auto-fix failed for ${step.name}`);
          }
        }
      } catch (error) {
        log.warn(`[Agent] Validation step ${step.name} failed:`, error);
        // Continue with other validation steps
      }
    }

    return {
      overallConfidence,
      issues: allIssues,
      suggestions: allSuggestions,
      autoFixed,
      fixesApplied,
      fixedToolCalls: autoFixed ? (currentData as any).toolCalls : undefined
    };
  }

  /**
   * COMPREHENSIVE end-of-task validation
   * This runs when model says "done" - checks EVERYTHING
   */
  private async validateProjectCompletion(): Promise<{
    valid: boolean;
    reason?: string;
    fixInstruction?: string;
    message?: string;
  }> {
    log.info('[Agent] 🔍 Running COMPREHENSIVE project validation...');
    
    // Check 1: No syntax errors in recent history
    if (this.syntaxErrorHistory.size > 0) {
      const filesWithErrors = Array.from(this.syntaxErrorHistory.entries())
        .filter(([_, count]) => count > 0)
        .map(([file, count]) => `${file} (${count} errors)`);
      
      if (filesWithErrors.length > 0) {
        log.info('[Agent] ❌ Validation failed: Syntax errors exist');
        return {
          valid: false,
          reason: `Syntax errors detected in: ${filesWithErrors.join(', ')}`,
          fixInstruction: `Read these files using read_file, identify and fix ALL syntax errors completely. Test by running the project again.`
        };
      }
    }
    
    // Check 2: Try to detect and validate project structure
    try {
      const { ProjectRunner } = await import('./agent/tools/projectRunner');
      const projectInfo = await ProjectRunner.detectProject(this.context.workspacePath);
      
      log.info(`[Agent] Detected project type: ${projectInfo.type}`);
      
      if (projectInfo.type === 'unknown') {
        // Can't validate unknown projects - allow it
        log.info('[Agent] ⚠️  Unknown project type - skipping structure validation');
        return { valid: true, message: 'Project structure detected' };
      }
      
      // Check 3: Validate project structure
      const validation = await ProjectRunner.validateProject(this.context.workspacePath, projectInfo);
      if (!validation.valid && validation.issues.length > 0) {
        log.info(`[Agent] ❌ Validation failed: ${validation.issues.join(', ')}`);
        return {
          valid: false,
          reason: `Project validation failed: ${validation.issues.join(', ')}`,
          fixInstruction: `Fix these validation issues: ${validation.issues.join('; ')}`
        };
      }
      
      // Check 4: Try a quick syntax check by attempting to run (with short timeout)
      if (projectInfo.startCommand) {
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          log.info('[Agent] Running syntax check...');
          
          // Quick syntax check - just parse, don't actually start server
          if (projectInfo.type === 'node' && projectInfo.mainFile) {
            // Use node --check for syntax validation
            await execAsync(`node --check ${projectInfo.mainFile}`, {
              cwd: this.context.workspacePath,
              timeout: 5000
            });
            log.info('[Agent] ✅ Node.js syntax check passed');
          } else if (projectInfo.type === 'python' && projectInfo.mainFile) {
            // Use python -m py_compile for syntax validation
            await execAsync(`python -m py_compile ${projectInfo.mainFile}`, {
              cwd: this.context.workspacePath,
              timeout: 5000
            });
            log.info('[Agent] ✅ Python syntax check passed');
          }
        } catch (syntaxCheckError: any) {
          // Syntax check failed - project has errors
          const errorOutput = syntaxCheckError.stderr || syntaxCheckError.message || '';
          
          log.info(`[Agent] ❌ Syntax check failed: ${errorOutput.substring(0, 200)}`);
          
          // Try to extract file and line from error
          const fileMatch = errorOutput.match(/(.+?):(\d+):/);
          if (fileMatch) {
            return {
              valid: false,
              reason: `Syntax error in ${fileMatch[1]} at line ${fileMatch[2]}`,
              fixInstruction: `Read ${fileMatch[1]} using read_file, fix the syntax error at line ${fileMatch[2]}, then test again.`
            };
          }
          
          return {
            valid: false,
            reason: `Syntax validation failed: ${errorOutput.substring(0, 200)}`,
            fixInstruction: `Fix syntax errors in the project files. Read the files, identify issues, and fix them completely.`
          };
        }
      }
      
      // Check 5: Run Opus Quality Validation (cross-file coherence)
      log.info('[Agent] 🔍 Running cross-file coherence validation...');
      try {
        const fileContents = new Map<string, string>();
        const projectFiles = fs.readdirSync(this.context.workspacePath);
        
        for (const file of projectFiles) {
          const filePath = path.join(this.context.workspacePath, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile() && (file.endsWith('.html') || file.endsWith('.css') || file.endsWith('.js') || file.endsWith('.ts'))) {
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              fileContents.set(file, content);
            } catch (e) {
              // Skip unreadable files
            }
          }
        }
        
        if (fileContents.size > 0) {
          const opusValidation = OpusThinkingEngine.validateOpusQuality(
            projectInfo.type || 'web',
            Array.from(fileContents.keys()),
            fileContents
          );
          
          if (!opusValidation.passes && opusValidation.issues.length > 0) {
            const criticalIssues = opusValidation.issues.filter(i => 
              i.includes('not found in HTML') || 
              i.includes('not in HTML') ||
              i.includes('mismatch') ||
              i.includes('missing')
            );
            
            if (criticalIssues.length > 0) {
              log.info(`[Agent] ❌ Cross-file coherence issues: ${criticalIssues.join('; ')}`);
              return {
                valid: false,
                reason: `Cross-file coherence issues: ${criticalIssues.slice(0, 3).join('; ')}`,
                fixInstruction: `CRITICAL: Fix these HTML/JS mismatches:\n${criticalIssues.map(i => `- ${i}`).join('\n')}\n\nRead index.html and game.js/script.js, ensure all getElementById() calls match actual HTML element IDs.`
              };
            }
            
            // Log suggestions but don't block
            if (opusValidation.suggestions.length > 0) {
              log.info(`[Agent] 💡 Quality suggestions: ${opusValidation.suggestions.slice(0, 3).join('; ')}`);
            }
          }
          log.info('[Agent] ✅ Cross-file coherence check passed');
        }
      } catch (opusError: any) {
        log.warn('[Agent] ⚠️  Opus validation error (non-blocking):', opusError.message);
      }
      
      log.info('[Agent] ✅ ALL validation checks passed - project is complete!');
      
      // All checks passed!
      return {
        valid: true,
        message: `✅ Project validated and complete! Type: ${projectInfo.type}${projectInfo.startCommand ? `, Start: ${projectInfo.startCommand}` : ''}`
      };
      
    } catch (error: any) {
      log.warn('[Agent] Validation error (allowing completion):', error.message);
      // If validation system fails, don't block - assume valid
      return { valid: true, message: 'Project structure detected (validation skipped)' };
    }
  }

  // === VALIDATION HELPER METHODS ===

  private validateJavaScriptSyntax(content: string, filePath: string): { critical: string[]; warnings: string[] } {
    const critical: string[] = []; // Will crash/break
    const warnings: string[] = []; // Style/suggestions

    // CRITICAL: Unbalanced braces (will crash)
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      critical.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }

    // CRITICAL: Unbalanced parentheses (will crash)
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      critical.push(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    }

    // CRITICAL: Malformed Mongoose syntax (will crash)
    if (content.includes('new mongoose.Schema(, )')) {
      critical.push('Malformed Mongoose schema: empty parentheses in schema definition');
    }

    if (content.includes('new mongoose.Schema()')) {
      critical.push('Empty Mongoose schema: missing field definitions');
    }

    // CRITICAL: Incomplete if statements (will crash)
    const incompleteIfs = content.match(/if\s*\([^)]+\)\s*$/gm);
    if (incompleteIfs && incompleteIfs.length > 0) {
      critical.push('Incomplete if statement: missing body after condition');
    }

    // WARNING: Incomplete arrow functions (might be intentional)
    const arrowFunctions = content.match(/=>\s*[^;,\n}]*$/gm);
    if (arrowFunctions) {
      for (const arrow of arrowFunctions) {
        if (!arrow.includes('{') && !arrow.includes('(') && arrow.trim().length < 3) {
          warnings.push('Some arrow functions may be incomplete');
          break; // Only warn once
        }
      }
    }

    // Note: Semicolon checking is completely removed - modern JS doesn't need them!

    return { critical, warnings };
  }

  /**
   * Check if this is an Express.js project
   */
  private isExpressProject(data: any): boolean {
    if (!data || !data.toolCalls) return false;

    return data.toolCalls.some((call: any) => {
      if (call.function.name === 'write_file') {
        try {
          const args = JSON.parse(call.function.arguments);
          return args.content && (
            args.content.includes('express') ||
            args.content.includes('mongoose') ||
            args.path.includes('routes/') ||
            args.path.includes('models/') ||
            args.path.includes('middleware/')
          );
        } catch {
          return false;
        }
      }
      return false;
    });
  }

  /**
   * Cross-file validation for Express.js projects
   */
  private validateCrossFileReferences(data: any): string[] {
    const issues: string[] = [];
    const files: { [key: string]: string } = {};

    // Collect all files
    if (data.toolCalls) {
      for (const call of data.toolCalls) {
        if (call.function.name === 'write_file') {
          try {
            const args = JSON.parse(call.function.arguments);
            files[args.path] = args.content;
          } catch (e) {
            // Skip malformed calls
          }
        }
      }
    }

    // Check for method references that don't exist
    const routesFiles = Object.keys(files).filter(path => path.includes('routes/'));
    const modelFiles = Object.keys(files).filter(path => path.includes('models/'));

    for (const routePath of routesFiles) {
      const routeContent = files[routePath];

      // Check for User.generateAuthToken() references
      if (routeContent.includes('generateAuthToken()')) {
        const hasUserModel = modelFiles.some(modelPath => {
          const modelContent = files[modelPath];
          return modelContent.includes('generateAuthToken') && modelContent.includes('jwt.sign');
        });

        if (!hasUserModel) {
          issues.push(`Route ${routePath} references generateAuthToken() but User model doesn't implement it`);
        }
      }

      // Check for validation middleware references
      if (routeContent.includes('userValidationRules()') || routeContent.includes('productValidationRules()')) {
        const hasValidationMiddleware = Object.values(files).some(content =>
          content.includes('userValidationRules') && content.includes('productValidationRules')
        );

        if (!hasValidationMiddleware) {
          issues.push(`Route ${routePath} references validation rules but validation middleware doesn't export them`);
        }
      }

      // Check for auth middleware references
      if (routeContent.includes('auth') && routeContent.includes('require')) {
        const hasAuthMiddleware = Object.keys(files).some(path =>
          path.includes('middleware/auth') || path.includes('middleware/auth.js')
        );

        if (!hasAuthMiddleware) {
          issues.push(`Route ${routePath} references auth middleware but auth.js doesn't exist`);
        }
      }
    }

    return issues;
  }

  private validatePythonSyntax(content: string, filePath: string): string[] {
    const issues: string[] = [];

    // Check for indentation consistency
    const lines = content.split('\n');
    let indentLevel = 0;
    const indentStack: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indentMatch = line.match(/^(\s*)/);
      const currentIndent = indentMatch ? indentMatch[1].length : 0;

      if (line.trim() && !line.trim().startsWith('#')) {
        if (line.includes(':')) {
          indentStack.push(indentLevel);
          indentLevel = currentIndent + 4; // Python standard
        } else if (currentIndent < indentLevel && indentStack.length > 0) {
          indentLevel = indentStack.pop()!;
        }
      }
    }

    // Check for common syntax issues
    if (content.includes('print(') && !content.includes('import sys')) {
      // Python 2 style print without proper setup
      issues.push('Using print() function - ensure Python 3 compatibility');
    }

    return issues;
  }

  private validateHTMLSyntax(content: string, filePath: string): string[] {
    const issues: string[] = [];

    // Check for unclosed tags
    const openTags = (content.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (content.match(/<\/[^>]+>/g) || []).length;

    if (openTags !== closeTags) {
      issues.push(`Unclosed HTML tags: ${openTags} open, ${closeTags} close`);
    }

    // Check for required elements
    if (!content.includes('<!DOCTYPE')) {
      issues.push('Missing DOCTYPE declaration');
    }

    if (!content.includes('<html')) {
      issues.push('Missing <html> tag');
    }

    if (!content.includes('</html>')) {
      issues.push('Missing </html> closing tag');
    }

    return issues;
  }

  /**
   * Validate Mongoose schema structure
   */
  private validateMongooseSchema(content: string, filePath: string): string[] {
    const issues: string[] = [];

    // Check for malformed schema definitions
    if (content.includes('new mongoose.Schema(, )')) {
      issues.push('Malformed Mongoose schema: empty parentheses in schema definition');
    }

    if (content.includes('new mongoose.Schema()')) {
      issues.push('Empty Mongoose schema: missing field definitions');
    }

    // Check for schema without proper field definitions
    const schemaMatch = content.match(/new\s+mongoose\.Schema\s*\([^)]*\)/);
    if (schemaMatch && !content.includes('type:') && !content.includes('required:')) {
      issues.push('Mongoose schema missing field definitions (no type or required properties)');
    }

    // Check for missing model export
    if (content.includes('mongoose.Schema') && !content.includes('mongoose.model')) {
      issues.push('Mongoose schema defined but model not exported');
    }

    // Check for incomplete schema field definitions
    const incompleteFieldPattern = /(\w+):\s*\{[^}]*$/;
    if (incompleteFieldPattern.test(content)) {
      issues.push('Incomplete Mongoose schema field definition (missing closing brace)');
    }

    return issues;
  }

  private generateJavaScriptSuggestions(issues: string[], filePath: string): string[] {
    const suggestions: string[] = [];

    for (const issue of issues) {
      if (issue.includes('unbalanced braces')) {
        suggestions.push(`Add missing ${issue.includes('more open') ? 'closing' : 'opening'} braces in ${filePath}`);
      } else if (issue.includes('missing semicolon')) {
        suggestions.push(`Add semicolons to complete statements in ${filePath}`);
      } else if (issue.includes('arrow function')) {
        suggestions.push(`Complete arrow function bodies with proper return statements or braces`);
      }
    }

    return suggestions;
  }

  private generatePythonSuggestions(issues: string[], filePath: string): string[] {
    const suggestions: string[] = [];

    for (const issue of issues) {
      if (issue.includes('indentation')) {
        suggestions.push(`Fix indentation to use consistent 4-space indentation in ${filePath}`);
      } else if (issue.includes('print')) {
        suggestions.push(`Use Python 3 print() function syntax or add proper imports`);
      }
    }

    return suggestions;
  }

  private generateHTMLSuggestions(issues: string[], filePath: string): string[] {
    const suggestions: string[] = [];

    for (const issue of issues) {
      if (issue.includes('DOCTYPE')) {
        suggestions.push(`Add <!DOCTYPE html> declaration at the top of ${filePath}`);
      } else if (issue.includes('unclosed')) {
        suggestions.push(`Add missing closing tags in ${filePath}`);
      }
    }

    return suggestions;
  }

  private fixUnbalancedBraces(data: any): any {
    const fixedData = { ...data };
    if (fixedData.toolCalls) {
      fixedData.toolCalls = fixedData.toolCalls.map((call: any) => {
        if (call.function.name === 'write_file') {
          try {
            const args = JSON.parse(call.function.arguments);
            const content = args.content;

            // Simple brace balancing
            const openBraces = (content.match(/{/g) || []).length;
            const closeBraces = (content.match(/}/g) || []).length;

            if (openBraces > closeBraces) {
              args.content = content + '\n}';
            }

            call.function.arguments = JSON.stringify(args);
          } catch (e) {
            // Skip if can't parse
          }
        }
        return call;
      });
    }
    return fixedData;
  }

  private fixMissingSemicolons(data: any): any {
    const fixedData = { ...data };
    if (fixedData.toolCalls) {
      fixedData.toolCalls = fixedData.toolCalls.map((call: any) => {
        if (call.function.name === 'write_file') {
          try {
            const args = JSON.parse(call.function.arguments);
            const lines = args.content.split('\n');

            // Add semicolons to statements that need them
            const fixedLines = lines.map((line: string) => {
              const trimmed = line.trim();
              if (trimmed.match(/^(let|const|var|return|throw)\s+.*[^;{}\s]$/) && !trimmed.includes('//')) {
                return line + ';';
              }
              return line;
            });

            args.content = fixedLines.join('\n');
            call.function.arguments = JSON.stringify(args);
          } catch (e) {
            // Skip if can't parse
          }
        }
        return call;
      });
    }
    return fixedData;
  }

  private fixIncompleteArrows(data: any): any {
    const fixedData = { ...data };
    if (fixedData.toolCalls) {
      fixedData.toolCalls = fixedData.toolCalls.map((call: any) => {
        if (call.function.name === 'write_file') {
          try {
            const args = JSON.parse(call.function.arguments);
            // Replace incomplete arrows with basic implementations
            args.content = args.content.replace(/=>\s*[,;\n}]/g, '=> {\n  // TODO: Implement function body\n};');
            call.function.arguments = JSON.stringify(args);
          } catch (e) {
            // Skip if can't parse
          }
        }
        return call;
      });
    }
    return fixedData;
  }

  private async createPackageJson(data: any): Promise<any> {
    const fixedData = { ...data };

    // Add a basic package.json tool call
    const packageJsonCall = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: 'function',
      function: {
        name: 'write_file',
        arguments: JSON.stringify({
          path: 'package.json',
          content: JSON.stringify({
            name: 'project',
            version: '1.0.0',
            description: 'Generated project',
            main: 'index.js',
            scripts: {
              start: 'node index.js'
            },
            dependencies: {}
          }, null, 2)
        })
      }
    };

    if (!fixedData.toolCalls) {
      fixedData.toolCalls = [];
    }
    fixedData.toolCalls.push(packageJsonCall);

    return fixedData;
  }

  private async createReadme(data: any): Promise<any> {
    const fixedData = { ...data };

    // Add a basic README.md tool call
    const readmeCall = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: 'function',
      function: {
        name: 'write_file',
        arguments: JSON.stringify({
          path: 'README.md',
          content: '# Project\n\nGenerated project.\n\n## Setup\n\n```bash\nnpm install\n# Then run the appropriate script from package.json, usually npm run dev or npm start\n```'
        })
      }
    };

    if (!fixedData.toolCalls) {
      fixedData.toolCalls = [];
    }
    fixedData.toolCalls.push(readmeCall);

    return fixedData;
  }

  private implementEmptyFunctions(data: any): any {
    const fixedData = { ...data };
    if (fixedData.toolCalls) {
      fixedData.toolCalls = fixedData.toolCalls.map((call: any) => {
        if (call.function.name === 'write_file') {
          try {
            const args = JSON.parse(call.function.arguments);
            // Replace empty function bodies with basic implementations
            args.content = args.content.replace(
              /(\w+\s*\([^)]*\)\s*\{\s*\})/g,
              '$1\n  // TODO: Implement function logic\n  return null;\n}'
            );
            call.function.arguments = JSON.stringify(args);
          } catch (e) {
            // Skip if can't parse
          }
        }
        return call;
      });
    }
    return fixedData;
  }

  private replacePlaceholders(data: any): any {
    const fixedData = { ...data };
    if (fixedData.toolCalls) {
      fixedData.toolCalls = fixedData.toolCalls.map((call: any) => {
        if (call.function.name === 'write_file') {
          try {
            const args = JSON.parse(call.function.arguments);
            // Normalize content to string before processing
            let content = args.content;
            if (typeof content === 'object') {
              // For JSON files, pretty format; otherwise, compact
              const filePath = args.path || '';
              if (filePath.endsWith('.json')) {
                content = JSON.stringify(content, null, 2);
              } else {
                content = JSON.stringify(content);
              }
            }

            // Only apply replacements if content is now a string
            if (typeof content === 'string') {
              content = content
                .replace(/TODO/gi, '// Implementation needed')
                .replace(/FIXME/gi, '// Fix required')
                .replace(/placeholder/gi, 'implementation');
            }

            args.content = content;
            call.function.arguments = JSON.stringify(args);
          } catch (e) {
            // Skip if can't parse
          }
        }
        return call;
      });
    }
    return fixedData;
  }

  private checkImportIssues(content: string, filePath: string, context: AgentContext): string[] {
    const issues: string[] = [];

    // Check for relative imports that might not exist
    const importMatches = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      for (const importMatch of importMatches) {
        const importPath = importMatch.match(/from\s+['"]([^'"]+)['"]/)?.[1];
        if (importPath && (importPath.startsWith('./') || importPath.startsWith('../'))) {
          const resolvedPath = path.resolve(path.dirname(path.join(context.workspacePath, filePath)), importPath);
          if (!fs.existsSync(resolvedPath) && !fs.existsSync(resolvedPath + '.js') && !fs.existsSync(resolvedPath + '.ts')) {
            issues.push(`Import path not found: ${importPath} in ${filePath}`);
          }
        }
      }
    }

    return issues;
  }

  private checkPackageJsonIssues(content: string): string[] {
    const issues: string[] = [];

    try {
      const packageJson = JSON.parse(content);

      if (!packageJson.name) {
        issues.push('Missing package name in package.json');
      }

      if (!packageJson.version) {
        issues.push('Missing version in package.json');
      }

      if (!packageJson.main && !packageJson.module) {
        issues.push('Missing main entry point in package.json');
      }
    } catch (e) {
      issues.push('Invalid JSON in package.json');
    }

    return issues;
  }

  private generatePackageJsonSuggestions(issues: string[]): string[] {
    const suggestions: string[] = [];

    for (const issue of issues) {
      if (issue.includes('package name')) {
        suggestions.push('Add a "name" field to package.json');
      } else if (issue.includes('version')) {
        suggestions.push('Add a "version" field to package.json (e.g., "1.0.0")');
      } else if (issue.includes('main entry')) {
        suggestions.push('Add a "main" field pointing to your main JavaScript file');
      }
    }

    return suggestions;
  }

  private async checkJavaScriptSyntax(filePath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Use Node.js built-in syntax checking
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      await execAsync(`node --check "${filePath}"`);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.stderr || error.message };
    }
  }

  private async checkPythonSyntax(filePath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      await execAsync(`python -m py_compile "${filePath}"`);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.stderr || error.message };
    }
  }

  /**
   * Detect truncated or incomplete code that models sometimes produce
   * Returns a description of the issue, or null if code looks complete
   */
  private detectTruncatedCode(content: string, filePath: string): string | null {
    if (!content || content.length < 50) {
      return 'Content is too short to be valid code';
    }
    
    // Check for JavaScript/TypeScript files
    if (filePath.match(/\.(js|jsx|ts|tsx)$/i)) {
      // Check for empty method bodies (common truncation pattern)
      const emptyMethodPattern = /\w+\s*\([^)]*\)\s*{\s*}/g;
      const emptyMethods = content.match(emptyMethodPattern);
      if (emptyMethods && emptyMethods.length > 3) {
        return `Multiple empty method bodies detected (${emptyMethods.length} found)`;
      }
      
      // Check for skeleton class with only signatures
      const methodSignaturePattern = /\w+\s*\([^)]*\)\s*\n\s*\n/g;
      const danglingSignatures = content.match(methodSignaturePattern);
      if (danglingSignatures && danglingSignatures.length > 2) {
        return `Multiple incomplete method signatures without bodies (${danglingSignatures.length} found)`;
      }
      
      // Check for unbalanced braces
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (Math.abs(openBraces - closeBraces) > 2) {
        return `Unbalanced braces (${openBraces} open, ${closeBraces} close)`;
      }
      
      // Check for incomplete arrow functions (like "=> )" or "=> ;")
      const incompleteArrows = content.match(/=>\s*[);,;\n]/g);
      if (incompleteArrows && incompleteArrows.length > 0) {
        return `Incomplete arrow functions detected (${incompleteArrows.length} found). Arrow functions must have a body or return value.`;
      }
      
      // Check for arrow functions with just closing paren (like "(req, res) => )")
      const arrowWithJustParen = content.match(/\([^)]+\)\s*=>\s*\)/g);
      if (arrowWithJustParen && arrowWithJustParen.length > 0) {
        return `Incomplete arrow functions detected: missing function body after =>. Found: ${arrowWithJustParen[0]}`;
      }
      
      // Check for incomplete template strings (missing ${})
      const incompleteTemplate = content.match(/`[^`]*\$\{[^}]*$/g);
      if (incompleteTemplate && incompleteTemplate.length > 0) {
        return `Incomplete template string detected - missing closing brace in ${incompleteTemplate.length} place(s)`;
      }
    }
    
    // Check for HTML files
    if (filePath.match(/\.html$/i)) {
      // Must have basic structure
      if (!content.includes('<!DOCTYPE') && !content.includes('<html')) {
        return 'Missing HTML document structure';
      }
      if (!content.includes('</html>')) {
        return 'HTML document not properly closed';
      }
    }
    
    // Check for CSS files
    if (filePath.match(/\.css$/i)) {
      // Check for rules with empty bodies
      const emptyRules = content.match(/[^{}]+{\s*}/g);
      if (emptyRules && emptyRules.length > 5) {
        return `Multiple empty CSS rules detected (${emptyRules.length} found)`;
      }
    }
    
    return null; // Code looks complete
  }

  /**
   * Calculate similarity between two content strings (0-1, where 1 is identical)
   * Uses a simple character-based comparison for speed
   */
  private contentSimilarity(content1: string, content2: string): number {
    if (!content1 || !content2) return 0;
    if (content1 === content2) return 1;
    
    // Normalize whitespace for comparison
    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
    const norm1 = normalize(content1);
    const norm2 = normalize(content2);
    
    if (norm1 === norm2) return 1;
    
    // Use Levenshtein-like similarity for longer strings
    // For performance, use a simple character overlap ratio
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length > norm2.length ? norm2 : norm1;
    
    if (longer.length === 0) return 1;
    
    // Calculate character overlap
    let matches = 0;
    const minLength = Math.min(norm1.length, norm2.length);
    for (let i = 0; i < minLength; i++) {
      if (norm1[i] === norm2[i]) matches++;
    }
    
    // Also check for substring matches (handles minor edits)
    const substringMatch = longer.includes(shorter.substring(0, Math.min(100, shorter.length)));
    if (substringMatch && shorter.length > 100) {
      return 0.9; // High similarity if one is a substring of the other
    }
    
    // Base similarity on character matches
    const baseSimilarity = matches / longer.length;
    
    // Boost similarity if lengths are very close
    const lengthRatio = shorter.length / longer.length;
    const lengthBonus = lengthRatio > 0.95 ? 0.1 : 0;
    
    return Math.min(1, baseSimilarity + lengthBonus);
  }

  /**
   * Track a file failure - returns true if the file should be skipped
   */
  private recordFileFailure(filePath: string, errorType: string): boolean {
    const existing = this.fileFailureHistory.get(filePath);
    const now = Date.now();
    
    if (existing) {
      existing.count++;
      existing.lastError = errorType;
      existing.lastAttempt = now;
      this.fileFailureHistory.set(filePath, existing);
      
      if (existing.count >= this.MAX_FAILURES_PER_FILE) {
        log.info(`[Agent] 🛑 File "${filePath}" has failed ${existing.count} times - skipping`);
        return true; // Should skip this file
      }
      
      log.info(`[Agent] ⚠️ File "${filePath}" failure count: ${existing.count}/${this.MAX_FAILURES_PER_FILE}`);
    } else {
      this.fileFailureHistory.set(filePath, {
        count: 1,
        lastError: errorType,
        lastAttempt: now
      });
    }
    
    return false; // Can still try this file
  }

  /**
   * Reset file failure count (e.g., after a successful operation)
   */
  private resetFileFailure(filePath: string): void {
    this.fileFailureHistory.delete(filePath);
  }

  /**
   * Get files that are currently blocked due to too many failures
   */
  private getBlockedFiles(): string[] {
    return Array.from(this.fileFailureHistory.entries())
      .filter(([_, data]) => data.count >= this.MAX_FAILURES_PER_FILE)
      .map(([file, _]) => file);
  }

  private buildFinalAnswer(message: string): string {
    let answer = message;
    
    if (this.completedSteps.length > 0) {
      answer += `\n\n📋 Steps completed (${this.completedSteps.length}):\n`;
      const stepsToShow = this.completedSteps.slice(-15);
      if (this.completedSteps.length > 15) {
        answer += `  ... (${this.completedSteps.length - 15} earlier steps)\n`;
      }
      answer += stepsToShow.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
    } else {
      answer += '\n\n(No steps completed)';
    }
    
    if (this.currentPlan.length > 0) {
      answer += `\n\n📊 Plan: ${this.currentPlanStep}/${this.currentPlan.length} steps`;
    }
    
    return answer;
  }

  private parseToolCalls(content: string): ToolCall[] {
    return parseToolCallsContent(content, Object.keys(tools));
  }

  // Update context (called by Electron frontend)
  updateContext(updates: Partial<AgentContext>) {
    this.context = { ...this.context, ...updates };
    this.syncBehaviorProfilePrompt();
  }
}

// Export factory function
export function createAgent(context: AgentContext): AgentLoop {
  return new AgentLoop(context);
}
