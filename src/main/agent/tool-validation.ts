/**
 * Tool Validation Utilities
 * Validates tool calls before execution to prevent errors
 * 
 * ENHANCED: Now includes protection against:
 * - Project scope creep (mixing unrelated projects)
 * - Duplicate files in different locations
 * - Orphaned/unreferenced files
 * - Platform-specific code issues
 */

import * as path from 'path';
import * as fs from 'fs';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  fixedPath?: string;
  warning?: string;
}

/**
 * Track files being created in a session to detect duplicates
 * Key: basename (e.g., "script.js"), Value: array of full paths
 */
const sessionFileTracker: Map<string, string[]> = new Map();

/**
 * Known project type signatures - used to detect project mixing
 * ENHANCED: Added todo, crud, and more patterns to catch common mismatches
 * FIXED: Added more project types for better detection accuracy
 */
const PROJECT_SIGNATURES: Record<string, string[]> = {
  tetris: ['tetromino', 'clearlines', 'gamecanvas', 'tetris', 'block_size', 'rows', 'cols', 'tetrominoes', 'rotatePiece'],
  portfolio: ['hamburger', 'nav-menu', 'hero-content', 'contact-form', 'portfolio', 'about me', 'skills', 'experience', 'testimonial'],
  nebula: ['nebula', 'cosmic', 'toast', 'palette', 'theme', 'reveal', 'particle'],
  minecraft: ['voxel', 'chunk', 'minecraft', 'block', 'terrain', 'world', 'voxelworld'],
  game: ['player', 'enemy', 'score', 'level', 'game-over', 'canvas', 'gameloop', 'collision', 'sprite', 'requestanimationframe'],
  dashboard: ['dashboard', 'widget', 'chart', 'analytics', 'metric', 'kpi', 'statistics'],
  ecommerce: ['cart', 'checkout', 'product', 'order', 'payment', 'addtocart', 'cartitem'],
  blog: ['post', 'article', 'comment', 'author', 'category', 'tag', 'blogpost'],
  // Todo/task app signatures
  todo: ['todo', 'task', 'addtodo', 'deletetodo', 'toggletodo', 'completed', 'todolist', 'todoapp', 'todoitem', 'remaining'],
  crud: ['create', 'read', 'update', 'delete', 'crud', 'addbtn', 'deletebtn', 'editbtn'],
  notes: ['note', 'notes', 'notepad', 'addnote', 'deletenote', 'savenote'],
  // NEW: Additional project types for better detection
  threejs: ['three.js', 'threejs', 'scene', 'renderer', 'camera', 'geometry', 'material', 'mesh', 'orbitcontrols', 'webglrenderer'],
  weather: ['weather', 'forecast', 'temperature', 'humidity', 'weatherapi', 'weatherdata'],
  calculator: ['calculator', 'calculate', 'add', 'subtract', 'multiply', 'divide', 'operator', 'result'],
  chat: ['chat', 'message', 'sendmessage', 'chatroom', 'conversation', 'chatapp'],
  landing: ['landing', 'hero', 'cta', 'signup', 'subscribe', 'features', 'pricing'],
  api: ['api', 'endpoint', 'request', 'response', 'fetch', 'axios', 'restapi'],
};

/**
 * Incompatible project type pairs - if task is A, content should NOT be B
 * This catches cases where the model generates completely wrong content
 * FIXED: Added new project types and better incompatibility mappings
 */
const INCOMPATIBLE_TYPES: Record<string, string[]> = {
  todo: ['portfolio', 'game', 'tetris', 'minecraft', 'dashboard', 'ecommerce', 'blog', 'threejs'],
  game: ['portfolio', 'todo', 'dashboard', 'ecommerce', 'blog', 'notes', 'weather', 'calculator'],
  tetris: ['portfolio', 'todo', 'dashboard', 'ecommerce', 'blog', 'notes', 'minecraft', 'threejs', 'weather'],
  portfolio: ['game', 'tetris', 'minecraft', 'todo', 'crud', 'notes', 'calculator', 'chat'],
  minecraft: ['portfolio', 'todo', 'dashboard', 'ecommerce', 'blog', 'tetris', 'calculator', 'weather'],
  dashboard: ['game', 'tetris', 'minecraft', 'portfolio', 'chat'],
  ecommerce: ['game', 'tetris', 'minecraft', 'chat', 'calculator'],
  blog: ['game', 'tetris', 'minecraft', 'calculator', 'chat'],
  notes: ['game', 'tetris', 'minecraft', 'portfolio', 'ecommerce', 'threejs'],
  crud: ['game', 'tetris', 'minecraft', 'portfolio', 'threejs'],
  threejs: ['todo', 'crud', 'notes', 'blog', 'ecommerce', 'calculator', 'weather'],
  weather: ['game', 'tetris', 'minecraft', 'threejs', 'ecommerce', 'portfolio'],
  calculator: ['game', 'tetris', 'minecraft', 'threejs', 'portfolio', 'ecommerce', 'blog'],
  chat: ['portfolio', 'tetris', 'minecraft', 'dashboard', 'calculator'],
  landing: ['game', 'tetris', 'minecraft', 'calculator', 'todo', 'crud'],
  api: ['game', 'tetris', 'minecraft', 'portfolio'],
};

/**
 * Task mode for file tracker behavior
 */
export type FileTrackerMode = 'create' | 'fix' | 'review' | 'enhance';

/**
 * Reset the session file tracker
 * 
 * @param mode - Task mode that determines behavior:
 *   - 'create': Full reset for new project generation (default)
 *   - 'fix': Preserve existing files, only track new/modified files
 *   - 'review': Preserve all files, read-only mode
 *   - 'enhance': Preserve existing files, allow additions
 */
