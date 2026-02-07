/**
 * IntentFrame - Deep Intent Understanding
 * Ported from ActivatePrime's SoulFrame concept
 * 
 * IntentFrame doesn't just detect keywords - it UNDERSTANDS intent.
 * It looks beyond the literal request to grasp what the user actually needs.
 * 
 * "The user who says 'make a button' might mean:
 *  - I need a clickable element (literal)
 *  - I need this action to be possible (functional)
 *  - I'm stuck and this is where I'm starting (exploratory)
 *  - I want something that looks professional (aesthetic)
 *  - I need to trigger something specific (behavioral)"
 */

import type { 
  IntentType, 
  IntentAnalysisResult, 
  ConsciousnessContext 
} from './types';

/**
 * Intent detection patterns with semantic depth
 */
interface IntentPattern {
  type: IntentType;
  keywords: string[];
  phrases: string[];
  negativeIndicators: string[];  // Things that suggest this ISN'T the intent
  contextualBoost: string[];     // Context that increases confidence
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: 'create_new',
    keywords: ['create', 'build', 'make', 'new', 'generate', 'scaffold', 'start', 'init', 'bootstrap'],
    phrases: ['from scratch', 'brand new', 'set up', 'get started', 'initialize'],
    negativeIndicators: ['fix', 'bug', 'error', 'broken', 'issue', 'existing'],
    contextualBoost: ['project', 'app', 'application', 'website', 'game', 'api', 'service']
  },
  {
    type: 'fix_issue',
    keywords: ['fix', 'debug', 'repair', 'solve', 'resolve', 'patch', 'correct'],
    phrases: ['not working', 'broken', 'bug', 'error', 'issue', 'problem', 'crash', 'failing'],
    negativeIndicators: ['new', 'create', 'build'],
    contextualBoost: ['error message', 'stack trace', 'exception', 'undefined', 'null']
  },
  {
    type: 'enhance_existing',
    keywords: ['add', 'implement', 'extend', 'expand', 'improve', 'enhance', 'upgrade'],
    phrases: ['add to', 'new feature', 'also want', 'additionally', 'on top of'],
    negativeIndicators: ['new project', 'from scratch', 'fix', 'bug'],
    contextualBoost: ['existing', 'current', 'already have', 'to the']
  },
  {
    type: 'refactor',
    keywords: ['refactor', 'restructure', 'reorganize', 'clean up', 'simplify'],
    phrases: ['make it cleaner', 'better structure', 'separate concerns', 'extract'],
    negativeIndicators: ['new feature', 'add', 'bug'],
    contextualBoost: ['maintainable', 'readable', 'modular', 'testable']
  },
  {
    type: 'understand',
    keywords: ['explain', 'how', 'why', 'what', 'understand', 'learn', 'show'],
    phrases: ['how does', 'what is', 'why is', 'can you explain', 'walk me through'],
    negativeIndicators: ['create', 'build', 'fix'],
    contextualBoost: ['?', 'curious', 'wondering', 'trying to understand']
  },
  {
    type: 'integrate',
    keywords: ['connect', 'integrate', 'link', 'combine', 'merge', 'hook up'],
    phrases: ['work with', 'talk to', 'connect to', 'integrate with'],
    negativeIndicators: ['new project', 'fix bug'],
    contextualBoost: ['api', 'service', 'database', 'external', 'third-party']
  },
  {
    type: 'optimize',
    keywords: ['optimize', 'faster', 'performance', 'speed up', 'efficient'],
    phrases: ['make it faster', 'too slow', 'performance issue', 'optimize for'],
    negativeIndicators: ['new', 'create', 'bug'],
    contextualBoost: ['slow', 'memory', 'cpu', 'loading', 'render']
  },
  {
    type: 'cleanup',
    keywords: ['remove', 'delete', 'clean', 'unused', 'dead code', 'organize'],
    phrases: ['get rid of', 'clean up', 'remove unused', 'organize files'],
    negativeIndicators: ['add', 'create', 'new'],
    contextualBoost: ['messy', 'cluttered', 'unused', 'deprecated']
  },
  {
    type: 'test',
    keywords: ['test', 'spec', 'coverage', 'unit test', 'e2e', 'integration test'],
    phrases: ['write tests', 'add tests', 'test coverage', 'make sure it works'],
    negativeIndicators: [],
    contextualBoost: ['jest', 'mocha', 'pytest', 'testing', 'tdd']
  },
  {
    type: 'deploy',
    keywords: ['deploy', 'publish', 'release', 'production', 'ship', 'launch'],
    phrases: ['go live', 'push to prod', 'release it', 'make it live'],
    negativeIndicators: ['test', 'local', 'development'],
    contextualBoost: ['server', 'cloud', 'hosting', 'domain']
  }
];

/**
 * Urgency indicators
 */
const URGENCY_INDICATORS = {
  high: ['asap', 'urgent', 'immediately', 'right now', 'quick', 'hurry', 'emergency', 'critical', 'blocking'],
  medium: ['soon', 'when you can', 'please', 'need', 'important'],
  low: ['eventually', 'when you have time', 'no rush', 'sometime', 'maybe', 'consider']
};

/**
 * Complexity indicators
 */
const COMPLEXITY_INDICATORS = {
  high: ['complex', 'complicated', 'full', 'complete', 'comprehensive', 'entire', 'whole system', 'architecture'],
  medium: ['feature', 'component', 'module', 'integration'],
  low: ['simple', 'quick', 'small', 'minor', 'tiny', 'just', 'only']
};

