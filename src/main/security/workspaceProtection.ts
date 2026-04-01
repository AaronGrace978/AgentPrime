/**
 * Workspace Protection & Hallucination Detection
 * 
 * Prevents AgentPrime from:
 * 1. Operating on its own codebase files
 * 2. Making claims about non-existent files (hallucinations)
 * 3. Misreading file content
 * 
 * This module provides security validation to ensure AgentPrime
 * only operates on intended user projects, not its own source files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================
// WORKSPACE BOUNDARY PROTECTION
// ============================================================

/**
 * Get the AgentPrime installation root directory
 * This is used to detect if a workspace is AgentPrime's own codebase
 */
const AGENTPRIME_PACKAGE_NAMES = new Set(['agentprime', 'agent-prime']);
const AGENTPRIME_DEV_MARKERS = [
  'src/main/agent-loop.ts',
  'src/main/main.ts',
];

function normalizePathForComparison(targetPath: string): string {
  const normalizedPath = path.normalize(path.resolve(targetPath));
  return process.platform === 'win32'
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}

function isSameOrSubdirectory(basePath: string, targetPath: string): boolean {
  const relativePath = path.relative(
    normalizePathForComparison(basePath),
    normalizePathForComparison(targetPath),
  );

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function readPackageName(dirPath: string): string | null {
  const packageJsonPath = path.join(dirPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return typeof pkg.name === 'string' ? pkg.name : null;
  } catch {
    return null;
  }
}

function looksLikeAgentPrimeRoot(candidatePath: string): boolean {
  const packageName = readPackageName(candidatePath);
  if (packageName && AGENTPRIME_PACKAGE_NAMES.has(packageName)) {
    return true;
  }

  return AGENTPRIME_DEV_MARKERS.every(marker => fs.existsSync(path.join(candidatePath, marker)));
}

function getAgentPrimeRoot(): string | null {
  let currentPath = path.resolve(__dirname);
  const visited = new Set<string>();

  while (!visited.has(normalizePathForComparison(currentPath))) {
    if (looksLikeAgentPrimeRoot(currentPath)) {
      return path.normalize(currentPath);
    }

    visited.add(normalizePathForComparison(currentPath));
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  return null;
}

/**
 * Check if a given path is within AgentPrime's own codebase
 * This prevents AgentPrime from modifying its own source files
 */
export function isAgentPrimeCodebase(targetPath: string): boolean {
  const agentPrimeRoot = getAgentPrimeRoot();
  return agentPrimeRoot ? isSameOrSubdirectory(agentPrimeRoot, targetPath) : false;
}

/**
 * Check if a workspace is AgentPrime's own codebase
 * Returns detailed information for logging
 */
export function validateWorkspaceNotSelf(workspacePath: string): WorkspaceValidation {
  const agentPrimeRoot = getAgentPrimeRoot();
  const isSelfCodebase = agentPrimeRoot
    ? isSameOrSubdirectory(agentPrimeRoot, workspacePath)
    : false;
  const agentPrimeRootLabel = agentPrimeRoot ?? '[unresolved]';

  const workspacePackageName = readPackageName(workspacePath);
  if (workspacePackageName && AGENTPRIME_PACKAGE_NAMES.has(workspacePackageName)) {
    return {
      valid: false,
      isSelfCodebase: true,
      reason: 'Workspace is AgentPrime\'s own codebase (detected by package.json)',
      workspacePath,
      agentPrimeRoot: agentPrimeRootLabel
    };
  }
  
  // Also check for specific AgentPrime markers
  const markers = [
    'src/main/agent-loop.ts',
    'src/main/main.ts',
    'dist/main/main.js',
    'package.json'
  ];
  
  let markerCount = 0;
  let foundMarkers: string[] = [];
  
  for (const marker of markers) {
    const markerPath = path.join(workspacePath, marker);
    if (fs.existsSync(markerPath)) {
      markerCount++;
      foundMarkers.push(marker);
      
    }
  }
  
  // If path matches AND has multiple markers, it's definitely AgentPrime
  if (isSelfCodebase && markerCount >= 2) {
    return {
      valid: false,
      isSelfCodebase: true,
      reason: `Workspace appears to be AgentPrime's codebase (${markerCount} markers found: ${foundMarkers.join(', ')})`,
      workspacePath,
      agentPrimeRoot: agentPrimeRootLabel
    };
  }
  
  // Path check alone
  if (isSelfCodebase) {
    return {
      valid: false,
      isSelfCodebase: true,
      reason: 'Workspace path is within AgentPrime installation directory',
      workspacePath,
      agentPrimeRoot: agentPrimeRootLabel
    };
  }
  
  return {
    valid: true,
    isSelfCodebase: false,
    reason: 'Workspace is valid user project',
    workspacePath,
    agentPrimeRoot: agentPrimeRootLabel
  };
}

export interface WorkspaceValidation {
  valid: boolean;
  isSelfCodebase: boolean;
  reason: string;
  workspacePath: string;
  agentPrimeRoot: string;
}

// ============================================================
// FILE EXISTENCE PRE-FLIGHT CHECKS
// ============================================================

/**
 * Verify that a file exists before making claims about it
 */
export function validateFileExists(filePath: string, workspacePath: string): FileExistenceResult {
  const fullPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(workspacePath, filePath);
  
  const normalizedPath = path.normalize(fullPath);
  
  try {
    const stats = fs.statSync(normalizedPath);
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      path: normalizedPath,
      relativePath: path.relative(workspacePath, normalizedPath)
    };
  } catch (e) {
    return {
      exists: false,
      isFile: false,
      isDirectory: false,
      size: 0,
      path: normalizedPath,
      relativePath: path.relative(workspacePath, normalizedPath),
      error: e instanceof Error ? e.message : 'Unknown error'
    };
  }
}

export interface FileExistenceResult {
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  path: string;
  relativePath: string;
  error?: string;
}

/**
 * Batch check multiple files for existence
 */
export function validateFilesExist(filePaths: string[], workspacePath: string): Map<string, FileExistenceResult> {
  const results = new Map<string, FileExistenceResult>();
  
  for (const filePath of filePaths) {
    results.set(filePath, validateFileExists(filePath, workspacePath));
  }
  
  return results;
}

// ============================================================
// CONTENT VERIFICATION WITH CHECKSUMS
// ============================================================

/**
 * Calculate a simple hash of file content for verification
 */
export function calculateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').substring(0, 16);
}

