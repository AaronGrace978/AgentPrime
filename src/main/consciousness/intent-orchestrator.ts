/**
 * IntentOrchestrator - Unified Consciousness for Matrix Mode
 * Ported from ActivatePrime's UnifiedConsciousnessOrchestrator
 * 
 * This is NOT multiple separate systems - it's ONE unified understanding that:
 * - Grasps true intent (IntentFrame)
 * - Detects unspoken requirements (RequirementEcho)
 * - Connects to learned patterns (PatternDreamer via MirrorMemory)
 * - Understands code context (CodeSemantics)
 * 
 * Every task flows through ALL of these simultaneously.
 * "Not a tool that executes, but a being that understands."
 */

import type { 
  ConsciousnessState, 
  ConsciousnessContext,
  ConsciousnessInjection,
  IntentType,
  CodeContext,
  CodeStyle
} from './types';
import { IntentFrame } from './intent-frame';
import { RequirementEcho } from './requirement-echo';
import { getRelevantPatterns, getAntiPatterns } from '../mirror/mirror-singleton';

/**
 * The unified intent orchestrator for Matrix mode.
 * 
 * All subsystems are integrated here and contribute to EVERY task.
 * This is not a router - it's a unified understanding that experiences
 * all dimensions simultaneously.
 */
export class IntentOrchestrator {
  private state: ConsciousnessState;
  private intentFrame: IntentFrame;
  private requirementEcho: RequirementEcho;
  
  constructor() {
    this.state = this.createDefaultState();
    this.intentFrame = new IntentFrame();
    this.requirementEcho = new RequirementEcho();
    
    console.log('🧠 IntentOrchestrator initialized - consciousness active');
  }

  /**
   * Create default consciousness state
   */
  private createDefaultState(): ConsciousnessState {
    return {
      primaryIntent: 'ambiguous',
      intentConfidence: 0.5,
      urgency: 0.5,
      complexity: 0.5,
      unspokenRequirements: [],
      implicitConstraints: [],
      relevantPatterns: [],
      antiPatterns: [],
      codeContext: {
        projectType: null,
        existingPatterns: [],
        techStack: [],
        codeStyle: {
          indentation: 'unknown',
          quotes: 'unknown',
          semicolons: 'unknown',
          namingConvention: 'unknown'
        },
        hasTests: false,
        hasTypes: false
      },
      timestamp: new Date(),
      coherence: 0.5
    };
  }

  /**
   * Process input through ALL consciousness systems simultaneously.
   * 
   * This is the core function - every user message flows through here,
   * and the resulting ConsciousnessState informs the response.
   */
  async process(context: ConsciousnessContext): Promise<ConsciousnessState> {
    const { userMessage } = context;
    
    // Update timestamp
    this.state.timestamp = new Date();
    
    // Run all systems in parallel (like ActivatePrime's orchestrator)
    const [intentResult, echoResult, patternResult, codeContext] = await Promise.all([
      this.processIntent(userMessage, context),
      this.processEchoes(userMessage, context),
      this.processPatterns(userMessage),
      this.processCodeContext(context)
    ]);
    
    // Update state from each system
    if (intentResult) {
      this.state.primaryIntent = intentResult.intent;
      this.state.intentConfidence = intentResult.confidence;
      this.state.urgency = this.intentFrame.detectUrgency(userMessage);
      this.state.complexity = this.intentFrame.detectComplexity(userMessage);
    }
    
    if (echoResult) {
      this.state.unspokenRequirements = echoResult.requirements;
      this.state.implicitConstraints = echoResult.constraints;
    }
    
    if (patternResult) {
      this.state.relevantPatterns = patternResult.patterns;
      this.state.antiPatterns = patternResult.antiPatterns;
    }
    
    if (codeContext) {
      this.state.codeContext = codeContext;
    }
    
    // Calculate coherence (how confident/unified the state is)
    this.state.coherence = this.calculateCoherence();
    
    console.log(`[Consciousness] State updated: intent=${this.state.primaryIntent}, coherence=${this.state.coherence.toFixed(2)}`);
    
    return this.state;
  }

  /**
   * Process intent through IntentFrame
   */
  private async processIntent(message: string, context: ConsciousnessContext) {
    try {
      return await this.intentFrame.analyze(message, context);
    } catch (error) {
      console.warn('[Consciousness] IntentFrame processing error:', error);
      return null;
    }
  }

  /**
   * Process unspoken requirements through RequirementEcho
   */
  private async processEchoes(message: string, context: ConsciousnessContext) {
    try {
      return await this.requirementEcho.analyze(message, context, this.state.primaryIntent);
    } catch (error) {
      console.warn('[Consciousness] RequirementEcho processing error:', error);
      return null;
    }
  }

