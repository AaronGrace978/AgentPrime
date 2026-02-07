/**
 * Cursor-Style Agent Enhancements
 * 
 * These are the key features that make Cursor's agent feel smart:
 * 1. Parallel tool execution - batch independent operations
 * 2. Surgical edits - StrReplace instead of full file rewrites
 * 3. Linter integration - check for errors after edits
 * 4. Progressive disclosure - show what's happening step by step
 * 5. Smart context windowing - manage long conversations
 * 6. Web search for docs - look up APIs and frameworks
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 1. PARALLEL TOOL EXECUTION
// ============================================================

export interface ParallelToolCall {
  id: string;
  tool: string;
  args: Record<string, any>;
  priority: 'high' | 'normal' | 'low';
  dependencies?: string[]; // IDs of tools that must complete first
}

export interface ParallelExecutionResult {
  id: string;
  success: boolean;
  result: any;
  duration: number;
  error?: string;
}

/**
 * Execute multiple independent tool calls in parallel
 * This is how Cursor feels fast - it batches operations
 */
export async function executeToolsInParallel(
  calls: ParallelToolCall[],
  toolExecutor: (tool: string, args: any) => Promise<any>,
  maxConcurrency: number = 5
): Promise<ParallelExecutionResult[]> {
  const results: ParallelExecutionResult[] = [];
  const pending = new Map<string, Promise<ParallelExecutionResult>>();
  const completed = new Set<string>();
  
  // Sort by priority
  const sortedCalls = [...calls].sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
  
  for (const call of sortedCalls) {
    // Wait for dependencies
    if (call.dependencies) {
      const depsToWait = call.dependencies.filter(d => !completed.has(d));
      if (depsToWait.length > 0) {
        const depPromises = depsToWait.map(d => pending.get(d)).filter(Boolean);
        await Promise.all(depPromises);
      }
    }
    
    // Limit concurrency
    while (pending.size >= maxConcurrency) {
      await Promise.race(pending.values());
    }
    
    // Execute tool
    const startTime = Date.now();
    const promise = (async (): Promise<ParallelExecutionResult> => {
      try {
        const result = await toolExecutor(call.tool, call.args);
        return {
          id: call.id,
          success: true,
          result,
          duration: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          id: call.id,
          success: false,
          result: null,
          duration: Date.now() - startTime,
          error: error.message
        };
      }
    })();
    
    pending.set(call.id, promise);
    
    promise.then(result => {
      results.push(result);
      completed.add(call.id);
      pending.delete(call.id);
    });
  }
  
  // Wait for all remaining
  await Promise.all(pending.values());
  
  return results;
}

// ============================================================
// 2. SURGICAL EDITS (StrReplace-style)
// ============================================================

export interface SurgicalEdit {
  path: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}

export interface SurgicalEditResult {
  success: boolean;
  path: string;
  replacements: number;
  error?: string;
}

/**
 * Apply surgical edits to files (like Cursor's StrReplace)
 * Much safer than full file rewrites
 */
