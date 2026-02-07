/**
 * Matrix Mode Agent Router
 * Routes messages to appropriate agents based on rules and capabilities
 * 
 * Enhanced with:
 * - Cost-aware model selection
 * - Complexity estimation
 * - Historical success rate tracking
 * - Dynamic load balancing
 */

import {
  AgentConfig,
  AgentInstance,
  AgentRequest,
  AgentResponse,
  RoutingRule,
  AgentCapability
} from './types';
import { AgentRegistry, getAgentRegistry } from './agent-registry';

// Generate unique ID
function generateId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Model tier configuration for cost-aware routing
 */
export interface ModelTier {
  name: string;
  costPerToken: number;
  speedRating: number; // 1-10, higher is faster
  intelligenceRating: number; // 1-10, higher is smarter
  maxTokens: number;
  bestFor: string[];
}

/**
 * Predefined model tiers
 */
export const MODEL_TIERS: Record<string, ModelTier> = {
  'fast': {
    name: 'fast',
    costPerToken: 0.0001,
    speedRating: 10,
    intelligenceRating: 5,
    maxTokens: 4096,
    bestFor: ['simple-chat', 'code-completion', 'quick-answers']
  },
  'balanced': {
    name: 'balanced',
    costPerToken: 0.001,
    speedRating: 7,
    intelligenceRating: 7,
    maxTokens: 8192,
    bestFor: ['code-generation', 'debugging', 'explanations']
  },
  'powerful': {
    name: 'powerful',
    costPerToken: 0.01,
    speedRating: 4,
    intelligenceRating: 10,
    maxTokens: 32768,
    bestFor: ['complex-reasoning', 'architecture', 'refactoring', 'multi-step']
  }
};

/**
 * Task complexity estimation result
 */
export interface ComplexityEstimate {
  level: 'simple' | 'moderate' | 'complex';
  score: number; // 0-1
  factors: string[];
  recommendedTier: string;
  estimatedTokens: number;
}

/**
 * Agent performance history
 */
interface AgentPerformance {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  averageTokens: number;
  lastUpdated: number;
}

export interface RoutingContext {
  channelId?: string;
  channelType?: string;
  userId?: string;
  message: string;
  capabilities?: AgentCapability[];
  preferredAgent?: string;
  /** Prefer faster responses over quality */
  preferSpeed?: boolean;
  /** Prefer quality over speed */
  preferQuality?: boolean;
  /** Budget constraint (cost multiplier, 1 = normal) */
  costBudget?: number;
  /** Force a specific model tier */
  forceTier?: string;
}

export interface RoutingResult {
  agentId: string;
  agent: AgentInstance;
  matchedRule?: RoutingRule;
  score: number;
  /** Recommended model tier based on complexity */
  recommendedTier?: string;
  /** Complexity estimate */
  complexity?: ComplexityEstimate;
}

export type AgentExecutor = (
  agent: AgentInstance,
  request: AgentRequest
) => Promise<AgentResponse>;

export class AgentRouter {
  private registry: AgentRegistry;
  private executor: AgentExecutor | null = null;
  private routeCache: Map<string, { agentId: string; timestamp: number }> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes
  
  // Performance tracking
  private agentPerformance: Map<string, AgentPerformance> = new Map();
  private complexityCache: Map<string, ComplexityEstimate> = new Map();
  
  // Complexity detection patterns
  private complexityPatterns = {
    simple: [
      /^(hi|hello|hey|thanks|ok|yes|no|bye)/i,
      /^what (is|are) .{1,30}$/i,
      /^(show|list|display) /i
    ],
    complex: [
      /architect/i,
      /refactor .* entire/i,
      /redesign/i,
      /implement .* from scratch/i,
      /migrate/i,
      /integrate .* with .* and/i,
      /complex|complicated|advanced/i,
      /multiple (files|components|services)/i,
      /step.by.step|walkthrough/i
    ],
    multiStep: [
      /first .* then/i,
      /\d+\.\s/,
      /multiple steps/i,
      /and also|and then|after that/i
    ]
  };

  constructor(registry?: AgentRegistry) {
    this.registry = registry || getAgentRegistry();
  }

  /**
   * Set the agent executor function
   */
  setExecutor(executor: AgentExecutor): void {
    this.executor = executor;
  }

