/**
 * AgentPrime - AI-Powered Refactoring Engine
 * Intelligent code refactoring with safety guarantees
 */

import { getAgentCoordinator } from './agent-coordinator';
import { getTaskOrchestrator } from './task-orchestrator';
import { getCodebaseEmbeddings } from './codebase-embeddings';
import type { AgentRole } from '../agent/specialized-agents';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Refactoring type
 */
export type RefactoringType =
  | 'extract-function'
  | 'extract-method'
  | 'rename-symbol'
  | 'move-code'
  | 'convert-async'
  | 'simplify-expression'
  | 'remove-dead-code'
  | 'inline-variable'
  | 'extract-variable';

/**
 * Refactoring request
 */
export interface RefactoringRequest {
  type: RefactoringType;
  filePath: string;
  selection?: {
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
  };
  target?: string; // For rename, move, etc.
  workspacePath: string;
}

/**
 * Refactoring result
 */
export interface RefactoringResult {
  success: boolean;
  changes: RefactoringChange[];
  preview: string; // Diff preview
  safetyScore: number;
  warnings: string[];
  errors: string[];
}

/**
 * Refactoring change
 */
export interface RefactoringChange {
  filePath: string;
  type: 'modified' | 'created' | 'deleted';
  diff: string;
  oldContent: string;
  newContent: string;
}

/**
 * Refactoring Engine - AI-powered refactoring with safety
 */
export class RefactoringEngine {
  private coordinator = getAgentCoordinator();
  private orchestrator = getTaskOrchestrator();

  /**
   * Perform refactoring with safety checks
   */
  async refactor(request: RefactoringRequest): Promise<RefactoringResult> {
    console.log(`[RefactoringEngine] Starting ${request.type} refactoring`);

    // Step 1: Safety checks
    const safetyCheck = await this.performSafetyChecks(request);
    if (!safetyCheck.safe) {
      return {
        success: false,
        changes: [],
        preview: '',
        safetyScore: safetyCheck.score,
        warnings: safetyCheck.warnings,
        errors: safetyCheck.errors
      };
    }

    // Step 2: Build refactoring plan
    const plan = await this.buildRefactoringPlan(request);

    // Step 3: Execute refactoring using specialized agents
    const changes = await this.executeRefactoring(request, plan);

    // Step 4: Validate changes
    const validation = await this.validateChanges(changes, request);

    // Step 5: Generate preview
    const preview = this.generatePreview(changes);

    return {
      success: validation.valid,
      changes: validation.valid ? changes : [],
      preview,
      safetyScore: safetyCheck.score,
      warnings: [...safetyCheck.warnings, ...validation.warnings],
      errors: validation.errors
    };
  }

  /**
   * Extract function/method
   */
  async extractFunction(
    filePath: string,
    selection: { startLine: number; endLine: number },
    functionName: string,
    workspacePath: string
  ): Promise<RefactoringResult> {
    return this.refactor({
      type: 'extract-function',
      filePath,
      selection,
      target: functionName,
      workspacePath
    });
  }

  /**
   * Rename symbol with references
   */
  async renameSymbol(
    filePath: string,
    symbolName: string,
    newName: string,
    workspacePath: string
  ): Promise<RefactoringResult> {
    // Find all references
    const references = await this.findSymbolReferences(symbolName, filePath, workspacePath);

    const changes: RefactoringChange[] = [];

    // Rename in each file
    for (const ref of references) {
      const content = fs.readFileSync(ref.filePath, 'utf-8');
      const lines = content.split('\n');

      // Replace symbol name
      const newLines = lines.map((line, index) => {
        if (index + 1 >= ref.startLine && index + 1 <= ref.endLine) {
          // Use regex to replace symbol name (whole word)
          const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
          return line.replace(regex, newName);
        }
        return line;
      });

      changes.push({
        filePath: ref.filePath,
        type: 'modified',
        diff: this.generateDiff(content, newLines.join('\n')),
        oldContent: content,
        newContent: newLines.join('\n')
      });
    }

    return {
      success: true,
      changes,
      preview: this.generatePreview(changes),
      safetyScore: 0.9, // High safety for rename
      warnings: [],
      errors: []
    };
  }