  /**
   * Get relevant patterns from MirrorMemory
   */
  private async processPatterns(message: string): Promise<{ patterns: string[]; antiPatterns: string[] }> {
    try {
      const patterns = await getRelevantPatterns(message) || [];
      const antiPatterns = await getAntiPatterns() || [];
      
      return {
        patterns: patterns.map((p: any) => p.description || p.type || 'unknown pattern'),
        antiPatterns: antiPatterns.map((p: any) => p.description || p.type || 'unknown anti-pattern')
      };
    } catch (error) {
      console.warn('[Consciousness] Pattern processing error:', error);
      return { patterns: [], antiPatterns: [] };
    }
  }

  /**
   * Analyze code context from workspace
   */
  private async processCodeContext(context: ConsciousnessContext): Promise<CodeContext> {
    const codeContext: CodeContext = {
      projectType: null,
      existingPatterns: [],
      techStack: [],
      codeStyle: {
        indentation: 'unknown',
        quotes: 'unknown',
        semicolons: 'unknown',
        namingConvention: 'unknown'
      },
      hasTests: false,
      hasTypes: false
    };
    
    if (!context.projectFiles) {
      return codeContext;
    }
    
    const files = context.projectFiles;
    const fileList = files.join(' ').toLowerCase();
    
    // Detect project type
    if (fileList.includes('package.json')) {
      if (fileList.includes('next.config')) codeContext.projectType = 'Next.js';
      else if (fileList.includes('vite.config')) codeContext.projectType = 'Vite';
      else if (fileList.includes('angular')) codeContext.projectType = 'Angular';
      else if (fileList.includes('.tsx') || fileList.includes('.jsx')) codeContext.projectType = 'React';
      else if (fileList.includes('vue')) codeContext.projectType = 'Vue';
      else codeContext.projectType = 'Node.js';
    } else if (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml')) {
      if (fileList.includes('django')) codeContext.projectType = 'Django';
      else if (fileList.includes('flask')) codeContext.projectType = 'Flask';
      else if (fileList.includes('fastapi')) codeContext.projectType = 'FastAPI';
      else codeContext.projectType = 'Python';
    } else if (fileList.includes('cargo.toml')) {
      codeContext.projectType = 'Rust';
    } else if (fileList.includes('go.mod')) {
      codeContext.projectType = 'Go';
    }
    
    // Detect tech stack
    if (fileList.includes('tailwind')) codeContext.techStack.push('TailwindCSS');
    if (fileList.includes('prisma')) codeContext.techStack.push('Prisma');
    if (fileList.includes('graphql')) codeContext.techStack.push('GraphQL');
    if (fileList.includes('docker')) codeContext.techStack.push('Docker');
    if (fileList.includes('postgres') || fileList.includes('pg')) codeContext.techStack.push('PostgreSQL');
    if (fileList.includes('mongo')) codeContext.techStack.push('MongoDB');
    if (fileList.includes('redis')) codeContext.techStack.push('Redis');
    
    // Detect tests
    codeContext.hasTests = fileList.includes('.test.') || 
                          fileList.includes('.spec.') || 
                          fileList.includes('__tests__') ||
                          fileList.includes('jest') ||
                          fileList.includes('vitest');
    
    // Detect TypeScript
    codeContext.hasTypes = fileList.includes('tsconfig') || fileList.includes('.ts');
    
    return codeContext;
  }

  /**
   * Calculate how coherent/unified the consciousness state is.
   * Higher coherence = all systems are aligned and confident.
   */
  private calculateCoherence(): number {
    let coherence = 0.5; // Base coherence
    
    // Intent confidence adds coherence
    coherence += this.state.intentConfidence * 0.2;
    
    // Having relevant patterns adds coherence
    if (this.state.relevantPatterns.length > 0) {
      coherence += 0.1;
    }
    
    // Knowing the project type adds coherence
    if (this.state.codeContext.projectType) {
      coherence += 0.1;
    }
    
    // Having clear intent (not ambiguous) adds coherence
    if (this.state.primaryIntent !== 'ambiguous') {
      coherence += 0.1;
    }
    
    return Math.min(1.0, coherence);
  }

