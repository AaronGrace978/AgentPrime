/**
 * ActivatePrime Context Awareness Engine - Ported to TypeScript
 * Detects user activity patterns and adapts responses accordingly
 * Adapts behavior based on context, time, and user state
 */

export interface UserContext {
  activity: 'coding' | 'chatting' | 'working' | 'stressed' | 'learning' | 'debugging' | 'unknown';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
  stressLevel: 'low' | 'medium' | 'high';
  conversationMode: 'casual' | 'technical' | 'urgent' | 'educational';
  mood: 'positive' | 'neutral' | 'negative';
  focus: 'deep_work' | 'quick_task' | 'exploration' | 'problem_solving';
  recentTopics: string[];
  interactionHistory: InteractionEvent[];
}

export interface InteractionEvent {
  timestamp: Date;
  type: 'message' | 'file_open' | 'file_save' | 'error' | 'success' | 'search';
  content?: string;
  metadata?: any;
}

export interface ContextAnalysis {
  userContext: UserContext;
  suggestedTone: 'professional' | 'casual' | 'encouraging' | 'direct' | 'patient';
  suggestedStyle: 'concise' | 'detailed' | 'step_by_step' | 'overview' | 'code_focused';
  responsePriority: 'immediate' | 'normal' | 'low_priority';
  adaptationHints: string[];
}

interface ActivityPattern {
  activity: UserContext['activity'];
  triggers: string[];
  timeRanges: string[];
  indicators: string[];
  stressIndicators: string[];
}

export class ContextAwarenessEngine {
  private interactionHistory: InteractionEvent[] = [];
  private maxHistorySize = 100;
  private activityPatterns: ActivityPattern[] = [
    {
      activity: 'coding',
      triggers: ['function', 'class', 'import', 'const', 'let', 'var', 'def', 'public', 'private'],
      timeRanges: ['morning', 'afternoon'],
      indicators: ['implement', 'code', 'function', 'method', 'variable', 'debug'],
      stressIndicators: ['error', 'bug', 'fix', 'problem', 'issue']
    },
    {
      activity: 'debugging',
      triggers: ['error', 'bug', 'fix', 'problem', 'issue', 'debug', 'trace', 'exception'],
      timeRanges: ['all'],
      indicators: ['stack trace', 'error message', 'fix', 'debug'],
      stressIndicators: ['urgent', 'critical', 'breaking', 'failing']
    },
    {
      activity: 'learning',
      triggers: ['how', 'what', 'why', 'explain', 'understand', 'learn', 'tutorial'],
      timeRanges: ['morning', 'evening'],
      indicators: ['explain', 'understand', 'learn', 'tutorial', 'example'],
      stressIndicators: ['confused', 'stuck', 'lost']
    },
    {
      activity: 'working',
      triggers: ['task', 'project', 'deadline', 'meeting', 'schedule', 'plan'],
      timeRanges: ['morning', 'afternoon'],
      indicators: ['task', 'project', 'deadline', 'meeting'],
      stressIndicators: ['deadline', 'urgent', 'behind', 'pressure']
    },
    {
      activity: 'stressed',
      triggers: ['urgent', 'help', 'stuck', 'frustrated', 'angry', 'wtf', 'damn'],
      timeRanges: ['all'],
      indicators: ['urgent', 'help', 'stuck', 'frustrated'],
      stressIndicators: ['urgent', 'critical', 'deadline', 'broken']
    },
    {
      activity: 'chatting',
      triggers: ['hello', 'hi', 'hey', 'thanks', 'thank you', 'good', 'nice'],
      timeRanges: ['evening', 'night'],
      indicators: ['hello', 'hi', 'thanks', 'good'],
      stressIndicators: []
    }
  ];

  /**
   * Analyze current user context from input and recent activity
   */
  async analyzeContext(
    userInput: string,
    timeOfDay?: UserContext['timeOfDay'],
    recentMood?: 'positive' | 'neutral' | 'negative'
  ): Promise<ContextAnalysis> {
    const userContext = this.buildUserContext(userInput, timeOfDay, recentMood);

    const analysis: ContextAnalysis = {
      userContext,
      suggestedTone: this.determineSuggestedTone(userContext),
      suggestedStyle: this.determineSuggestedStyle(userContext),
      responsePriority: this.determineResponsePriority(userContext),
      adaptationHints: this.generateAdaptationHints(userContext)
    };

    // Record this interaction
    this.recordInteraction({
      timestamp: new Date(),
      type: 'message',
      content: userInput,
      metadata: { context: userContext }
    });

    return analysis;
  }