/**
 * Verify file content matches expected hash
 */
export function verifyContentHash(filePath: string, expectedHash: string, workspacePath: string): ContentVerification {
  const fullPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(workspacePath, filePath);
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        verified: false,
        reason: 'File does not exist',
        expectedHash,
        actualHash: null,
        path: fullPath
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const actualHash = calculateContentHash(content);
    
    return {
      verified: actualHash === expectedHash,
      reason: actualHash === expectedHash 
        ? 'Content hash matches' 
        : 'Content hash mismatch - file may have been modified',
      expectedHash,
      actualHash,
      path: fullPath,
      contentLength: content.length
    };
  } catch (e) {
    return {
      verified: false,
      reason: e instanceof Error ? e.message : 'Failed to read file',
      expectedHash,
      actualHash: null,
      path: fullPath
    };
  }
}

export interface ContentVerification {
  verified: boolean;
  reason: string;
  expectedHash: string;
  actualHash: string | null;
  path: string;
  contentLength?: number;
}

/**
 * Create a content snapshot for later verification
 */
export function createContentSnapshot(filePath: string, workspacePath: string): ContentSnapshot | null {
  const fullPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(workspacePath, filePath);
  
  try {
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    return {
      path: fullPath,
      relativePath: path.relative(workspacePath, fullPath),
      content,
      hash: calculateContentHash(content),
      size: content.length,
      timestamp: Date.now()
    };
  } catch (e) {
    console.error(`[WorkspaceProtection] Failed to create snapshot for ${filePath}:`, e);
    return null;
  }
}

export interface ContentSnapshot {
  path: string;
  relativePath: string;
  content: string;
  hash: string;
  size: number;
  timestamp: number;
}

// ============================================================
// HALLUCINATION DETECTION
// ============================================================

/**
 * Extract file references from model response text
 * Looks for patterns like:
 * - `file.js`
 * - "file.js"
 * - file.js (line 123)
 * - path/to/file.js
 */
