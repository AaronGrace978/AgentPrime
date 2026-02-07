/**
 * AgentPrime - Context Awareness Engine
 * Detects user activity and adapts responses based on context
 * Ported from ActivatePrime's context_awareness_engine.py
 */

interface UserActivity {
  type: 'coding' | 'chatting' | 'working' | 'stressed' | 'learning' | 'debugging' | 'designing';
  confidence: number;
  indicators: string[];
}

interface ConversationMode {
  mode: 'casual' | 'technical' | 'tutorial' | 'debugging' | 'planning' | 'implementation';
  confidence: number;
  context: string[];
}

interface TimeContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  isWeekend: boolean;
  workHours: boolean;
}

interface ContextAnalysis {
  userActivity: UserActivity;
  conversationMode: ConversationMode;
  timeContext: TimeContext;
  stressLevel: number;
  emotionalState: 'neutral' | 'positive' | 'negative' | 'frustrated' | 'excited';
  adaptation: ContextAdaptation;
}

interface ContextAdaptation {
  tone: 'casual' | 'professional' | 'encouraging' | 'methodical' | 'concise';
  style: 'conversational' | 'technical' | 'tutorial' | 'debug' | 'planning';
  verbosity: 'brief' | 'normal' | 'detailed';
  suggestions: string[];
}

export class ContextAwarenessEngine {
  private activityPatterns: { [key: string]: { keywords: string[], weight: number } } = {
    coding: {
      keywords: ['function', 'class', 'variable', 'code', 'implement', 'create', 'write', 'build'],
      weight: 1.0
    },
    debugging: {
      keywords: ['error', 'bug', 'fix', 'issue', 'problem', 'debug', 'trace', 'exception'],
      weight: 1.0
    },
    chatting: {
      keywords: ['hello', 'hi', 'thanks', 'please', 'how are you', 'what do you think'],
      weight: 0.8
    },
    working: {
      keywords: ['task', 'project', 'deadline', 'complete', 'finish', 'work on', 'implement'],
      weight: 0.9
    },
    stressed: {
      keywords: ['urgent', 'important', 'critical', 'asap', 'deadline', 'pressure', 'stuck'],
      weight: 1.0
    },
    learning: {
      keywords: ['learn', 'understand', 'explain', 'tutorial', 'guide', 'how to', 'teach'],
      weight: 0.9
    },
    designing: {
      keywords: ['design', 'architecture', 'structure', 'pattern', 'component', 'ui', 'ux'],
      weight: 0.9
    }
  };

  private conversationModePatterns: { [key: string]: { keywords: string[], weight: number } } = {
    technical: {
      keywords: ['api', 'database', 'server', 'framework', 'library', 'async', 'typescript'],
      weight: 1.0
    },
    tutorial: {
      keywords: ['explain', 'how to', 'guide', 'step by step', 'tutorial', 'learn', 'understand'],
      weight: 1.0
    },
    debugging: {
      keywords: ['error', 'bug', 'fix', 'debug', 'trace', 'exception', 'issue', 'problem'],
      weight: 1.0
    },
    planning: {
      keywords: ['plan', 'design', 'architecture', 'structure', 'organize', 'strategy'],
      weight: 1.0
    },
    implementation: {
      keywords: ['implement', 'code', 'write', 'create', 'build', 'develop', 'function'],
      weight: 0.9
    },
    casual: {
      keywords: ['hey', 'hi', 'thanks', 'cool', 'nice', 'awesome', 'great'],
      weight: 0.7
    }
  };

  /**
   * Analyze complete context to understand user state and intent
   */
  async analyzeContext(
    userInput: string,
    timeOfDay?: string,
    recentMood?: string,
    conversationHistory?: string[]
  ): Promise<ContextAnalysis> {
    const userActivity = this.detectUserActivity(userInput, conversationHistory);
    const conversationMode = this.detectConversationMode(userInput, conversationHistory);
    const timeContext = this.analyzeTimeContext(timeOfDay);
    const stressLevel = this.calculateStressLevel(userInput, conversationHistory);
    const emotionalState = this.detectEmotionalState(userInput, recentMood);
    const adaptation = this.generateAdaptation(userActivity, conversationMode, stressLevel, emotionalState);

    return {
      userActivity,
      conversationMode,
      timeContext,
      stressLevel,
      emotionalState,
      adaptation
    };
  }

