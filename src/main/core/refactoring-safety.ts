/**
 * AgentPrime - Refactoring Safety Checks
 * Validates refactoring operations won't break code
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RefactoringRequest, RefactoringChange } from './refactoring-engine';

/**
 * Safety check result
 */
export interface SafetyCheckResult {
  safe: boolean;
  score: number; // 0-1, higher is safer
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

/**
 * Refactoring Safety - Validates refactoring safety
 */
export class RefactoringSafety {
  /**
   * Comprehensive safety check before refactoring
   */
  async validateRefactoring(
    request: RefactoringRequest,
    changes: RefactoringChange[]
  ): Promise<SafetyCheckResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    // Check 1: Syntax validation
    const syntaxCheck = await this.validateSyntax(changes);
    if (!syntaxCheck.valid) {
      errors.push(...syntaxCheck.errors);
      score -= 0.3;
    }

    // Check 2: Type safety (if TypeScript)
    const typeCheck = await this.validateTypes(changes);
    if (!typeCheck.valid) {
      warnings.push(...typeCheck.warnings);
      score -= 0.2;
    }

    // Check 3: Test coverage (if tests exist)
    const testCheck = await this.checkTestCoverage(request, changes);
    if (!testCheck.hasTests) {
      warnings.push('No tests found - refactoring risk is higher');
      recommendations.push('Consider adding tests before refactoring');
      score -= 0.1;
    }

    // Check 4: Dependency analysis
    const dependencyCheck = await this.analyzeDependencies(changes);
    if (dependencyCheck.hasBreakingChanges) {
      warnings.push('Potential breaking changes detected');
      recommendations.push('Review dependent code before applying');
      score -= 0.2;
    }

    // Check 5: Git status
    const gitCheck = await this.checkGitStatus(request.workspacePath);
    if (!gitCheck.clean) {
      warnings.push('Uncommitted changes detected');
      recommendations.push('Commit or stash changes before refactoring');
      score -= 0.1;
    }

    const safe = errors.length === 0 && score > 0.6;

    return {
      safe,
      score: Math.max(0, score),
      warnings,
      errors,
      recommendations
    };
  }