  /**
   * Estimate task complexity from message
   */
  estimateComplexity(message: string): ComplexityEstimate {
    // Check cache first
    const cacheKey = message.substring(0, 100);
    const cached = this.complexityCache.get(cacheKey);
    if (cached) return cached;

    const factors: string[] = [];
    let score = 0.5; // Start at moderate

    // Check for simple patterns
    for (const pattern of this.complexityPatterns.simple) {
      if (pattern.test(message)) {
        score -= 0.2;
        factors.push('Simple pattern detected');
        break;
      }
    }

    // Check for complex patterns
    for (const pattern of this.complexityPatterns.complex) {
      if (pattern.test(message)) {
        score += 0.15;
        factors.push('Complex pattern: ' + pattern.toString().slice(1, 20));
      }
    }

    // Check for multi-step patterns
    for (const pattern of this.complexityPatterns.multiStep) {
      if (pattern.test(message)) {
        score += 0.1;
        factors.push('Multi-step task');
        break;
      }
    }

    // Message length affects complexity
    const wordCount = message.split(/\s+/).length;
    if (wordCount > 100) {
      score += 0.15;
      factors.push('Long message (detailed request)');
    } else if (wordCount < 10) {
      score -= 0.1;
      factors.push('Short message');
    }

    // Code blocks indicate technical depth
    if (message.includes('```')) {
      score += 0.1;
      factors.push('Contains code blocks');
    }

    // Questions about "why" or "how" are often complex
    if (/^(why|how)\s/i.test(message)) {
      score += 0.1;
      factors.push('Explanatory question');
    }

    // Clamp score
    score = Math.max(0, Math.min(1, score));

    // Determine level and tier
    let level: 'simple' | 'moderate' | 'complex';
    let recommendedTier: string;
    let estimatedTokens: number;

    if (score < 0.35) {
      level = 'simple';
      recommendedTier = 'fast';
      estimatedTokens = 500;
    } else if (score < 0.65) {
      level = 'moderate';
      recommendedTier = 'balanced';
      estimatedTokens = 2000;
    } else {
      level = 'complex';
      recommendedTier = 'powerful';
      estimatedTokens = 8000;
    }

    const estimate: ComplexityEstimate = {
      level,
      score,
      factors,
      recommendedTier,
      estimatedTokens
    };

    // Cache the result
    this.complexityCache.set(cacheKey, estimate);

    return estimate;
  }

  /**
   * Select optimal model tier based on context
   */
  selectModelTier(context: RoutingContext, complexity: ComplexityEstimate): string {
    // If tier is forced, use it
    if (context.forceTier && MODEL_TIERS[context.forceTier]) {
      return context.forceTier;
    }

    // User preferences
    if (context.preferSpeed) {
      return complexity.level === 'complex' ? 'balanced' : 'fast';
    }

    if (context.preferQuality) {
      return complexity.level === 'simple' ? 'balanced' : 'powerful';
    }

    // Budget constraints
    if (context.costBudget !== undefined && context.costBudget < 0.5) {
      return 'fast';
    }

    // Default to complexity-based recommendation
    return complexity.recommendedTier;
  }

  /**
   * Record agent performance for future routing decisions
   */
  recordPerformance(
    agentId: string,
    success: boolean,
    duration: number,
    tokens?: number
  ): void {
    let perf = this.agentPerformance.get(agentId);
    
    if (!perf) {
      perf = {
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        averageDuration: 0,
        averageTokens: 0,
        lastUpdated: Date.now()
      };
    }

    perf.totalRequests++;
    if (success) {
      perf.successCount++;
    } else {
      perf.failureCount++;
    }

    // Rolling average for duration
    perf.averageDuration = (perf.averageDuration * (perf.totalRequests - 1) + duration) / perf.totalRequests;
    
    if (tokens !== undefined) {
      perf.averageTokens = (perf.averageTokens * (perf.totalRequests - 1) + tokens) / perf.totalRequests;
    }

    perf.lastUpdated = Date.now();
    this.agentPerformance.set(agentId, perf);
  }

  /**
   * Get agent success rate
   */
  getAgentSuccessRate(agentId: string): number {
    const perf = this.agentPerformance.get(agentId);
    if (!perf || perf.totalRequests === 0) {
      return 0.5; // Unknown, assume average
    }
    return perf.successCount / perf.totalRequests;
  }

  /**
   * Get performance stats for all agents
   */
  getPerformanceStats(): Map<string, AgentPerformance> {
    return new Map(this.agentPerformance);
  }

