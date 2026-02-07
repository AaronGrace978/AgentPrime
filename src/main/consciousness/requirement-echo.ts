/**
 * RequirementEcho - Detecting What Wasn't Said
 * Ported from ActivatePrime's Echo Archaeology concept
 * 
 * RequirementEcho detects, reconstructs, and surfaces unspoken requirements.
 * It remembers what the user DIDN'T say but probably expects.
 * 
 * "When they say 'make a login form', they didn't say:
 *  - Handle invalid credentials gracefully
 *  - Show password visibility toggle
 *  - Remember me checkbox
 *  - Rate limiting for security
 *  - Accessible to screen readers
 *  - Loading state while authenticating
 *  ...but they probably expect all of that."
 */

import type { 
  UnspokenRequirement, 
  UnspokenType, 
  EchoAnalysisResult,
  ConsciousnessContext,
  IntentType
} from './types';

/**
 * Implicit requirement patterns - things users expect but don't say
 */
interface ImplicitPattern {
  trigger: string | RegExp;
  requirements: Array<{
    requirement: string;
    type: UnspokenType;
    confidence: number;
  }>;
}

const IMPLICIT_PATTERNS: ImplicitPattern[] = [
  // UI Component Patterns
  {
    trigger: /\b(form|input|field)\b/i,
    requirements: [
      { requirement: 'Form validation with clear error messages', type: 'implicit_feature', confidence: 0.9 },
      { requirement: 'Disabled state while submitting', type: 'ux_expectation', confidence: 0.85 },
      { requirement: 'Keyboard navigation and submit on Enter', type: 'platform_expectation', confidence: 0.8 },
      { requirement: 'Accessible labels and ARIA attributes', type: 'platform_expectation', confidence: 0.75 }
    ]
  },
  {
    trigger: /\b(login|signin|sign.in|auth)\b/i,
    requirements: [
      { requirement: 'Secure password handling (never log passwords)', type: 'security_need', confidence: 0.95 },
      { requirement: 'Password visibility toggle', type: 'ux_expectation', confidence: 0.85 },
      { requirement: 'Rate limiting to prevent brute force', type: 'security_need', confidence: 0.8 },
      { requirement: 'Clear error for invalid credentials', type: 'ux_expectation', confidence: 0.9 },
      { requirement: 'Loading state during authentication', type: 'ux_expectation', confidence: 0.85 },
      { requirement: 'Remember me / stay logged in option', type: 'implicit_feature', confidence: 0.7 }
    ]
  },
  {
    trigger: /\b(button|btn)\b/i,
    requirements: [
      { requirement: 'Hover and active states', type: 'ux_expectation', confidence: 0.9 },
      { requirement: 'Disabled state styling', type: 'ux_expectation', confidence: 0.85 },
      { requirement: 'Loading spinner when action is async', type: 'ux_expectation', confidence: 0.8 },
      { requirement: 'Keyboard focus visible state', type: 'platform_expectation', confidence: 0.75 }
    ]
  },
  {
    trigger: /\b(list|table|grid)\b/i,
    requirements: [
      { requirement: 'Empty state when no items', type: 'ux_expectation', confidence: 0.9 },
      { requirement: 'Loading state while fetching', type: 'ux_expectation', confidence: 0.85 },
      { requirement: 'Pagination or infinite scroll for large datasets', type: 'performance_need', confidence: 0.75 },
      { requirement: 'Responsive layout for mobile', type: 'platform_expectation', confidence: 0.8 }
    ]
  },
  {
    trigger: /\b(modal|dialog|popup)\b/i,
    requirements: [
      { requirement: 'Close on Escape key', type: 'ux_expectation', confidence: 0.9 },
      { requirement: 'Close on backdrop/overlay click', type: 'ux_expectation', confidence: 0.85 },
      { requirement: 'Focus trap inside modal', type: 'platform_expectation', confidence: 0.8 },
      { requirement: 'Smooth open/close animation', type: 'ux_expectation', confidence: 0.7 }
    ]
  },
  
  // Backend/API Patterns
  {
    trigger: /\b(api|endpoint|route)\b/i,
    requirements: [
      { requirement: 'Input validation and sanitization', type: 'security_need', confidence: 0.95 },
      { requirement: 'Proper HTTP status codes (200, 400, 401, 404, 500)', type: 'assumed_quality', confidence: 0.9 },
      { requirement: 'Error response with helpful message', type: 'assumed_quality', confidence: 0.85 },
      { requirement: 'Authentication check if protected route', type: 'security_need', confidence: 0.8 }
    ]
  },
  {
    trigger: /\b(database|db|sql|query)\b/i,
    requirements: [
      { requirement: 'Parameterized queries to prevent SQL injection', type: 'security_need', confidence: 0.95 },
      { requirement: 'Connection error handling', type: 'assumed_quality', confidence: 0.9 },
      { requirement: 'Transaction for multi-step operations', type: 'assumed_quality', confidence: 0.75 }
    ]
  },
  {
    trigger: /\b(file|upload|download)\b/i,
    requirements: [
      { requirement: 'File size limit validation', type: 'security_need', confidence: 0.9 },
      { requirement: 'File type validation', type: 'security_need', confidence: 0.85 },
      { requirement: 'Progress indicator for large files', type: 'ux_expectation', confidence: 0.8 },
      { requirement: 'Error handling for failed uploads', type: 'assumed_quality', confidence: 0.9 }
    ]
  },
  
  // Data Patterns
  {
    trigger: /\b(fetch|load|get.*data)\b/i,
    requirements: [
      { requirement: 'Loading state while fetching', type: 'ux_expectation', confidence: 0.9 },
      { requirement: 'Error state for failed requests', type: 'assumed_quality', confidence: 0.9 },
      { requirement: 'Retry mechanism for transient failures', type: 'assumed_quality', confidence: 0.7 },
      { requirement: 'Cache responses when appropriate', type: 'performance_need', confidence: 0.6 }
    ]
  },
  
  // Mobile/Responsive Patterns
  {
    trigger: /\b(mobile|responsive|phone)\b/i,
    requirements: [
      { requirement: 'Touch-friendly tap targets (min 44px)', type: 'platform_expectation', confidence: 0.9 },
      { requirement: 'Viewport meta tag', type: 'platform_expectation', confidence: 0.85 },
      { requirement: 'No horizontal scroll on mobile', type: 'ux_expectation', confidence: 0.9 }
    ]
  }
];

