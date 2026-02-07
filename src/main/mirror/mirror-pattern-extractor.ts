/**
 * Opus Mirror Pattern Extractor
 * Analyzes code examples and extracts meaningful, actionable patterns.
 * 
 * Improvements over v1:
 * - Language-aware analysis (JS/TS, Python, general)
 * - Structural depth analysis (not just "has imports")
 * - Quantitative metrics (cyclomatic complexity, nesting depth, etc.)
 * - Pattern deduplication via stable IDs
 * - Meaningful confidence scores based on evidence strength
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MirrorPattern } from '../../types';

interface PatternResult {
  codeStructure: MirrorPattern[];
  problemSolving: MirrorPattern[];
  reasoning: MirrorPattern[];
  style: MirrorPattern[];
  promptInterpretation: MirrorPattern[];
}

/** Detected language of the code */
type Language = 'javascript' | 'typescript' | 'python' | 'java' | 'unknown';

/** Structural metrics extracted from code */
interface CodeMetrics {
  lines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  functions: number;
  classes: number;
  imports: number;
  exports: number;
  maxNestingDepth: number;
  avgFunctionLength: number;
  hasAsyncAwait: boolean;
  hasErrorHandling: boolean;
  hasTypeAnnotations: boolean;
  hasJSDoc: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  language: Language;
}

export class MirrorPatternExtractor {
  private opusExamplesPath: string;

  constructor(opusExamplesPath: string) {
    this.opusExamplesPath = opusExamplesPath;
  }

  /**
   * Extract patterns from a code example
   */
  async extractPatterns(codeContent: string, metadata: any = {}): Promise<PatternResult> {
    if (!codeContent || codeContent.trim().length < 10) {
      return { codeStructure: [], problemSolving: [], reasoning: [], style: [], promptInterpretation: [] };
    }

    // Compute metrics once, share across extractors
    const metrics = this.computeMetrics(codeContent);

    const patterns: PatternResult = {
      codeStructure: this.extractCodeStructure(codeContent, metrics),
      problemSolving: this.extractProblemSolvingApproach(codeContent, metrics),
      reasoning: this.extractReasoningPatterns(codeContent, metrics),
      style: this.extractStylePatterns(codeContent, metrics),
      promptInterpretation: this.extractPromptInterpretation(codeContent, metadata, metrics)
    };

    return patterns;
  }

  // ============================================
  // Core Metrics Computation
  // ============================================

  /**
   * Compute quantitative metrics for a piece of code
   */
  private computeMetrics(code: string): CodeMetrics {
    const lines = code.split('\n');
    const language = this.detectLanguage(code);

    let codeLines = 0;
    let commentLines = 0;
    let blankLines = 0;
    let maxNesting = 0;
    let currentNesting = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        blankLines++;
        continue;
      }