  /**
   * Detect what the user is currently doing
   */
  private detectUserActivity(input: string, history?: string[]): UserActivity {
    const inputLower = input.toLowerCase();
    const activityScores: { [key: string]: { score: number, indicators: string[] } } = {};

    // Initialize scores
    Object.keys(this.activityPatterns).forEach(activity => {
      activityScores[activity] = { score: 0, indicators: [] };
    });

    // Score current input
    for (const [activity, pattern] of Object.entries(this.activityPatterns)) {
      for (const keyword of pattern.keywords) {
        if (inputLower.includes(keyword)) {
          activityScores[activity].score += pattern.weight;
          activityScores[activity].indicators.push(keyword);
        }
      }
    }

    // Consider conversation history for context
    if (history && history.length > 0) {
      const recentHistory = history.slice(-5).join(' ').toLowerCase();
      for (const [activity, pattern] of Object.entries(this.activityPatterns)) {
        for (const keyword of pattern.keywords) {
          if (recentHistory.includes(keyword)) {
            activityScores[activity].score += pattern.weight * 0.5; // History gets half weight
            if (!activityScores[activity].indicators.includes(keyword)) {
              activityScores[activity].indicators.push(keyword);
            }
          }
        }
      }
    }

    // Find highest scoring activity
    let maxActivity = 'working';
    let maxScore = 0;

    for (const [activity, data] of Object.entries(activityScores)) {
      if (data.score > maxScore) {
        maxScore = data.score;
        maxActivity = activity;
      }
    }

    const confidence = Math.min(1.0, maxScore / 3.0); // Normalize confidence

    return {
      type: maxActivity as UserActivity['type'],
      confidence,
      indicators: activityScores[maxActivity].indicators
    };
  }

  /**
   * Detect the current conversation mode
   */
  private detectConversationMode(input: string, history?: string[]): ConversationMode {
    const inputLower = input.toLowerCase();
    const modeScores: { [key: string]: { score: number, context: string[] } } = {};

    // Initialize scores
    Object.keys(this.conversationModePatterns).forEach(mode => {
      modeScores[mode] = { score: 0, context: [] };
    });

    // Score current input
    for (const [mode, pattern] of Object.entries(this.conversationModePatterns)) {
      for (const keyword of pattern.keywords) {
        if (inputLower.includes(keyword)) {
          modeScores[mode].score += pattern.weight;
          modeScores[mode].context.push(keyword);
        }
      }
    }

    // Consider conversation history
    if (history && history.length > 0) {
      const recentHistory = history.slice(-3).join(' ').toLowerCase();
      for (const [mode, pattern] of Object.entries(this.conversationModePatterns)) {
        for (const keyword of pattern.keywords) {
          if (recentHistory.includes(keyword)) {
            modeScores[mode].score += pattern.weight * 0.7;
            if (!modeScores[mode].context.includes(keyword)) {
              modeScores[mode].context.push(keyword);
            }
          }
        }
      }
    }

    // Find highest scoring mode
    let maxMode = 'casual';
    let maxScore = 0;

    for (const [mode, data] of Object.entries(modeScores)) {
      if (data.score > maxScore) {
        maxScore = data.score;
        maxMode = mode;
      }
    }

    const confidence = Math.min(1.0, maxScore / 2.5);

    return {
      mode: maxMode as ConversationMode['mode'],
      confidence,
      context: modeScores[maxMode].context
    };
  }

  /**
   * Analyze time context
   */
  private analyzeTimeContext(timeOfDay?: string): TimeContext {
    const now = new Date();
    const hour = timeOfDay ? parseInt(timeOfDay.split(':')[0]) : now.getHours();

    let timeOfDayCategory: TimeContext['timeOfDay'];
    if (hour >= 6 && hour < 12) timeOfDayCategory = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDayCategory = 'afternoon';
    else if (hour >= 17 && hour < 22) timeOfDayCategory = 'evening';
    else timeOfDayCategory = 'night';

    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const workHours = hour >= 9 && hour <= 17 && !isWeekend;

    return {
      timeOfDay: timeOfDayCategory,
      dayOfWeek,
      isWeekend,
      workHours
    };
  }