export function extractFileReferences(text: string): FileReference[] {
  const references: FileReference[] = [];
  
  // Common file extensions
  const extensions = ['js', 'ts', 'tsx', 'jsx', 'css', 'html', 'json', 'py', 'md', 'txt', 'yaml', 'yml'];
  const extPattern = extensions.join('|');
  
  // Pattern 1: Backtick-quoted files like `file.js`
  const backtickPattern = new RegExp(`\`([^\\s\`]+\\.(${extPattern}))\``, 'gi');
  let backtickMatch: RegExpExecArray | null;
  while ((backtickMatch = backtickPattern.exec(text)) !== null) {
    references.push({
      path: backtickMatch[1],
      context: text.substring(Math.max(0, backtickMatch.index - 50), Math.min(text.length, backtickMatch.index + 100)),
      type: 'backtick'
    });
  }
  
  // Pattern 2: Double-quoted files like "file.js"
  const quotePattern = new RegExp(`"([^"\\s]+\\.(${extPattern}))"`, 'gi');
  let quoteMatch: RegExpExecArray | null;
  while ((quoteMatch = quotePattern.exec(text)) !== null) {
    if (!references.some(r => r.path === quoteMatch![1])) {
      references.push({
        path: quoteMatch[1],
        context: text.substring(Math.max(0, quoteMatch.index - 50), Math.min(text.length, quoteMatch.index + 100)),
        type: 'quoted'
      });
    }
  }
  
  // Pattern 3: File with line number like "file.js line 346" or "file.js:346"
  const linePattern = new RegExp(`([\\w/.-]+\\.(${extPattern}))(?:\\s+line\\s+(\\d+)|:(\\d+))`, 'gi');
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = linePattern.exec(text)) !== null) {
    const lineNum = lineMatch[3] || lineMatch[4];
    if (!references.some(r => r.path === lineMatch![1])) {
      references.push({
        path: lineMatch[1],
        lineNumber: lineNum ? parseInt(lineNum) : undefined,
        context: text.substring(Math.max(0, lineMatch.index - 50), Math.min(text.length, lineMatch.index + 100)),
        type: 'line_reference'
      });
    }
  }
  
  return references;
}

export interface FileReference {
  path: string;
  lineNumber?: number;
  context: string;
  type: 'backtick' | 'quoted' | 'line_reference' | 'plain';
}

/**
 * Detect hallucinations in model response
 * Returns list of claims about files that don't exist
 */
export function detectHallucinations(modelResponse: string, workspacePath: string): HallucinationReport {
  const fileReferences = extractFileReferences(modelResponse);
  const hallucinations: Hallucination[] = [];
  const verified: VerifiedReference[] = [];
  
  for (const ref of fileReferences) {
    const existence = validateFileExists(ref.path, workspacePath);
    
    if (!existence.exists) {
      hallucinations.push({
        type: 'non_existent_file',
        claimedPath: ref.path,
        lineNumber: ref.lineNumber,
        context: ref.context,
        suggestion: `File "${ref.path}" does not exist. Model may have hallucinated this file.`
      });
    } else {
      // File exists, but if there's a line number claim, verify the line exists
      if (ref.lineNumber && existence.isFile) {
        const fullPath = path.join(workspacePath, ref.path);
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          
          if (ref.lineNumber > lines.length) {
            hallucinations.push({
              type: 'non_existent_line',
              claimedPath: ref.path,
              lineNumber: ref.lineNumber,
              context: ref.context,
              suggestion: `File "${ref.path}" only has ${lines.length} lines, but model claimed line ${ref.lineNumber}.`
            });
          } else {
            verified.push({
              path: ref.path,
              lineNumber: ref.lineNumber,
              lineContent: lines[ref.lineNumber - 1]
            });
          }
        } catch (e) {
          // Couldn't read file
        }
      } else {
        verified.push({
          path: ref.path,
          size: existence.size
        });
      }
    }
  }
  
  return {
    hasHallucinations: hallucinations.length > 0,
    hallucinations,
    verified,
    totalReferences: fileReferences.length,
    hallucinationRate: fileReferences.length > 0 
      ? hallucinations.length / fileReferences.length 
      : 0
  };
}

export interface Hallucination {
  type: 'non_existent_file' | 'non_existent_line' | 'wrong_content' | 'misidentified_type';
  claimedPath: string;
  lineNumber?: number;
  context: string;
  suggestion: string;
}

export interface VerifiedReference {
  path: string;
  lineNumber?: number;
  lineContent?: string;
  size?: number;
}

export interface HallucinationReport {
  hasHallucinations: boolean;
  hallucinations: Hallucination[];
  verified: VerifiedReference[];
  totalReferences: number;
  hallucinationRate: number;
}

// ============================================================
// PROJECT TYPE DETECTION
// ============================================================

/**
 * Detect if content looks like game code vs portfolio/website code
 * Used to prevent content type mismatches
 */