  /**
   * Route a message to the best agent
   */
  route(context: RoutingContext): RoutingResult | null {
    // Estimate complexity first
    const complexity = this.estimateComplexity(context.message);
    const recommendedTier = this.selectModelTier(context, complexity);

    // Check for preferred agent
    if (context.preferredAgent) {
      const preferred = this.registry.get(context.preferredAgent);
      if (preferred && preferred.config.enabled && this.registry.canAcceptTask(context.preferredAgent)) {
        return {
          agentId: context.preferredAgent,
          agent: preferred,
          score: 1.0,
          complexity,
          recommendedTier
        };
      }
    }

    // Check cache for consistent routing
    const cacheKey = this.getCacheKey(context);
    const cached = this.routeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      const agent = this.registry.get(cached.agentId);
      if (agent && agent.config.enabled && this.registry.canAcceptTask(cached.agentId)) {
        return {
          agentId: cached.agentId,
          agent,
          score: 0.9,
          complexity,
          recommendedTier
        };
      }
    }

    // Find best matching agent
    const candidates = this.findCandidates(context);
    if (candidates.length === 0) {
      // Fall back to default agent
      const defaultAgent = this.registry.getDefault();
      if (defaultAgent && this.registry.canAcceptTask(defaultAgent.config.id)) {
        return {
          agentId: defaultAgent.config.id,
          agent: defaultAgent,
          score: 0.5,
          complexity,
          recommendedTier
        };
      }
      return null;
    }

    // Select best candidate, factoring in historical performance
    let best = candidates[0];
    
    // Boost score for agents with good success rates
    for (const candidate of candidates) {
      const successRate = this.getAgentSuccessRate(candidate.agentId);
      candidate.score *= (0.8 + successRate * 0.4); // Boost up to 40% for perfect success rate
    }
    
    // Re-sort after performance adjustment
    candidates.sort((a, b) => b.score - a.score);
    best = candidates[0];
    
    // Add complexity info to result
    best.complexity = complexity;
    best.recommendedTier = recommendedTier;
    
    // Cache the routing decision
    this.routeCache.set(cacheKey, {
      agentId: best.agentId,
      timestamp: Date.now()
    });