  /**
   * Calculate stress level from input and context
   */
  private calculateStressLevel(input: string, history?: string[]): number {
    const inputLower = input.toLowerCase();
    let stressScore = 0;

    const stressIndicators = [
      { word: 'urgent', weight: 1.0 },
      { word: 'deadline', weight: 0.9 },
      { word: 'critical', weight: 0.9 },
      { word: 'asap', weight: 0.8 },
      { word: 'stuck', weight: 0.7 },
      { word: 'problem', weight: 0.6 },
      { word: 'issue', weight: 0.5 },
      { word: 'error', weight: 0.4 },
      { word: 'help', weight: 0.3 },
      { word: 'please', weight: 0.2 }
    ];

    // Count stress indicators in current input
    for (const indicator of stressIndicators) {
      if (inputLower.includes(indicator.word)) {
        stressScore += indicator.weight;
      }
    }

    // Consider urgency markers
    const urgencyMarkers = ['!', '!!!', 'urgent', 'immediately', 'right now'];
    for (const marker of urgencyMarkers) {
      if (inputLower.includes(marker)) {
        stressScore += 0.3;
      }
    }

    // Consider recent history for stress patterns
    if (history && history.length > 0) {
      const recentHistory = history.slice(-3).join(' ').toLowerCase();
      for (const indicator of stressIndicators) {
        if (recentHistory.includes(indicator.word)) {
          stressScore += indicator.weight * 0.4; // History gets reduced weight
        }
      }
    }

    // Consider time pressure
    const now = new Date();
    const isEndOfDay = now.getHours() >= 16;
    const isFriday = now.getDay() === 5;
    if (isEndOfDay || isFriday) {
      stressScore += 0.2; // Slight increase for time pressure
    }

    return Math.min(1.0, stressScore / 3.0); // Normalize to 0-1
  }

  /**
   * Detect emotional state
   */
  private detectEmotionalState(input: string, recentMood?: string): ContextAnalysis['emotionalState'] {
    const inputLower = input.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;

    const positiveIndicators = [
      'great', 'awesome', 'excellent', 'perfect', 'amazing', 'fantastic',
      'good', 'nice', 'cool', 'love', 'happy', 'excited', '😊', '❤️'
    ];

    const negativeIndicators = [
      'terrible', 'awful', 'horrible', 'bad', 'hate', 'sad', 'angry',
      'frustrated', 'annoyed', 'disappointed', '😢', '😠', '😡'
    ];

    // Score current input
    for (const word of positiveIndicators) {
      if (inputLower.includes(word)) positiveScore += 1;
    }
    for (const word of negativeIndicators) {
      if (inputLower.includes(word)) negativeScore += 1;
    }

    // Consider recent mood if provided
    if (recentMood) {
      if (positiveIndicators.some(word => recentMood.toLowerCase().includes(word))) {
        positiveScore += 0.5;
      }
      if (negativeIndicators.some(word => recentMood.toLowerCase().includes(word))) {
        negativeScore += 0.5;
      }
    }

    // Determine emotional state
    if (positiveScore > negativeScore + 0.5) return 'positive';
    if (negativeScore > positiveScore + 0.5) return 'negative';
    if (inputLower.includes('frustrated') || inputLower.includes('stuck')) return 'frustrated';
    if (inputLower.includes('excited') || inputLower.includes('amazing')) return 'excited';

    return 'neutral';
  }

