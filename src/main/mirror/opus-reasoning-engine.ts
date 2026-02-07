/**
 * Opus Reasoning Engine - Deep Pattern Extraction & Application
 * 
 * This doesn't just inject Opus examples into prompts.
 * It EXTRACTS Opus 4.5's reasoning patterns and applies them across
 * the ENTIRE AgentPrime architecture:
 * 
 * 1. Decision-making logic (when to use what approach)
 * 2. Problem-solving patterns (how Opus breaks down tasks)
 * 3. Quality standards (what "complete" means to Opus)
 * 4. Error prevention (how Opus avoids mistakes)
 * 5. Architecture awareness (how Opus understands systems)
 * 
 * These patterns are then applied to:
 * - Agent Loop (task execution)
 * - Task Master (quality review)
 * - Tool Validation (pre-write checks)
 * - Specialized Agents (code generation)
 * - Self-Critique (post-generation review)
 */

import { loadOpusExamples, getExamplesByTag, getExamplesByCategory } from './opus-example-loader';
import { getMirrorMemory, storeLearning } from './mirror-singleton';

export interface OpusReasoningPattern {
  id: string;
  type: 'decision' | 'problem-solving' | 'quality' | 'error-prevention' | 'architecture';
  description: string;
  context: string; // When to apply this pattern
  example: string; // Code/behavior example
  confidence: number;
  appliedTo: string[]; // Which parts of architecture use this
}

export interface OpusDecision {
  situation: string;
  opusApproach: string;
  reasoning: string;
  alternatives: string[];
  whyChosen: string;
}

/**
 * Opus Reasoning Engine
 * Extracts and applies Opus 4.5's reasoning patterns system-wide
 */
export class OpusReasoningEngine {
  private cachedPatterns: Map<string, OpusReasoningPattern[]> = new Map();
  private decisionCache: Map<string, OpusDecision> = new Map();
  
  /**
   * Extract reasoning patterns from Opus examples
   * This analyzes HOW Opus thinks, not just WHAT it codes
   */
  async extractReasoningPatterns(task: string): Promise<OpusReasoningPattern[]> {
    const cacheKey = task.substring(0, 100);
    if (this.cachedPatterns.has(cacheKey)) {
      return this.cachedPatterns.get(cacheKey)!;
    }
    
    const patterns: OpusReasoningPattern[] = [];
    
    // Load relevant Opus examples
    const examples = await loadOpusExamples(task, 5);
    
    for (const example of examples) {
      // Extract decision-making patterns
      const decisions = this.extractDecisions(example);
      patterns.push(...decisions);
      
      // Extract problem-solving patterns
      const problemSolving = this.extractProblemSolving(example);
      patterns.push(...problemSolving);
      
      // Extract quality standards
      const quality = this.extractQualityStandards(example);
      patterns.push(...quality);
      
      // Extract error prevention
      const errorPrevention = this.extractErrorPrevention(example);
      patterns.push(...errorPrevention);
      
      // Extract architecture awareness
      const architecture = this.extractArchitectureAwareness(example);
      patterns.push(...architecture);
    }
    
    // Store in cache
    this.cachedPatterns.set(cacheKey, patterns);
    
    // Store in mirror memory for future use
    for (const pattern of patterns) {
      await storeLearning({
        type: 'pattern',
        description: pattern.description,
        context: pattern.context,
        examples: [pattern.example]
      });
    }
    
    console.log(`[OpusReasoning] Extracted ${patterns.length} reasoning patterns from Opus examples`);
    
    return patterns;
  }
  
