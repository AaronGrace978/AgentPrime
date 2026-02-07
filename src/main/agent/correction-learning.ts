/**
 * AgentPrime - Correction Learning System
 * 
 * Learns from user corrections to AI-generated code.
 * When a user edits code that the AI just wrote, we can infer:
 * 1. What the AI got wrong
 * 2. What the user prefers
 * 3. Patterns to apply in future
 * 
 * This is "passive learning" - no explicit feedback needed!
 * Just watch and learn from how users refine our output.
 */

import * as fs from 'fs';
import * as path from 'path';
import { storeLearning, addAntiPattern } from '../mirror/mirror-singleton';

export interface FileVersion {
  path: string;
  content: string;
  timestamp: number;
  source: 'ai' | 'user';
  model?: string;
  task?: string;
}

export interface CorrectionPattern {
  id: string;
  type: 'style' | 'logic' | 'imports' | 'naming' | 'structure' | 'error-handling';
  before: string;  // What AI generated
  after: string;   // What user changed it to
  context: string; // Surrounding code
  language: string;
  frequency: number;
  timestamp: number;
}

interface DiffChunk {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * Correction Learning Engine
 * Tracks AI-generated files and learns when users correct them
 */
export class CorrectionLearningEngine {
  private recentAIWrites: Map<string, FileVersion[]> = new Map();
  private corrections: CorrectionPattern[] = [];
  private dataPath: string;
  private readonly MAX_HISTORY_PER_FILE = 10;
  private readonly CORRECTION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  
  constructor(dataPath?: string) {
    this.dataPath = dataPath || path.join(process.cwd(), 'data', 'corrections.json');
    this.loadCorrections();
  }
  
  /**
   * Record when AI writes a file
   */
  recordAIWrite(filePath: string, content: string, model: string, task: string): void {
    const version: FileVersion = {
      path: filePath,
      content,
      timestamp: Date.now(),
      source: 'ai',
      model,
      task
    };
    
    const history = this.recentAIWrites.get(filePath) || [];
    history.push(version);
    
    // Keep only recent history
    if (history.length > this.MAX_HISTORY_PER_FILE) {
      history.shift();
    }
    
    this.recentAIWrites.set(filePath, history);
    console.log(`[CorrectionLearning] Recorded AI write to ${filePath}`);
  }
  
  /**
   * Record when user saves a file (potential correction)
   */
  async recordUserSave(filePath: string, content: string): Promise<CorrectionPattern[]> {
    const history = this.recentAIWrites.get(filePath);
    if (!history || history.length === 0) {
      return []; // Not an AI-generated file we're tracking
    }
    
    const latestAI = history[history.length - 1];
    const timeSinceAI = Date.now() - latestAI.timestamp;
    
    // Only consider corrections within the time window
    if (timeSinceAI > this.CORRECTION_WINDOW_MS) {
      return [];
    }
    
    // If content is identical, no correction was made
    if (content === latestAI.content) {
      return [];
    }
    
    console.log(`[CorrectionLearning] Detected user correction to ${filePath} (${timeSinceAI}ms after AI write)`);
    
    // Analyze the diff
    const patterns = await this.analyzeCorrection(latestAI, content);
    
    if (patterns.length > 0) {
      // Store the corrections
      this.corrections.push(...patterns);
      await this.saveCorrections();
      
      // Learn from significant patterns
      await this.learnFromPatterns(patterns, latestAI);
      
      console.log(`[CorrectionLearning] Learned ${patterns.length} correction patterns`);
    }
    
    return patterns;
  }
  