  /**
   * Generate adaptation recommendations based on context
   */
  private generateAdaptation(
    activity: UserActivity,
    conversationMode: ConversationMode,
    stressLevel: number,
    emotionalState: ContextAnalysis['emotionalState']
  ): ContextAdaptation {
    let tone: ContextAdaptation['tone'] = 'casual';
    let style: ContextAdaptation['style'] = 'conversational';
    let verbosity: ContextAdaptation['verbosity'] = 'normal';
    const suggestions: string[] = [];

    // Adapt based on activity
    switch (activity.type) {
      case 'coding':
        tone = 'methodical';
        style = 'technical';
        verbosity = 'detailed';
        suggestions.push('Provide specific code examples');
        break;
      case 'debugging':
        tone = 'methodical';
        style = 'debug';
        verbosity = 'detailed';
        suggestions.push('Focus on error analysis and solutions');
        break;
      case 'stressed':
        tone = 'encouraging';
        verbosity = 'brief';
        suggestions.push('Be reassuring and provide clear steps');
        break;
      case 'learning':
        tone = 'encouraging';
        style = 'tutorial';
        verbosity = 'detailed';
        suggestions.push('Explain concepts thoroughly with examples');
        break;
      case 'designing':
        tone = 'professional';
        style = 'planning';
        verbosity = 'normal';
        suggestions.push('Focus on architecture and design patterns');
        break;
    }

    // Adapt based on conversation mode
    switch (conversationMode.mode) {
      case 'technical':
        style = 'technical';
        verbosity = 'detailed';
        break;
      case 'tutorial':
        style = 'tutorial';
        verbosity = 'detailed';
        break;
      case 'debugging':
        style = 'debug';
        tone = 'methodical';
        break;
      case 'planning':
        style = 'planning';
        tone = 'professional';
        break;
    }

    // Adapt based on stress level
    if (stressLevel > 0.7) {
      verbosity = 'brief';
      suggestions.push('Provide immediate, actionable solutions');
    }

    // Adapt based on emotional state
    switch (emotionalState) {
      case 'frustrated':
        tone = 'encouraging';
        suggestions.push('Acknowledge frustration and provide hope');
        break;
      case 'excited':
        tone = 'encouraging';
        suggestions.push('Match enthusiasm and build on excitement');
        break;
      case 'negative':
        tone = 'encouraging';
        suggestions.push('Be empathetic and solution-focused');
        break;
    }

    return {
      tone,
      style,
      verbosity,
      suggestions
    };
  }

  /**
   * Get quick context summary for logging/debugging
   */
  getContextSummary(analysis: ContextAnalysis): string {
    return `Activity: ${analysis.userActivity.type} (${Math.round(analysis.userActivity.confidence * 100)}%), ` +
           `Mode: ${analysis.conversationMode.mode} (${Math.round(analysis.conversationMode.confidence * 100)}%), ` +
           `Stress: ${Math.round(analysis.stressLevel * 100)}%, ` +
           `Emotion: ${analysis.emotionalState}, ` +
           `Adaptation: ${analysis.adaptation.tone}/${analysis.adaptation.style}/${analysis.adaptation.verbosity}`;
  }

  /**
   * Get suggested response style for AI model
   */
  getResponseGuidance(analysis: ContextAnalysis): string {
    let guidance = `Respond in a ${analysis.adaptation.tone} tone with ${analysis.adaptation.style} style. `;

    if (analysis.adaptation.verbosity === 'brief') {
      guidance += 'Keep responses concise and focused on immediate solutions. ';
    } else if (analysis.adaptation.verbosity === 'detailed') {
      guidance += 'Provide comprehensive explanations with examples. ';
    }

    if (analysis.userActivity.type === 'stressed') {
      guidance += 'Acknowledge urgency and provide clear, actionable steps. ';
    }

    if (analysis.emotionalState === 'frustrated') {
      guidance += 'Be empathetic and encouraging. ';
    }

    if (analysis.adaptation.suggestions.length > 0) {
      guidance += 'Suggestions: ' + analysis.adaptation.suggestions.join(', ') + '. ';
    }

    return guidance;
  }
}

// Singleton instance
let contextAwarenessEngineInstance: ContextAwarenessEngine | null = null;

export function getContextAwarenessEngine(): ContextAwarenessEngine {
  if (!contextAwarenessEngineInstance) {
    contextAwarenessEngineInstance = new ContextAwarenessEngine();
  }
  return contextAwarenessEngineInstance;
}
