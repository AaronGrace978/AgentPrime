/**
 * Intent Analyzer
 * Analyzes user requests to understand true intent beyond literal words
 * 
 * Enhanced with:
 * - Multi-turn conversation tracking
 * - Entity extraction and slot filling
 * - Confidence-based classification
 * - Semantic similarity matching
 * - Ambiguity detection
 */

import type { MirrorMemory } from '../mirror/mirror-memory';
import type {
  IntentAnalysis,
  ConversationContext,
  Enhancement,
  ContextClue,
  TaskType,
  UserPreference,
  EnhancementType
} from './types';

/**
 * Enhanced intent analysis result
 */
export interface EnhancedIntentAnalysis extends IntentAnalysis {
  /** Detected entities (files, functions, variables, etc.) */
  entities: ExtractedEntity[];
  /** Conversation state for multi-turn tracking */
  conversationState: ConversationState;
  /** Alternative interpretations with confidence scores */
  alternatives: Array<{ intent: string; confidence: number }>;
  /** Detected ambiguities that might need clarification */
  ambiguities: string[];
  /** Suggested clarifying questions */
  clarifyingQuestions: string[];
  /** Semantic category scores */
  categoryScores: Record<string, number>;
}

/**
 * Extracted entity from message
 */
export interface ExtractedEntity {
  type: 'file' | 'function' | 'class' | 'variable' | 'url' | 'path' | 'number' | 'quoted' | 'code_block' | 'command';
  value: string;
  position: { start: number; end: number };
  confidence: number;
}

/**
 * Multi-turn conversation state
 */
export interface ConversationState {
  /** Current topic being discussed */
  currentTopic?: string;
  /** Entities mentioned in conversation */
  mentionedEntities: Map<string, ExtractedEntity>;
  /** Pending clarifications */
  pendingClarifications: string[];
  /** Last confirmed intent */
  lastConfirmedIntent?: string;
  /** Turn count in current topic */
  turnCount: number;
  /** Slots filled from conversation */
  filledSlots: Map<string, string>;
}

/**
 * Keywords that indicate different task types with weights
 */