export function resetFileTracker(mode: FileTrackerMode = 'create'): void {
  if (mode === 'create') {
    sessionFileTracker.clear();
    console.log('[ToolValidation] 🛡️ File tracker reset for CREATE mode');
  } else {
    // In fix/review/enhance modes, don't clear - just log the mode
    console.log(`[ToolValidation] 🛡️ File tracker preserved for ${mode.toUpperCase()} mode (${sessionFileTracker.size} files tracked)`);
  }
}

/**
 * Populate the file tracker with existing files from a workspace
 * Use this in FIX/ENHANCE mode to protect existing files
 */
export function populateFileTracker(existingFiles: string[]): void {
  for (const filePath of existingFiles) {
    const fileName = path.basename(filePath).toLowerCase();
    const existingPaths = sessionFileTracker.get(fileName) || [];
    if (!existingPaths.includes(filePath)) {
      sessionFileTracker.set(fileName, [...existingPaths, filePath]);
    }
  }
  console.log(`[ToolValidation] 🛡️ Populated file tracker with ${existingFiles.length} existing files`);
}

/**
 * Check if a file already exists in the tracker (used for duplicate detection)
 */
export function isFileTracked(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  const trackedPaths = sessionFileTracker.get(fileName) || [];
  return trackedPaths.includes(filePath);
}

/**
 * Get the current file tracker state (for debugging)
 */
export function getFileTrackerState(): Map<string, string[]> {
  return new Map(sessionFileTracker);
}

/**
 * Detect what type of project the task is about
 * FIXED: Added more single keyword matches for better detection
 */
export function detectProjectType(taskContext: string): string | null {
  const taskLower = taskContext.toLowerCase();
  
  for (const [projectType, keywords] of Object.entries(PROJECT_SIGNATURES)) {
    const matchCount = keywords.filter(kw => taskLower.includes(kw)).length;
    if (matchCount >= 2) {
      return projectType;
    }
  }
  
  // Single keyword matches for explicit mentions (ordered by specificity)
  if (taskLower.includes('tetris')) return 'tetris';
  if (taskLower.includes('minecraft')) return 'minecraft';
  if (taskLower.includes('three.js') || taskLower.includes('threejs') || taskLower.includes('3d')) return 'threejs';
  if (taskLower.includes('portfolio')) return 'portfolio';
  if (taskLower.includes('dashboard')) return 'dashboard';
  if (taskLower.includes('ecommerce') || taskLower.includes('e-commerce') || taskLower.includes('shop')) return 'ecommerce';
  if (taskLower.includes('blog')) return 'blog';
  if (taskLower.includes('todo') || taskLower.includes('task list') || taskLower.includes('tasklist')) return 'todo';
  if (taskLower.includes('calculator')) return 'calculator';
  if (taskLower.includes('weather')) return 'weather';
  if (taskLower.includes('chat') || taskLower.includes('messaging')) return 'chat';
  if (taskLower.includes('landing page') || taskLower.includes('landingpage')) return 'landing';
  if (taskLower.includes('notes') || taskLower.includes('notepad')) return 'notes';
  if (taskLower.includes('crud')) return 'crud';
  if (taskLower.includes(' api ') || taskLower.includes('rest api') || taskLower.includes('restapi')) return 'api';
  if (taskLower.includes('game')) return 'game';
  
  return null;
}

/**
 * Detect project type from file content
 */
export function detectProjectTypeFromContent(content: string): string | null {
  const contentLower = content.toLowerCase();
  
  // Score each project type
  const scores: [string, number][] = [];
  
  for (const [projectType, keywords] of Object.entries(PROJECT_SIGNATURES)) {
    const matchCount = keywords.filter(kw => contentLower.includes(kw)).length;
    if (matchCount > 0) {
      scores.push([projectType, matchCount]);
    }
  }
  
  // Sort by score descending
  scores.sort((a, b) => b[1] - a[1]);
  
  // Return highest scoring type if it has at least 2 matches
  if (scores.length > 0 && scores[0][1] >= 2) {
    return scores[0][0];
  }
  
  return null;
}

/**
 * Check if content type is incompatible with task type
 * Returns true if the content should NOT be written for this task
 */
export function isContentIncompatibleWithTask(taskContext: string, content: string): { incompatible: boolean; reason: string } {
  const taskLower = taskContext.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Detect task type (what user asked for)
  let taskType: string | null = null;
  for (const [projectType, keywords] of Object.entries(PROJECT_SIGNATURES)) {
    if (keywords.some(kw => taskLower.includes(kw))) {
      taskType = projectType;
      break;
    }
  }
  
  // Detect content type (what AI is generating)
  const contentType = detectProjectTypeFromContent(content);
  
  // If we couldn't detect either, allow it (can't determine incompatibility)
  if (!taskType && !contentType) {
    return { incompatible: false, reason: '' };
  }
  
  // If task type is detected but content type is different and incompatible
  if (taskType && contentType && taskType !== contentType) {
    const incompatibleWith = INCOMPATIBLE_TYPES[taskType] || [];
    if (incompatibleWith.includes(contentType)) {
      return {
        incompatible: true,
        reason: `Task is "${taskType}" but content is "${contentType}" - these are incompatible project types`
      };
    }
  }
  
  // Special case: portfolio code detected when task doesn't mention portfolio
  if (contentType === 'portfolio' && !taskLower.includes('portfolio')) {
    // Check for strong portfolio indicators
    const strongPortfolioIndicators = ['hamburger', 'nav-menu', 'hero-content', 'skills', 'experience'];
    const portfolioMatches = strongPortfolioIndicators.filter(ind => contentLower.includes(ind)).length;
    
    if (portfolioMatches >= 2) {
      return {
        incompatible: true,
        reason: `Content contains portfolio code (${portfolioMatches} indicators) but task doesn't mention portfolio`
      };
    }
  }
  
  // Special case: game code detected when task doesn't mention game
  if (contentType === 'game' && !taskLower.includes('game') && !taskLower.includes('player') && !taskLower.includes('canvas')) {
    return {
      incompatible: true,
      reason: `Content contains game code but task doesn't mention games`
    };
  }
  
  return { incompatible: false, reason: '' };
}