export function applySurgicalEdit(
  workspacePath: string,
  edit: SurgicalEdit
): SurgicalEditResult {
  try {
    const fullPath = path.resolve(workspacePath, edit.path);
    
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        path: edit.path,
        replacements: 0,
        error: `File not found: ${edit.path}`
      };
    }
    
    let content = fs.readFileSync(fullPath, 'utf-8');
    const originalContent = content;
    
    if (edit.replaceAll) {
      const regex = new RegExp(escapeRegex(edit.oldText), 'g');
      const matches = content.match(regex);
      content = content.replace(regex, edit.newText);
      
      return {
        success: content !== originalContent,
        path: edit.path,
        replacements: matches?.length || 0
      };
    } else {
      if (!content.includes(edit.oldText)) {
        return {
          success: false,
          path: edit.path,
          replacements: 0,
          error: `Text not found in file. Make sure old_string matches exactly.`
        };
      }
      
      content = content.replace(edit.oldText, edit.newText);
      fs.writeFileSync(fullPath, content, 'utf-8');
      
      return {
        success: true,
        path: edit.path,
        replacements: 1
      };
    }
  } catch (error: any) {
    return {
      success: false,
      path: edit.path,
      replacements: 0,
      error: error.message
    };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// 3. LINTER INTEGRATION
// ============================================================

export interface LintResult {
  file: string;
  errors: LintError[];
  warnings: LintError[];
}

export interface LintError {
  line: number;
  column: number;
  message: string;
  rule?: string;
  severity: 'error' | 'warning';
  fixable?: boolean;
}

/**
 * Run linter on recently edited files
 * This catches errors before the agent marks task as done
 */
export async function checkLints(
  workspacePath: string,
  files: string[]
): Promise<LintResult[]> {
  const results: LintResult[] = [];
  
  for (const file of files) {
    const fullPath = path.resolve(workspacePath, file);
    if (!fs.existsSync(fullPath)) continue;
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const errors: LintError[] = [];
    const warnings: LintError[] = [];
    
    // Basic syntax checks based on file type
    const ext = path.extname(file).toLowerCase();
    
    if (ext === '.js' || ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
      // Check for common JS/TS issues
      const lines = content.split('\n');
      
      lines.forEach((line, i) => {
        // Missing semicolons (warning)
        if (/[a-zA-Z0-9\)\]"'`]\s*$/.test(line) && 
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*') &&
            !line.includes('{') &&
            !line.includes('}') &&
            line.trim().length > 0) {
          // This is simplified - real linter would be more accurate
        }
        
        // console.log in production (warning)
        if (line.includes('console.log')) {
          warnings.push({
            line: i + 1,
            column: line.indexOf('console.log') + 1,
            message: 'Unexpected console.log statement',
            rule: 'no-console',
            severity: 'warning'
          });
        }
        
        // TODO comments (info/warning)
        if (line.includes('TODO') || line.includes('FIXME')) {
          warnings.push({
            line: i + 1,
            column: 1,
            message: 'TODO/FIXME comment found',
            rule: 'no-todo',
            severity: 'warning'
          });
        }
      });
      
      // Check for unclosed brackets (simplified)
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push({
          line: 1,
          column: 1,
          message: `Mismatched braces: ${openBraces} open, ${closeBraces} close`,
          severity: 'error'
        });
      }
    }
    
    if (ext === '.html') {
      // Check HTML for common issues
      const lines = content.split('\n');
      
      // Check for unclosed tags (simplified)
      const openTags = content.match(/<[a-z][^>]*[^/]>/gi) || [];
      const closeTags = content.match(/<\/[a-z]+>/gi) || [];
      
      // Check for missing alt on images
      const imgWithoutAlt = content.match(/<img(?![^>]*alt=)[^>]*>/gi);
      if (imgWithoutAlt) {
        warnings.push({
          line: 1,
          column: 1,
          message: `${imgWithoutAlt.length} image(s) missing alt attribute`,
          rule: 'img-alt',
          severity: 'warning'
        });
      }
    }
    
    if (ext === '.css') {
      // Check CSS for common issues
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push({
          line: 1,
          column: 1,
          message: `Mismatched braces in CSS`,
          severity: 'error'
        });
      }
    }
    
    results.push({
      file,
      errors,
      warnings
    });
  }
  
  return results;
}

// ============================================================
// 4. PROGRESSIVE DISCLOSURE / STEP STREAMING
// ============================================================

export interface AgentStep {
  id: string;
  type: 'thinking' | 'reading' | 'writing' | 'running' | 'searching' | 'complete';
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startTime: number;
  endTime?: number;
  children?: AgentStep[];
}

/**
 * Step tracker for progressive disclosure
 * Shows users what the agent is doing in real-time
 */
export class StepTracker {
  private steps: AgentStep[] = [];
  private listeners: ((steps: AgentStep[]) => void)[] = [];
  