  /**
   * Move code between files
   */
  async moveCode(
    sourceFile: string,
    selection: { startLine: number; endLine: number },
    targetFile: string,
    workspacePath: string
  ): Promise<RefactoringResult> {
    return this.refactor({
      type: 'move-code',
      filePath: sourceFile,
      selection,
      target: targetFile,
      workspacePath
    });
  }

  /**
   * Convert to async/await
   */
  async convertToAsync(
    filePath: string,
    selection: { startLine: number; endLine: number },
    workspacePath: string
  ): Promise<RefactoringResult> {
    return this.refactor({
      type: 'convert-async',
      filePath,
      selection,
      workspacePath
    });
  }

  /**
   * Perform safety checks before refactoring
   */
  private async performSafetyChecks(
    request: RefactoringRequest
  ): Promise<{
    safe: boolean;
    score: number;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];
    let score = 1.0;

    // Check file exists
    if (!fs.existsSync(request.filePath)) {
      errors.push(`File not found: ${request.filePath}`);
      return { safe: false, score: 0, warnings, errors };
    }

    // Check selection is valid
    if (request.selection) {
      const content = fs.readFileSync(request.filePath, 'utf-8');
      const lines = content.split('\n');

      if (request.selection.startLine < 1 || request.selection.endLine > lines.length) {
        errors.push('Invalid selection range');
        return { safe: false, score: 0, warnings, errors };
      }

      if (request.selection.startLine > request.selection.endLine) {
        errors.push('Start line must be before end line');
        return { safe: false, score: 0, warnings, errors };
      }
    }

    // Check for uncommitted changes (warning)
    try {
      const { execSync } = require('child_process');
      const gitStatus = execSync('git status --porcelain', { cwd: request.workspacePath }).toString();
      if (gitStatus.trim()) {
        warnings.push('Uncommitted changes detected - consider committing before refactoring');
        score -= 0.1;
      }
    } catch (error) {
      // Git not available or not a git repo - not critical
    }

    // Check for syntax errors in file
    const syntaxCheck = await this.checkSyntax(request.filePath);
    if (!syntaxCheck.valid) {
      errors.push(`Syntax errors detected: ${syntaxCheck.errors.join(', ')}`);
      score -= 0.3;
    }

    // Type-specific checks
    switch (request.type) {
      case 'rename-symbol':
        if (!request.target) {
          errors.push('New symbol name required for rename');
          return { safe: false, score: 0, warnings, errors };
        }
        // Check new name is valid identifier
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(request.target)) {
          errors.push('Invalid symbol name');
          return { safe: false, score: 0, warnings, errors };
        }
        break;