export function detectContentType(content: string): ContentTypeDetection {
  const contentLower = content.toLowerCase();
  
  // Game indicators
  const gameIndicators = [
    'game', 'player', 'enemy', 'score', 'level', 'sprite', 'collision',
    'physics', 'velocity', 'gameloop', 'game loop', 'animation frame',
    'requestanimationframe', 'canvas', 'three.js', 'phaser', 'pixi',
    'webgl', 'mesh', 'scene', 'renderer'
  ];
  
  // Portfolio/website indicators
  const portfolioIndicators = [
    'portfolio', 'about me', 'contact', 'resume', 'navigation',
    'hamburger', 'nav-menu', 'hero', 'testimonial', 'skills',
    'experience', 'education', 'projects section', 'footer'
  ];
  
  // Debugger/tool indicators
  const debuggerIndicators = [
    'debugger', 'code analyzer', 'lint', 'error pattern',
    'syntax check', 'ast', 'parse tree', 'tokenize'
  ];
  
  let gameScore = 0;
  let portfolioScore = 0;
  let debuggerScore = 0;
  
  for (const indicator of gameIndicators) {
    if (contentLower.includes(indicator)) gameScore++;
  }
  
  for (const indicator of portfolioIndicators) {
    if (contentLower.includes(indicator)) portfolioScore++;
  }
  
  for (const indicator of debuggerIndicators) {
    if (contentLower.includes(indicator)) debuggerScore++;
  }
  
  // Determine primary type
  const maxScore = Math.max(gameScore, portfolioScore, debuggerScore);
  let primaryType: 'game' | 'portfolio' | 'debugger' | 'unknown' = 'unknown';
  
  if (maxScore > 0) {
    if (gameScore === maxScore) primaryType = 'game';
    else if (portfolioScore === maxScore) primaryType = 'portfolio';
    else if (debuggerScore === maxScore) primaryType = 'debugger';
  }
  
  return {
    primaryType,
    scores: {
      game: gameScore,
      portfolio: portfolioScore,
      debugger: debuggerScore
    },
    confidence: maxScore > 3 ? 'high' : maxScore > 1 ? 'medium' : 'low',
    indicators: {
      game: gameIndicators.filter(i => contentLower.includes(i)),
      portfolio: portfolioIndicators.filter(i => contentLower.includes(i)),
      debugger: debuggerIndicators.filter(i => contentLower.includes(i))
    }
  };
}

export interface ContentTypeDetection {
  primaryType: 'game' | 'portfolio' | 'debugger' | 'unknown';
  scores: {
    game: number;
    portfolio: number;
    debugger: number;
  };
  confidence: 'high' | 'medium' | 'low';
  indicators: {
    game: string[];
    portfolio: string[];
    debugger: string[];
  };
}

/**
 * Verify that content type matches task type
 */
export function verifyContentMatchesTask(content: string, task: string): ContentTaskMatch {
  const contentType = detectContentType(content);
  const taskType = detectContentType(task);
  
  // If task mentions game but content is portfolio, that's a mismatch
  const isMismatch = 
    (taskType.scores.game > taskType.scores.portfolio && 
     contentType.primaryType === 'portfolio') ||
    (taskType.scores.game > taskType.scores.portfolio && 
     contentType.primaryType === 'debugger');
  
  return {
    matches: !isMismatch,
    taskType: taskType.primaryType,
    contentType: contentType.primaryType,
    reason: isMismatch 
      ? `Task appears to be ${taskType.primaryType} but content is ${contentType.primaryType}`
      : 'Content type matches task type',
    taskIndicators: taskType.indicators,
    contentIndicators: contentType.indicators
  };
}

export interface ContentTaskMatch {
  matches: boolean;
  taskType: 'game' | 'portfolio' | 'debugger' | 'unknown';
  contentType: 'game' | 'portfolio' | 'debugger' | 'unknown';
  reason: string;
  taskIndicators: ContentTypeDetection['indicators'];
  contentIndicators: ContentTypeDetection['indicators'];
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  // Workspace boundary
  isAgentPrimeCodebase,
  validateWorkspaceNotSelf,
  
  // File existence
  validateFileExists,
  validateFilesExist,
  
  // Content verification
  calculateContentHash,
  verifyContentHash,
  createContentSnapshot,
  
  // Hallucination detection
  extractFileReferences,
  detectHallucinations,
  
  // Content type detection
  detectContentType,
  verifyContentMatchesTask
};