  /**
   * Validate syntax of changes
   */
  private async validateSyntax(
    changes: RefactoringChange[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const change of changes) {
      // Basic syntax checks
      const content = change.newContent;

      // Check balanced brackets
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push(`Unbalanced braces in ${change.filePath}`);
      }

      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        errors.push(`Unbalanced parentheses in ${change.filePath}`);
      }

      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        errors.push(`Unbalanced brackets in ${change.filePath}`);
      }

      // Check for common syntax errors
      if (content.includes('function(') && !content.includes('function (')) {
        // Might be okay, but check context
      }

      // Check string quotes are balanced
      const singleQuotes = (content.match(/'/g) || []).length;
      const doubleQuotes = (content.match(/"/g) || []).length;
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
        errors.push(`Unbalanced quotes in ${change.filePath}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate types (for TypeScript)
   */
  private async validateTypes(
    changes: RefactoringChange[]
  ): Promise<{ valid: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    for (const change of changes) {
      if (change.filePath.endsWith('.ts') || change.filePath.endsWith('.tsx')) {
        // Check for type annotations
        const content = change.newContent;

        // Check for any types (bad practice)
        if (content.includes(': any')) {
          warnings.push(`'any' type used in ${change.filePath} - consider specific types`);
        }

        // Check for undefined access
        if (content.includes('?.') || content.includes('!.')) {
          // Optional chaining - might be okay
        }

        // Check for non-null assertions
        if (content.includes('!')) {
          warnings.push(`Non-null assertion used in ${change.filePath} - verify null safety`);
        }
      }
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  /**
   * Check test coverage
   */
  private async checkTestCoverage(
    request: RefactoringRequest,
    changes: RefactoringChange[]
  ): Promise<{ hasTests: boolean; coverage?: number }> {
    const testFiles: string[] = [];

    // Look for test files
    for (const change of changes) {
      const dir = path.dirname(change.filePath);
      const baseName = path.basename(change.filePath, path.extname(change.filePath));

      // Common test file patterns
      const testPatterns = [
        `${baseName}.test.ts`,
        `${baseName}.test.js`,
        `${baseName}.spec.ts`,
        `${baseName}.spec.js`,
        `__tests__/${baseName}.ts`
      ];

      for (const pattern of testPatterns) {
        const testPath = path.join(dir, pattern);
        if (fs.existsSync(testPath)) {
          testFiles.push(testPath);
        }
      }
    }

    return {
      hasTests: testFiles.length > 0,
      coverage: testFiles.length > 0 ? 0.8 : undefined // Would calculate actual coverage
    };
  }

  /**
   * Analyze dependencies
   */
  private async analyzeDependencies(
    changes: RefactoringChange[]
  ): Promise<{ hasBreakingChanges: boolean; affectedFiles: string[] }> {
    const affectedFiles: string[] = [];

    for (const change of changes) {
      // Extract exports from changed file
      const exports = this.extractExports(change.newContent);
      const oldExports = this.extractExports(change.oldContent);

      // Check if exports changed
      const removedExports = oldExports.filter(exp => !exports.includes(exp));
      if (removedExports.length > 0) {
        // Find files that import these exports
        const importers = await this.findImporters(removedExports, change.filePath);
        affectedFiles.push(...importers);
      }
    }

    return {
      hasBreakingChanges: affectedFiles.length > 0,
      affectedFiles: [...new Set(affectedFiles)]
    };
  }

  /**
   * Extract exports from code
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // Match export statements
    const exportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Match default exports
    const defaultExportRegex = /export\s+default\s+(?:class|function|const|let|var)?\s*(\w+)?/;
    const defaultMatch = content.match(defaultExportRegex);
    if (defaultMatch && defaultMatch[1]) {
      exports.push(defaultMatch[1]);
    }

    return exports;
  }

  /**
   * Find files that import specific exports
   */
  private async findImporters(
    exports: string[],
    sourceFile: string
  ): Promise<string[]> {
    const importers: string[] = [];
    const workspacePath = path.dirname(sourceFile);

    // Search for imports of these exports
    const searchDir = (dirPath: string): void => {
      try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory() && !this.shouldSkipDirectory(item)) {
            searchDir(fullPath);
          } else if (stat.isFile() && this.shouldSearchFile(item) && fullPath !== sourceFile) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const sourceBaseName = path.basename(sourceFile, path.extname(sourceFile));

              // Check if file imports from source
              const importRegex = new RegExp(
                `(?:import|from).*['"]\\.?/?[^'"]*${sourceBaseName}['"]`,
                'g'
              );

              if (importRegex.test(content)) {
                // Check if it imports the removed exports
                for (const exp of exports) {
                  if (content.includes(exp)) {
                    importers.push(fullPath);
                    break;
                  }
                }
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
    return importers;
  }

  /**
   * Check git status
   */
  private async checkGitStatus(workspacePath: string): Promise<{ clean: boolean; files: string[] }> {
    try {
      const { execSync } = require('child_process');
      const gitStatus = execSync('git status --porcelain', {
        cwd: workspacePath,
        encoding: 'utf-8'
      });

      const files = gitStatus
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => line.substring(3).trim());

      return {
        clean: files.length === 0,
        files
      };
    } catch (error) {
      // Not a git repo or git not available
      return { clean: true, files: [] };
    }
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
let refactoringSafetyInstance: RefactoringSafety | null = null;

export function getRefactoringSafety(): RefactoringSafety {
  if (!refactoringSafetyInstance) {
    refactoringSafetyInstance = new RefactoringSafety();
  }
  return refactoringSafetyInstance;
}