  /**
   * Analyze the difference between AI version and user correction
   */
  private async analyzeCorrection(aiVersion: FileVersion, userContent: string): Promise<CorrectionPattern[]> {
    const patterns: CorrectionPattern[] = [];
    const language = aiVersion.path.split('.').pop() || 'text';
    
    // Get the diff
    const diff = this.computeDiff(aiVersion.content, userContent);
    
    // Find meaningful changes (not just whitespace)
    const meaningfulChanges = diff.filter(chunk => {
      if (chunk.type === 'unchanged') return false;
      const content = chunk.content.trim();
      return content.length > 2; // Ignore tiny changes
    });
    
    if (meaningfulChanges.length === 0) {
      return patterns;
    }
    
    // Group consecutive added/removed chunks to understand the full correction
    let i = 0;
    while (i < meaningfulChanges.length) {
      const current = meaningfulChanges[i];
      
      // Look for a removed+added pair (a replacement)
      if (current.type === 'removed' && i + 1 < meaningfulChanges.length) {
        const next = meaningfulChanges[i + 1];
        if (next.type === 'added') {
          // This is a replacement - most valuable correction type
          const pattern = this.categorizeCorrection(
            current.content,
            next.content,
            aiVersion.content,
            language
          );
          
          if (pattern) {
            patterns.push({
              ...pattern,
              id: `correction-${Date.now()}-${patterns.length}`,
              frequency: 1,
              timestamp: Date.now()
            });
          }
          
          i += 2;
          continue;
        }
      }
      
      // Pure addition - user added something AI missed
      if (current.type === 'added') {
        const pattern = this.categorizeAddition(
          current.content,
          aiVersion.content,
          language
        );
        
        if (pattern) {
          patterns.push({
            ...pattern,
            id: `addition-${Date.now()}-${patterns.length}`,
            frequency: 1,
            timestamp: Date.now()
          });
        }
      }
      
      // Pure removal - user deleted something AI shouldn't have included
      if (current.type === 'removed') {
        const pattern = this.categorizeRemoval(
          current.content,
          aiVersion.content,
          language
        );
        
        if (pattern) {
          patterns.push({
            ...pattern,
            id: `removal-${Date.now()}-${patterns.length}`,
            frequency: 1,
            timestamp: Date.now()
          });
        }
      }
      
      i++;
    }
    
    return patterns;
  }
  
  /**
   * Simple line-based diff
   */
  private computeDiff(oldContent: string, newContent: string): DiffChunk[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const chunks: DiffChunk[] = [];
    
    // Use longest common subsequence for better diff
    const lcs = this.longestCommonSubsequence(oldLines, newLines);
    
    let oldIdx = 0;
    let newIdx = 0;
    let lcsIdx = 0;
    
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      // If we have more LCS to process
      if (lcsIdx < lcs.length) {
        const lcsLine = lcs[lcsIdx];
        
        // Remove lines from old until we hit the LCS line
        const removedLines: string[] = [];
        while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcsLine) {
          removedLines.push(oldLines[oldIdx]);
          oldIdx++;
        }
        if (removedLines.length > 0) {
          chunks.push({
            type: 'removed',
            content: removedLines.join('\n'),
            lineStart: oldIdx - removedLines.length,
            lineEnd: oldIdx - 1
          });
        }
        
        // Add lines from new until we hit the LCS line
        const addedLines: string[] = [];
        while (newIdx < newLines.length && newLines[newIdx] !== lcsLine) {
          addedLines.push(newLines[newIdx]);
          newIdx++;
        }
        if (addedLines.length > 0) {
          chunks.push({
            type: 'added',
            content: addedLines.join('\n'),
            lineStart: newIdx - addedLines.length,
            lineEnd: newIdx - 1
          });
        }
        
        // The LCS line itself is unchanged
        if (oldIdx < oldLines.length && newIdx < newLines.length) {
          chunks.push({
            type: 'unchanged',
            content: lcsLine,
            lineStart: oldIdx,
            lineEnd: oldIdx
          });
          oldIdx++;
          newIdx++;
          lcsIdx++;
        }
      } else {
        // No more LCS - remaining lines are additions/deletions
        if (oldIdx < oldLines.length) {
          chunks.push({
            type: 'removed',
            content: oldLines.slice(oldIdx).join('\n'),
            lineStart: oldIdx,
            lineEnd: oldLines.length - 1
          });
          oldIdx = oldLines.length;
        }
        if (newIdx < newLines.length) {
          chunks.push({
            type: 'added',
            content: newLines.slice(newIdx).join('\n'),
            lineStart: newIdx,
            lineEnd: newLines.length - 1
          });
          newIdx = newLines.length;
        }
      }
    }
    