/**
 * Redirect/shutdown phrases (like Echo Archaeology's ghost detection)
 */
const REDIRECT_PHRASES = [
  'anyway', 'moving on', 'nevermind', 'forget it', 'whatever',
  'not important', 'doesn\'t matter', 'but anyway'
];

const INCOMPLETE_THOUGHT_PATTERNS = [
  /\.\.\./,  // Trailing ellipsis
  /,\s*$/,   // Trailing comma
  /\band\s*$/i,  // Trailing "and"
  /\bbut\s*$/i   // Trailing "but"
];

export class RequirementEcho {
  private echoHistory: UnspokenRequirement[] = [];
  
  constructor() {
    console.log('👻 RequirementEcho initialized');
  }

  /**
   * Analyze message for unspoken requirements
   */
  async analyze(
    message: string,
    context?: ConsciousnessContext,
    intentType?: IntentType
  ): Promise<EchoAnalysisResult> {
    const requirements: UnspokenRequirement[] = [];
    const constraints: string[] = [];
    const suggestedQuestions: string[] = [];
    
    const messageLower = message.toLowerCase();
    
    // Check for implicit requirement patterns
    for (const pattern of IMPLICIT_PATTERNS) {
      const trigger = pattern.trigger;
      const matches = typeof trigger === 'string' 
        ? messageLower.includes(trigger.toLowerCase())
        : trigger.test(message);
      
      if (matches) {
        for (const req of pattern.requirements) {
          requirements.push({
            id: `echo_${Date.now()}_${requirements.length}`,
            type: req.type,
            requirement: req.requirement,
            confidence: req.confidence,
            trigger: typeof trigger === 'string' ? trigger : trigger.source,
            shouldSurfaceNow: req.confidence > 0.85 // High confidence = include automatically
          });
        }
      }
    }
    
    // Detect incomplete thoughts
    for (const pattern of INCOMPLETE_THOUGHT_PATTERNS) {
      if (pattern.test(message)) {
        requirements.push({
          id: `echo_incomplete_${Date.now()}`,
          type: 'incomplete_thought',
          requirement: 'User may have more to say - the thought seems incomplete',
          confidence: 0.7,
          trigger: 'incomplete_sentence',
          shouldSurfaceNow: true
        });
        suggestedQuestions.push('It looks like you might have more to add - what else should I know?');
        break;
      }
    }
    
    // Detect redirects/topic avoidance
    for (const phrase of REDIRECT_PHRASES) {
      if (messageLower.includes(phrase)) {
        requirements.push({
          id: `echo_redirect_${Date.now()}`,
          type: 'topic_redirect',
          requirement: 'User redirected the conversation - they might be avoiding something or simplifying',
          confidence: 0.6,
          trigger: phrase,
          shouldSurfaceNow: false
        });
        break;
      }
    }
    
    // Add intent-specific constraints
    if (intentType) {
      const intentConstraints = this.getIntentConstraints(intentType);
      constraints.push(...intentConstraints);
    }
    
    // Detect project-specific implicit requirements from context
    if (context?.projectFiles) {
      const projectReqs = this.detectProjectRequirements(context.projectFiles);
      requirements.push(...projectReqs);
    }
    
    // Store in history
    this.echoHistory.push(...requirements);
    if (this.echoHistory.length > 100) {
      this.echoHistory = this.echoHistory.slice(-100);
    }
    
    return {
      requirements,
      constraints,
      suggestedQuestions
    };
  }

