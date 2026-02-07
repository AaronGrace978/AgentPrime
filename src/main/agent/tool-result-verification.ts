/**
 * AgentPrime - Tool Result Verification
 * 
 * After a tool call completes, we verify that it actually achieved the intended goal.
 * This prevents the "I created the file" → "But the file is empty" problem.
 * 
 * Verification Types:
 * 1. File Creation: Verify file exists and has expected content
 * 2. File Modification: Verify changes were applied
 * 3. Command Execution: Verify expected output/side effects
 * 4. Search Results: Verify results are relevant
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { calculateContentHash, createContentSnapshot, type ContentSnapshot } from '../security/workspaceProtection';

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  issues: VerificationIssue[];
  suggestions: string[];
}

export interface VerificationIssue {
  type: 'missing_file' | 'empty_content' | 'partial_content' | 'unexpected_result' | 'error';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  expected?: string;
  actual?: string;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

/**
 * Tool Result Verification Engine
 */
export class ToolResultVerifier {
  private workspacePath: string;
  private contentSnapshots: Map<string, ContentSnapshot> = new Map();
  
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }
  
  /**
   * Create a content snapshot for a file before modification
   * Used to verify changes were actually applied
   */
  createSnapshot(filePath: string): ContentSnapshot | null {
    const snapshot = createContentSnapshot(filePath, this.workspacePath);
    if (snapshot) {
      this.contentSnapshots.set(filePath, snapshot);
      console.log(`[ToolVerifier] 📸 Created snapshot for ${filePath} (hash: ${snapshot.hash.substring(0, 8)}...)`);
    }
    return snapshot;
  }
  
  /**
   * Verify content matches a previous snapshot
   */
  verifyAgainstSnapshot(filePath: string): { 
    verified: boolean; 
    changed: boolean; 
    reason: string;
    previousHash?: string;
    currentHash?: string;
  } {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.workspacePath, filePath);
    
    const snapshot = this.contentSnapshots.get(filePath);
    
    if (!snapshot) {
      // No snapshot to compare against - just check if file exists
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const currentHash = calculateContentHash(content);
        return {
          verified: true,
          changed: true, // Assume changed since we have no baseline
          reason: 'File exists (no previous snapshot)',
          currentHash
        };
      }
      return {
        verified: false,
        changed: false,
        reason: 'File does not exist and no snapshot available'
      };
    }
    
    try {
      if (!fs.existsSync(fullPath)) {
        return {
          verified: false,
          changed: true,
          reason: 'File was deleted since snapshot',
          previousHash: snapshot.hash
        };
      }
      
      const currentContent = fs.readFileSync(fullPath, 'utf-8');
      const currentHash = calculateContentHash(currentContent);
      
      return {
        verified: true,
        changed: currentHash !== snapshot.hash,
        reason: currentHash !== snapshot.hash 
          ? `File content changed (${snapshot.size} → ${currentContent.length} bytes)`
          : 'File content unchanged',
        previousHash: snapshot.hash,
        currentHash
      };
    } catch (e) {
      return {
        verified: false,
        changed: false,
        reason: e instanceof Error ? e.message : 'Failed to verify file'
      };
    }
  }
  
  /**
   * Clear all stored snapshots
   */
  clearSnapshots(): void {
    this.contentSnapshots.clear();
  }
  
  /**
   * Verify that a tool call achieved its intended goal
   */
  async verify(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const issues: VerificationIssue[] = [];
    let confidence = 1.0;
    const suggestions: string[] = [];
    
    switch (toolCall.name) {
      case 'create_file':
      case 'write_file':
        return await this.verifyFileWrite(toolCall, intent);
        
      case 'read_file':
        return await this.verifyFileRead(toolCall, intent);
        
      case 'run_command':
        return await this.verifyCommand(toolCall, intent);
        
      case 'search_files':
      case 'grep':
        return await this.verifySearch(toolCall, intent);
        
      case 'list_directory':
      case 'list_files':
        return await this.verifyListDirectory(toolCall, intent);
        
      case 'delete_file':
        return await this.verifyDelete(toolCall, intent);
        
      case 'scaffold_project':
        return await this.verifyScaffold(toolCall, intent);
        
      default:
        // For unknown tools, do basic result check
        return {
          verified: !toolCall.error,
          confidence: toolCall.error ? 0.3 : 0.7,
          issues: toolCall.error ? [{
            type: 'error',
            severity: 'critical',
            description: toolCall.error
          }] : [],
          suggestions: []
        };
    }
  }
  
  /**
   * Verify file was written correctly
   */
  private async verifyFileWrite(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const issues: VerificationIssue[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;
    
    const filePath = toolCall.arguments.path;
    const content = toolCall.arguments.content;
    
    if (!filePath) {
      return {
        verified: false,
        confidence: 0,
        issues: [{
          type: 'error',
          severity: 'critical',
          description: 'No file path provided to write_file'
        }],
        suggestions: ['Provide a file path']
      };
    }
    
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.workspacePath, filePath);
    
    // 1. Check if file exists
    if (!fs.existsSync(fullPath)) {
      return {
        verified: false,
        confidence: 0,
        issues: [{
          type: 'missing_file',
          severity: 'critical',
          description: `File was not created: ${filePath}`,
          expected: 'File to exist',
          actual: 'File does not exist'
        }],
        suggestions: ['Retry the file creation', 'Check if directory exists']
      };
    }
    
    // 2. Read actual content
    const actualContent = fs.readFileSync(fullPath, 'utf-8');
    
    // 3. Check if file is empty
    if (actualContent.trim().length === 0) {
      return {
        verified: false,
        confidence: 0.1,
        issues: [{
          type: 'empty_content',
          severity: 'critical',
          description: `File was created but is empty: ${filePath}`,
          expected: `Content with ${content?.length || 0} characters`,
          actual: 'Empty file'
        }],
        suggestions: ['Retry with content', 'Check if content was provided']
      };
    }
    
    // 4. Check if content matches what was intended
    if (content) {
      if (actualContent === content) {
        // Perfect match
        confidence = 1.0;
      } else if (actualContent.length < content.length * 0.5) {
        // Content is significantly shorter than expected
        confidence = 0.3;
        issues.push({
          type: 'partial_content',
          severity: 'warning',
          description: `File content is shorter than expected (${actualContent.length} vs ${content.length} chars)`,
          expected: `${content.length} characters`,
          actual: `${actualContent.length} characters`
        });
        suggestions.push('Content may have been truncated');
      } else {
        // Some difference but acceptable
        confidence = 0.8;
      }
    }
    
    // 5. Basic syntax validation based on file type
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    if (ext === 'json') {
      try {
        JSON.parse(actualContent);
      } catch (e) {
        confidence *= 0.5;
        issues.push({
          type: 'unexpected_result',
          severity: 'critical',
          description: 'JSON file has invalid syntax',
          actual: (e as Error).message
        });
        suggestions.push('Fix JSON syntax errors');
      }
    }
    
    if (['js', 'ts', 'tsx', 'jsx'].includes(ext || '')) {
      // Check for unbalanced braces
      const openBraces = (actualContent.match(/\{/g) || []).length;
      const closeBraces = (actualContent.match(/\}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        confidence *= 0.6;
        issues.push({
          type: 'unexpected_result',
          severity: 'warning',
          description: `Unbalanced braces: ${openBraces} { vs ${closeBraces} }`,
          expected: 'Balanced braces',
          actual: `${openBraces} open, ${closeBraces} close`
        });
        suggestions.push('Check for missing closing braces');
      }
    }
    
    if (ext === 'html') {
      // Check for basic HTML structure
      if (!actualContent.toLowerCase().includes('<html') && 
          !actualContent.toLowerCase().includes('<!doctype')) {
        confidence *= 0.8;
        issues.push({
          type: 'unexpected_result',
          severity: 'info',
          description: 'HTML file missing standard structure',
          expected: 'DOCTYPE or <html> tag',
          actual: 'Neither found'
        });
      }
    }
    
    // 6. Intent matching (does the file relate to the intent?)
    const intentKeywords = this.extractKeywords(intent);
    const contentKeywords = this.extractKeywords(actualContent);
    const keywordMatch = this.calculateOverlap(intentKeywords, contentKeywords);
    
    if (keywordMatch < 0.2 && intentKeywords.length > 0) {
      confidence *= 0.7;
      issues.push({
        type: 'unexpected_result',
        severity: 'warning',
        description: 'File content may not match the intended task',
        expected: `Keywords: ${intentKeywords.slice(0, 5).join(', ')}`,
        actual: `Found: ${contentKeywords.slice(0, 5).join(', ')}`
      });
    }
    
    return {
      verified: issues.filter(i => i.severity === 'critical').length === 0,
      confidence: Math.max(0, Math.min(1, confidence)),
      issues,
      suggestions
    };
  }
  
  /**
   * Verify file was read correctly
   * Enhanced with content hash verification to ensure accurate reading
   */
  private async verifyFileRead(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const filePath = toolCall.arguments.path;
    const issues: VerificationIssue[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;
    
    if (!filePath) {
      return {
        verified: false,
        confidence: 0,
        issues: [{
          type: 'error',
          severity: 'critical',
          description: 'No file path provided to read_file'
        }],
        suggestions: []
      };
    }
    
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.workspacePath, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        verified: false,
        confidence: 0,
        issues: [{
          type: 'missing_file',
          severity: 'critical',
          description: `File does not exist: ${filePath}`
        }],
        suggestions: ['Check if file path is correct', 'File may have been deleted']
      };
    }
    
    // Read actual content and calculate hash
    const actualContent = fs.readFileSync(fullPath, 'utf-8');
    const actualHash = calculateContentHash(actualContent);
    
    // Create/update snapshot for future verification
    this.createSnapshot(filePath);
    
    // If result is empty but file exists and has content, there's an issue
    if (actualContent.length > 0 && (!toolCall.result || toolCall.result.length === 0)) {
      issues.push({
        type: 'unexpected_result',
        severity: 'warning',
        description: 'File has content but read returned empty',
        expected: `${actualContent.length} characters`,
        actual: 'Empty result'
      });
      confidence = 0.3;
      suggestions.push('Retry the read operation');
    }
    
    // If result exists, verify it matches actual content
    if (toolCall.result && typeof toolCall.result === 'string') {
      const resultHash = calculateContentHash(toolCall.result);
      
      if (resultHash !== actualHash) {
        // Content mismatch - could be truncation or modification during read
        const actualLength = actualContent.length;
        const resultLength = toolCall.result.length;
        
        if (resultLength < actualLength * 0.9) {
          // Significant truncation detected
          issues.push({
            type: 'partial_content',
            severity: 'warning',
            description: `Read result appears truncated (${resultLength} vs ${actualLength} chars)`,
            expected: `${actualLength} characters, hash: ${actualHash.substring(0, 8)}...`,
            actual: `${resultLength} characters, hash: ${resultHash.substring(0, 8)}...`
          });
          confidence = 0.6;
          suggestions.push('File may have been truncated during read');
        } else {
          // Minor difference - could be encoding or newline differences
          issues.push({
            type: 'unexpected_result',
            severity: 'info',
            description: `Minor content difference detected (hash mismatch)`,
            expected: actualHash.substring(0, 8),
            actual: resultHash.substring(0, 8)
          });
          confidence = 0.9;
        }
      } else {
        // Perfect match - content verified!
        console.log(`[ToolVerifier] ✅ File read verified: ${filePath} (hash: ${actualHash.substring(0, 8)}...)`);
      }
    }
    
    return {
      verified: issues.filter(i => i.severity === 'critical').length === 0,
      confidence,
      issues,
      suggestions
    };
  }
  
  /**
   * Verify command executed correctly
   */
  private async verifyCommand(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const command = toolCall.arguments.command;
    const issues: VerificationIssue[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;
    
    // Check for error in result
    if (toolCall.error) {
      return {
        verified: false,
        confidence: 0.2,
        issues: [{
          type: 'error',
          severity: 'critical',
          description: `Command failed: ${toolCall.error}`
        }],
        suggestions: ['Check command syntax', 'Verify required tools are installed']
      };
    }
    
    // Check for common failure patterns in output
    const result = toolCall.result || '';
    const lowerResult = result.toLowerCase();
    
    const errorPatterns = [
      { pattern: /error:/i, msg: 'Error detected in output' },
      { pattern: /command not found/i, msg: 'Command not found' },
      { pattern: /permission denied/i, msg: 'Permission denied' },
      { pattern: /no such file or directory/i, msg: 'File or directory not found' },
      { pattern: /enoent/i, msg: 'File not found' },
      { pattern: /failed/i, msg: 'Operation failed' },
      { pattern: /cannot/i, msg: 'Operation cannot be performed' }
    ];
    
    for (const { pattern, msg } of errorPatterns) {
      if (pattern.test(lowerResult)) {
        confidence *= 0.5;
        issues.push({
          type: 'unexpected_result',
          severity: 'warning',
          description: msg,
          actual: result.substring(0, 200)
        });
      }
    }
    
    // For npm/yarn commands, check for success indicators
    if (command.includes('npm') || command.includes('yarn')) {
      if (result.includes('npm ERR!') || result.includes('error ')) {
        confidence = 0.2;
        issues.push({
          type: 'error',
          severity: 'critical',
          description: 'npm/yarn command encountered errors'
        });
        suggestions.push('Check package.json', 'Try clearing node_modules');
      } else if (result.includes('added') || result.includes('up to date')) {
        confidence = 1.0; // npm install succeeded
      }
    }
    
    // For build commands, check for success
    if (command.includes('build')) {
      if (result.includes('successfully') || result.includes('compiled') || result.includes('built')) {
        confidence = 1.0;
      }
    }
    
    return {
      verified: issues.filter(i => i.severity === 'critical').length === 0,
      confidence,
      issues,
      suggestions
    };
  }
  
  /**
   * Verify search results are relevant
   */
  private async verifySearch(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const query = toolCall.arguments.query || toolCall.arguments.pattern;
    const result = toolCall.result;
    
    if (!result || result.length === 0) {
      return {
        verified: true, // Empty results can be valid
        confidence: 0.8,
        issues: [{
          type: 'unexpected_result',
          severity: 'info',
          description: 'Search returned no results',
          expected: 'Matching results',
          actual: 'No matches found'
        }],
        suggestions: ['Try a different search term', 'Check if files exist in the search path']
      };
    }
    
    return {
      verified: true,
      confidence: 1.0,
      issues: [],
      suggestions: []
    };
  }
  
  /**
   * Verify directory listing
   */
  private async verifyListDirectory(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const dirPath = toolCall.arguments.path || toolCall.arguments.directory;
    
    const fullPath = path.isAbsolute(dirPath) 
      ? dirPath 
      : path.join(this.workspacePath, dirPath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        verified: false,
        confidence: 0,
        issues: [{
          type: 'missing_file',
          severity: 'critical',
          description: `Directory does not exist: ${dirPath}`
        }],
        suggestions: ['Check if directory path is correct']
      };
    }
    
    return {
      verified: true,
      confidence: 1.0,
      issues: [],
      suggestions: []
    };
  }
  
  /**
   * Verify file was deleted
   */
  private async verifyDelete(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const filePath = toolCall.arguments.path;
    
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.workspacePath, filePath);
    
    if (fs.existsSync(fullPath)) {
      return {
        verified: false,
        confidence: 0.2,
        issues: [{
          type: 'unexpected_result',
          severity: 'critical',
          description: `File still exists after delete: ${filePath}`
        }],
        suggestions: ['Retry the delete', 'Check file permissions']
      };
    }
    
    return {
      verified: true,
      confidence: 1.0,
      issues: [],
      suggestions: []
    };
  }
  
  /**
   * Verify project scaffolding
   */
  private async verifyScaffold(toolCall: ToolCall, intent: string): Promise<VerificationResult> {
    const projectPath = toolCall.arguments.project_path || toolCall.arguments.path;
    const template = toolCall.arguments.template;
    
    const fullPath = path.isAbsolute(projectPath) 
      ? projectPath 
      : path.join(this.workspacePath, projectPath);
    
    const issues: VerificationIssue[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;
    
    // Check if directory was created
    if (!fs.existsSync(fullPath)) {
      return {
        verified: false,
        confidence: 0,
        issues: [{
          type: 'missing_file',
          severity: 'critical',
          description: `Project directory was not created: ${projectPath}`
        }],
        suggestions: ['Retry scaffolding', 'Check parent directory permissions']
      };
    }
    
    // Check for essential files based on template type
    const essentialFiles: Record<string, string[]> = {
      'react': ['package.json', 'src/index.tsx', 'src/App.tsx'],
      'node': ['package.json', 'index.js'],
      'python': ['requirements.txt', 'main.py'],
      'nextjs': ['package.json', 'pages/index.tsx', 'next.config.js'],
      'default': ['package.json']
    };
    
    const expected = essentialFiles[template] || essentialFiles['default'];
    
    for (const file of expected) {
      const filePath = path.join(fullPath, file);
      if (!fs.existsSync(filePath)) {
        confidence *= 0.8;
        issues.push({
          type: 'missing_file',
          severity: 'warning',
          description: `Expected file not found: ${file}`
        });
      }
    }
    
    // Check if package.json is valid
    const packageJsonPath = path.join(fullPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (!pkg.name) {
          issues.push({
            type: 'unexpected_result',
            severity: 'info',
            description: 'package.json missing name field'
          });
        }
      } catch (e) {
        confidence *= 0.5;
        issues.push({
          type: 'unexpected_result',
          severity: 'critical',
          description: 'package.json has invalid JSON'
        });
      }
    }
    
    return {
      verified: issues.filter(i => i.severity === 'critical').length === 0,
      confidence,
      issues,
      suggestions
    };
  }
  
  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'to', 'of', 'in', 'for', 'on', 'with',
      'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
      'this', 'that', 'these', 'those', 'and', 'or', 'but', 'if', 'then',
      'const', 'let', 'var', 'function', 'return', 'import', 'export', 'from'
    ]);
    
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    // Count frequency
    const counts: Record<string, number> = {};
    for (const word of words) {
      counts[word] = (counts[word] || 0) + 1;
    }
    
    // Sort by frequency and return top keywords
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }
  
  /**
   * Calculate overlap between two keyword sets
   */
  private calculateOverlap(set1: string[], set2: string[]): number {
    if (set1.length === 0 || set2.length === 0) return 0;
    
    const s1 = new Set(set1);
    const s2 = new Set(set2);
    
    let intersection = 0;
    for (const word of s1) {
      if (s2.has(word)) intersection++;
    }
    
    return intersection / Math.min(set1.length, set2.length);
  }
}

/**
 * Quick verification function for use in agent loop
 */
export async function verifyToolResult(
  toolCall: ToolCall,
  intent: string,
  workspacePath: string
): Promise<VerificationResult> {
  const verifier = new ToolResultVerifier(workspacePath);
  return verifier.verify(toolCall, intent);
}