/**
 * Validate a tool call before execution
 */
export function validateToolCall(toolCall: any, workspacePath: string, taskContext?: string): ValidationResult {
  if (!toolCall || !toolCall.name) {
    return { valid: false, error: 'Invalid tool call: missing name' };
  }

  // Validate read_file tool
  if (toolCall.name === 'read_file') {
    return validateReadFile(toolCall, workspacePath);
  }

  // Validate write_file tool
  if (toolCall.name === 'write_file' || toolCall.name === 'create_file') {
    return validateWriteFile(toolCall, workspacePath, taskContext);
  }

  // Validate run_command tool
  if (toolCall.name === 'run_command') {
    return validateRunCommand(toolCall);
  }

  // Validate scaffold_project tool
  if (toolCall.name === 'scaffold_project') {
    return validateScaffoldProject(toolCall, workspacePath);
  }

  return { valid: true };
}

/**
 * Validate read_file tool call
 */
function validateReadFile(toolCall: any, workspacePath: string): ValidationResult {
  const args = toolCall.arguments || {};
  const filePath = args.path;

  if (!filePath) {
    return { valid: false, error: 'read_file: missing path argument' };
  }

  // Check for absolute paths
  if (path.isAbsolute(filePath)) {
    try {
      const relativePath = path.relative(workspacePath, filePath);
      if (!relativePath.startsWith('..')) {
        console.warn(`[ToolValidation] Fixed absolute path: ${filePath} -> ${relativePath}`);
        return { valid: true, fixedPath: relativePath };
      }
    } catch (e) {
      // Path resolution failed
    }
    return { 
      valid: false, 
      error: `read_file: absolute path detected (${filePath}). Use relative paths only.` 
    };
  }

  // Check for paths outside workspace
  try {
    const resolvedPath = path.resolve(workspacePath, filePath);
    const normalizedWorkspace = path.normalize(workspacePath);
    const normalizedResolved = path.normalize(resolvedPath);

    if (!normalizedResolved.startsWith(normalizedWorkspace)) {
      return { 
        valid: false, 
        error: `read_file: path outside workspace: ${filePath}` 
      };
    }
  } catch (e) {
    return { 
      valid: false, 
      error: `read_file: invalid path: ${filePath}` 
    };
  }

  return { valid: true };
}

/**
 * Validate write_file tool call
 * 
 * ENHANCED VALIDATION:
 * 1. Duplicate file detection (same file in root and src/)
 * 2. Project type coherence (content matches task)
 * 3. File structure sanity checks
 */
