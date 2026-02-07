/**
 * AgentPrime - Self-Critique System
 * 
 * Before marking a task complete, the agent reviews its own work.
 * This mirrors how expert engineers do self-review before submitting code.
 * 
 * The critique system:
 * 1. Reviews generated code for common issues
 * 2. Checks for missing imports, unclosed tags, unhandled cases
 * 3. Verifies file coherence (HTML↔JS↔CSS connections)
 * 4. Optionally asks a different model for a second opinion
 */

import aiRouter from '../ai-providers';
import type { ChatMessage } from '../../types/ai-providers';

export interface CritiqueResult {
  passed: boolean;
  issues: CritiqueIssue[];
  suggestions: string[];
  confidence: number;
  autoFixable: CritiqueIssue[];
}

export interface CritiqueIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'syntax' | 'imports' | 'coherence' | 'logic' | 'ux' | 'security' | 'performance';
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
  autoFixable?: boolean;
}

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

/**
 * Self-Critique Engine
 * Performs multi-layer review of generated code
 */
export class SelfCritiqueEngine {
  private readonly CRITIQUE_MODEL = 'claude-3-5-haiku-20241022'; // Fast model for critique
  
  /**
   * Perform comprehensive self-critique on generated files
   */
  async critique(
    files: GeneratedFile[],
    task: string,
    workspacePath: string
  ): Promise<CritiqueResult> {
    const issues: CritiqueIssue[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    // Layer 1: Static Analysis (fast, no AI)
    const staticIssues = await this.staticAnalysis(files);
    issues.push(...staticIssues);
    
    // Layer 2: Coherence Check (verify files work together)
    const coherenceIssues = await this.coherenceCheck(files);
    issues.push(...coherenceIssues);
    
    // Layer 3: AI Critique (only for complex tasks or when issues found)
    if (issues.some(i => i.severity === 'critical') || files.length > 3) {
      const aiIssues = await this.aiCritique(files, task);
      issues.push(...aiIssues);
    }
    
    // Calculate confidence based on issues
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    
    confidence -= criticalCount * 0.25;
    confidence -= warningCount * 0.1;
    confidence = Math.max(0, Math.min(1, confidence));
    
    // Generate actionable suggestions
    if (criticalCount > 0) {
      suggestions.push('⚠️ Critical issues found - auto-fix recommended before completion');
    }
    
    if (issues.some(i => i.category === 'imports')) {
      suggestions.push('💡 Check import statements - some may be missing or incorrect');
    }
    
    if (issues.some(i => i.category === 'coherence')) {
      suggestions.push('🔗 File coherence issues - verify HTML/JS/CSS connections');
    }
    
    const autoFixable = issues.filter(i => i.autoFixable);
    
    return {
      passed: criticalCount === 0 && confidence >= 0.7,
      issues,
      suggestions,
      confidence,
      autoFixable
    };
  }
  
  /**
   * Static analysis - no AI, just pattern matching
   */
  private async staticAnalysis(files: GeneratedFile[]): Promise<CritiqueIssue[]> {
    const issues: CritiqueIssue[] = [];
    
    for (const file of files) {
      const ext = file.path.split('.').pop()?.toLowerCase() || '';
      
      // Check for unbalanced braces/brackets
      if (['js', 'ts', 'tsx', 'jsx', 'json'].includes(ext)) {
        const braceBalance = this.checkBraceBalance(file.content);
        if (!braceBalance.balanced) {
          issues.push({
            severity: 'critical',
            category: 'syntax',
            description: `Unbalanced ${braceBalance.type} in ${file.path}`,
            file: file.path,
            line: braceBalance.estimatedLine,
            autoFixable: false
          });
        }
        
        // Check for TODO/FIXME/placeholder text
        const placeholders = file.content.match(/TODO|FIXME|PLACEHOLDER|YOUR_.*_HERE|<your.*>/gi);
        if (placeholders && placeholders.length > 0) {
          issues.push({
            severity: 'warning',
            category: 'logic',
            description: `Contains ${placeholders.length} placeholder(s): ${placeholders.slice(0, 3).join(', ')}`,
            file: file.path,
            autoFixable: false
          });
        }
        
        // Check for console.log in production code
        const consoleLogs = (file.content.match(/console\.log/g) || []).length;
        if (consoleLogs > 5) {
          issues.push({
            severity: 'info',
            category: 'performance',
            description: `${consoleLogs} console.log statements - consider removing for production`,
            file: file.path,
            autoFixable: true,
            suggestedFix: 'Remove or comment out console.log statements'
          });
        }
      }
      
      // Check HTML for common issues
      if (['html', 'htm'].includes(ext)) {
        // Check for unclosed tags
        const tagIssues = this.checkHtmlTags(file.content);
        issues.push(...tagIssues.map(t => ({ ...t, file: file.path })));
        
        // Check for missing doctype
        if (!file.content.trim().toLowerCase().startsWith('<!doctype')) {
          issues.push({
            severity: 'warning',
            category: 'syntax',
            description: 'Missing <!DOCTYPE html> declaration',
            file: file.path,
            autoFixable: true,
            suggestedFix: 'Add <!DOCTYPE html> at the beginning'
          });
        }
      }
      
      // Check CSS for common issues
      if (['css', 'scss', 'less'].includes(ext)) {
        const cssIssues = this.checkCss(file.content);
        issues.push(...cssIssues.map(c => ({ ...c, file: file.path })));
      }
      
      // Check Python for common issues
      if (ext === 'py') {
        const pyIssues = this.checkPython(file.content);
        issues.push(...pyIssues.map(p => ({ ...p, file: file.path })));
      }
    }
    
    return issues;
  }
  
  /**
   * Check brace/bracket/paren balance
   */
  private checkBraceBalance(content: string): { balanced: boolean; type?: string; estimatedLine?: number } {
    const pairs = [
      { open: '{', close: '}', type: 'braces' },
      { open: '[', close: ']', type: 'brackets' },
      { open: '(', close: ')', type: 'parentheses' }
    ];
    
    // Remove strings and comments to avoid false positives
    const cleaned = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments
      .replace(/\/\/.*/g, '') // Single-line comments
      .replace(/"(?:[^"\\]|\\.)*"/g, '""') // Double-quoted strings
      .replace(/'(?:[^'\\]|\\.)*'/g, "''") // Single-quoted strings
      .replace(/`(?:[^`\\]|\\.)*`/g, '``'); // Template literals
    
    for (const { open, close, type } of pairs) {
      let count = 0;
      let lastOpenLine = 0;
      const lines = cleaned.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === open) {
            count++;
            lastOpenLine = i + 1;
          } else if (char === close) {
            count--;
            if (count < 0) {
              return { balanced: false, type, estimatedLine: i + 1 };
            }
          }
        }
      }
      
      if (count !== 0) {
        return { balanced: false, type, estimatedLine: lastOpenLine };
      }
    }
    
    return { balanced: true };
  }
  
  /**
   * Check HTML for unclosed tags
   */
  private checkHtmlTags(content: string): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    
    // Self-closing tags that don't need closing
    const selfClosing = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);
    
    // Track open tags
    const tagStack: { tag: string; line: number }[] = [];
    const lines = content.split('\n');
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      // Find opening tags
      const openTags = line.matchAll(/<([a-z][a-z0-9]*)[^>]*(?<!\/)\s*>/gi);
      for (const match of openTags) {
        const tag = match[1].toLowerCase();
        if (!selfClosing.has(tag)) {
          tagStack.push({ tag, line: lineNum + 1 });
        }
      }
      
      // Find closing tags
      const closeTags = line.matchAll(/<\/([a-z][a-z0-9]*)>/gi);
      for (const match of closeTags) {
        const tag = match[1].toLowerCase();
        const lastOpen = tagStack.pop();
        
        if (!lastOpen) {
          issues.push({
            severity: 'warning',
            category: 'syntax',
            description: `Unexpected closing tag </${tag}> with no matching open tag`,
            line: lineNum + 1
          });
        } else if (lastOpen.tag !== tag) {
          issues.push({
            severity: 'critical',
            category: 'syntax',
            description: `Tag mismatch: expected </${lastOpen.tag}> but found </${tag}>`,
            line: lineNum + 1
          });
          // Put it back for potential recovery
          tagStack.push(lastOpen);
        }
      }
    }
    
    // Check for unclosed tags
    for (const unclosed of tagStack) {
      issues.push({
        severity: 'warning',
        category: 'syntax',
        description: `Unclosed tag <${unclosed.tag}> opened on line ${unclosed.line}`,
        line: unclosed.line
      });
    }
    
    return issues;
  }
  
  /**
   * Check CSS for common issues
   */
  private checkCss(content: string): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    
    // Check for !important overuse
    const importantCount = (content.match(/!important/g) || []).length;
    if (importantCount > 10) {
      issues.push({
        severity: 'warning',
        category: 'performance',
        description: `Heavy use of !important (${importantCount} occurrences) - consider refactoring specificity`,
        autoFixable: false
      });
    }
    
    // Check for vendor prefix without standard property
    const vendorPrefixes = content.match(/-webkit-|-moz-|-ms-|-o-/g) || [];
    if (vendorPrefixes.length > 0 && !content.includes('autoprefixer')) {
      issues.push({
        severity: 'info',
        category: 'performance',
        description: 'Manual vendor prefixes detected - consider using autoprefixer',
        autoFixable: false
      });
    }
    
    // CRITICAL: Check for pointer-events inheritance issues
    // This catches the common bug where child buttons have pointer-events:all
    // which overrides parent's pointer-events:none on hidden overlays
    const pointerEventsIssues = this.checkPointerEventsInheritance(content);
    issues.push(...pointerEventsIssues);
    
    // Check for z-index stacking context issues
    const zIndexIssues = this.checkZIndexStacking(content);
    issues.push(...zIndexIssues);
    
    // Check for opacity + pointer-events pattern (common in modal/overlay UIs)
    const overlayIssues = this.checkOverlayPatterns(content);
    issues.push(...overlayIssues);
    
    return issues;
  }
  
  /**
   * Check for pointer-events inheritance issues
   * Common bug: buttons inside hidden overlays still intercept clicks
   */
  private checkPointerEventsInheritance(content: string): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    
    // Pattern: parent has pointer-events:none, child has pointer-events:all
    // This creates click interception on hidden elements
    const hasPointerEventsNone = /pointer-events\s*:\s*none/i.test(content);
    const hasPointerEventsAll = /pointer-events\s*:\s*all/i.test(content);
    
    if (hasPointerEventsNone && hasPointerEventsAll) {
      // Check if pointer-events:all is on a button or interactive element
      const pointerAllMatch = content.match(/([^{}]+)\{[^{}]*pointer-events\s*:\s*all[^{}]*\}/gi);
      if (pointerAllMatch) {
        for (const rule of pointerAllMatch) {
          const selector = rule.match(/([^{]+)\{/)?.[1]?.trim();
          if (selector && (
            selector.includes('button') ||
            selector.includes('.btn') ||
            selector.includes('glow-button') ||
            selector.includes('a ') ||
            selector.includes('[type="submit"]')
          )) {
            issues.push({
              severity: 'critical',
              category: 'ux',
              description: `"${selector}" has pointer-events:all which may override parent's pointer-events:none. Hidden buttons can intercept clicks! Use "pointer-events: inherit" or move the active state to a higher-level container.`,
              autoFixable: true,
              suggestedFix: `Change "${selector} { pointer-events: all }" to use inherit or remove it, and let the parent's .active class control pointer-events`
            });
          }
        }
      }
    }
    
    return issues;
  }
  
  /**
   * Check for z-index stacking context issues
   */
  private checkZIndexStacking(content: string): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    
    // Find all z-index declarations
    const zIndexMatches = content.match(/z-index\s*:\s*(\d+)/gi);
    if (zIndexMatches && zIndexMatches.length > 0) {
      const zIndexValues = zIndexMatches.map(m => parseInt(m.match(/\d+/)?.[0] || '0'));
      
      // Check for multiple elements with same z-index
      const zIndexCounts = new Map<number, number>();
      for (const z of zIndexValues) {
        zIndexCounts.set(z, (zIndexCounts.get(z) || 0) + 1);
      }
      
      for (const [zValue, count] of zIndexCounts) {
        if (count > 2 && zValue > 1) {
          issues.push({
            severity: 'warning',
            category: 'ux',
            description: `${count} elements have same z-index:${zValue}. This can cause unpredictable stacking order. Consider using different z-index values.`,
            autoFixable: false
          });
        }
      }
      
      // Check for very high z-index values (potential z-index war)
      const maxZ = Math.max(...zIndexValues);
      if (maxZ > 9999) {
        issues.push({
          severity: 'info',
          category: 'performance',
          description: `Very high z-index value (${maxZ}) detected. This may indicate z-index escalation issues.`,
          autoFixable: false
        });
      }
    }
    
    return issues;
  }
  
  /**
   * Check for overlay/modal patterns that may cause issues
   */
  private checkOverlayPatterns(content: string): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    
    // Check for overlay pattern: opacity:0 + pointer-events:none (good)
    // vs just opacity:0 without pointer-events:none (bad)
    const hasOpacityZero = /opacity\s*:\s*0/i.test(content);
    const hasPointerEventsNone = /pointer-events\s*:\s*none/i.test(content);
    
    if (hasOpacityZero && !hasPointerEventsNone) {
      issues.push({
        severity: 'warning',
        category: 'ux',
        description: 'opacity:0 used without pointer-events:none. Hidden elements will still intercept clicks! Add pointer-events:none to hidden state.',
        autoFixable: true,
        suggestedFix: 'Add pointer-events:none to elements with opacity:0'
      });
    }
    
    // Check for display:none vs visibility:hidden vs opacity:0
    // All have different behaviors for pointer events
    const hasDisplayNone = /display\s*:\s*none/i.test(content);
    const hasVisibilityHidden = /visibility\s*:\s*hidden/i.test(content);
    
    if (hasOpacityZero && hasDisplayNone && hasVisibilityHidden) {
      issues.push({
        severity: 'info',
        category: 'ux',
        description: 'Multiple hiding techniques (display:none, visibility:hidden, opacity:0) used. Consider standardizing on one approach for consistency.',
        autoFixable: false
      });
    }
    
    // Check for transition on opacity without transition on pointer-events
    const hasOpacityTransition = /transition[^;]*opacity/i.test(content);
    if (hasOpacityTransition && hasPointerEventsNone) {
      // This is actually fine - just informational
      // Pointer-events don't animate anyway
    }
    
    return issues;
  }
  
  /**
   * Check Python for common issues
   */
  private checkPython(content: string): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    
    // Check for bare except clauses
    if (/except\s*:/g.test(content)) {
      issues.push({
        severity: 'warning',
        category: 'security',
        description: 'Bare except clause - catches all exceptions including SystemExit',
        suggestedFix: 'Use except Exception: instead',
        autoFixable: true
      });
    }
    
    // Check for eval() usage
    if (/\beval\s*\(/g.test(content)) {
      issues.push({
        severity: 'critical',
        category: 'security',
        description: 'eval() usage detected - potential security vulnerability',
        autoFixable: false
      });
    }
    
    // Check for missing type hints in function definitions
    const funcDefs = content.match(/def\s+\w+\s*\([^)]*\)/g) || [];
    const typedFuncs = content.match(/def\s+\w+\s*\([^)]*\)\s*->/g) || [];
    if (funcDefs.length > typedFuncs.length + 2) {
      issues.push({
        severity: 'info',
        category: 'logic',
        description: `Only ${typedFuncs.length}/${funcDefs.length} functions have return type hints`,
        autoFixable: false
      });
    }
    
    return issues;
  }
  
  /**
   * Coherence check - verify files work together
   */
  private async coherenceCheck(files: GeneratedFile[]): Promise<CritiqueIssue[]> {
    const issues: CritiqueIssue[] = [];
    
    // Find HTML files
    const htmlFiles = files.filter(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
    const jsFiles = files.filter(f => /\.(js|ts|tsx|jsx)$/.test(f.path));
    const cssFiles = files.filter(f => f.path.endsWith('.css'));
    
    for (const html of htmlFiles) {
      // Check if referenced scripts exist
      const scriptRefs = html.content.match(/src=["']([^"']+\.js)["']/g) || [];
      for (const ref of scriptRefs) {
        const scriptPath = ref.match(/["']([^"']+)["']/)?.[1];
        if (scriptPath) {
          const scriptExists = jsFiles.some(f => 
            f.path.endsWith(scriptPath) || 
            scriptPath.includes(f.path.split('/').pop() || '')
          );
          if (!scriptExists && !scriptPath.startsWith('http') && !scriptPath.includes('cdn')) {
            issues.push({
              severity: 'critical',
              category: 'coherence',
              description: `HTML references script "${scriptPath}" but it wasn't generated`,
              file: html.path,
              autoFixable: false
            });
          }
        }
      }
      
      // Check if referenced stylesheets exist
      const styleRefs = html.content.match(/href=["']([^"']+\.css)["']/g) || [];
      for (const ref of styleRefs) {
        const stylePath = ref.match(/["']([^"']+)["']/)?.[1];
        if (stylePath) {
          const styleExists = cssFiles.some(f => 
            f.path.endsWith(stylePath) ||
            stylePath.includes(f.path.split('/').pop() || '')
          );
          if (!styleExists && !stylePath.startsWith('http') && !stylePath.includes('cdn')) {
            issues.push({
              severity: 'warning',
              category: 'coherence',
              description: `HTML references stylesheet "${stylePath}" but it wasn't generated`,
              file: html.path,
              autoFixable: false
            });
          }
        }
      }
    }
    
    // Check JS imports resolve
    for (const js of jsFiles) {
      const imports = js.content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g) || [];
      for (const imp of imports) {
        const importPath = imp.match(/from\s+['"]([^'"]+)['"]/)?.[1];
        if (importPath && importPath.startsWith('.')) {
          // Relative import - check if it exists
          const importExists = files.some(f => {
            const normalizedImport = importPath.replace(/^\.\//, '').replace(/\.(js|ts|tsx|jsx)$/, '');
            const normalizedFile = f.path.replace(/\.(js|ts|tsx|jsx)$/, '');
            return normalizedFile.includes(normalizedImport);
          });
          
          if (!importExists) {
            issues.push({
              severity: 'warning',
              category: 'coherence',
              description: `Import "${importPath}" may not resolve - file not in generated set`,
              file: js.path,
              autoFixable: false
            });
          }
        }
      }
    }
    
    return issues;
  }
  
  /**
   * AI-powered critique for complex issues
   */
  private async aiCritique(files: GeneratedFile[], task: string): Promise<CritiqueIssue[]> {
    const issues: CritiqueIssue[] = [];
    
    try {
      // Build a compact representation of generated files
      const filesSummary = files.map(f => {
        const lines = f.content.split('\n').length;
        const preview = f.content.substring(0, 500);
        return `### ${f.path} (${lines} lines)\n\`\`\`${f.language}\n${preview}${f.content.length > 500 ? '\n... (truncated)' : ''}\n\`\`\``;
      }).join('\n\n');
      
      const messages: ChatMessage[] = [{
        role: 'user',
        content: `You are a senior code reviewer. Review this generated code for the task: "${task}"

${filesSummary}

Look for:
1. Logic bugs or runtime errors
2. Missing error handling
3. Security vulnerabilities
4. UX issues (missing loading states, error messages)
5. Edge cases not handled

Respond with a JSON array of issues:
[
  {"severity": "critical|warning|info", "category": "syntax|logic|security|ux|performance", "description": "issue description", "file": "filename"}
]

If no issues found, respond with empty array: []
Be concise and only report significant issues.`
      }];
      
      const response = await aiRouter.chat(messages, {
        model: this.CRITIQUE_MODEL,
        max_tokens: 1000,
        temperature: 0.3
      });
      
      // Parse AI response
      const jsonMatch = response.content?.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const aiIssues = JSON.parse(jsonMatch[0]);
        for (const issue of aiIssues) {
          issues.push({
            severity: issue.severity || 'warning',
            category: issue.category || 'logic',
            description: `[AI Review] ${issue.description}`,
            file: issue.file,
            autoFixable: false
          });
        }
      }
    } catch (error) {
      console.warn('[SelfCritique] AI critique failed:', error);
      // Non-critical - continue without AI critique
    }
    
    return issues;
  }
}

/**
 * Singleton instance
 */
export const selfCritiqueEngine = new SelfCritiqueEngine();

/**
 * Quick critique function for use in agent loop
 */
export async function critqueGeneratedFiles(
  files: { path: string; content: string }[],
  task: string,
  workspacePath: string
): Promise<CritiqueResult> {
  const generatedFiles: GeneratedFile[] = files.map(f => ({
    path: f.path,
    content: f.content,
    language: f.path.split('.').pop() || 'text'
  }));
  
  return selfCritiqueEngine.critique(generatedFiles, task, workspacePath);
}