    return best;
  }

  /**
   * Find candidate agents for a context
   */
  private findCandidates(context: RoutingContext): RoutingResult[] {
    const enabledAgents = this.registry.getEnabled();
    const candidates: RoutingResult[] = [];

    for (const agent of enabledAgents) {
      if (!this.registry.canAcceptTask(agent.config.id)) {
        continue;
      }

      const result = this.scoreAgent(agent, context);
      if (result.score > 0) {
        candidates.push(result);
      }
    }

    // Sort by score descending, then by priority
    candidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (b.agent.config.priority || 0) - (a.agent.config.priority || 0);
    });

    return candidates;
  }

  /**
   * Score an agent for a context
   */
  private scoreAgent(agent: AgentInstance, context: RoutingContext): RoutingResult {
    let score = 0;
    let matchedRule: RoutingRule | undefined;

    const config = agent.config;

    // Check capability match
    if (context.capabilities && context.capabilities.length > 0) {
      const hasAllCapabilities = context.capabilities.every(cap =>
        config.capabilities.includes(cap) || config.capabilities.includes('*')
      );
      if (hasAllCapabilities) {
        score += 0.3;
      }
    } else {
      // No specific capability required
      score += 0.1;
    }

    // Check routing rules
    if (config.routingRules && config.routingRules.length > 0) {
      for (const rule of config.routingRules) {
        const ruleScore = this.evaluateRule(rule, context);
        if (ruleScore > 0) {
          score += ruleScore * 0.4;
          matchedRule = rule;
          break; // Use first matching rule
        }
      }
    }

    // Boost for less busy agents
    const busyRatio = agent.currentTasks / (config.maxConcurrentTasks || 5);
    score += (1 - busyRatio) * 0.2;

    // Boost for priority
    score += (config.priority || 0) * 0.1;

    return {
      agentId: config.id,
      agent,
      matchedRule,
      score
    };
  }

  /**
   * Evaluate a routing rule
   */
  private evaluateRule(rule: RoutingRule, context: RoutingContext): number {
    const values = Array.isArray(rule.value) ? rule.value : [rule.value];

    switch (rule.type) {
      case 'channel':
        if (context.channelId && values.includes(context.channelId)) {
          return 1;
        }
        if (context.channelType && values.includes(context.channelType)) {
          return 0.8;
        }
        break;

      case 'user':
        if (context.userId && values.includes(context.userId)) {
          return 1;
        }
        break;

      case 'keyword':
        const messageLower = context.message.toLowerCase();
        for (const keyword of values) {
          if (messageLower.includes(keyword.toLowerCase())) {
            return 1;
          }
        }
        break;

      case 'capability':
        if (context.capabilities) {
          for (const cap of context.capabilities) {
            if (values.includes(cap)) {
              return 1;
            }
          }
        }
        break;

      case 'pattern':
        for (const pattern of values) {
          try {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(context.message)) {
              return 1;
            }
          } catch {
            // Invalid regex, skip
          }
        }
        break;
    }

    return 0;
  }

  /**
   * Generate cache key for routing
   */
  private getCacheKey(context: RoutingContext): string {
    return `${context.channelId || ''}:${context.userId || ''}`;
  }

  /**
   * Clear routing cache
   */
  clearCache(): void {
    this.routeCache.clear();
  }

  /**
   * Clear cache for specific context
   */
  clearCacheFor(channelId?: string, userId?: string): void {
    const keyPrefix = `${channelId || ''}:${userId || ''}`;
    for (const key of this.routeCache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.routeCache.delete(key);
      }
    }
  }

  /**
   * Execute a request through the router
   */
  async execute(context: RoutingContext): Promise<AgentResponse | null> {
    if (!this.executor) {
      throw new Error('No executor configured');
    }

    const result = this.route(context);
    if (!result) {
      return null;
    }

    const request: AgentRequest = {
      id: generateId(),
      message: context.message,
      sessionId: `${context.channelId || 'default'}:${context.userId || 'anonymous'}`,
      channelId: context.channelId,
      userId: context.userId,
      metadata: {
        routingScore: result.score,
        matchedRule: result.matchedRule,
        complexity: result.complexity,
        recommendedTier: result.recommendedTier
      }
    };

    // Record task start
    this.registry.recordTaskStart(result.agentId);
    const startTime = Date.now();

    try {
      const response = await this.executor(result.agent, request);
      const duration = Date.now() - startTime;
      
      // Record success performance
      this.registry.recordTaskComplete(result.agentId, true);
      this.recordPerformance(result.agentId, true, duration, response.tokensUsed);
      
      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Record failure performance
      this.registry.recordTaskComplete(result.agentId, false);
      this.recordPerformance(result.agentId, false, duration);
      
      throw error;
    }
  }

  /**
   * Execute with automatic tier selection
   * Returns both the response and the tier used
   */
  async executeWithTier(context: RoutingContext): Promise<{
    response: AgentResponse | null;
    tier: string;
    complexity: ComplexityEstimate;
  }> {
    const complexity = this.estimateComplexity(context.message);
    const tier = this.selectModelTier(context, complexity);
    
    const response = await this.execute({
      ...context,
      forceTier: tier
    });

    return { response, tier, complexity };
  }

  /**
   * Detect required capabilities from message
   */
  detectCapabilities(message: string): AgentCapability[] {
    const capabilities: AgentCapability[] = ['chat'];
    const messageLower = message.toLowerCase();

    // Code-related keywords
    if (/\b(code|function|class|debug|error|fix|implement|refactor|test)\b/i.test(message)) {
      capabilities.push('code');
    }

    // Search-related keywords
    if (/\b(search|find|look up|google|what is|who is|when|where)\b/i.test(message)) {
      capabilities.push('search');
    }

    // Browser-related keywords
    if (/\b(browser|website|url|click|navigate|page|screenshot)\b/i.test(message)) {
      capabilities.push('browser');
    }

    // System-related keywords
    if (/\b(open|launch|run|execute|command|app|application|file|folder)\b/i.test(message)) {
      capabilities.push('system');
    }

    // Integration-related keywords
    if (/\b(spotify|notion|slack|discord|email|calendar|smart home|light)\b/i.test(message)) {
      capabilities.push('integration');
    }

    return [...new Set(capabilities)];
  }

  /**
   * Route with auto-detected capabilities
   */
  autoRoute(
    message: string,
    channelId?: string,
    userId?: string,
    preferredAgent?: string
  ): RoutingResult | null {
    const capabilities = this.detectCapabilities(message);
    
    return this.route({
      message,
      channelId,
      userId,
      capabilities,
      preferredAgent
    });
  }
}

// Singleton instance
let agentRouterInstance: AgentRouter | null = null;

export function getAgentRouter(): AgentRouter {
  if (!agentRouterInstance) {
    agentRouterInstance = new AgentRouter();
  }
  return agentRouterInstance;
}

export default AgentRouter;