  /**
   * Build comprehensive user context
   */
  private buildUserContext(
    userInput: string,
    timeOfDay?: UserContext['timeOfDay'],
    recentMood?: 'positive' | 'neutral' | 'negative'
  ): UserContext {
    const input = userInput.toLowerCase();

    // Determine time context
    const currentTimeOfDay = timeOfDay || this.getCurrentTimeOfDay();
    const dayOfWeek = this.getCurrentDayOfWeek();

    // Detect activity based on input patterns
    const detectedActivity = this.detectActivity(input);

    // Analyze stress level
    const stressLevel = this.analyzeStressLevel(input, detectedActivity);

    // Determine conversation mode
    const conversationMode = this.determineConversationMode(input, detectedActivity);

    // Analyze mood
    const mood = recentMood || this.analyzeMood(input);

    // Determine focus level
    const focus = this.determineFocus(input, detectedActivity);

    // Extract recent topics
    const recentTopics = this.extractTopics(input);

    return {
      activity: detectedActivity,
      timeOfDay: currentTimeOfDay,
      dayOfWeek,
      stressLevel,
      conversationMode,
      mood,
      focus,
      recentTopics,
      interactionHistory: this.interactionHistory.slice(-10) // Last 10 interactions
    };
  }

  /**
   * Detect user activity from input patterns
   */
  private detectActivity(input: string): UserContext['activity'] {
    let bestMatch: UserContext['activity'] = 'unknown';
    let highestScore = 0;

    for (const pattern of this.activityPatterns) {
      let score = 0;

      // Check triggers
      for (const trigger of pattern.triggers) {
        if (input.includes(trigger)) score += 2;
      }

      // Check indicators
      for (const indicator of pattern.indicators) {
        if (input.includes(indicator)) score += 1;
      }

      // Check recent interaction history
      const recentActivities = this.interactionHistory
        .slice(-5)
        .filter(event => event.metadata?.activity)
        .map(event => event.metadata.activity);

      if (recentActivities.includes(pattern.activity)) score += 3;

      if (score > highestScore) {
        highestScore = score;
        bestMatch = pattern.activity;
      }
    }

    return highestScore > 0 ? bestMatch : 'chatting';
  }

  /**
   * Analyze stress level from input and context
   */
  private analyzeStressLevel(input: string, activity: UserContext['activity']): 'low' | 'medium' | 'high' {
    let stressScore = 0;

    // Check for stress indicators in input
    const stressWords = [
      'urgent', 'critical', 'deadline', 'broken', 'failing', 'stuck', 'frustrated',
      'angry', 'wtf', 'damn', 'help', 'please', 'immediately', 'asap'
    ];

    for (const word of stressWords) {
      if (input.includes(word)) stressScore += 2;
    }

    // Activity-based stress
    if (activity === 'debugging' || activity === 'stressed') stressScore += 3;
    if (activity === 'working') stressScore += 1;

    // Time-based stress (end of day/week might be more stressful)
    const now = new Date();
    if (now.getHours() >= 17 || now.getDay() === 5) stressScore += 1;

    // Recent error history
    const recentErrors = this.interactionHistory
      .filter(event => event.type === 'error')
      .filter(event => Date.now() - event.timestamp.getTime() < 3600000) // Last hour
      .length;

    stressScore += recentErrors * 2;

    if (stressScore >= 8) return 'high';
    if (stressScore >= 4) return 'medium';
    return 'low';
  }

  /**
   * Determine conversation mode based on input and activity
   */
  private determineConversationMode(
    input: string,
    activity: UserContext['activity']
  ): UserContext['conversationMode'] {
    // Check for urgent language
    if (input.includes('urgent') || input.includes('asap') || input.includes('immediately')) {
      return 'urgent';
    }

    // Technical content
    if (activity === 'coding' || activity === 'debugging') {
      return 'technical';
    }

    // Learning/educational
    if (activity === 'learning' || input.includes('explain') || input.includes('how')) {
      return 'educational';
    }

    // Casual conversation
    if (activity === 'chatting' || input.includes('hello') || input.includes('thanks')) {
      return 'casual';
    }

    return 'technical'; // Default for coding environment
  }