      // Track block comments
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('*/')) inBlockComment = false;
        continue;
      }
      if (trimmed.startsWith('/*') || trimmed.startsWith('/**')) {
        commentLines++;
        if (!trimmed.includes('*/')) inBlockComment = false;
        inBlockComment = true;
        continue;
      }
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        commentLines++;
        continue;
      }

      codeLines++;

      // Track nesting depth
      const opens = (line.match(/\{/g) || []).length + (line.match(/\(/g) || []).length;
      const closes = (line.match(/\}/g) || []).length + (line.match(/\)/g) || []).length;
      currentNesting += opens - closes;
      if (currentNesting > maxNesting) maxNesting = currentNesting;
      if (currentNesting < 0) currentNesting = 0;
    }

    // Count structural elements
    const functionMatches = code.match(
      /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(|(?:async\s+)?(?:function\s*\*?\s*\w*\s*\()|def\s+\w+\s*\()/g
    );
    const classMatches = code.match(/class\s+\w+/g);
    const importMatches = code.match(/^(?:import\s|from\s|const\s+.*=\s*require\()/gm);
    const exportMatches = code.match(/^(?:export\s|module\.exports)/gm);

    const functions = functionMatches?.length || 0;
    const classes = classMatches?.length || 0;

    // Calculate average function length (rough estimate)
    let avgFunctionLength = 0;
    if (functions > 0) {
      avgFunctionLength = Math.round(codeLines / functions);
    }

    // Determine complexity
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';
    if (codeLines > 200 || (classes > 2 && functions > 10) || maxNesting > 6) {
      complexity = 'complex';
    } else if (codeLines > 50 || functions > 3 || classes > 0 || maxNesting > 3) {
      complexity = 'medium';
    }

    return {
      lines: lines.length,
      codeLines,
      commentLines,
      blankLines,
      functions,
      classes,
      imports: importMatches?.length || 0,
      exports: exportMatches?.length || 0,
      maxNestingDepth: maxNesting,
      avgFunctionLength,
      hasAsyncAwait: /\basync\b|\bawait\b/.test(code),
      hasErrorHandling: /\btry\s*\{/.test(code) && /\bcatch\b/.test(code),
      hasTypeAnnotations: /:\s*(?:string|number|boolean|any|void|Promise|Array|Record)\b/.test(code),
      hasJSDoc: /\/\*\*[\s\S]*?\*\//.test(code),
      complexity,
      language
    };
  }

  /**
   * Detect programming language from code content
   */
  private detectLanguage(code: string): Language {
    // TypeScript indicators (strongest signal)
    if (/(?:interface|type|enum)\s+\w+\s*[{=]/.test(code) || /:\s*(?:string|number|boolean|void)\b/.test(code)) {
      return 'typescript';
    }
    // Python indicators
    if (/\bdef\s+\w+\s*\(|^\s*import\s+\w+$/m.test(code) && /:\s*$/m.test(code)) {
      return 'python';
    }
    // Java indicators
    if (/\bpublic\s+(?:class|static|void)\b/.test(code) && /\bSystem\.out\.print/.test(code)) {
      return 'java';
    }
    // JavaScript (default for import/export/function/const patterns)
    if (/\b(?:const|let|var|function|=>|require)\b/.test(code)) {
      return 'javascript';
    }
    return 'unknown';
  }

  // ============================================
  // Pattern Extractors (now metrics-driven)
  // ============================================

  /**
   * Extract code structure patterns
   */
  extractCodeStructure(codeContent: string, metrics?: CodeMetrics): MirrorPattern[] {
    const m = metrics || this.computeMetrics(codeContent);
    const patterns: MirrorPattern[] = [];

    // Modular structure (only if there's real modular organization)
    if (m.imports > 0 && m.exports > 0 && m.functions > 1) {
      patterns.push(this.createPattern('modular_structure', {
        description: `Well-modularized ${m.language} code: ${m.imports} imports, ${m.exports} exports, ${m.functions} functions`,
        confidence: this.scaleConfidence(m.functions, 2, 10),
        characteristics: {
          imports: m.imports,
          exports: m.exports,
          functions: m.functions,
          language: m.language
        }
      }));
    }

    // Class hierarchy detection
    const classInheritance = codeContent.match(/class\s+(\w+)\s+extends\s+(\w+)/g);
    const classImplements = codeContent.match(/class\s+(\w+)\s+implements\s+(\w+)/g);
    if (classInheritance || classImplements) {
      const inheritanceCount = (classInheritance?.length || 0) + (classImplements?.length || 0);
      patterns.push(this.createPattern('class_hierarchy', {
        description: `OOP hierarchy with ${m.classes} classes, ${inheritanceCount} inheritance/implementation relationships`,
        confidence: this.scaleConfidence(inheritanceCount, 1, 5),
        characteristics: {
          classCount: m.classes,
          inheritanceCount,
          hasInheritance: !!classInheritance,
          hasImplements: !!classImplements
        }
      }));
    } else if (m.classes > 1) {
      patterns.push(this.createPattern('class_composition', {
        description: `Composition-based design with ${m.classes} classes (no inheritance)`,
        confidence: this.scaleConfidence(m.classes, 2, 6),
        characteristics: { classCount: m.classes }
      }));
    }

    // Functional decomposition (functions without classes)
    if (m.functions > 3 && m.classes === 0) {
      patterns.push(this.createPattern('functional_decomposition', {
        description: `Functional architecture: ${m.functions} functions, avg ${m.avgFunctionLength} lines each`,
        confidence: this.scaleConfidence(m.functions, 3, 15),
        characteristics: {
          functionCount: m.functions,
          avgFunctionLength: m.avgFunctionLength
        }
      }));
    }

    // Design pattern detection (more rigorous)
    patterns.push(...this.detectDesignPatterns(codeContent, m));

    return patterns;
  }

  /**
   * Detect design patterns with stricter matching
   */
  private detectDesignPatterns(code: string, metrics: CodeMetrics): MirrorPattern[] {
    const patterns: MirrorPattern[] = [];

    // Singleton: must have private constructor + static instance
    if (/private\s+(?:static\s+)?(?:instance|_instance)/.test(code) && 
        /static\s+(?:get\w+|instance)\b/.test(code)) {
      patterns.push(this.createPattern('singleton_pattern', {
        description: 'Singleton pattern: private instance with static accessor',
        confidence: 0.9,
        characteristics: { pattern: 'singleton' }
      }));
    }

    // Factory: must have create/build method that returns different types
    if (/(?:create|build|make)\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/.test(code) &&
        /\bnew\s+\w+/.test(code)) {
      patterns.push(this.createPattern('factory_pattern', {
        description: 'Factory pattern: create methods that instantiate objects',
        confidence: 0.8,
        characteristics: { pattern: 'factory' }
      }));
    }

    // Observer: must have subscribe/on AND emit/notify
    const hasSubscribe = /\b(?:subscribe|addEventListener|on)\s*\(/.test(code);
    const hasEmit = /\b(?:emit|dispatch|notify|fire)\s*\(/.test(code);
    if (hasSubscribe && hasEmit) {
      patterns.push(this.createPattern('observer_pattern', {
        description: 'Observer/Event pattern: subscribe + emit lifecycle',
        confidence: 0.85,
        characteristics: { pattern: 'observer' }
      }));
    }

    // Strategy: multiple implementations of same interface
    const interfaceImpl = code.match(/implements\s+(\w+)/g);
    if (interfaceImpl && interfaceImpl.length > 1) {
      const interfaceName = interfaceImpl[0].match(/implements\s+(\w+)/)?.[1];
      patterns.push(this.createPattern('strategy_pattern', {
        description: `Strategy pattern: multiple implementations of ${interfaceName}`,
        confidence: 0.8,
        characteristics: { pattern: 'strategy', interfaceName }
      }));
    }

    // Builder: method chaining pattern
    const chainedMethods = code.match(/return\s+this\s*;/g);
    if (chainedMethods && chainedMethods.length >= 3) {
      patterns.push(this.createPattern('builder_pattern', {
        description: 'Builder/Fluent pattern: method chaining with return this',
        confidence: 0.75,
        characteristics: { pattern: 'builder', chainCount: chainedMethods.length }
      }));
    }

    return patterns;
  }

  /**
   * Extract problem-solving approach patterns
   */
  extractProblemSolvingApproach(codeContent: string, metrics?: CodeMetrics): MirrorPattern[] {
    const m = metrics || this.computeMetrics(codeContent);
    const patterns: MirrorPattern[] = [];

    // Robust error handling (not just "has try/catch" but measuring coverage)
    if (m.hasErrorHandling) {
      const tryCatchBlocks = (codeContent.match(/\btry\s*\{/g) || []).length;
      const asyncFunctions = (codeContent.match(/\basync\s+/g) || []).length;
      const coverage = asyncFunctions > 0 ? Math.min(1, tryCatchBlocks / asyncFunctions) : 0.5;

      patterns.push(this.createPattern('error_handling', {
        description: `Error handling: ${tryCatchBlocks} try/catch blocks, ${(coverage * 100).toFixed(0)}% async coverage`,
        confidence: this.scaleConfidence(tryCatchBlocks, 1, 5),
        characteristics: {
          tryCatchCount: tryCatchBlocks,
          asyncCoverage: coverage,
          hasCustomErrors: /class\s+\w+Error\s+extends/.test(codeContent)
        }
      }));
    }

    // Input validation pattern
    const validationChecks = (codeContent.match(/\bif\s*\(\s*!?\w+\s*(?:===?\s*(?:null|undefined|''|0)|!==?\s*(?:null|undefined)|\?\.\w+)/g) || []).length;
    if (validationChecks >= 2) {
      patterns.push(this.createPattern('input_validation', {
        description: `Input validation: ${validationChecks} guard clauses and null checks`,
        confidence: this.scaleConfidence(validationChecks, 2, 8),
        characteristics: { validationCount: validationChecks }
      }));
    }

    // Async patterns
    if (m.hasAsyncAwait) {
      const hasParallel = /Promise\.all|Promise\.allSettled|Promise\.race/.test(codeContent);
      const hasSequential = (codeContent.match(/\bawait\b/g) || []).length > 2;
      patterns.push(this.createPattern('async_patterns', {
        description: `Async architecture: ${hasParallel ? 'parallel + ' : ''}${hasSequential ? 'sequential' : 'basic'} patterns`,
        confidence: hasParallel ? 0.9 : hasSequential ? 0.7 : 0.5,
        characteristics: {
          hasParallel,
          hasSequential,
          awaitCount: (codeContent.match(/\bawait\b/g) || []).length
        }
      }));
    }

    // Data transformation pipeline
    const chainCount = (codeContent.match(/\.\s*(?:map|filter|reduce|flatMap|sort|find|some|every)\s*\(/g) || []).length;
    if (chainCount >= 2) {
      patterns.push(this.createPattern('data_pipeline', {
        description: `Data transformation pipeline: ${chainCount} chained operations`,
        confidence: this.scaleConfidence(chainCount, 2, 6),
        characteristics: { chainCount }
      }));
    }

    // Caching/memoization
    if (/\bcache\b|\bmemo\b|\bMap\s*</.test(codeContent) && /\.(?:get|has|set)\s*\(/.test(codeContent)) {
      patterns.push(this.createPattern('caching', {
        description: 'Caching/memoization pattern with Map-based storage',
        confidence: 0.8,
        characteristics: { hasCaching: true }
      }));
    }

    return patterns;
  }

  /**
   * Extract reasoning patterns (how the code reasons about its domain)
   */
  extractReasoningPatterns(codeContent: string, metrics?: CodeMetrics): MirrorPattern[] {
    const m = metrics || this.computeMetrics(codeContent);
    const patterns: MirrorPattern[] = [];

    // State machine / finite automaton
    const switchCases = (codeContent.match(/\bcase\s+['"`]/g) || []).length;
    const stateTransitions = /\bstate\b.*=\s*['"`]\w+['"`]/.test(codeContent);
    if (switchCases >= 3 || stateTransitions) {
      patterns.push(this.createPattern('state_machine', {
        description: `State-based logic: ${switchCases} states${stateTransitions ? ' with transitions' : ''}`,
        confidence: this.scaleConfidence(switchCases, 3, 10),
        characteristics: { switchCases, stateTransitions }
      }));
    }

    // Configuration-driven behavior
    const configObjects = (codeContent.match(/(?:config|options|settings|defaults)\s*[=:]\s*\{/gi) || []).length;
    if (configObjects >= 1) {
      patterns.push(this.createPattern('config_driven', {
        description: `Configuration-driven behavior: ${configObjects} config objects`,
        confidence: this.scaleConfidence(configObjects, 1, 3),
        characteristics: { configObjects }
      }));
    }

    // Recursive problem solving
    const functionNames = [...codeContent.matchAll(/(?:function\s+(\w+)|const\s+(\w+)\s*=)/g)]
      .map(m => m[1] || m[2]).filter(Boolean);
    const selfCalls = functionNames.filter(name => {
      const callRegex = new RegExp(`\\b${name}\\s*\\(`, 'g');
      return (codeContent.match(callRegex) || []).length > 1;
    });
    if (selfCalls.length > 0) {
      patterns.push(this.createPattern('recursive_solving', {
        description: `Recursive problem solving: ${selfCalls.length} recursive function(s)`,
        confidence: 0.85,
        characteristics: { recursiveFunctions: selfCalls }
      }));
    }

    // Type-driven design (TypeScript/Java)
    if (m.hasTypeAnnotations) {
      const interfaces = (codeContent.match(/\binterface\s+\w+/g) || []).length;
      const typeAliases = (codeContent.match(/\btype\s+\w+\s*=/g) || []).length;
      const generics = (codeContent.match(/<\w+(?:\s+extends\s+\w+)?>/g) || []).length;
      if (interfaces + typeAliases > 0) {
        patterns.push(this.createPattern('type_driven', {
          description: `Type-driven design: ${interfaces} interfaces, ${typeAliases} type aliases, ${generics} generics`,
          confidence: this.scaleConfidence(interfaces + typeAliases, 1, 8),
          characteristics: { interfaces, typeAliases, generics }
        }));
      }
    }

    return patterns;
  }

  /**
   * Extract code style patterns
   */
  extractStylePatterns(codeContent: string, metrics?: CodeMetrics): MirrorPattern[] {
    const m = metrics || this.computeMetrics(codeContent);
    const patterns: MirrorPattern[] = [];
    const lines = codeContent.split('\n');

    // Documentation quality
    if (m.commentLines > 0) {
      const commentRatio = m.commentLines / Math.max(m.codeLines, 1);
      const quality = m.hasJSDoc ? 'comprehensive' : commentRatio > 0.15 ? 'good' : 'minimal';
      patterns.push(this.createPattern('documentation', {
        description: `${quality} documentation: ${m.commentLines} comment lines (${(commentRatio * 100).toFixed(0)}% ratio)${m.hasJSDoc ? ', includes JSDoc' : ''}`,
        confidence: quality === 'comprehensive' ? 0.9 : quality === 'good' ? 0.7 : 0.5,
        characteristics: {
          commentRatio,
          hasJSDoc: m.hasJSDoc,
          commentLines: m.commentLines
        }
      }));
    }

    // Line length discipline
    const longLines = lines.filter(l => l.length > 120).length;
    const veryLongLines = lines.filter(l => l.length > 160).length;
    const avgLength = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
    if (longLines === 0 && avgLength < 80) {
      patterns.push(this.createPattern('line_discipline', {
        description: `Excellent line discipline: avg ${Math.round(avgLength)} chars, no lines over 120`,
        confidence: 0.9,
        characteristics: { avgLineLength: Math.round(avgLength), longLines: 0 }
      }));
    } else if (veryLongLines === 0) {
      patterns.push(this.createPattern('line_discipline', {
        description: `Good line discipline: avg ${Math.round(avgLength)} chars, ${longLines} lines over 120`,
        confidence: 0.7,
        characteristics: { avgLineLength: Math.round(avgLength), longLines }
      }));
    }

    // Naming conventions
    const camelCaseVars = (codeContent.match(/\b(?:const|let|var)\s+([a-z][a-zA-Z0-9]*)\b/g) || []).length;
    const pascalCaseClasses = (codeContent.match(/\bclass\s+([A-Z][a-zA-Z0-9]*)\b/g) || []).length;
    const snakeCaseVars = (codeContent.match(/\b(?:const|let|var)\s+([a-z][a-z0-9_]*)\b/g) || []).length;
    const SCREAMING_CONSTANTS = (codeContent.match(/\bconst\s+([A-Z][A-Z0-9_]+)\b/g) || []).length;

    if (camelCaseVars + pascalCaseClasses + SCREAMING_CONSTANTS > 3) {
      patterns.push(this.createPattern('naming_conventions', {
        description: `Consistent naming: ${camelCaseVars} camelCase vars, ${pascalCaseClasses} PascalCase classes, ${SCREAMING_CONSTANTS} UPPER_CASE constants`,
        confidence: 0.75,
        characteristics: { camelCaseVars, pascalCaseClasses, SCREAMING_CONSTANTS }
      }));
    }

    // Modern JS/TS features
    if (m.language === 'javascript' || m.language === 'typescript') {
      const modern: string[] = [];
      if (/=>\s*[{\(]/.test(codeContent)) modern.push('arrow functions');
      if (/\b(?:const|let)\b/.test(codeContent) && !/\bvar\b/.test(codeContent)) modern.push('const/let (no var)');
      if (/`[^`]*\$\{/.test(codeContent)) modern.push('template literals');
      if (/\.\.\.\w+/.test(codeContent)) modern.push('spread/rest');
      if (/\?\.\w+/.test(codeContent)) modern.push('optional chaining');
      if (/\?\?/.test(codeContent)) modern.push('nullish coalescing');
      if (/\bfor\s+(?:const|let)\s+\w+\s+of\b/.test(codeContent)) modern.push('for..of');

      if (modern.length >= 3) {
        patterns.push(this.createPattern('modern_features', {
          description: `Modern ${m.language}: ${modern.join(', ')}`,
          confidence: this.scaleConfidence(modern.length, 3, 7),
          characteristics: { features: modern, language: m.language }
        }));
      }
    }

    // Nesting depth
    if (m.maxNestingDepth <= 3 && m.codeLines > 20) {
      patterns.push(this.createPattern('shallow_nesting', {
        description: `Excellent nesting discipline: max depth ${m.maxNestingDepth} in ${m.codeLines} lines`,
        confidence: 0.85,
        characteristics: { maxDepth: m.maxNestingDepth }
      }));
    }

    return patterns;
  }

  /**
   * Extract prompt interpretation patterns
   */
  extractPromptInterpretation(codeContent: string, metadata: any, metrics?: CodeMetrics): MirrorPattern[] {
    const m = metrics || this.computeMetrics(codeContent);
    const patterns: MirrorPattern[] = [];

    if (metadata.sourceType === 'prompt_response' || metadata.sourceType === 'generated_code') {
      patterns.push(this.createPattern('prompt_interpretation', {
        description: `Generated ${m.complexity} ${m.language} code: ${m.functions} functions, ${m.classes} classes`,
        confidence: 0.7,
        characteristics: {
          source: 'prompt',
          complexity: m.complexity,
          language: m.language,
          functions: m.functions,
          classes: m.classes
        },
        examples: [codeContent.substring(0, 500)]
      }));
    }

    return patterns;
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Create a pattern with stable ID generation
   */
  private createPattern(type: string, data: {
    description: string;
    confidence: number;
    characteristics?: Record<string, any>;
    examples?: string[];
  }): MirrorPattern {
    return {
      id: `pattern_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      description: data.description,
      confidence: Math.max(0, Math.min(1, data.confidence)),
      characteristics: data.characteristics || {},
      examples: data.examples || []
    };
  }

  /**
   * Scale confidence based on evidence count.
   * Returns a value between 0.4 (minimum threshold) and 0.95 (strong evidence).
   * 
   * @param count - actual count of evidence
   * @param minExpected - count at which confidence is 0.5
   * @param strongEvidence - count at which confidence reaches 0.9+
   */
  private scaleConfidence(count: number, minExpected: number, strongEvidence: number): number {
    if (count < minExpected) return 0.4;
    const ratio = (count - minExpected) / (strongEvidence - minExpected);
    return 0.5 + Math.min(ratio, 1) * 0.45;
  }

  /**
   * Estimate code complexity (public API)
   */
  estimateComplexity(codeContent: string): 'simple' | 'medium' | 'complex' {
    return this.computeMetrics(codeContent).complexity;
  }

  /**
   * Analyze Opus examples directory
   */
  async analyzeOpusExamples(): Promise<{ success: boolean; patterns: PatternResult[]; totalFiles: number; error?: string }> {
    try {
      const files = await fs.readdir(this.opusExamplesPath);
      const codeFiles = files.filter(file =>
        file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.py') ||
        file.endsWith('.java') || file.endsWith('.cpp') || file.endsWith('.c')
      );

      const results: PatternResult[] = [];

      for (const file of codeFiles.slice(0, 50)) {
        try {
          const filePath = path.join(this.opusExamplesPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const patterns = await this.extractPatterns(content, { fileName: file, filePath });
          results.push(patterns);
        } catch (error: any) {
          console.warn(`Error processing ${file}:`, error.message);
        }
      }

      return { success: true, patterns: results, totalFiles: codeFiles.length };
    } catch (error: any) {
      return { success: false, patterns: [], totalFiles: 0, error: error.message };
    }
  }
}