  /**
   * Get implicit constraints based on intent type
   */
  private getIntentConstraints(intentType: IntentType): string[] {
    const constraints: Record<IntentType, string[]> = {
      'create_new': [
        'Start with a clean, well-structured foundation',
        'Include proper error handling from the start',
        'Set up for future extensibility'
      ],
      'fix_issue': [
        'Make minimal changes to fix the issue',
        'Don\'t refactor unrelated code',
        'Preserve existing functionality',
        'Add comments explaining the fix'
      ],
      'enhance_existing': [
        'Match the existing code style',
        'Don\'t break existing features',
        'Consider backward compatibility'
      ],
      'refactor': [
        'Don\'t change external behavior',
        'Maintain all existing functionality',
        'Keep or improve test coverage'
      ],
      'understand': [
        'Explain clearly and concisely',
        'Use examples when helpful',
        'Point to relevant code locations'
      ],
      'integrate': [
        'Handle connection failures gracefully',
        'Consider rate limiting and retries',
        'Add proper error messages for integration failures'
      ],
      'optimize': [
        'Measure before and after',
        'Don\'t sacrifice readability unnecessarily',
        'Consider edge cases that might affect performance'
      ],
      'cleanup': [
        'Verify code is actually unused before removing',
        'Don\'t break any dependencies',
        'Keep changes reviewable'
      ],
      'test': [
        'Cover both happy path and edge cases',
        'Make tests readable and maintainable',
        'Include meaningful test descriptions'
      ],
      'deploy': [
        'Verify all tests pass',
        'Check for environment-specific configs',
        'Have a rollback plan'
      ],
      'ambiguous': []
    };
    
    return constraints[intentType] || [];
  }

  /**
   * Detect project-specific requirements from files
   */
  private detectProjectRequirements(files: string[]): UnspokenRequirement[] {
    const requirements: UnspokenRequirement[] = [];
    const fileList = files.join(' ').toLowerCase();
    
    // TypeScript project
    if (fileList.includes('tsconfig') || fileList.includes('.ts')) {
      requirements.push({
        id: 'echo_typescript',
        type: 'assumed_quality',
        requirement: 'Use TypeScript with proper type annotations',
        confidence: 0.9,
        trigger: 'typescript_project',
        shouldSurfaceNow: true
      });
    }
    
    // Testing framework detected
    if (fileList.includes('jest') || fileList.includes('.test.') || fileList.includes('.spec.')) {
      requirements.push({
        id: 'echo_testing',
        type: 'assumed_quality',
        requirement: 'Consider adding tests for new functionality',
        confidence: 0.7,
        trigger: 'testing_framework',
        shouldSurfaceNow: false
      });
    }
    
    // React project
    if (fileList.includes('react') || fileList.includes('.jsx') || fileList.includes('.tsx')) {
      requirements.push({
        id: 'echo_react',
        type: 'assumed_quality',
        requirement: 'Follow React best practices (hooks, functional components)',
        confidence: 0.8,
        trigger: 'react_project',
        shouldSurfaceNow: true
      });
    }
    
    // ESLint/Prettier
    if (fileList.includes('eslint') || fileList.includes('prettier')) {
      requirements.push({
        id: 'echo_linting',
        type: 'assumed_quality',
        requirement: 'Ensure code passes linting rules',
        confidence: 0.85,
        trigger: 'linting_config',
        shouldSurfaceNow: true
      });
    }
    
    return requirements;
  }

  /**
   * Get high-confidence requirements that should be auto-included
   */
  getAutoIncludeRequirements(): string[] {
    return this.echoHistory
      .filter(r => r.shouldSurfaceNow && r.confidence > 0.8)
      .map(r => r.requirement);
  }

  /**
   * Get echo context for prompt injection
   */
  getEchoContext(result: EchoAnalysisResult): string {
    const autoInclude = result.requirements
      .filter(r => r.shouldSurfaceNow)
      .slice(0, 5);
    
    if (autoInclude.length === 0) {
      return '';
    }
    
    const reqList = autoInclude.map(r => `- ${r.requirement}`).join('\n');
    return `The user didn't explicitly say, but probably expects:\n${reqList}`;
  }
}