const TASK_TYPE_PATTERNS: Record<TaskType, Array<{ pattern: string | RegExp; weight: number }>> = {
  'code-generation': [
    { pattern: 'create', weight: 1.0 },
    { pattern: 'build', weight: 1.0 },
    { pattern: 'make', weight: 0.8 },
    { pattern: 'generate', weight: 1.0 },
    { pattern: 'implement', weight: 1.0 },
    { pattern: 'write', weight: 0.9 },
    { pattern: 'add', weight: 0.7 },
    { pattern: 'new', weight: 0.6 },
    { pattern: /create\s+a?\s*(function|class|component|file|module)/i, weight: 1.5 },
    { pattern: /build\s+(me\s+)?a?\s*(app|application|website|api)/i, weight: 1.5 }
  ],
  'code-modification': [
    { pattern: 'update', weight: 1.0 },
    { pattern: 'change', weight: 1.0 },
    { pattern: 'modify', weight: 1.0 },
    { pattern: 'edit', weight: 0.9 },
    { pattern: 'alter', weight: 0.8 },
    { pattern: 'adjust', weight: 0.7 },
    { pattern: 'rename', weight: 1.0 },
    { pattern: 'replace', weight: 0.9 },
    { pattern: /change\s+.+\s+to\s+/i, weight: 1.5 }
  ],
  'debugging': [
    { pattern: 'debug', weight: 1.2 },
    { pattern: 'fix', weight: 1.0 },
    { pattern: 'error', weight: 0.9 },
    { pattern: 'bug', weight: 1.0 },
    { pattern: 'issue', weight: 0.7 },
    { pattern: 'problem', weight: 0.7 },
    { pattern: 'broken', weight: 0.9 },
    { pattern: 'not working', weight: 1.0 },
    { pattern: 'crash', weight: 1.0 },
    { pattern: 'fails', weight: 0.9 },
    { pattern: 'exception', weight: 1.0 },
    { pattern: /why\s+(is|does|isn't|doesn't)/i, weight: 0.8 },
    { pattern: /(doesn't|won't|can't)\s+work/i, weight: 1.2 }
  ],
  'refactoring': [
    { pattern: 'refactor', weight: 1.2 },
    { pattern: 'clean', weight: 0.7 },
    { pattern: 'optimize', weight: 1.0 },
    { pattern: 'improve', weight: 0.8 },
    { pattern: 'restructure', weight: 1.0 },
    { pattern: 'reorganize', weight: 1.0 },
    { pattern: 'simplify', weight: 0.9 },
    { pattern: 'extract', weight: 0.8 },
    { pattern: 'split', weight: 0.7 }
  ],
  'documentation': [
    { pattern: 'document', weight: 1.2 },
    { pattern: 'comment', weight: 1.0 },
    { pattern: 'readme', weight: 1.2 },
    { pattern: 'explain', weight: 0.8 },
    { pattern: 'describe', weight: 0.7 },
    { pattern: 'docs', weight: 1.0 },
    { pattern: 'jsdoc', weight: 1.2 },
    { pattern: 'docstring', weight: 1.2 }
  ],
  'testing': [
    { pattern: 'test', weight: 1.0 },
    { pattern: 'spec', weight: 1.0 },
    { pattern: 'unit test', weight: 1.3 },
    { pattern: 'integration test', weight: 1.3 },
    { pattern: 'e2e', weight: 1.2 },
    { pattern: 'coverage', weight: 0.9 },
    { pattern: 'mock', weight: 0.8 },
    { pattern: 'jest', weight: 1.0 },
    { pattern: 'pytest', weight: 1.0 }
  ],
  'ui-design': [
    { pattern: 'ui', weight: 1.0 },
    { pattern: 'design', weight: 0.7 },
    { pattern: 'style', weight: 0.8 },
    { pattern: 'css', weight: 1.0 },
    { pattern: 'layout', weight: 0.9 },
    { pattern: 'responsive', weight: 1.0 },
    { pattern: 'theme', weight: 0.9 },
    { pattern: 'button', weight: 0.8 },
    { pattern: 'form', weight: 0.8 },
    { pattern: 'component', weight: 0.7 },
    { pattern: 'animation', weight: 0.9 },
    { pattern: 'tailwind', weight: 1.0 }
  ],
  'api-design': [
    { pattern: 'api', weight: 1.0 },
    { pattern: 'endpoint', weight: 1.2 },
    { pattern: 'route', weight: 0.9 },
    { pattern: 'rest', weight: 1.0 },
    { pattern: 'graphql', weight: 1.2 },
    { pattern: 'backend', weight: 0.8 },
    { pattern: 'server', weight: 0.7 },
    { pattern: 'database', weight: 0.8 },
    { pattern: 'crud', weight: 1.0 }
  ],
  'system-action': [
    { pattern: 'open', weight: 1.0 },
    { pattern: 'run', weight: 0.9 },
    { pattern: 'execute', weight: 1.0 },
    { pattern: 'launch', weight: 1.0 },
    { pattern: 'start', weight: 0.8 },
    { pattern: 'close', weight: 0.9 },
    { pattern: 'click', weight: 1.2 },
    { pattern: 'type', weight: 0.8 },
    { pattern: 'scroll', weight: 1.0 },
    { pattern: 'install', weight: 0.9 }
  ],
  'web-search': [
    { pattern: 'search', weight: 0.9 },
    { pattern: 'look up', weight: 1.0 },
    { pattern: 'what is', weight: 1.2 },
    { pattern: 'how to', weight: 1.0 },
    { pattern: 'who is', weight: 1.2 },
    { pattern: 'when did', weight: 1.2 },
    { pattern: 'find info', weight: 1.0 },
    { pattern: /what('s| is) the/i, weight: 1.0 }
  ],
  'general': []
};

// Legacy compatibility
const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = Object.fromEntries(
  Object.entries(TASK_TYPE_PATTERNS).map(([key, patterns]) => [
    key,
    patterns.filter(p => typeof p.pattern === 'string').map(p => p.pattern as string)
  ])
) as Record<TaskType, string[]>;

/**
 * Enhancement suggestions based on task type
 */
const TASK_ENHANCEMENTS: Record<TaskType, Enhancement[]> = {
  'code-generation': [
    { type: 'error-handling', description: 'Add try/catch blocks and error handling', priority: 'high', autoApply: true },
    { type: 'docs', description: 'Add JSDoc/docstring comments', priority: 'medium', autoApply: true },
    { type: 'edge-case', description: 'Handle null/undefined cases', priority: 'high', autoApply: true }
  ],
  'code-modification': [
    { type: 'edge-case', description: 'Preserve existing functionality', priority: 'high', autoApply: true },
    { type: 'testing', description: 'Update related tests', priority: 'medium', autoApply: false }
  ],
  'debugging': [
    { type: 'error-handling', description: 'Add detailed error messages', priority: 'high', autoApply: true },
    { type: 'docs', description: 'Add comments explaining the fix', priority: 'low', autoApply: true }
  ],
  'refactoring': [
    { type: 'quality', description: 'Apply clean code principles', priority: 'high', autoApply: true },
    { type: 'performance', description: 'Optimize for performance', priority: 'medium', autoApply: false },
    { type: 'testing', description: 'Ensure tests still pass', priority: 'high', autoApply: false }
  ],
  'documentation': [
    { type: 'docs', description: 'Include usage examples', priority: 'high', autoApply: true },
    { type: 'docs', description: 'Document parameters and return types', priority: 'high', autoApply: true }
  ],
  'testing': [
    { type: 'edge-case', description: 'Include edge case tests', priority: 'high', autoApply: true },
    { type: 'testing', description: 'Add both positive and negative test cases', priority: 'high', autoApply: true }
  ],
  'ui-design': [
    { type: 'accessibility', description: 'Add ARIA labels and keyboard navigation', priority: 'high', autoApply: true },
    { type: 'ux', description: 'Add loading states and error feedback', priority: 'medium', autoApply: true },
    { type: 'quality', description: 'Make responsive for mobile', priority: 'medium', autoApply: true }
  ],
  'api-design': [
    { type: 'security', description: 'Add input validation and sanitization', priority: 'high', autoApply: true },
    { type: 'error-handling', description: 'Return proper HTTP status codes', priority: 'high', autoApply: true },
    { type: 'docs', description: 'Document API endpoints', priority: 'medium', autoApply: true }
  ],
  'system-action': [
    { type: 'error-handling', description: 'Handle action failures gracefully', priority: 'high', autoApply: true }
  ],
  'web-search': [],
  'general': []
};

/**
 * Keywords that indicate implicit requirements
 */
const IMPLICIT_REQUIREMENT_TRIGGERS: Record<string, string[]> = {
  'form': ['validation', 'error states', 'submit handling', 'accessibility'],
  'login': ['password visibility toggle', 'remember me', 'forgot password', 'rate limiting', 'secure storage'],
  'button': ['loading state', 'disabled state', 'hover effects', 'keyboard focus'],
  'api': ['error handling', 'authentication', 'rate limiting', 'input validation'],
  'database': ['connection pooling', 'error handling', 'transactions', 'prepared statements'],
  'file': ['error handling', 'path validation', 'encoding handling'],
  'list': ['empty state', 'loading state', 'pagination', 'search/filter'],
  'modal': ['close on escape', 'focus trap', 'backdrop click', 'animation'],
  'table': ['sorting', 'pagination', 'empty state', 'responsive design'],
  'input': ['validation', 'placeholder', 'error message', 'character limit']
};

export class IntentAnalyzer {
  private mirror: MirrorMemory | null;
  private conversationState: ConversationState;

  constructor(mirror?: MirrorMemory) {
    this.mirror = mirror || null;
    this.conversationState = this.createEmptyState();
  }

  /**
   * Create empty conversation state
   */
  private createEmptyState(): ConversationState {
    return {
      mentionedEntities: new Map(),
      pendingClarifications: [],
      turnCount: 0,
      filledSlots: new Map()
    };
  }

  /**
   * Reset conversation state
   */
  resetState(): void {
    this.conversationState = this.createEmptyState();
  }

  /**
   * Analyze a user message to understand true intent
   */
  async analyze(message: string, context: ConversationContext): Promise<EnhancedIntentAnalysis> {
    const startTime = Date.now();
    
    // Update turn count
    this.conversationState.turnCount++;
    
    // Extract keywords from the message
    const keywords = this.extractKeywords(message);
    
    // Extract entities from message
    const entities = this.extractEntities(message);
    
    // Update conversation state with new entities
    for (const entity of entities) {
      this.conversationState.mentionedEntities.set(entity.value, entity);
    }
    
    // Detect task type with confidence scores
    const { taskType, categoryScores, alternatives } = this.detectTaskTypeEnhanced(message, keywords);
    
    // Check if this is a follow-up
    const isFollowUp = this.isFollowUpMessage(message, context);
    
    // If follow-up, inherit context from previous turn
    if (isFollowUp && this.conversationState.currentTopic) {
      // Boost the previous topic's score
      const prevTopic = this.conversationState.currentTopic as TaskType;
      if (prevTopic in categoryScores) {
        categoryScores[prevTopic] = (categoryScores[prevTopic] || 0) + 0.3;
      }
    }
    
    // Extract context clues
    const contextClues = await this.extractContextClues(message, context);
    
    // Identify implicit requirements
    const implicitRequirements = this.identifyImplicitRequirements(message, keywords, taskType);
    
    // Get suggested enhancements based on task type and context
    const suggestedEnhancements = this.getSuggestedEnhancements(taskType, keywords, context);
    
    // Detect ambiguities
    const ambiguities = this.detectAmbiguities(message, entities, categoryScores);
    
    // Generate clarifying questions if needed
    const clarifyingQuestions = this.generateClarifyingQuestions(message, taskType, entities, ambiguities);
    
    // Determine true intent
    const trueIntent = this.determineTrueIntent(message, taskType, implicitRequirements, context);
    
    // Calculate confidence score
    const confidenceScore = this.calculateConfidence(message, contextClues, taskType);
    
    // Update conversation state
    this.conversationState.currentTopic = taskType;
    this.conversationState.lastConfirmedIntent = trueIntent;

    return {
      literalRequest: message,
      trueIntent,
      implicitRequirements,
      suggestedEnhancements,
      confidenceScore,
      contextClues,
      taskType,
      keywords,
      isFollowUp,
      // Enhanced fields
      entities,
      conversationState: { ...this.conversationState, mentionedEntities: new Map(this.conversationState.mentionedEntities) },
      alternatives,
      ambiguities,
      clarifyingQuestions,
      categoryScores
    };
  }

  /**
   * Extract entities from message (files, functions, URLs, etc.)
   */
  private extractEntities(message: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // File paths (with extensions)
    const filePatterns = /(?:^|[\s'"(])([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)(?:[\s'")\]:,]|$)/g;
    let match;
    while ((match = filePatterns.exec(message)) !== null) {
      const value = match[1];
      // Filter out URLs and common false positives
      if (!value.includes('://') && !value.startsWith('.') && value.length > 2) {
        entities.push({
          type: 'file',
          value,
          position: { start: match.index, end: match.index + match[0].length },
          confidence: value.includes('/') || value.includes('\\') ? 0.9 : 0.7
        });
      }
    }
    
    // Function/method names (camelCase or snake_case with parentheses)
    const funcPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\)/g;
    while ((match = funcPattern.exec(message)) !== null) {
      entities.push({
        type: 'function',
        value: match[1],
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.85
      });
    }
    
    // Class names (PascalCase)
    const classPattern = /\b([A-Z][a-zA-Z0-9]*(?:Component|Service|Controller|Manager|Handler|Factory|Builder|Provider|Repository|Store))\b/g;
    while ((match = classPattern.exec(message)) !== null) {
      entities.push({
        type: 'class',
        value: match[1],
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.9
      });
    }
    
    // URLs
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    while ((match = urlPattern.exec(message)) !== null) {
      entities.push({
        type: 'url',
        value: match[1],
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.95
      });
    }
    
    // Quoted strings (potential file names, function names, etc.)
    const quotedPattern = /["'`]([^"'`]+)["'`]/g;
    while ((match = quotedPattern.exec(message)) !== null) {
      const value = match[1];
      if (value.length > 1 && value.length < 100) {
        entities.push({
          type: 'quoted',
          value,
          position: { start: match.index, end: match.index + match[0].length },
          confidence: 0.8
        });
      }
    }
    
    // Numbers (important for counts, ports, etc.)
    const numberPattern = /\b(\d+(?:\.\d+)?)\b/g;
    while ((match = numberPattern.exec(message)) !== null) {
      entities.push({
        type: 'number',
        value: match[1],
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.9
      });
    }
    
    // Shell commands (common command patterns)
    const cmdPattern = /\b(npm|yarn|pip|git|docker|kubectl|curl|wget|cd|ls|mkdir|rm|mv|cp)\s+[^\n]+/gi;
    while ((match = cmdPattern.exec(message)) !== null) {
      entities.push({
        type: 'command',
        value: match[0].trim(),
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.85
      });
    }
    
    return entities;
  }

  /**
   * Enhanced task type detection with confidence scores
   */
  private detectTaskTypeEnhanced(message: string, keywords: string[]): {
    taskType: TaskType;
    categoryScores: Record<string, number>;
    alternatives: Array<{ intent: string; confidence: number }>;
  } {
    const messageLower = message.toLowerCase();
    const categoryScores: Record<string, number> = {};
    
    for (const [taskType, patterns] of Object.entries(TASK_TYPE_PATTERNS) as [TaskType, Array<{ pattern: string | RegExp; weight: number }>][]) {
      let score = 0;
      
      for (const { pattern, weight } of patterns) {
        if (typeof pattern === 'string') {
          if (messageLower.includes(pattern.toLowerCase())) {
            score += weight;
          }
        } else {
          if (pattern.test(message)) {
            score += weight;
          }
        }
      }
      
      if (score > 0) {
        categoryScores[taskType] = score;
      }
    }
    
    // Sort by score
    const sorted = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1]);
    
    const taskType: TaskType = sorted.length > 0 ? sorted[0][0] as TaskType : 'general';
    
    // Normalize scores to 0-1 range
    const maxScore = sorted.length > 0 ? sorted[0][1] : 1;
    const normalizedScores: Record<string, number> = {};
    for (const [type, score] of Object.entries(categoryScores)) {
      normalizedScores[type] = score / (maxScore || 1);
    }
    
    // Build alternatives
    const alternatives = sorted.slice(0, 3).map(([intent, score]) => ({
      intent,
      confidence: score / (maxScore || 1)
    }));
    
    return { taskType, categoryScores: normalizedScores, alternatives };
  }

  /**
   * Detect ambiguities in the message
   */
  private detectAmbiguities(
    message: string,
    entities: ExtractedEntity[],
    categoryScores: Record<string, number>
  ): string[] {
    const ambiguities: string[] = [];
    
    // Check if multiple task types have similar scores
    const scores = Object.entries(categoryScores)
      .filter(([_, score]) => score > 0.5)
      .sort((a, b) => b[1] - a[1]);
    
    if (scores.length >= 2 && scores[0][1] - scores[1][1] < 0.2) {
      ambiguities.push(`Ambiguous intent: could be ${scores[0][0]} or ${scores[1][0]}`);
    }
    
    // Check for vague references
    const vaguePatterns = [
      { pattern: /\b(it|this|that|these|those)\b/i, message: 'Unclear reference: what does "it/this/that" refer to?' },
      { pattern: /\b(the file|the function|the component)\b/i, message: 'Which specific file/function/component?' },
      { pattern: /\b(same|similar|like before)\b/i, message: 'Reference to previous context - may need clarification' }
    ];
    
    for (const { pattern, message: ambMsg } of vaguePatterns) {
      if (pattern.test(message) && entities.length === 0) {
        ambiguities.push(ambMsg);
      }
    }
    
    // Check if message is very short
    if (message.split(/\s+/).length < 4 && entities.length === 0) {
      ambiguities.push('Message is brief - may need more details');
    }
    
    return ambiguities;
  }

  /**
   * Generate clarifying questions based on ambiguities
   */
  private generateClarifyingQuestions(
    message: string,
    taskType: TaskType,
    entities: ExtractedEntity[],
    ambiguities: string[]
  ): string[] {
    const questions: string[] = [];
    
    // Task-specific questions when entities are missing
    if (taskType === 'code-generation' && !entities.some(e => e.type === 'file')) {
      questions.push('What should the file be named?');
    }
    
    if (taskType === 'code-modification' && entities.length === 0) {
      questions.push('Which file would you like me to modify?');
    }
    
    if (taskType === 'debugging' && !message.toLowerCase().includes('error')) {
      questions.push('Can you share the error message or describe what\'s happening?');
    }
    
    // Generic clarifications for ambiguities
    if (ambiguities.some(a => a.includes('Ambiguous intent'))) {
      questions.push('Could you clarify what specific action you\'d like me to take?');
    }
    
    return questions.slice(0, 2); // Limit to 2 questions
  }

  /**
   * Extract keywords from the message
   */
  private extractKeywords(message: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
      'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once', 'here',
      'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
      'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
      'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but',
      'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these',
      'those', 'it', 'its', 'i', 'me', 'my', 'you', 'your', 'we', 'our',
      'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'please'
    ]);

    const words = message.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Remove duplicates while preserving order
    return [...new Set(words)];
  }

  /**
   * Detect the type of task from the message (legacy method for compatibility)
   */
  private detectTaskType(message: string, keywords: string[]): TaskType {
    const { taskType } = this.detectTaskTypeEnhanced(message, keywords);
    return taskType;
  }

  /**
   * Check if this is a follow-up to a previous message
   */
  private isFollowUpMessage(message: string, context: ConversationContext): boolean {
    if (!context.history || context.history.length === 0) {
      return false;
    }

    const followUpIndicators = [
      'also', 'and', 'additionally', 'then', 'next', 'after that',
      'now', 'too', 'as well', 'can you also', 'one more thing',
      'wait', 'actually', 'instead', 'but', 'however', 'change',
      'that', 'this', 'it', 'them', 'those', 'the same'
    ];

    const messageLower = message.toLowerCase();
    return followUpIndicators.some(indicator => messageLower.includes(indicator));
  }

  /**
   * Extract context clues from conversation and user patterns
   */
  private async extractContextClues(
    message: string,
    context: ConversationContext
  ): Promise<ContextClue[]> {
    const clues: ContextClue[] = [];

    // Clues from conversation history
    if (context.history && context.history.length > 0) {
      const recentMessages = context.history.slice(-5);
      for (const msg of recentMessages) {
        if (msg.role === 'user') {
          clues.push({
            type: 'conversation',
            content: `Previous request: ${msg.content.substring(0, 100)}`,
            confidence: 0.8,
            source: 'conversation-history'
          });
        }
      }
    }

    // Clues from project context
    if (context.projectFiles && context.projectFiles.length > 0) {
      const projectType = this.inferProjectType(context.projectFiles);
      if (projectType) {
        clues.push({
          type: 'project',
          content: `Project appears to be: ${projectType}`,
          confidence: 0.9,
          source: 'project-files'
        });
      }
    }

    // Clues from user preferences
    if (context.userPreferences && context.userPreferences.length > 0) {
      for (const pref of context.userPreferences.slice(0, 5)) {
        clues.push({
          type: 'preference',
          content: `User prefers: ${pref.key} = ${pref.value}`,
          confidence: pref.confidence,
          source: 'mirror-memory'
        });
      }
    }

    // Clues from Mirror Memory patterns
    if (this.mirror) {
      try {
        const patterns = await this.mirror.getRelevantPatterns(message, 3);
        for (const pattern of patterns) {
          clues.push({
            type: 'history',
            content: `Successful pattern: ${pattern.description}`,
            confidence: pattern.successRate || 0.5,
            source: 'mirror-patterns'
          });
        }
      } catch (error) {
        // Mirror not available, continue without it
      }
    }

    return clues;
  }

  /**
   * Infer project type from file list
   */
  private inferProjectType(files: string[]): string | null {
    const fileList = files.join(' ').toLowerCase();
    
    if (fileList.includes('package.json')) {
      if (fileList.includes('next.config')) return 'Next.js';
      if (fileList.includes('vite.config')) return 'Vite';
      if (fileList.includes('angular.json')) return 'Angular';
      if (fileList.includes('.tsx') || fileList.includes('.jsx')) return 'React';
      if (fileList.includes('vue')) return 'Vue';
      return 'Node.js';
    }
    if (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml')) {
      if (fileList.includes('django')) return 'Django';
      if (fileList.includes('flask')) return 'Flask';
      if (fileList.includes('fastapi')) return 'FastAPI';
      return 'Python';
    }
    if (fileList.includes('cargo.toml')) return 'Rust';
    if (fileList.includes('go.mod')) return 'Go';
    if (fileList.includes('.html') && fileList.includes('.css')) return 'Web/HTML';
    
    return null;
  }

  /**
   * Identify implicit requirements from the message
   */
  private identifyImplicitRequirements(
    message: string,
    keywords: string[],
    taskType: TaskType
  ): string[] {
    const requirements: Set<string> = new Set();
    const messageLower = message.toLowerCase();

    // Check for trigger keywords
    for (const [trigger, implicitReqs] of Object.entries(IMPLICIT_REQUIREMENT_TRIGGERS)) {
      if (messageLower.includes(trigger)) {
        implicitReqs.forEach(req => requirements.add(req));
      }
    }

    // Add task-type specific implicit requirements
    switch (taskType) {
      case 'code-generation':
        requirements.add('proper error handling');
        requirements.add('meaningful variable names');
        requirements.add('code comments for complex logic');
        break;
      case 'ui-design':
        requirements.add('responsive design');
        requirements.add('accessibility');
        requirements.add('consistent styling');
        break;
      case 'api-design':
        requirements.add('input validation');
        requirements.add('error responses');
        requirements.add('authentication check');
        break;
    }

    return Array.from(requirements);
  }

  /**
   * Get suggested enhancements based on task type and context
   */
  private getSuggestedEnhancements(
    taskType: TaskType,
    keywords: string[],
    context: ConversationContext
  ): Enhancement[] {
    const enhancements: Enhancement[] = [];

    // Add task-type specific enhancements
    const taskEnhancements = TASK_ENHANCEMENTS[taskType] || [];
    enhancements.push(...taskEnhancements);

    // Add context-specific enhancements
    if (context.projectFiles) {
      const hasTests = context.projectFiles.some(f => 
        f.includes('test') || f.includes('spec')
      );
      if (hasTests) {
        enhancements.push({
          type: 'testing',
          description: 'Project has tests - consider adding test coverage',
          priority: 'medium',
          autoApply: false
        });
      }
    }

    // Add security enhancements for sensitive operations
    const sensitiveKeywords = ['password', 'login', 'auth', 'api', 'token', 'secret', 'key'];
    if (keywords.some(k => sensitiveKeywords.includes(k))) {
      enhancements.push({
        type: 'security',
        description: 'Sensitive operation detected - ensure secure handling',
        priority: 'high',
        autoApply: true
      });
    }

    // Deduplicate by description
    const seen = new Set<string>();
    return enhancements.filter(e => {
      if (seen.has(e.description)) return false;
      seen.add(e.description);
      return true;
    });
  }

  /**
   * Determine the true intent behind the user's request
   */
  private determineTrueIntent(
    message: string,
    taskType: TaskType,
    implicitRequirements: string[],
    context: ConversationContext
  ): string {
    let intent = message;

    // If it's a follow-up, incorporate context
    if (context.history && context.history.length > 0) {
      const lastUserMessage = [...context.history]
        .reverse()
        .find(m => m.role === 'user');
      
      if (lastUserMessage && this.isFollowUpMessage(message, context)) {
        intent = `Building on previous request (${lastUserMessage.content.substring(0, 50)}...): ${message}`;
      }
    }

    // Add implicit requirements to intent
    if (implicitRequirements.length > 0) {
      intent += ` (also consider: ${implicitRequirements.slice(0, 3).join(', ')})`;
    }

    return intent;
  }

  /**
   * Calculate confidence score for the analysis
   */
  private calculateConfidence(
    message: string,
    contextClues: ContextClue[],
    taskType: TaskType
  ): number {
    let confidence = 0.5; // Base confidence

    // More context clues = higher confidence
    confidence += Math.min(contextClues.length * 0.05, 0.2);

    // Known task type increases confidence
    if (taskType !== 'general') {
      confidence += 0.15;
    }

    // Longer, more detailed messages are easier to analyze
    if (message.length > 50) {
      confidence += 0.1;
    }

    // Cap at 0.95
    return Math.min(confidence, 0.95);
  }
}