function validateWriteFile(toolCall: any, workspacePath: string, taskContext?: string): ValidationResult {
  const args = toolCall.arguments || {};
  const filePath = args.path;
  const content = args.content || '';

  if (!filePath) {
    return { valid: false, error: 'write_file: missing path argument' };
  }

  const fileName = path.basename(filePath).toLowerCase();
  const fileDir = path.dirname(filePath);
  
  // ==========================================
  // CHECK 1: Duplicate File Detection (ENHANCED)
  // FIXED: Now blocks ALL duplicate basenames, not just root vs src/
  // ==========================================
  const existingPaths = sessionFileTracker.get(fileName) || [];
  
  // Detect problematic duplicates (same basename in different locations)
  for (const existingPath of existingPaths) {
    const existingDir = path.dirname(existingPath);
    
    // Block if same file exists in ANY different location
    if (existingPath !== filePath) {
      // Normalize directories for comparison
      const normalizedFileDir = fileDir === '' ? '.' : fileDir;
      const normalizedExistingDir = existingDir === '' ? '.' : existingDir;
      
      // Check for root vs src/ pattern (most common)
      const isRootVsSrc = 
        (normalizedFileDir === '.' && normalizedExistingDir.startsWith('src')) ||
        (normalizedExistingDir === '.' && normalizedFileDir.startsWith('src'));
      
      // Check for any different directory
      const isDifferentDir = normalizedFileDir !== normalizedExistingDir;
      
      if (isRootVsSrc || isDifferentDir) {
        console.error(`[ToolValidation] 🚨 DUPLICATE FILE BLOCKED: "${fileName}"`);
        console.error(`[ToolValidation]   Already exists at: "${existingPath}"`);
        console.error(`[ToolValidation]   Attempted to create at: "${filePath}"`);
        
        return {
          valid: false,
          error: `🚨 DUPLICATE FILE DETECTED!\n\n` +
                 `"${fileName}" already exists at "${existingPath}".\n` +
                 `You're trying to create it AGAIN at "${filePath}".\n\n` +
                 `⛔ BLOCKED: Do NOT create the same file in multiple locations!\n\n` +
                 `RULE: Each file name should exist in exactly ONE location.\n` +
                 `- If you put files in src/, put ALL files there\n` +
                 `- If you put files in root, put ALL files there\n` +
                 `- NEVER create both script.js AND src/script.js\n\n` +
                 `The file at "${existingPath}" is the correct one. Do NOT create another.`
        };
      }
    }
  }
  
  // Track this file BEFORE we continue (so future writes detect duplicates)
  sessionFileTracker.set(fileName, [...existingPaths, filePath]);

  // ==========================================
  // CHECK 2: Project Type Coherence (HARD BLOCK)
  // ENHANCED: Now uses incompatibility matrix for better detection
  // ==========================================
  if (taskContext && content.length > 100) {
    const taskProjectType = detectProjectType(taskContext);
    const contentProjectType = detectProjectTypeFromContent(content);
    
    // NEW: Use the enhanced incompatibility check
    const incompatibilityCheck = isContentIncompatibleWithTask(taskContext, content);
    if (incompatibilityCheck.incompatible) {
      console.error(`[ToolValidation] 🚨 CRITICAL: CONTENT INCOMPATIBILITY DETECTED!`);
      console.error(`[ToolValidation]   Reason: ${incompatibilityCheck.reason}`);
      console.error(`[ToolValidation]   File: ${filePath}`);
      console.error(`[ToolValidation]   Task: ${taskContext.substring(0, 100)}...`);
      
      return {
        valid: false,
        error: `🚨 CRITICAL: WRONG CONTENT TYPE DETECTED!\n\n` +
               `${incompatibilityCheck.reason}\n\n` +
               `⛔ BLOCKED: This file will NOT be written.\n\n` +
               `Task was: "${taskContext.substring(0, 150)}..."\n\n` +
               `TO FIX:\n` +
               `1. Re-read the original task carefully\n` +
               `2. Generate content that matches the ACTUAL task\n` +
               `3. DO NOT use code from other projects or templates\n` +
               `4. Every file must relate to: ${taskContext.substring(0, 80)}...`
      };
    }
    
    // Original check: Detect project mixing (content from wrong project type)
    if (taskProjectType && contentProjectType && taskProjectType !== contentProjectType) {
      // Check if this is an incompatible pair
      const incompatibleWith = INCOMPATIBLE_TYPES[taskProjectType] || [];
      if (incompatibleWith.includes(contentProjectType)) {
        console.error(`[ToolValidation] 🚨 CRITICAL: PROJECT MIXING DETECTED!`);
        console.error(`[ToolValidation]   Task type: ${taskProjectType}`);
        console.error(`[ToolValidation]   Content type: ${contentProjectType}`);
        console.error(`[ToolValidation]   File: ${filePath}`);
        
        return {
          valid: false,
          error: `🚨 CRITICAL: PROJECT MIXING DETECTED!\n\n` +
                 `You are creating content for a "${contentProjectType}" project, but the task is about "${taskProjectType}".\n\n` +
                 `THIS IS A SERIOUS ERROR. The AI is confusing multiple projects.\n\n` +
                 `⛔ BLOCKED: This file will NOT be written.\n\n` +
                 `TO FIX:\n` +
                 `1. Re-read the original task carefully\n` +
                 `2. Generate content that matches: ${taskContext.substring(0, 150)}...\n` +
                 `3. DO NOT mix code from other projects`
        };
      }
    }
    
    // ==========================================
    // CHECK 2c: Cross-File Consistency (NEW - Prevents mismatched files)
    // ==========================================
    // Check if this file is referenced by other files and verify consistency
    try {
      const htmlFiles: string[] = [];
      
      // Find all HTML files that might reference this JS file
      // Use a recursive function to scan the workspace
      const scanForHtmlFiles = (dir: string, basePath: string = ''): void => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
            
            if (entry.isFile() && entry.name.endsWith('.html')) {
              htmlFiles.push(fullPath);
            } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              scanForHtmlFiles(fullPath, relativePath);
            }
          }
        } catch (e) {
          // Skip directories we can't read
        }
      };
      
      scanForHtmlFiles(workspacePath);
      
      // Check each HTML file
      for (const htmlPath of htmlFiles) {
        try {
          const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
          // Check if HTML references this JS file
          const jsFileName = path.basename(filePath);
          if (htmlContent.includes(jsFileName) || htmlContent.includes(filePath)) {
            // Read the HTML to check what project type it expects
            const htmlProjectType = detectProjectTypeFromContent(htmlContent);
            
            // If HTML expects a game but JS is portfolio/debugger code, BLOCK IT
            if (htmlProjectType && contentProjectType && htmlProjectType !== contentProjectType) {
              console.error(`[ToolValidation] 🚨 CROSS-FILE MISMATCH DETECTED!`);
              console.error(`[ToolValidation]   HTML file (${path.basename(htmlPath)}) expects: ${htmlProjectType}`);
              console.error(`[ToolValidation]   JS file (${filePath}) contains: ${contentProjectType}`);
              
              return {
                valid: false,
                error: `🚨 CRITICAL: FILE MISMATCH DETECTED!\n\n` +
                       `The file "${path.basename(htmlPath)}" references "${filePath}", but they don't match!\n\n` +
                       `**HTML expects:** ${htmlProjectType} project\n` +
                       `**JS contains:** ${contentProjectType} project\n\n` +
                       `THIS IS A SERIOUS ERROR. Files in the same project must be consistent.\n\n` +
                       `⛔ BLOCKED: This file will NOT be written.\n\n` +
                       `TO FIX:\n` +
                       `1. Read the HTML file to see what it expects\n` +
                       `2. Generate JavaScript that matches the project type\n` +
                       `3. Ensure all files work together as a cohesive project\n` +
                       `4. DO NOT mix different project types in the same project`
              };
            }
          }
        } catch (e) {
          // Couldn't read HTML, skip
        }
      }
    } catch (e) {
      // Couldn't scan workspace, continue with other checks
    }
  }
  
  // ==========================================
  // CHECK 2b: Content Similarity Check for Existing Files
  // Prevents complete file replacement in FIX mode
  // ==========================================
  if (taskContext && content.length > 200) {
    const existingFilePath = sessionFileTracker.get(fileName)?.[0];
    if (existingFilePath && existingFilePath === filePath) {
      // This file was already created - check if new content is completely different
      // This catches the case where the AI "fixes" by generating entirely new content
      const taskLower = taskContext.toLowerCase();
      const isFix = /fix|debug|repair|check|review|issue|bug|problem/i.test(taskLower);
      
      if (isFix) {
        // In fix mode, warn about complete rewrites
        console.warn(`[ToolValidation] ⚠️ FIX MODE: Overwriting existing file "${filePath}"`);
        console.warn(`[ToolValidation] ⚠️ Consider using patch_file for surgical edits instead`);
        
        return {
          valid: true,
          warning: `FIX MODE WARNING: You are completely overwriting "${filePath}". ` +
                   `For bug fixes, use patch_file to make surgical edits instead of full file rewrites.`
        };
      }
    }
  }

  // ==========================================
  // CHECK 3: File Name vs Task Context
  // ==========================================
  if (taskContext) {
    const taskLower = taskContext.toLowerCase();
    
    // Check for common mismatches
    const mismatches: { [key: string]: string[] } = {
      'minecraft': ['tetris', 'snake', 'pong', 'breakout'],
      'tetris': ['minecraft', 'snake', 'pong'],
      'snake': ['minecraft', 'tetris', 'pong'],
      'voxel': ['tetris', 'snake'],
      'block': ['tetris', 'snake']
    };
    
    // If task mentions Minecraft/voxel/block, reject Tetris-related files
    if ((taskLower.includes('minecraft') || taskLower.includes('voxel') || taskLower.includes('block')) && 
        fileName.includes('tetris')) {
      return { 
        valid: false, 
        error: `write_file: File name "${fileName}" does not match task. Task is about Minecraft/voxel game, but file name suggests Tetris. Use appropriate names like: game.js, world.js, chunk.js, player.js, block.js` 
      };
    }
    
    // If task mentions Tetris, reject Minecraft-related files
    if (taskLower.includes('tetris') && 
        (fileName.includes('minecraft') || fileName.includes('voxel') || fileName.includes('chunk') || fileName.includes('block'))) {
      return { 
        valid: false, 
        error: `write_file: File name "${fileName}" does not match task. Task is about Tetris, but file name suggests Minecraft. Use appropriate names like: tetris.js, board.js, piece.js` 
      };
    }
    
    // If task mentions Tetris but content is clearly portfolio/other
    if (taskLower.includes('tetris') && content.length > 200) {
      const contentLower = content.toLowerCase();
      if (contentLower.includes('hamburger') && contentLower.includes('nav-menu')) {
        return {
          valid: false,
          error: `write_file: Content mismatch! Task is about Tetris but content contains portfolio/navigation code. ` +
                 `Generate Tetris game code instead.`
        };
      }
    }
  }

  // ==========================================
  // CHECK 4: Absolute Path Handling
  // ==========================================
  if (path.isAbsolute(filePath)) {
    // Try to extract relative path
    try {
      const relativePath = path.relative(workspacePath, filePath);
      if (!relativePath.startsWith('..')) {
        console.warn(`[ToolValidation] Fixed absolute path: ${filePath} -> ${relativePath}`);
        return { valid: true, fixedPath: relativePath };
      }
    } catch (e) {
      // Path resolution failed
    }
    return { 
      valid: false, 
      error: `write_file: absolute path detected (${filePath}). Use relative paths only.` 
    };
  }

  // ==========================================
  // CHECK 5: Path Within Workspace
  // ==========================================
  try {
    const resolvedPath = path.resolve(workspacePath, filePath);
    const normalizedWorkspace = path.normalize(workspacePath);
    const normalizedResolved = path.normalize(resolvedPath);

    if (!normalizedResolved.startsWith(normalizedWorkspace)) {
      return { 
        valid: false, 
        error: `write_file: path outside workspace: ${filePath}` 
      };
    }
  } catch (e) {
    return { 
      valid: false, 
      error: `write_file: invalid path: ${filePath}` 
    };
  }

  // ==========================================
  // CHECK 6: Content Present
  // ==========================================
  if (args.content === undefined) {
    return { valid: false, error: 'write_file: missing content argument' };
  }

  return { valid: true };
}