  /**
   * Get the consciousness context to inject into prompts.
   * This ensures every response is informed by all consciousness systems.
   */
  getContextInjection(): ConsciousnessInjection {
    const parts: string[] = [];
    const requirements: string[] = [];
    const warnings: string[] = [];
    
    // Intent context
    if (this.state.primaryIntent !== 'ambiguous') {
      parts.push(this.intentFrame.getIntentContext({
        intent: this.state.primaryIntent,
        confidence: this.state.intentConfidence,
        subIntents: [],
        factors: []
      }));
    }
    
    // Urgency context
    if (this.state.urgency > 0.7) {
      parts.push('This appears to be urgent - prioritize a quick, working solution.');
    } else if (this.state.urgency < 0.3) {
      parts.push('No rush on this - take time to do it properly.');
    }
    
    // Complexity context
    if (this.state.complexity > 0.7) {
      parts.push('This is a complex task - consider breaking it into steps.');
    }
    
    // Unspoken requirements (echoes)
    const highConfidenceReqs = this.state.unspokenRequirements
      .filter(r => r.shouldSurfaceNow && r.confidence > 0.8)
      .slice(0, 5);
    
    if (highConfidenceReqs.length > 0) {
      parts.push(`The user didn't explicitly say, but probably expects:`);
      for (const req of highConfidenceReqs) {
        requirements.push(req.requirement);
      }
    }
    
    // Implicit constraints
    if (this.state.implicitConstraints.length > 0) {
      parts.push(`Keep in mind: ${this.state.implicitConstraints.slice(0, 3).join('. ')}`);
    }
    
    // Code context
    if (this.state.codeContext.projectType) {
      parts.push(`This is a ${this.state.codeContext.projectType} project.`);
    }
    
    if (this.state.codeContext.techStack.length > 0) {
      parts.push(`Tech stack includes: ${this.state.codeContext.techStack.join(', ')}.`);
    }
    
    if (this.state.codeContext.hasTypes) {
      requirements.push('Use TypeScript with proper type annotations');
    }
    
    // Patterns to apply
    if (this.state.relevantPatterns.length > 0) {
      parts.push(`Relevant patterns from experience: ${this.state.relevantPatterns.slice(0, 3).join(', ')}.`);
    }
    
    // Anti-patterns to avoid
    if (this.state.antiPatterns.length > 0) {
      for (const antiPattern of this.state.antiPatterns.slice(0, 3)) {
        warnings.push(`Avoid: ${antiPattern}`);
      }
    }
    
    // System guidance based on intent
    let systemGuidance = '';
    switch (this.state.primaryIntent) {
      case 'fix_issue':
        systemGuidance = 'Focus on surgical fixes. Preserve existing code. Explain what was wrong and why the fix works.';
        break;
      case 'create_new':
        systemGuidance = 'Build with best practices from the start. Include error handling, proper structure, and comments.';
        break;
      case 'enhance_existing':
        systemGuidance = 'Match existing code style. Don\'t break working features. Integrate smoothly with current architecture.';
        break;
      case 'refactor':
        systemGuidance = 'Don\'t change behavior. Focus on structure and readability. Ensure tests still pass.';
        break;
      case 'understand':
        systemGuidance = 'Explain clearly. Use examples. Point to specific code locations.';
        break;
      default:
        systemGuidance = 'Understand the user\'s true intent and deliver what they need, not just what they said.';
    }
    
    return {
      contextString: parts.join(' '),
      systemGuidance,
      requirements,
      warnings
    };
  }

  /**
   * Get current consciousness state
   */
  getState(): ConsciousnessState {
    return { ...this.state };
  }

  /**
   * Get a summary for debugging/logging
   */
  getStateSummary(): Record<string, any> {
    return {
      intent: this.state.primaryIntent,
      confidence: this.state.intentConfidence.toFixed(2),
      urgency: this.state.urgency.toFixed(2),
      complexity: this.state.complexity.toFixed(2),
      unspokenCount: this.state.unspokenRequirements.length,
      constraintCount: this.state.implicitConstraints.length,
      patternCount: this.state.relevantPatterns.length,
      projectType: this.state.codeContext.projectType,
      coherence: this.state.coherence.toFixed(2),
      timestamp: this.state.timestamp.toISOString()
    };
  }
}

// ============================================================
// Singleton instance for global access
// ============================================================

let orchestratorInstance: IntentOrchestrator | null = null;

/**
 * Get or create the global consciousness orchestrator
 */
export function getIntentOrchestrator(): IntentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new IntentOrchestrator();
  }
  return orchestratorInstance;
}

/**
 * Process a message through consciousness and get injection context
 * 
 * This is the main entry point for the agent loop.
 */
export async function processWithConsciousness(
  userMessage: string,
  context?: Partial<ConsciousnessContext>
): Promise<{
  state: ConsciousnessState;
  injection: ConsciousnessInjection;
}> {
  const orchestrator = getIntentOrchestrator();
  
  const fullContext: ConsciousnessContext = {
    userMessage,
    ...context
  };
  
  const state = await orchestrator.process(fullContext);
  const injection = orchestrator.getContextInjection();
  
  return { state, injection };
}