    return chunks;
  }
  
  /**
   * Find longest common subsequence of lines
   */
  private longestCommonSubsequence(arr1: string[], arr2: string[]): string[] {
    const m = arr1.length;
    const n = arr2.length;
    
    // Optimization for large files
    if (m > 1000 || n > 1000) {
      return this.approximateLCS(arr1, arr2);
    }
    
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    // Backtrack to find the actual sequence
    const result: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (arr1[i - 1] === arr2[j - 1]) {
        result.unshift(arr1[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    
    return result;
  }
  
  /**
   * Approximate LCS for large files
   */
  private approximateLCS(arr1: string[], arr2: string[]): string[] {
    // For large files, use a simpler approach: find common lines in order
    const result: string[] = [];
    let j = 0;
    
    for (let i = 0; i < arr1.length && j < arr2.length; i++) {
      while (j < arr2.length && arr1[i] !== arr2[j]) {
        j++;
      }
      if (j < arr2.length) {
        result.push(arr1[i]);
        j++;
      }
    }
    
    return result;
  }
  
  /**
   * Categorize a replacement correction
   */
  private categorizeCorrection(
    removed: string,
    added: string,
    context: string,
    language: string
  ): Omit<CorrectionPattern, 'id' | 'frequency' | 'timestamp'> | null {
    const removedTrim = removed.trim();
    const addedTrim = added.trim();
    
    // Detect common correction types
    
    // 1. Import/require statement changes
    if (removedTrim.match(/^(import|require|from)/) || addedTrim.match(/^(import|require|from)/)) {
      return {
        type: 'imports',
        before: removedTrim,
        after: addedTrim,
        context: this.extractContext(context, removed),
        language
      };
    }
    
    // 2. Variable naming changes
    const varPattern = /^(const|let|var|def|val|var)\s+(\w+)/;
    const oldVar = removedTrim.match(varPattern);
    const newVar = addedTrim.match(varPattern);
    if (oldVar && newVar && oldVar[2] !== newVar[2]) {
      return {
        type: 'naming',
        before: oldVar[2],
        after: newVar[2],
        context: this.extractContext(context, removed),
        language
      };
    }
    
    // 3. Error handling additions
    if (addedTrim.includes('try') || addedTrim.includes('catch') || 
        addedTrim.includes('throw') || addedTrim.includes('except')) {
      return {
        type: 'error-handling',
        before: removedTrim,
        after: addedTrim,
        context: this.extractContext(context, removed),
        language
      };
    }
    
    // 4. Logic changes (conditions, operators)
    if (removedTrim.includes('if ') || addedTrim.includes('if ') ||
        removedTrim.includes('===') || addedTrim.includes('===')) {
      return {
        type: 'logic',
        before: removedTrim,
        after: addedTrim,
        context: this.extractContext(context, removed),
        language
      };
    }
    
    // 5. Style changes (formatting, semicolons, etc.)
    if (this.isStyleChange(removedTrim, addedTrim)) {
      return {
        type: 'style',
        before: removedTrim,
        after: addedTrim,
        context: this.extractContext(context, removed),
        language
      };
    }
    
    // Default: structure change
    return {
      type: 'structure',
      before: removedTrim.substring(0, 200),
      after: addedTrim.substring(0, 200),
      context: this.extractContext(context, removed),
      language
    };
  }
  
  /**
   * Categorize an addition (AI missed something)
   */
  private categorizeAddition(
    added: string,
    context: string,
    language: string
  ): Omit<CorrectionPattern, 'id' | 'frequency' | 'timestamp'> | null {
    const addedTrim = added.trim();
    
    // Skip very small additions (likely typos)
    if (addedTrim.length < 5) return null;
    
    // Error handling addition
    if (addedTrim.includes('try') || addedTrim.includes('catch') || 
        addedTrim.includes('throw') || addedTrim.includes('except')) {
      return {
        type: 'error-handling',
        before: '(missing)',
        after: addedTrim.substring(0, 200),
        context: this.extractContext(context, added),
        language
      };
    }
    
    // Import addition
    if (addedTrim.match(/^(import|require|from)/)) {
      return {
        type: 'imports',
        before: '(missing)',
        after: addedTrim,
        context: this.extractContext(context, added),
        language
      };
    }
    
    return null;
  }
  
  /**
   * Categorize a removal (AI included something it shouldn't have)
   */
  private categorizeRemoval(
    removed: string,
    context: string,
    language: string
  ): Omit<CorrectionPattern, 'id' | 'frequency' | 'timestamp'> | null {
    const removedTrim = removed.trim();
    
    // Console.log removal
    if (removedTrim.includes('console.log') || removedTrim.includes('print(')) {
      return {
        type: 'style',
        before: removedTrim.substring(0, 100),
        after: '(removed)',
        context: 'Debug statements',
        language
      };
    }
    
    return null;
  }
  
  /**
   * Check if a change is primarily stylistic
   */
  private isStyleChange(before: string, after: string): boolean {
    // Normalize whitespace and compare
    const normalizedBefore = before.replace(/\s+/g, ' ').trim();
    const normalizedAfter = after.replace(/\s+/g, ' ').trim();
    
    // If normalized versions are very similar, it's a style change
    if (normalizedBefore === normalizedAfter) return true;
    
    // Semicolon only difference
    if (normalizedBefore.replace(/;/g, '') === normalizedAfter.replace(/;/g, '')) return true;
    
    // Quote style difference
    if (normalizedBefore.replace(/"/g, "'") === normalizedAfter.replace(/"/g, "'")) return true;
    
    return false;
  }
  
  /**
   * Extract surrounding context for a piece of code
   */
  private extractContext(fullContent: string, searchFor: string): string {
    const idx = fullContent.indexOf(searchFor);
    if (idx === -1) return '';
    
    const before = fullContent.substring(Math.max(0, idx - 50), idx).split('\n').pop() || '';
    const after = fullContent.substring(idx + searchFor.length, idx + searchFor.length + 50).split('\n')[0] || '';
    
    return `${before.trim()} [...] ${after.trim()}`;
  }
  
  /**
   * Learn from detected patterns - store for future use
   */
  private async learnFromPatterns(patterns: CorrectionPattern[], aiVersion: FileVersion): Promise<void> {
    for (const pattern of patterns) {
      // If user had to add error handling, learn that
      if (pattern.type === 'error-handling' && pattern.before === '(missing)') {
        await storeLearning({
          type: 'anti-pattern',
          description: `Missing error handling: Always include try/catch in ${aiVersion.task}`,
          context: pattern.context,
          severity: 'high'
        });
      }
      
      // If user had to add imports, learn that
      if (pattern.type === 'imports' && pattern.before === '(missing)') {
        await storeLearning({
          type: 'pattern',
          description: `Required import: ${pattern.after}`,
          context: pattern.context,
          examples: [pattern.after]
        });
      }
      
      // If it's a naming preference, store it
      if (pattern.type === 'naming') {
        await storeLearning({
          type: 'preference',
          description: `Naming preference: ${pattern.before} → ${pattern.after}`,
          context: pattern.language
        });
      }
      
      // If console.log was removed, remember to not include debug statements
      if (pattern.type === 'style' && pattern.after === '(removed)' && pattern.before.includes('console.log')) {
        await addAntiPattern({
          description: 'Avoid including console.log in generated code',
          category: 'style',
          severity: 'low'
        });
      }
    }
  }
  
  /**
   * Get aggregated correction patterns for prompts
   */
  getFrequentPatterns(language?: string, limit: number = 5): CorrectionPattern[] {
    let patterns = this.corrections;
    
    if (language) {
      patterns = patterns.filter(p => p.language === language);
    }
    
    // Sort by frequency and recency
    patterns.sort((a, b) => {
      const freqDiff = b.frequency - a.frequency;
      if (freqDiff !== 0) return freqDiff;
      return b.timestamp - a.timestamp;
    });
    
    return patterns.slice(0, limit);
  }
  
  /**
   * Generate correction-aware prompt addition
   */
  getCorrectionPromptAddition(language: string): string {
    const patterns = this.getFrequentPatterns(language, 3);
    
    if (patterns.length === 0) return '';
    
    let prompt = '\n\n## ⚠️ COMMON CORRECTIONS TO AVOID\n';
    prompt += 'Users frequently correct these patterns - do it right the first time:\n';
    
    for (const pattern of patterns) {
      if (pattern.before !== '(missing)' && pattern.after !== '(removed)') {
        prompt += `• Instead of: \`${pattern.before}\` → Use: \`${pattern.after}\`\n`;
      } else if (pattern.before === '(missing)') {
        prompt += `• Don't forget: ${pattern.after.substring(0, 80)}\n`;
      } else if (pattern.after === '(removed)') {
        prompt += `• Avoid: ${pattern.before.substring(0, 80)}\n`;
      }
    }
    
    return prompt;
  }
  
  /**
   * Load corrections from disk
   */
  private async loadCorrections(): Promise<void> {
    try {
      const dir = path.dirname(this.dataPath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      if (fs.existsSync(this.dataPath)) {
        const data = await fs.promises.readFile(this.dataPath, 'utf-8');
        this.corrections = JSON.parse(data);
        console.log(`[CorrectionLearning] Loaded ${this.corrections.length} correction patterns`);
      }
    } catch (error) {
      console.warn('[CorrectionLearning] Could not load corrections:', error);
    }
  }
  
  /**
   * Save corrections to disk
   */
  private async saveCorrections(): Promise<void> {
    try {
      const dir = path.dirname(this.dataPath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      // Keep only recent and frequent patterns (max 500)
      if (this.corrections.length > 500) {
        this.corrections.sort((a, b) => {
          const freqDiff = b.frequency - a.frequency;
          if (freqDiff !== 0) return freqDiff;
          return b.timestamp - a.timestamp;
        });
        this.corrections = this.corrections.slice(0, 500);
      }
      
      await fs.promises.writeFile(
        this.dataPath,
        JSON.stringify(this.corrections, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.warn('[CorrectionLearning] Could not save corrections:', error);
    }
  }
}

/**
 * Singleton instance
 */
export const correctionLearning = new CorrectionLearningEngine();