  /**
   * Analyze mood from input
   */
  private analyzeMood(input: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['good', 'great', 'awesome', 'excellent', 'perfect', 'love', 'amazing', 'thanks'];
    const negativeWords = ['bad', 'wrong', 'error', 'problem', 'hate', 'frustrated', 'angry', 'stuck'];

    const positiveCount = positiveWords.filter(word => input.includes(word)).length;
    const negativeCount = negativeWords.filter(word => input.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Determine focus level based on input and activity
   */
  private determineFocus(input: string, activity: UserContext['activity']): UserContext['focus'] {
    // Quick tasks (short, specific requests)
    if (input.length < 100 && (input.includes('run') || input.includes('check') || input.includes('show'))) {
      return 'quick_task';
    }

    // Deep work (complex, multi-step tasks)
    if (activity === 'coding' || input.includes('implement') || input.includes('build') || input.length > 500) {
      return 'deep_work';
    }

    // Problem solving (debugging, fixing issues)
    if (activity === 'debugging' || input.includes('fix') || input.includes('solve')) {
      return 'problem_solving';
    }

    // Exploration (learning, discovering)
    if (activity === 'learning' || input.includes('explore') || input.includes('find')) {
      return 'exploration';
    }

    return 'quick_task';
  }

  /**
   * Extract topics from input
   */
  private extractTopics(input: string): string[] {
    const words = input.split(/\s+/);
    const topics: string[] = [];

    // Extract technical terms
    const technicalTerms = [
      'function', 'class', 'method', 'api', 'database', 'server', 'client',
      'component', 'module', 'error', 'bug', 'fix', 'test', 'deploy'
    ];

    for (const word of words) {
      if (technicalTerms.includes(word.toLowerCase()) && !topics.includes(word.toLowerCase())) {
        topics.push(word.toLowerCase());
      }
    }

    return topics.slice(0, 5);
  }

  /**
   * Determine suggested tone based on context
   */
  private determineSuggestedTone(context: UserContext): ContextAnalysis['suggestedTone'] {
    if (context.stressLevel === 'high' || context.activity === 'stressed') {
      return 'encouraging';
    }

    if (context.timeOfDay === 'evening' || context.timeOfDay === 'night') {
      return 'casual';
    }

    if (context.activity === 'learning' || context.conversationMode === 'educational') {
      return 'patient';
    }

    if (context.conversationMode === 'urgent') {
      return 'direct';
    }

    return 'professional';
  }

  /**
   * Determine suggested response style
   */
  private determineSuggestedStyle(context: UserContext): ContextAnalysis['suggestedStyle'] {
    if (context.focus === 'quick_task') {
      return 'concise';
    }

    if (context.activity === 'coding' || context.conversationMode === 'technical') {
      return 'code_focused';
    }

    if (context.activity === 'learning' || context.conversationMode === 'educational') {
      return 'step_by_step';
    }

    if (context.focus === 'deep_work') {
      return 'detailed';
    }

    return 'overview';
  }

  /**
   * Determine response priority
   */
  private determineResponsePriority(context: UserContext): ContextAnalysis['responsePriority'] {
    if (context.stressLevel === 'high' || context.conversationMode === 'urgent') {
      return 'immediate';
    }

    if (context.focus === 'quick_task') {
      return 'immediate';
    }

    if (context.activity === 'debugging') {
      return 'immediate';
    }

    return 'normal';
  }

  /**
   * Generate adaptation hints for the AI
   */
  private generateAdaptationHints(context: UserContext): string[] {
    const hints: string[] = [];

    if (context.stressLevel === 'high') {
      hints.push('Be reassuring and offer step-by-step guidance');
    }

    if (context.activity === 'learning') {
      hints.push('Provide examples and explain concepts clearly');
    }

    if (context.conversationMode === 'technical') {
      hints.push('Use technical terminology and focus on implementation details');
    }

    if (context.focus === 'quick_task') {
      hints.push('Provide direct, actionable responses without unnecessary explanation');
    }

    if (context.timeOfDay === 'evening') {
      hints.push('Keep responses concise and professional');
    }

    if (context.mood === 'negative') {
      hints.push('Be empathetic and focus on solutions rather than problems');
    }

    return hints;
  }

  /**
   * Record interaction for future context analysis
   */
  private recordInteraction(event: InteractionEvent): void {
    this.interactionHistory.push(event);

    // Keep history within limits
    if (this.interactionHistory.length > this.maxHistorySize) {
      this.interactionHistory = this.interactionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get current time of day
   */
  private getCurrentTimeOfDay(): UserContext['timeOfDay'] {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Get current day type
   */
  private getCurrentDayOfWeek(): UserContext['dayOfWeek'] {
    const day = new Date().getDay();
    return (day === 0 || day === 6) ? 'weekend' : 'weekday';
  }

  /**
   * Get context statistics
   */
  getStats(): {
    totalInteractions: number;
    activityBreakdown: Record<string, number>;
    stressLevels: Record<string, number>;
    commonTopics: string[];
  } {
    const activityBreakdown: Record<string, number> = {};
    const stressLevels: Record<string, number> = {};
    const allTopics: string[] = [];

    for (const event of this.interactionHistory) {
      if (event.metadata?.activity) {
        activityBreakdown[event.metadata.activity] = (activityBreakdown[event.metadata.activity] || 0) + 1;
      }

      if (event.metadata?.stressLevel) {
        stressLevels[event.metadata.stressLevel] = (stressLevels[event.metadata.stressLevel] || 0) + 1;
      }

      if (event.metadata?.recentTopics) {
        allTopics.push(...event.metadata.recentTopics);
      }
    }

    const topicCounts: Record<string, number> = {};
    for (const topic of allTopics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }

    const commonTopics = Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);

    return {
      totalInteractions: this.interactionHistory.length,
      activityBreakdown,
      stressLevels,
      commonTopics
    };
  }

  /**
   * Clear interaction history
   */
  clearHistory(): void {
    this.interactionHistory = [];
  }
}

export default ContextAwarenessEngine;