  startStep(type: AgentStep['type'], title: string, detail?: string): string {
    const id = `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const step: AgentStep = {
      id,
      type,
      title,
      detail,
      status: 'running',
      startTime: Date.now()
    };
    
    this.steps.push(step);
    this.notify();
    return id;
  }
  
  completeStep(id: string, status: 'success' | 'error' = 'success', detail?: string): void {
    const step = this.steps.find(s => s.id === id);
    if (step) {
      step.status = status;
      step.endTime = Date.now();
      if (detail) step.detail = detail;
      this.notify();
    }
  }
  
  updateStep(id: string, updates: Partial<AgentStep>): void {
    const step = this.steps.find(s => s.id === id);
    if (step) {
      Object.assign(step, updates);
      this.notify();
    }
  }
  
  getSteps(): AgentStep[] {
    return [...this.steps];
  }
  
  onUpdate(listener: (steps: AgentStep[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
  
  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.getSteps());
    }
  }
  
  reset(): void {
    this.steps = [];
    this.notify();
  }
}

// Global step tracker instance
export const stepTracker = new StepTracker();

// ============================================================
// 5. SMART CONTEXT WINDOWING
// ============================================================

export interface ContextWindow {
  systemPrompt: string;
  recentMessages: Array<{ role: string; content: string }>;
  relevantFiles: Array<{ path: string; content: string; relevance: number }>;
  totalTokens: number;
}

/**
 * Smart context manager that keeps the most relevant context
 * within token limits
 */
export function buildSmartContext(
  messages: Array<{ role: string; content: string }>,
  files: Map<string, string>,
  query: string,
  maxTokens: number = 8000
): ContextWindow {
  // Estimate tokens (rough: 4 chars per token)
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  
  // Always include system prompt
  const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
  let usedTokens = estimateTokens(systemPrompt);
  
  // Score files by relevance to query
  const queryTerms = query.toLowerCase().split(/\s+/);
  const scoredFiles = Array.from(files.entries()).map(([path, content]) => {
    let relevance = 0;
    
    // Path matching
    for (const term of queryTerms) {
      if (path.toLowerCase().includes(term)) relevance += 10;
    }
    
    // Content matching (sample first 1000 chars)
    const sample = content.slice(0, 1000).toLowerCase();
    for (const term of queryTerms) {
      if (sample.includes(term)) relevance += 5;
    }
    
    // Recent edits get priority (would need timestamp tracking)
    // Entry files get priority
    if (path.match(/^(index|main|app)\.(js|ts|tsx|jsx|html|py)$/i)) {
      relevance += 20;
    }
    
    return { path, content, relevance };
  }).sort((a, b) => b.relevance - a.relevance);
  
  // Include files up to token budget
  const relevantFiles: typeof scoredFiles = [];
  const fileTokenBudget = (maxTokens - usedTokens) * 0.4; // 40% for files
  let fileTokens = 0;
  
  for (const file of scoredFiles) {
    const tokens = estimateTokens(file.content);
    if (fileTokens + tokens <= fileTokenBudget) {
      relevantFiles.push(file);
      fileTokens += tokens;
    }
  }
  
  usedTokens += fileTokens;
  
  // Include recent messages
  const recentMessages: typeof messages = [];
  const messageBudget = maxTokens - usedTokens;
  let messageTokens = 0;
  
  // Work backwards from most recent
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'system') continue;
    
    const tokens = estimateTokens(msg.content);
    if (messageTokens + tokens <= messageBudget) {
      recentMessages.unshift(msg);
      messageTokens += tokens;
    } else {
      break;
    }
  }
  
  return {
    systemPrompt,
    recentMessages,
    relevantFiles,
    totalTokens: usedTokens + messageTokens
  };
}

// ============================================================
// 6. WEB SEARCH FOR DOCUMENTATION
// ============================================================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

/**
 * Search the web for documentation
 * Useful when the agent encounters unfamiliar APIs
 */
export async function searchDocs(
  query: string,
  options?: {
    site?: string; // e.g., 'developer.mozilla.org'
    limit?: number;
  }
): Promise<WebSearchResult[]> {
  // This would integrate with a web search API
  // For now, return empty - could use DuckDuckGo, Google Custom Search, etc.
  console.log(`[WebSearch] Would search for: ${query}`);
  
  // Placeholder - in production, this would call a search API
  return [];
}

// ============================================================
// EXPORTS
// ============================================================

export const CursorStyleEnhancements = {
  executeToolsInParallel,
  applySurgicalEdit,
  checkLints,
  StepTracker,
  stepTracker,
  buildSmartContext,
  searchDocs
};

export default CursorStyleEnhancements;