/**
 * Validate run_command tool call
 */
function validateRunCommand(toolCall: any): ValidationResult {
  const args = toolCall.arguments || {};
  const command = args.command;

  if (!command) {
    return { valid: false, error: 'run_command: missing command argument' };
  }

  // Check for dangerous commands (optional - can be expanded)
  const dangerousCommands = ['rm -rf', 'del /f', 'format', 'mkfs'];
  const lowerCommand = command.toLowerCase();
  for (const dangerous of dangerousCommands) {
    if (lowerCommand.includes(dangerous)) {
      return { 
        valid: false, 
        error: `run_command: potentially dangerous command detected: ${dangerous}` 
      };
    }
  }

  return { valid: true };
}

/**
 * Validate scaffold_project tool call
 */
function validateScaffoldProject(toolCall: any, workspacePath: string): ValidationResult {
  const args = toolCall.arguments || {};
  const projectPath = args.project_path || args.path;

  if (!projectPath) {
    return { valid: false, error: 'scaffold_project: missing project_path argument' };
  }

  // Similar validation as write_file
  if (path.isAbsolute(projectPath)) {
    try {
      const relativePath = path.relative(workspacePath, projectPath);
      if (!relativePath.startsWith('..')) {
        console.warn(`[ToolValidation] Fixed absolute path: ${projectPath} -> ${relativePath}`);
        return { valid: true, fixedPath: relativePath };
      }
    } catch (e) {
      // Path resolution failed
    }
    return { 
      valid: false, 
      error: `scaffold_project: absolute path detected (${projectPath}). Use relative paths only.` 
    };
  }

  return { valid: true };
}

/**
 * Validate index.html has required CSS/JS links
 * This catches the common mistake of creating CSS files but not linking them
 * 
 * ENHANCED: Now returns hard failures for missing CSS links and can auto-fix
 */