export class IntentFrame {
  constructor() {
    console.log('🧠 IntentFrame initialized');
  }

  /**
   * Analyze user message to understand true intent
   */
  async analyze(
    message: string, 
    context?: ConsciousnessContext
  ): Promise<IntentAnalysisResult> {
    const messageLower = message.toLowerCase();
    const factors: string[] = [];
    
    // Score each intent type
    const scores: Map<IntentType, number> = new Map();
    
    for (const pattern of INTENT_PATTERNS) {
      let score = 0;
      const matchedFactors: string[] = [];
      
      // Check keywords
      for (const keyword of pattern.keywords) {
        if (messageLower.includes(keyword)) {
          score += 2;
          matchedFactors.push(`keyword: ${keyword}`);
        }
      }
      
      // Check phrases (worth more)
      for (const phrase of pattern.phrases) {
        if (messageLower.includes(phrase)) {
          score += 3;
          matchedFactors.push(`phrase: ${phrase}`);
        }
      }
      
      // Check negative indicators (reduce score)
      for (const negative of pattern.negativeIndicators) {
        if (messageLower.includes(negative)) {
          score -= 2;
          matchedFactors.push(`negative: ${negative}`);
        }
      }
      
      // Check contextual boosters
      for (const boost of pattern.contextualBoost) {
        if (messageLower.includes(boost)) {
          score += 1;
          matchedFactors.push(`context: ${boost}`);
        }
      }
      
      // Context from conversation history
      if (context?.conversationHistory?.length) {
        const recentContext = context.conversationHistory
          .slice(-3)
          .map(m => m.content.toLowerCase())
          .join(' ');
        
        for (const boost of pattern.contextualBoost) {
          if (recentContext.includes(boost)) {
            score += 0.5;
            matchedFactors.push(`history context: ${boost}`);
          }
        }
      }
      
      if (score > 0) {
        scores.set(pattern.type, score);
        if (matchedFactors.length > 0) {
          factors.push(...matchedFactors.map(f => `[${pattern.type}] ${f}`));
        }
      }
    }
    
    // Find the best match
    let bestIntent: IntentType = 'ambiguous';
    let bestScore = 0;
    const subIntents: IntentType[] = [];
    
    for (const [intent, score] of scores.entries()) {
      if (score > bestScore) {
        if (bestIntent !== 'ambiguous') {
          subIntents.push(bestIntent);
        }
        bestScore = score;
        bestIntent = intent;
      } else if (score > bestScore * 0.6) {
        // Secondary intent if close enough
        subIntents.push(intent);
      }
    }
    
    // Calculate confidence
    const maxPossibleScore = 15; // Rough estimate
    const confidence = Math.min(0.95, bestScore / maxPossibleScore);
    
    return {
      intent: bestIntent,
      confidence,
      subIntents: subIntents.slice(0, 3),
      factors
    };
  }

  /**
   * Detect urgency level from message
   */
  detectUrgency(message: string): number {
    const messageLower = message.toLowerCase();
    
    for (const indicator of URGENCY_INDICATORS.high) {
      if (messageLower.includes(indicator)) return 0.9;
    }
    
    for (const indicator of URGENCY_INDICATORS.medium) {
      if (messageLower.includes(indicator)) return 0.5;
    }
    
    for (const indicator of URGENCY_INDICATORS.low) {
      if (messageLower.includes(indicator)) return 0.2;
    }
    
    return 0.5; // Default medium urgency
  }

  /**
   * Detect complexity level from message
   */
  detectComplexity(message: string): number {
    const messageLower = message.toLowerCase();
    
    for (const indicator of COMPLEXITY_INDICATORS.high) {
      if (messageLower.includes(indicator)) return 0.9;
    }
    
    for (const indicator of COMPLEXITY_INDICATORS.medium) {
      if (messageLower.includes(indicator)) return 0.5;
    }
    
    for (const indicator of COMPLEXITY_INDICATORS.low) {
      if (messageLower.includes(indicator)) return 0.2;
    }
    
    // Estimate from message length and punctuation
    const words = message.split(/\s+/).length;
    if (words > 100) return 0.8;
    if (words > 50) return 0.6;
    if (words > 20) return 0.4;
    
    return 0.3; // Default low-medium
  }

  /**
   * Get intent context for prompt injection
   */
  getIntentContext(result: IntentAnalysisResult): string {
    if (result.intent === 'ambiguous') {
      return 'The user\'s intent is unclear. Ask clarifying questions if needed.';
    }
    
    const intentDescriptions: Record<IntentType, string> = {
      'create_new': 'The user wants to create something new from scratch.',
      'fix_issue': 'The user is trying to fix a bug or resolve an error.',
      'enhance_existing': 'The user wants to add features to existing code.',
      'refactor': 'The user wants to improve code structure without changing behavior.',
      'understand': 'The user wants to understand how something works.',
      'integrate': 'The user wants to connect different systems or services.',
      'optimize': 'The user wants to improve performance.',
      'cleanup': 'The user wants to remove unused code or organize files.',
      'test': 'The user wants to write or run tests.',
      'deploy': 'The user wants to deploy or release code.',
      'ambiguous': 'Intent is unclear.'
    };
    
    let context = intentDescriptions[result.intent];
    
    if (result.subIntents.length > 0) {
      context += ` They may also want to: ${result.subIntents.map(i => intentDescriptions[i].toLowerCase().replace('the user wants to ', '').replace('the user is trying to ', '')).join(', ')}.`;
    }
    
    return context;
  }
}