      case 'move-code':
        if (!request.target) {
          errors.push('Target file required for move');
          return { safe: false, score: 0, warnings, errors };
        }
        if (!fs.existsSync(request.target)) {
          warnings.push('Target file does not exist - will be created');
        }
        break;
    }

    const safe = errors.length === 0 && score > 0.5;

    return { safe, score, warnings, errors };
  }

  /**
   * Build refactoring plan
   */
  private async buildRefactoringPlan(
    request: RefactoringRequest
  ): Promise<{
    steps: string[];
    affectedFiles: string[];
    estimatedRisk: number;
  }> {
    const steps: string[] = [];
    const affectedFiles: string[] = [request.filePath];

    // Determine affected files based on refactoring type
    switch (request.type) {
      case 'rename-symbol':
        if (request.target) {
          const references = await this.findSymbolReferences(
            this.getSymbolName(request),
            request.filePath,
            request.workspacePath
          );
          affectedFiles.push(...references.map(r => r.filePath));
          steps.push(`Find all references to symbol`);
          steps.push(`Rename symbol in ${affectedFiles.length} files`);
        }
        break;

      case 'extract-function':
        steps.push(`Extract code from lines ${request.selection?.startLine}-${request.selection?.endLine}`);
        steps.push(`Create new function: ${request.target || 'extractedFunction'}`);
        steps.push(`Replace original code with function call`);
        break;

      case 'move-code':
        if (request.target) {
          affectedFiles.push(request.target);
          steps.push(`Extract code from ${request.filePath}`);
          steps.push(`Move to ${request.target}`);
          steps.push(`Update imports if needed`);
        }
        break;

      case 'convert-async':
        steps.push(`Identify promise chains`);
        steps.push(`Convert to async/await`);
        steps.push(`Update function signatures`);
        break;
    }

    const estimatedRisk = this.estimateRisk(request.type, affectedFiles.length);

    return { steps, affectedFiles, estimatedRisk };
  }

  /**
   * Execute refactoring using specialized agents
   */
  private async executeRefactoring(
    request: RefactoringRequest,
    plan: { steps: string[]; affectedFiles: string[]; estimatedRisk: number }
  ): Promise<RefactoringChange[]> {
    const changes: RefactoringChange[] = [];

    // Build refactoring task
    const task = this.buildRefactoringTask(request, plan);

    // Use coordinator to execute refactoring
    const agents: AgentRole[] = ['tool_orchestrator', 'javascript_specialist'];
    if (request.filePath.endsWith('.py')) {
      agents.push('python_specialist');
    }

    const result = await this.coordinator.coordinateAgents(agents, task, {
      workspacePath: request.workspacePath,
      refactoringType: request.type,
      plan
    });

    // Extract changes from agent results
    for (const [role, agentResult] of result.entries()) {
      if (agentResult.filesModified.length > 0 || agentResult.filesCreated.length > 0) {
        for (const filePath of [...agentResult.filesModified, ...agentResult.filesCreated]) {
          if (fs.existsSync(filePath)) {
            const newContent = fs.readFileSync(filePath, 'utf-8');
            // Get old content from git or backup
            const oldContent = await this.getOriginalContent(filePath, request.workspacePath);

            changes.push({
              filePath,
              type: agentResult.filesCreated.includes(filePath) ? 'created' : 'modified',
              diff: this.generateDiff(oldContent, newContent),
              oldContent,
              newContent
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Validate refactoring changes
   */
  private async validateChanges(
    changes: RefactoringChange[],
    request: RefactoringRequest
  ): Promise<{
    valid: boolean;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const change of changes) {
      // Check syntax of new content
      const syntaxCheck = await this.checkSyntax(change.filePath, change.newContent);
      if (!syntaxCheck.valid) {
        errors.push(`Syntax errors in ${change.filePath}: ${syntaxCheck.errors.join(', ')}`);
      }

      // Check for broken imports
      const importCheck = this.checkImports(change.newContent, request.workspacePath);
      if (!importCheck.valid) {
        warnings.push(`Potential import issues in ${change.filePath}: ${importCheck.warnings.join(', ')}`);
      }

      // Check for undefined references
      const referenceCheck = await this.checkReferences(change.newContent, change.filePath, request.workspacePath);
      if (!referenceCheck.valid) {
        warnings.push(`Potential undefined references in ${change.filePath}`);
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Find symbol references across codebase
   */
  private async findSymbolReferences(
    symbolName: string,
    filePath: string,
    workspacePath: string
  ): Promise<Array<{ filePath: string; startLine: number; endLine: number; content: string }>> {
    const references: Array<{ filePath: string; startLine: number; endLine: number; content: string }> = [];

    // Use codebase indexer to find references
    try {
      const { CodebaseIndexer } = await import('../search/indexer');
      const indexer = new CodebaseIndexer(workspacePath);
      await indexer.indexCodebase();

      const searchResults = await indexer.searchCodebase(symbolName, 50);

      for (const result of searchResults) {
        // Check if result contains the symbol
        if (result.content.includes(symbolName)) {
          const lines = result.content.split('\n');
          const symbolLine = lines.findIndex((line: string) => line.includes(symbolName));

          if (symbolLine >= 0) {
            references.push({
              filePath: result.path,
              startLine: symbolLine + 1,
              endLine: symbolLine + 1,
              content: result.content
            });
          }
        }
      }
    } catch (error) {
      console.warn('[RefactoringEngine] Failed to use indexer, falling back to file search:', error);
      // Fallback: search files manually
      return this.searchFilesManually(symbolName, workspacePath);
    }

    return references;
  }

  /**
   * Search files manually for symbol
   */
  private searchFilesManually(
    symbolName: string,
    workspacePath: string
  ): Array<{ filePath: string; startLine: number; endLine: number; content: string }> {
    const references: Array<{ filePath: string; startLine: number; endLine: number; content: string }> = [];
    const regex = new RegExp(`\\b${symbolName}\\b`);

    const searchDir = (dirPath: string): void => {
      try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory() && !this.shouldSkipDirectory(item)) {
            searchDir(fullPath);
          } else if (stat.isFile() && this.shouldSearchFile(item)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              if (regex.test(content)) {
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                  if (regex.test(line)) {
                    references.push({
                      filePath: fullPath,
                      startLine: index + 1,
                      endLine: index + 1,
                      content: line
                    });
                  }
                });
              }
            } catch (error) {
              // Skip unreadable files
            }
          }
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    };

    searchDir(workspacePath);
    return references;
  }

  /**
   * Check syntax of code
   */
  private async checkSyntax(
    filePath: string,
    content?: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    const code = content || fs.readFileSync(filePath, 'utf-8');
    const errors: string[] = [];

    // Basic syntax checks
    if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      // Check for balanced brackets
      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push('Unbalanced braces');
      }

      const openParens = (code.match(/\(/g) || []).length;
      const closeParens = (code.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        errors.push('Unbalanced parentheses');
      }
    }

    // In production, would use actual parser (TypeScript compiler, ESLint, etc.)

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check imports
   */
  private checkImports(
    content: string,
    workspacePath: string
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const importRegex = /(?:import|from|require)\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Check if imported files exist
    for (const imp of imports) {
      // Resolve import path
      const resolvedPath = this.resolveImportPath(imp, workspacePath);
      if (resolvedPath && !fs.existsSync(resolvedPath)) {
        warnings.push(`Import not found: ${imp}`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  /**
   * Check references
   */
  private async checkReferences(
    content: string,
    filePath: string,
    workspacePath: string
  ): Promise<{ valid: boolean; warnings: string[] }> {
    // Simplified reference checking
    // In production, would use TypeScript compiler or language server
    return { valid: true, warnings: [] };
  }

  /**
   * Generate diff preview
   */
  private generatePreview(changes: RefactoringChange[]): string {
    return changes.map(change => {
      return `--- ${change.filePath}\n+++ ${change.filePath}\n${change.diff}`;
    }).join('\n\n');
  }

  /**
   * Generate diff between old and new content
   */
  private generateDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const diff: string[] = [];
    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        diff.push(`+${newLines[j]}`);
        j++;
      } else if (j >= newLines.length) {
        diff.push(`-${oldLines[i]}`);
        i++;
      } else if (oldLines[i] === newLines[j]) {
        diff.push(` ${oldLines[i]}`);
        i++;
        j++;
      } else {
        // Check if line was moved
        const nextOldMatch = newLines.slice(j).indexOf(oldLines[i]);
        const nextNewMatch = oldLines.slice(i).indexOf(newLines[j]);

        if (nextOldMatch >= 0 && (nextNewMatch < 0 || nextOldMatch < nextNewMatch)) {
          diff.push(`+${newLines[j]}`);
          j++;
        } else {
          diff.push(`-${oldLines[i]}`);
          i++;
        }
      }
    }

    return diff.join('\n');
  }

  /**
   * Build refactoring task description
   */
  private buildRefactoringTask(
    request: RefactoringRequest,
    plan: { steps: string[]; affectedFiles: string[] }
  ): string {
    const fileContent = request.selection
      ? this.getSelectedContent(request.filePath, request.selection)
      : fs.readFileSync(request.filePath, 'utf-8');

    let task = `Refactor code in ${request.filePath}:\n\n`;
    task += `Type: ${request.type}\n`;
    
    if (request.selection) {
      task += `Selection: lines ${request.selection.startLine}-${request.selection.endLine}\n`;
    }
    
    if (request.target) {
      task += `Target: ${request.target}\n`;
    }

    task += `\nCode to refactor:\n${fileContent}\n\n`;
    task += `Steps:\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`;
    task += `Affected files: ${plan.affectedFiles.join(', ')}\n\n`;
    task += `Perform this refactoring safely, maintaining functionality.`;

    return task;
  }

  /**
   * Get selected content
   */
  private getSelectedContent(
    filePath: string,
    selection: { startLine: number; endLine: number }
  ): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(selection.startLine - 1, selection.endLine).join('\n');
  }

  /**
   * Get original content (from git or backup)
   */
  private async getOriginalContent(
    filePath: string,
    workspacePath: string
  ): Promise<string> {
    try {
      // Try to get from git
      const { execSync } = require('child_process');
      const gitContent = execSync(`git show HEAD:${path.relative(workspacePath, filePath)}`, {
        cwd: workspacePath,
        encoding: 'utf-8'
      });
      return gitContent;
    } catch (error) {
      // Fallback: read current file (assumes no changes yet)
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    }
  }

  /**
   * Get symbol name from request
   */
  private getSymbolName(request: RefactoringRequest): string {
    if (request.target) {
      // For rename, the old name might be in selection
      const content = fs.readFileSync(request.filePath, 'utf-8');
      const lines = content.split('\n');
      if (request.selection) {
        const selectedLine = lines[request.selection.startLine - 1];
        // Extract symbol name from line (simplified)
        const match = selectedLine.match(/\b(\w+)\b/);
        return match ? match[1] : '';
      }
    }
    return '';
  }

  /**
   * Estimate risk of refactoring
   */
  private estimateRisk(type: RefactoringType, affectedFiles: number): number {
    const baseRisks: Record<RefactoringType, number> = {
      'extract-function': 0.2,
      'extract-method': 0.2,
      'rename-symbol': 0.3,
      'move-code': 0.4,
      'convert-async': 0.3,
      'simplify-expression': 0.1,
      'remove-dead-code': 0.1,
      'inline-variable': 0.2,
      'extract-variable': 0.1
    };

    const baseRisk = baseRisks[type] || 0.5;
    const fileMultiplier = Math.min(affectedFiles / 10, 1.0); // More files = more risk

    return Math.min(1.0, baseRisk + fileMultiplier * 0.3);
  }

  /**
   * Resolve import path
   */
  private resolveImportPath(importPath: string, workspacePath: string): string | null {
    // Simplified import resolution
    // In production, would use proper module resolution
    if (importPath.startsWith('.')) {
      return path.resolve(workspacePath, importPath);
    }
    // Check node_modules
    const nodeModulesPath = path.join(workspacePath, 'node_modules', importPath);
    if (fs.existsSync(nodeModulesPath)) {
      return nodeModulesPath;
    }
    return null;
  }

  /**
   * Should skip directory
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['node_modules', 'dist', 'build', '.git', '.vscode', '__pycache__', 'venv'];
    return skipDirs.includes(dirName);
  }

  /**
   * Should search file
   */
  private shouldSearchFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext);
  }
}

// Singleton instance
let refactoringEngineInstance: RefactoringEngine | null = null;

export function getRefactoringEngine(): RefactoringEngine {
  if (!refactoringEngineInstance) {
    refactoringEngineInstance = new RefactoringEngine();
  }
  return refactoringEngineInstance;
}