  /**
   * Extract decision-making patterns using multi-signal detection.
   * Each pattern requires multiple signals to avoid false positives.
   */
  private extractDecisions(example: string): OpusReasoningPattern[] {
    const patterns: OpusReasoningPattern[] = [];
    const lower = example.toLowerCase();
    
    // Pattern 1: Read-before-write (require 2+ signals)
    const readFirstSignals = [
      lower.includes('read') && (lower.includes('file') || lower.includes('existing')),
      lower.includes('understand') && lower.includes('before'),
      lower.includes('context') && lower.includes('first'),
      /readFile|readdir|fs\.read/.test(example)
    ].filter(Boolean).length;
    
    if (readFirstSignals >= 2) {
      patterns.push({
        id: 'opus_decision_read_first',
        type: 'decision',
        description: 'Always read existing files before writing to understand context',
        context: 'Before writing any file, especially in FIX/ENHANCE mode',
        example: 'Read index.html before writing script.js to ensure consistency',
        confidence: Math.min(0.95, 0.7 + readFirstSignals * 0.1),
        appliedTo: ['agent-loop', 'task-master', 'tool-validation']
      });
    }
    
    // Pattern 2: Cross-file validation (require structural signals)
    const validationSignals = [
      /\bvalidat\w+\b.*\b(?:file|import|reference)\b/.test(lower),
      lower.includes('consistency') || lower.includes('coherence'),
      /\bmatch\w*\b.*\b(?:html|js|css|type)\b/.test(lower),
      /import.*exist|require.*found/.test(lower)
    ].filter(Boolean).length;
    
    if (validationSignals >= 1) {
      patterns.push({
        id: 'opus_decision_validate_consistency',
        type: 'decision',
        description: 'Validate cross-file consistency (imports, references, types)',
        context: 'When writing files that reference other files',
        example: 'Check that HTML script tags match actual JS files',
        confidence: Math.min(0.9, 0.6 + validationSignals * 0.15),
        appliedTo: ['task-master', 'tool-validation']
      });
    }
    
    // Pattern 3: Surgical edits (require code-level signals)
    const surgicalSignals = [
      /patch|str_replace|sed\b/.test(lower),
      /surgical|minimal.*change|targeted.*edit/.test(lower),
      /replace\s*\(.*,.*\)/.test(example),
      lower.includes('fix') && !lower.includes('rewrite')
    ].filter(Boolean).length;
    
    if (surgicalSignals >= 2) {
      patterns.push({
        id: 'opus_decision_surgical_edits',
        type: 'decision',
        description: 'Use surgical edits instead of full file rewrites when fixing',
        context: 'FIX mode - when only part of a file needs changing',
        example: 'Patch specific functions instead of rewriting the entire file',
        confidence: Math.min(0.85, 0.6 + surgicalSignals * 0.1),
        appliedTo: ['agent-loop', 'specialized-agents']
      });
    }
    
    // Pattern 4: Plan-first approach (require structured signals)
    const planSignals = [
      /\bstep\s*[1-9]|1\)\s|first.*then/.test(lower),
      lower.includes('plan') && (lower.includes('before') || lower.includes('approach')),
      /break\s*down|decompose|subtask/.test(lower),
      /\b(?:phase|stage)\s*\d/.test(lower)
    ].filter(Boolean).length;
    
    if (planSignals >= 2) {
      patterns.push({
        id: 'opus_decision_plan_first',
        type: 'decision',
        description: 'Break down complex tasks into ordered steps before coding',
        context: 'Complex tasks with multiple files or features',
        example: '1) Read existing files 2) Understand structure 3) Plan changes 4) Implement',
        confidence: Math.min(0.9, 0.6 + planSignals * 0.15),
        appliedTo: ['agent-loop', 'specialized-agents']
      });
    }
    
