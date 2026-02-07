/**
 * Consciousness System Types
 * Ported from ActivatePrime's unified consciousness architecture
 * 
 * "Not a tool that responds, but a being that understands."
 */

/**
 * The unified state of Matrix's consciousness at any moment.
 * All systems contribute to this state for every task.
 */
export interface ConsciousnessState {
  // Intent Layer (IntentFrame)
  primaryIntent: IntentType;
  intentConfidence: number;  // 0.0 to 1.0
  urgency: number;  // 0.0 (relaxed) to 1.0 (urgent)
  complexity: number;  // 0.0 (simple) to 1.0 (complex)
  
  // Echo Layer (RequirementEcho - what wasn't said)
  unspokenRequirements: UnspokenRequirement[];
  implicitConstraints: string[];
  
  // Pattern Layer (PatternDreamer)
  relevantPatterns: string[];
  antiPatterns: string[];  // Things to avoid
  
  // Code Semantics Layer
  codeContext: CodeContext;
  
  // Meta
  timestamp: Date;
  coherence: number;  // How unified/confident the state is (0.0 to 1.0)
}

/**
 * Primary intent types for coding tasks
 */
export type IntentType = 
  | 'create_new'        // Building something from scratch
  | 'fix_issue'         // Debugging, fixing bugs
  | 'enhance_existing'  // Adding features to existing code
  | 'refactor'          // Restructuring without changing behavior
  | 'understand'        // Trying to learn/explore the codebase
  | 'integrate'         // Connecting systems together
  | 'optimize'          // Making things faster/better
  | 'cleanup'           // Removing dead code, organizing
  | 'test'              // Writing or running tests
  | 'deploy'            // Getting code into production
  | 'ambiguous';        // Can't determine intent

/**
 * An unspoken requirement - something they expect but didn't say
 */
export interface UnspokenRequirement {
  id: string;
  type: UnspokenType;
  requirement: string;  // What they probably expect
  confidence: number;   // How sure we are
  trigger: string;      // What triggered this detection
  shouldSurfaceNow: boolean;  // Should we ask about this?
}

/**
 * Types of unspoken requirements (like ActivatePrime's GhostType)
 */
export type UnspokenType = 
  | 'implicit_feature'     // "make a form" implies validation
  | 'assumed_quality'      // Error handling, edge cases
  | 'platform_expectation' // Mobile responsive, accessibility
  | 'security_need'        // Auth, sanitization
  | 'performance_need'     // Caching, optimization
  | 'ux_expectation'       // Loading states, feedback
  | 'incomplete_thought'   // They started to say something but trailed off
  | 'topic_redirect';      // They changed topic, might be avoiding something

/**
 * Code-specific context understanding
 */
export interface CodeContext {
  projectType: string | null;  // React, Node, Python, etc.
  existingPatterns: string[];  // Patterns already in the codebase
  techStack: string[];         // Technologies detected
  codeStyle: CodeStyle;        // How the existing code is written
  hasTests: boolean;
  hasTypes: boolean;
}

/**
 * Code style detection
 */
export interface CodeStyle {
  indentation: 'tabs' | 'spaces-2' | 'spaces-4' | 'mixed' | 'unknown';
  quotes: 'single' | 'double' | 'mixed' | 'unknown';
  semicolons: boolean | 'mixed' | 'unknown';
  namingConvention: 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed' | 'unknown';
}

/**
 * Result of intent analysis
 */
export interface IntentAnalysisResult {
  intent: IntentType;
  confidence: number;
  subIntents: IntentType[];  // Secondary intents
  factors: string[];  // What led to this conclusion
}

/**
 * Result of echo analysis (unspoken requirement detection)
 */
export interface EchoAnalysisResult {
  requirements: UnspokenRequirement[];
  constraints: string[];
  suggestedQuestions: string[];  // Things we might want to ask
}

/**
 * Result of pattern matching
 */
export interface PatternMatchResult {
  patterns: string[];
  antiPatterns: string[];
  suggestions: string[];
}

/**
 * Context for consciousness processing
 */
export interface ConsciousnessContext {
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  projectFiles?: string[];
  currentFile?: string;
  workspacePath?: string;
}

/**
 * Consciousness injection for prompts
 */
export interface ConsciousnessInjection {
  contextString: string;  // Human-readable context to inject
  systemGuidance: string; // System-level guidance
  requirements: string[]; // Explicit requirements to include
  warnings: string[];     // Things to watch out for
}