export function validateIndexHtml(content: string, createdFiles: Map<string, string[]>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const contentLower = content.toLowerCase();
  
  // Get list of CSS files that were created
  const cssFiles = Array.from(createdFiles.keys()).filter(f => 
    f.endsWith('.css') && !f.includes('node_modules')
  );
  
  // Get list of JS files that were created (excluding config files)
  const jsFiles = Array.from(createdFiles.keys()).filter(f => 
    (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx')) && 
    !f.includes('node_modules') &&
    !f.includes('config') &&
    !f.includes('.config.')
  );
  
  // Check if index.html has ANY stylesheet link
  const hasStylesheetLink = contentLower.includes('rel="stylesheet"') || 
                            contentLower.includes("rel='stylesheet'");
  
  // Check if index.html has ANY script tag
  const hasScriptTag = contentLower.includes('<script');
  
  // 🚨 HARD FAILURE: CSS files created but no stylesheet link
  if (cssFiles.length > 0 && !hasStylesheetLink) {
    errors.push(
      `🚨 CRITICAL ERROR: CSS file(s) created (${cssFiles.join(', ')}) but index.html has NO <link rel="stylesheet"> tag!\n` +
      `The page will appear completely unstyled (404 for CSS).\n` +
      `FIX: Add this inside <head>: <link rel="stylesheet" href="/${cssFiles[0]}" />`
    );
  }
  
  // If JS files were created but no script tag (and not a Vite project with main.tsx)
  const isViteProject = content.includes('type="module"');
  if (jsFiles.length > 0 && !hasScriptTag && !isViteProject) {
    // Filter to main JS files only
    const mainJsFiles = jsFiles.filter(f => 
      f.includes('main') || f.includes('script') || f.includes('game') || f.includes('app')
    );
    
    if (mainJsFiles.length > 0) {
      errors.push(
        `🚨 ERROR: JS file(s) created (${mainJsFiles.join(', ')}) but index.html has no <script> tag!\n` +
        `The JavaScript will not run (404 for JS).\n` +
        `FIX: Add before </body>: <script src="/${mainJsFiles[0]}"></script>`
      );
    }
  }
  
  // Check for specific CSS file references
  for (const cssFile of cssFiles) {
    const fileName = cssFile.split('/').pop() || cssFile;
    if (!content.includes(cssFile) && !content.includes(fileName)) {
      errors.push(
        `CSS file "${cssFile}" was created but is not referenced in index.html.\n` +
        `FIX: Add inside <head>: <link rel="stylesheet" href="/${cssFile}" />`
      );
    }
  }
  
  // Return errors (hard failures) before warnings
  if (errors.length > 0) {
    return {
      valid: false,
      error: `🚨 index.html CRITICAL ERRORS (will cause 404s):\n\n${errors.join('\n\n')}`
    };
  }
  
  if (warnings.length > 0) {
    return {
      valid: true,  // Warnings don't block, but are reported
      warning: `⚠️ index.html warnings:\n${warnings.join('\n')}`
    };
  }
  
  return { valid: true };
}

/**
 * Auto-fix index.html by adding missing CSS and JS links
 * This prevents 404 errors by ensuring all created files are properly referenced
 */
export function autoFixIndexHtml(
  content: string, 
  cssFiles: string[], 
  jsFiles: string[]
): { fixed: boolean; content: string; changes: string[] } {
  let fixedContent = content;
  const changes: string[] = [];
  
  // Find the </head> tag to insert CSS links
  const headCloseIndex = fixedContent.toLowerCase().indexOf('</head>');
  
  // Find the </body> tag to insert JS links
  const bodyCloseIndex = fixedContent.toLowerCase().indexOf('</body>');
  
  // Add missing CSS links
  for (const cssFile of cssFiles) {
    const fileName = cssFile.split('/').pop() || cssFile;
    const contentLower = fixedContent.toLowerCase();
    
    if (!contentLower.includes(cssFile) && !contentLower.includes(fileName)) {
      const linkTag = `    <link rel="stylesheet" href="/${cssFile}" />\n`;
      
      if (headCloseIndex !== -1) {
        // Insert before </head>
        const insertPosition = fixedContent.indexOf('</head>');
        fixedContent = 
          fixedContent.slice(0, insertPosition) + 
          linkTag + 
          fixedContent.slice(insertPosition);
        
        changes.push(`Added CSS link: ${cssFile}`);
      }
    }
  }
  
  // Add missing JS links (only for main files)
  const mainJsFiles = jsFiles.filter(f => 
    f.includes('main') || f.includes('script') || f.includes('game') || f.includes('app')
  );
  
  for (const jsFile of mainJsFiles) {
    const fileName = jsFile.split('/').pop() || jsFile;
    const contentLower = fixedContent.toLowerCase();
    
    if (!contentLower.includes(jsFile) && !contentLower.includes(fileName)) {
      const scriptTag = `    <script src="/${jsFile}"></script>\n`;
      
      // Find current position of </body> (may have moved)
      const currentBodyClose = fixedContent.indexOf('</body>');
      if (currentBodyClose !== -1) {
        // Insert before </body>
        fixedContent = 
          fixedContent.slice(0, currentBodyClose) + 
          scriptTag + 
          fixedContent.slice(currentBodyClose);
        
        changes.push(`Added JS script: ${jsFile}`);
      }
    }
  }
  
  return {
    fixed: changes.length > 0,
    content: fixedContent,
    changes
  };
}

/**
 * Validate JavaScript files for bundler-only syntax
 * Catches issues like "import './styles.css'" which only work with Vite/Webpack
 */
export function validateJavaScriptFile(content: string, filePath: string): ValidationResult {
  const warnings: string[] = [];
  
  // Check for CSS imports (Vite-specific, won't work in browser)
  const cssImportMatch = content.match(/import\s+['"][^'"]+\.css['"]/g);
  if (cssImportMatch) {
    warnings.push(
      `CRITICAL: File "${filePath}" uses Vite-style CSS import: "${cssImportMatch[0]}"\n` +
      `This ONLY works when running through a bundler (npm run dev).\n` +
      `If user opens index.html directly, the ENTIRE JavaScript will FAIL to load!\n` +
      `Either:\n` +
      `  1. Add <link rel="stylesheet" href="..."> to index.html AND remove CSS import, OR\n` +
      `  2. Make sure README clearly states user MUST run "npm run dev" to use the project`
    );
  }
  
  // Check for other bundler-only imports
  const assetImports = content.match(/import\s+\w+\s+from\s+['"][^'"]+\.(png|jpg|svg|gif|woff|woff2)['"]/) ;
  if (assetImports) {
    warnings.push(
      `WARNING: File "${filePath}" imports assets directly: "${assetImports[0]}"\n` +
      `This requires a bundler. Ensure README specifies "npm run dev" is required.`
    );
  }
  
  if (warnings.length > 0) {
    return {
      valid: true,  // Allow but warn - might be intentional Vite project
      warning: warnings.join('\n')
    };
  }
  
  return { valid: true };
}

/**
 * Validate package.json for cross-platform compatibility
 */
export function validatePackageJson(content: string): ValidationResult {
  try {
    const pkg = JSON.parse(content);
    const warnings: string[] = [];
    const errors: string[] = [];
    
    if (pkg.scripts) {
      // Check for macOS-only commands
      for (const [scriptName, scriptCmd] of Object.entries(pkg.scripts)) {
        const cmd = String(scriptCmd).toLowerCase();
        
        // "open" command is macOS only
        if (cmd.startsWith('open ') || cmd.includes(' open ')) {
          errors.push(
            `🚨 Script "${scriptName}" uses "open" command which only works on macOS.\n` +
            `   Windows/Linux users will get: "'open' is not recognized as an internal or external command"\n` +
            `   FIX: Use "npx serve" or "npx http-server" for web projects.`
          );
        }
        
        // "xdg-open" is Linux only
        if (cmd.includes('xdg-open')) {
          errors.push(
            `🚨 Script "${scriptName}" uses "xdg-open" which only works on Linux.\n` +
            `   FIX: Use cross-platform tools like "npx serve" or "npx open-cli".`
          );
        }
        
        // "start" without proper escaping might fail
        if (cmd === 'start' || cmd.startsWith('start ')) {
          if (!cmd.includes('npm') && !cmd.includes('node')) {
            warnings.push(
              `Script "${scriptName}" uses Windows "start" command - may not work on macOS/Linux.\n` +
              `   Consider using cross-platform alternatives.`
            );
          }
        }
      }
    }

    // Bundler required when browser npm packages are used (bare imports are not resolved by static servers)
    const browserPackagesNeedingBundler = [
      'three',
      'react',
      'react-dom',
      'vue',
      'svelte',
      '@react-three/fiber',
      'pixi.js',
      '@pixi/react'
    ];
    const hasBrowserNpmDep = browserPackagesNeedingBundler.some((name) => Boolean(pkg.dependencies?.[name]));
    const hasBundler =
      Boolean(
        pkg.devDependencies?.vite ||
          pkg.devDependencies?.webpack ||
          pkg.devDependencies?.parcel ||
          pkg.devDependencies?.rollup ||
          pkg.dependencies?.vite
      );
    if (hasBrowserNpmDep && !hasBundler) {
      errors.push(
        `🚨 Browser npm dependencies (e.g. three, react) require a bundler. Plain "npx serve" / "serve" only serves static files — the browser cannot resolve bare imports like import * as THREE from 'three'. ` +
          `Add devDependencies: { "vite": "^5.4.0" }, scripts: { "dev": "vite", "build": "vite build", "preview": "vite preview", "start": "vite" }, and a root vite.config.js. README must say: npm install && npm run dev.`
      );
    }
    
    if (errors.length > 0) {
      return {
        valid: false,
        error: `Cross-platform ERRORS in package.json (project won't work on all OSes):\n\n${errors.join('\n\n')}`
      };
    }
    
    if (warnings.length > 0) {
      return {
        valid: true,  // Don't block, just warn
        warning: `Cross-platform warnings in package.json:\n${warnings.join('\n')}`
      };
    }
    
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid JSON in package.json' };
  }
}

/**
 * Auto-fix package.json scripts for cross-platform compatibility
 * Converts macOS/Linux specific commands to cross-platform alternatives
 */
export function autoFixPackageJsonScripts(content: string): { 
  fixed: boolean; 
  content: string; 
  changes: string[] 
} {
  try {
    const pkg = JSON.parse(content);
    const changes: string[] = [];
    let modified = false;
    
    if (pkg.scripts) {
      for (const [scriptName, scriptCmd] of Object.entries(pkg.scripts)) {
        const cmd = String(scriptCmd);
        let newCmd = cmd;
        
        // Fix "open" command (macOS)
        if (cmd.toLowerCase().includes('open ')) {
          // Pattern: "open index.html" -> "npx serve ."
          // Pattern: "open http://localhost:3000" -> "node -e \"require('open')('http://localhost:3000')\""
          if (cmd.match(/open\s+(index\.html|\.\/|\.)/i)) {
            // Opening a local HTML file - use serve
            newCmd = 'npx serve .';
            changes.push(`${scriptName}: Replaced "open ..." with "npx serve ." (cross-platform static server)`);
            modified = true;
          } else if (cmd.match(/open\s+https?:/i)) {
            // Opening a URL - use open-cli (cross-platform)
            const urlMatch = cmd.match(/open\s+(https?:[^\s]+)/i);
            if (urlMatch) {
              newCmd = cmd.replace(/open\s+/, 'npx open-cli ');
              changes.push(`${scriptName}: Replaced "open" with "npx open-cli" (cross-platform URL opener)`);
              modified = true;
            }
          } else {
            // Generic open replacement
            newCmd = cmd.replace(/\bopen\b/g, 'npx open-cli');
            changes.push(`${scriptName}: Replaced "open" with "npx open-cli"`);
            modified = true;
          }
        }
        
        // Fix "xdg-open" command (Linux)
        if (cmd.includes('xdg-open')) {
          newCmd = cmd.replace(/xdg-open/g, 'npx open-cli');
          changes.push(`${scriptName}: Replaced "xdg-open" with "npx open-cli" (cross-platform)`);
          modified = true;
        }
        
        // Fix common pattern: "start index.html" (Windows) 
        // This often appears with && chains
        if (cmd.match(/^\s*start\s+[^"'`\s]+\.(html|htm)/i)) {
          newCmd = 'npx serve .';
          changes.push(`${scriptName}: Replaced "start index.html" with "npx serve ."`);
          modified = true;
        }
        
        // Update if changed
        if (newCmd !== cmd) {
          pkg.scripts[scriptName] = newCmd;
        }
      }
      
      // Add serve as devDependency if we're using it
      if (changes.some(c => c.includes('npx serve'))) {
        if (!pkg.devDependencies) pkg.devDependencies = {};
        if (!pkg.devDependencies['serve'] && !pkg.dependencies?.['serve']) {
          pkg.devDependencies['serve'] = '^14.0.0';
          changes.push('Added "serve" as devDependency for cross-platform static file serving');
          modified = true;
        }
      }
      
      // Add open-cli if we're using it
      if (changes.some(c => c.includes('open-cli'))) {
        if (!pkg.devDependencies) pkg.devDependencies = {};
        if (!pkg.devDependencies['open-cli'] && !pkg.dependencies?.['open-cli']) {
          pkg.devDependencies['open-cli'] = '^7.0.0';
          changes.push('Added "open-cli" as devDependency for cross-platform URL opening');
          modified = true;
        }
      }
    }

    // If package.json lists browser npm packages but no bundler, add Vite (fixes broken "serve + three" projects)
    try {
      const browserPkgs = [
        'three',
        'react',
        'react-dom',
        'vue',
        'svelte',
        '@react-three/fiber',
        'pixi.js',
        '@pixi/react'
      ];
      const hasBrowserDep = browserPkgs.some((n) => Boolean(pkg.dependencies?.[n]));
      const hasBundler =
        Boolean(
          pkg.devDependencies?.vite ||
            pkg.devDependencies?.webpack ||
            pkg.devDependencies?.parcel ||
            pkg.dependencies?.vite
        );
      if (hasBrowserDep && !hasBundler) {
        if (!pkg.devDependencies) pkg.devDependencies = {};
        pkg.devDependencies.vite = pkg.devDependencies.vite || '^5.4.0';
        pkg.scripts = pkg.scripts || {};
        const devCmd = String(pkg.scripts.dev || '');
        const startCmd = String(pkg.scripts.start || '');
        if (!pkg.scripts.dev || devCmd.includes('serve')) pkg.scripts.dev = 'vite';
        if (!pkg.scripts.start || startCmd.includes('serve') || startCmd === 'npx serve') pkg.scripts.start = 'vite';
        if (!pkg.scripts.build) pkg.scripts.build = 'vite build';
        if (!pkg.scripts.preview) pkg.scripts.preview = 'vite preview';
        changes.push(
          'Added Vite and aligned scripts — npm packages in browser code need a bundler; "npx serve" alone cannot resolve bare imports'
        );
        modified = true;
      }
    } catch {
      // ignore
    }
    
    return {
      fixed: modified,
      content: modified ? JSON.stringify(pkg, null, 2) : content,
      changes
    };
  } catch (e) {
    return { fixed: false, content, changes: [`Error parsing package.json: ${e}`] };
  }
}

/**
 * Analyze project files for orphaned code
 * Returns list of files that appear to be unused/unreferenced
 */
export function detectOrphanedFiles(
  files: Map<string, string>,
  entryPoint: string = 'index.html'
): string[] {
  const orphaned: string[] = [];
  const entryContent = files.get(entryPoint) || '';
  
  for (const [filePath, content] of files) {
    if (filePath === entryPoint) continue;
    
    const fileName = path.basename(filePath);
    const fileNameNoExt = path.basename(filePath, path.extname(filePath));
    
    // Check if this file is referenced anywhere
    let isReferenced = false;
    
    // Check in entry point
    if (entryContent.includes(filePath) || 
        entryContent.includes(fileName) ||
        entryContent.includes(`src="${filePath}"`) ||
        entryContent.includes(`href="${filePath}"`)) {
      isReferenced = true;
    }
    
    // Check if referenced by other files
    if (!isReferenced) {
      for (const [otherPath, otherContent] of files) {
        if (otherPath === filePath) continue;
        
        // Check for import/require statements or script/link tags
        if (otherContent.includes(`import`) && 
            (otherContent.includes(`from './${fileNameNoExt}'`) ||
             otherContent.includes(`from "./${fileNameNoExt}"`) ||
             otherContent.includes(`from '${filePath}'`) ||
             otherContent.includes(`from "${filePath}"`))) {
          isReferenced = true;
          break;
        }
        
        if (otherContent.includes(`require('${filePath}')`) ||
            otherContent.includes(`require("./${fileNameNoExt}")`)) {
          isReferenced = true;
          break;
        }
      }
    }
    
    // Exclude common config files that don't need references
    const configFiles = [
      'package.json', 'package-lock.json', 'tsconfig.json', 
      'vite.config.ts', 'webpack.config.js', '.gitignore',
      'README.md', '.env', '.env.example'
    ];
    
    if (!isReferenced && !configFiles.includes(fileName)) {
      // Only flag JS/TS/CSS files as potentially orphaned
      const ext = path.extname(filePath).toLowerCase();
      if (['.js', '.ts', '.jsx', '.tsx', '.css', '.scss'].includes(ext)) {
        orphaned.push(filePath);
      }
    }
  }
  
  return orphaned;
}

/**
 * Fix a tool call based on validation result
 */
export function fixToolCall(toolCall: any, validation: ValidationResult): any {
  if (validation.valid && validation.fixedPath) {
    const fixed = { ...toolCall };
    if (fixed.arguments) {
      fixed.arguments = { ...fixed.arguments };
      fixed.arguments.path = validation.fixedPath;
    }
    return fixed;
  }
  return toolCall;
}