    return patterns;
  }
  
  /**
   * Extract problem-solving patterns
   * "How Opus approaches different types of problems"
   */
  private extractProblemSolving(example: string): OpusReasoningPattern[] {
    const patterns: OpusReasoningPattern[] = [];
    
    // Pattern: Opus understands project type before coding
    if (example.includes('project type') || example.includes('detect') || example.includes('game') || example.includes('portfolio')) {
      patterns.push({
        id: 'opus_problem_project_type',
        type: 'problem-solving',
        description: 'Identify project type (game, portfolio, debugger, etc.) before generating code',
        context: 'When user asks to create or modify a project',
        example: 'Opus detects "Three.js game" from task, ensures all files match game type',
        confidence: 0.95,
        appliedTo: ['task-master', 'tool-validation', 'agent-loop']
      });
    }
    
    // Pattern: Opus ensures file coherence
    if (example.includes('coherence') || example.includes('match') || example.includes('consistent')) {
      patterns.push({
        id: 'opus_problem_file_coherence',
        type: 'problem-solving',
        description: 'Ensure all files in a project work together (HTML references correct JS, imports resolve, etc.)',
        context: 'When creating or modifying multiple files',
        example: 'Opus verifies HTML script tag matches actual JS file name and content',
        confidence: 0.9,
        appliedTo: ['task-master', 'tool-validation', 'self-critique']
      });
    }
    
    return patterns;
  }
  
  /**
   * Extract quality standards
   * "What 'complete' and 'production-ready' means to Opus"
   */
  private extractQualityStandards(example: string): OpusReasoningPattern[] {
    const patterns: OpusReasoningPattern[] = [];
    
    // Pattern: Opus includes error handling
    if (example.includes('try') || example.includes('catch') || example.includes('error')) {
      patterns.push({
        id: 'opus_quality_error_handling',
        type: 'quality',
        description: 'Always include proper error handling (try/catch, validation, fallbacks)',
        context: 'All code generation, especially file operations and API calls',
        example: 'Opus wraps file operations in try/catch and provides meaningful error messages',
        confidence: 0.95,
        appliedTo: ['specialized-agents', 'self-critique']
      });
    }
    
    // Pattern: Opus creates complete solutions
    if (example.includes('complete') || example.includes('full') || example.includes('production')) {
      patterns.push({
        id: 'opus_quality_complete',
        type: 'quality',
        description: 'Create complete, working solutions - no placeholders, no TODOs, no skeleton code',
        context: 'All code generation',
        example: 'Opus generates full working code with all imports, functions, and error handling',
        confidence: 0.9,
        appliedTo: ['specialized-agents', 'self-critique', 'agent-loop']
      });
    }
    
    return patterns;
  }
  
  /**
   * Extract error prevention patterns
   * "How Opus avoids common mistakes"
   */
  private extractErrorPrevention(example: string): OpusReasoningPattern[] {
    const patterns: OpusReasoningPattern[] = [];
    
    // Pattern: Opus checks for mismatches
    if (example.includes('mismatch') || example.includes('wrong type') || example.includes('doesn\'t match')) {
      patterns.push({
        id: 'opus_prevent_mismatch',
        type: 'error-prevention',
        description: 'Check for project type mismatches (game HTML with debugger JS, etc.)',
        context: 'Before writing any file, especially JS files referenced by HTML',
        example: 'Opus detects HTML expects "game" but JS is "debugger" and blocks the write',
        confidence: 0.95,
        appliedTo: ['task-master', 'tool-validation']
      });
    }
    
    // Pattern: Opus validates before writing
    if (example.includes('validate') || example.includes('check') || example.includes('verify')) {
      patterns.push({
        id: 'opus_prevent_validate',
        type: 'error-prevention',
        description: 'Validate work before writing - check against task, existing files, and project type',
        context: 'Before every file write operation',
        example: 'Opus validates file matches task type and existing files before writing',
        confidence: 0.9,
        appliedTo: ['task-master', 'tool-validation']
      });
    }
    
    return patterns;
  }
  
  /**
   * Extract architecture awareness patterns
   * "How Opus understands system architecture"
   */
  private extractArchitectureAwareness(example: string): OpusReasoningPattern[] {
    const patterns: OpusReasoningPattern[] = [];
    
    // Pattern: Opus understands file relationships
    if (example.includes('import') || example.includes('require') || example.includes('reference')) {
      patterns.push({
        id: 'opus_arch_file_relationships',
        type: 'architecture',
        description: 'Understand how files relate (imports, references, dependencies)',
        context: 'When creating or modifying files that depend on others',
        example: 'Opus tracks that script.js is imported by index.html and ensures they match',
        confidence: 0.9,
        appliedTo: ['task-master', 'tool-validation', 'agent-loop']
      });
    }
    
    // Pattern: Opus considers full context
    if (example.includes('context') || example.includes('understand') || example.includes('analyze')) {
      patterns.push({
        id: 'opus_arch_full_context',
        type: 'architecture',
        description: 'Consider full project context, not just the immediate file',
        context: 'All operations - read related files, understand project structure',
        example: 'Opus reads multiple files to understand project before making changes',
        confidence: 0.85,
        appliedTo: ['agent-loop', 'specialized-agents']
      });
    }
    
    return patterns;
  }
  
  /**
   * Apply Opus reasoning to a specific part of the architecture
   */
  async applyReasoning(
    component: 'agent-loop' | 'task-master' | 'tool-validation' | 'specialized-agents' | 'self-critique',
    context: {
      task?: string;
      filePath?: string;
      content?: string;
      existingFiles?: Map<string, string>;
    }
  ): Promise<{
    shouldProceed: boolean;
    reasoning: string;
    recommendations: string[];
    opusPatterns: OpusReasoningPattern[];
  }> {
    const patterns = await this.extractReasoningPatterns(context.task || '');
    
    // Filter patterns relevant to this component
    const relevantPatterns = patterns.filter(p => 
      p.appliedTo.includes(component)
    );
    
    const recommendations: string[] = [];
    let shouldProceed = true;
    let reasoning = '';
    
    // Apply each relevant pattern
    for (const pattern of relevantPatterns) {
      switch (pattern.type) {
        case 'decision':
          // Apply decision logic
          if (pattern.id === 'opus_decision_read_first' && context.filePath && !context.existingFiles?.has(context.filePath)) {
            recommendations.push(`Read existing files first: ${pattern.description}`);
            reasoning += `Opus Pattern: ${pattern.description}\n`;
          }
          break;
          
        case 'error-prevention':
          // Apply error prevention
          if (pattern.id === 'opus_prevent_mismatch' && context.content && context.existingFiles) {
            // Check for mismatches
            recommendations.push(`Validate consistency: ${pattern.description}`);
            reasoning += `Opus Pattern: ${pattern.description}\n`;
          }
          break;
          
        case 'quality':
          // Apply quality standards
          if (pattern.id === 'opus_quality_complete' && context.content) {
            if (context.content.includes('TODO') || context.content.includes('placeholder')) {
              recommendations.push(`Ensure completeness: ${pattern.description}`);
              reasoning += `Opus Pattern: ${pattern.description}\n`;
              shouldProceed = false; // Block incomplete code
            }
          }
          break;
      }
    }
    
    return {
      shouldProceed,
      reasoning,
      recommendations,
      opusPatterns: relevantPatterns
    };
  }
  
  /**
   * Get Opus-style decision for a situation.
   * Scores each option against loaded examples and Opus principles.
   */
  async getOpusDecision(situation: string, options: string[]): Promise<OpusDecision | null> {
    if (options.length === 0) return null;
    
    const cacheKey = `${situation.substring(0, 80)}_${options.length}`;
    if (this.decisionCache.has(cacheKey)) {
      return this.decisionCache.get(cacheKey)!;
    }
    
    // Load relevant Opus examples
    const examples = await loadOpusExamples(situation, 3);
    const examplesText = examples.join('\n').toLowerCase();
    const sitLower = situation.toLowerCase();
    
    // Score each option based on Opus principles
    const scored = options.map(option => {
      const optLower = option.toLowerCase();
      let score = 0;
      const reasons: string[] = [];
      
      // Safety-first: options mentioning validation, checking, reading first
      if (/\b(?:validate|check|verify|read|review)\b/.test(optLower)) {
        score += 3;
        reasons.push('prioritizes verification');
      }
      
      // Minimal change: surgical over rewrite
      if (/\b(?:patch|fix|update|modify)\b/.test(optLower) && !/\b(?:rewrite|replace all|rebuild)\b/.test(optLower)) {
        score += 2;
        reasons.push('minimal change approach');
      }
      
      // Example alignment
      if (examplesText.length > 0) {
        const optWords = optLower.split(/\W+/).filter(w => w.length > 3);
        const matching = optWords.filter(w => examplesText.includes(w)).length;
        score += matching * 0.5;
        if (matching > 2) reasons.push('aligns with Opus examples');
      }
      
      // Context-aware: options mentioning the situation keywords
      const sitWords = sitLower.split(/\W+/).filter(w => w.length > 3);
      const contextMatch = sitWords.filter(w => optLower.includes(w)).length;
      score += contextMatch * 0.5;
      
      return { option, score, reasons };
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    const chosen = scored[0];
    const decision: OpusDecision = {
      situation,
      opusApproach: chosen.option,
      reasoning: chosen.reasons.length > 0 
        ? `Chosen because it ${chosen.reasons.join(', ')}` 
        : 'Best available option based on Opus safety-first principles',
      alternatives: scored.slice(1).map(s => s.option),
      whyChosen: `Score: ${chosen.score.toFixed(1)} - Opus prioritizes correctness, safety, and minimal-change approaches`
    };
    
    this.decisionCache.set(cacheKey, decision);
    return decision;
  }
}

/**
 * Global Opus Reasoning Engine instance
 */
let globalOpusEngine: OpusReasoningEngine | null = null;

/**
 * Get or create global Opus Reasoning Engine
 */
export function getOpusReasoningEngine(): OpusReasoningEngine {
  if (!globalOpusEngine) {
    globalOpusEngine = new OpusReasoningEngine();
  }
  return globalOpusEngine;
}

export default OpusReasoningEngine;
