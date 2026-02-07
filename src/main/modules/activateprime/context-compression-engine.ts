/**
 * ActivatePrime Context Compression Engine - Ported to TypeScript
 * Intelligent summarization to maintain infinite memory
 * Preserves essential context while reducing token usage
 */

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    emotional?: number;
    importance?: number;
    topic?: string;
    entities?: string[];
  };
}

export interface ConversationHistory {
  sessionId: string;
  messages: ConversationMessage[];
  createdAt: Date;
  lastActivity: Date;
}

export interface CompressionResult {
  summary: string;
  keyTopics: string[];
  emotionalArc: string;
  relationshipDynamics: string[];
  milestoneEvents: string[];
  compressedTokenCount: number;
  originalTokenCount: number;
  compressionRatio: number;
}

export interface EssentialElements {
  emotionalHighlights: string[];
  topicContinuity: string[];
  relationshipMoments: string[];
  relationshipDynamics?: string[];
  keyDecisions: string[];
  unresolvedQuestions: string[];
  personalityInsights: string[];
}

export class ContextCompressionEngine {
  private maxContextLength = 32000; // tokens
  private compressionThreshold = 0.8; // When to compress
  private essentialRetentionRatio = 0.7; // How much essential content to keep

  /**
   * Compress conversation history while preserving essentials
   */
  async compressConversationHistory(
    sessionId: string,
    conversationHistory: ConversationHistory
  ): Promise<CompressionResult> {
    const originalTokenCount = this.estimateTokenCount(
      conversationHistory.messages.map(m => m.content).join(' ')
    );

    // Analyze conversation for essential elements
    const analysis = this.analyzeConversation(conversationHistory);

    // Extract essential elements
    const essentialElements = this.extractEssentialElements(conversationHistory, analysis);

    // Generate compressed summary
    const summary = this.generateCompressedSummary(essentialElements, analysis);

    // Calculate compression metrics
    const compressedTokenCount = this.estimateTokenCount(summary);
    const compressionRatio = compressedTokenCount / originalTokenCount;

    return {
      summary,
      keyTopics: analysis.keyTopics,
      emotionalArc: analysis.emotionalArc,
      relationshipDynamics: analysis.relationshipDynamics,
      milestoneEvents: analysis.milestoneEvents,
      compressedTokenCount,
      originalTokenCount,
      compressionRatio
    };
  }

  /**
   * Analyze conversation structure and content
   */
  private analyzeConversation(history: ConversationHistory): {
    keyTopics: string[];
    emotionalArc: string;
    relationshipDynamics: string[];
    milestoneEvents: string[];
    conversationFlow: string[];
    participantRoles: Map<string, string>;
  } {
    const messages = history.messages;
    const keyTopics = new Set<string>();
    const emotionalStates: string[] = [];
    const relationshipDynamics: string[] = [];
    const milestoneEvents: string[] = [];
    const conversationFlow: string[] = [];

    // Analyze each message
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const content = message.content.toLowerCase();

      // Extract topics
      this.extractTopics(content).forEach(topic => keyTopics.add(topic));

      // Analyze emotional state
      const emotion = this.analyzeEmotionalState(content);
      emotionalStates.push(emotion);

      // Detect relationship dynamics
      if (i > 0) {
        const dynamic = this.analyzeRelationshipDynamic(messages[i-1], message);
        if (dynamic) relationshipDynamics.push(dynamic);
      }

      // Detect milestone events
      if (this.isMilestoneEvent(content)) {
        milestoneEvents.push(`[${message.timestamp.toISOString()}] ${message.content.substring(0, 100)}...`);
      }

      // Track conversation flow
      conversationFlow.push(`${message.role}: ${this.summarizeMessageIntent(content)}`);
    }

    // Determine emotional arc
    const emotionalArc = this.determineEmotionalArc(emotionalStates);

    return {
      keyTopics: Array.from(keyTopics),
      emotionalArc,
      relationshipDynamics,
      milestoneEvents,
      conversationFlow,
      participantRoles: new Map([['user', 'developer'], ['assistant', 'ai-assistant']])
    };
  }

  /**
   * Extract essential elements that must be preserved
   */
  private extractEssentialElements(
    history: ConversationHistory,
    analysis: { keyTopics: string[]; relationshipDynamics: string[] }
  ): EssentialElements {
    const messages = history.messages;

    // Emotional highlights (peak emotional moments)
    const emotionalHighlights = messages
      .filter(m => this.analyzeEmotionalState(m.content.toLowerCase()) !== 'neutral')
      .map(m => `[${m.timestamp.toISOString()}] ${m.role}: ${m.content.substring(0, 150)}...`)
      .slice(-5); // Keep last 5

    // Topic continuity (ongoing discussions)
    const topicContinuity = analysis.keyTopics.map(topic => {
      const relevantMessages = messages
        .filter(m => m.content.toLowerCase().includes(topic.toLowerCase()))
        .slice(-3); // Last 3 mentions of each topic
      return `${topic}: ${relevantMessages.map(m => m.content.substring(0, 100)).join(' | ')}`;
    });

    // Relationship moments (important interactions)
    const relationshipMoments = analysis.relationshipDynamics.slice(-3);

    // Key decisions (explicit decisions made)
    const keyDecisions = messages
      .filter(m => this.containsDecision(m.content))
      .map(m => `[${m.timestamp.toISOString()}] Decision: ${m.content.substring(0, 200)}...`)
      .slice(-5);

    // Unresolved questions (open-ended queries)
    const unresolvedQuestions = messages
      .filter(m => m.role === 'user' && this.isQuestion(m.content) && !this.hasAnswer(messages, m))
      .map(m => m.content.substring(0, 150) + '...')
      .slice(-3);

    // Personality insights (revealing preferences/behaviors)
    const personalityInsights = this.extractPersonalityInsights(messages);

    return {
      emotionalHighlights,
      topicContinuity,
      relationshipMoments,
      keyDecisions,
      unresolvedQuestions,
      personalityInsights
    };
  }

  /**
   * Generate compressed summary from essential elements
   */
  private generateCompressedSummary(
    elements: EssentialElements,
    analysis: any
  ): string {
    let summary = 'CONVERSATION SUMMARY:\n\n';

    // Key context
    summary += `TOPICS: ${analysis.keyTopics.join(', ')}\n`;
    summary += `EMOTIONAL ARC: ${analysis.emotionalArc}\n\n`;

    // Essential elements
    if (elements.emotionalHighlights.length > 0) {
      summary += 'EMOTIONAL HIGHLIGHTS:\n';
      elements.emotionalHighlights.forEach(highlight => {
        summary += `• ${highlight}\n`;
      });
      summary += '\n';
    }

    if (elements.keyDecisions.length > 0) {
      summary += 'KEY DECISIONS:\n';
      elements.keyDecisions.forEach(decision => {
        summary += `• ${decision}\n`;
      });
      summary += '\n';
    }

    if (elements.unresolvedQuestions.length > 0) {
      summary += 'OPEN QUESTIONS:\n';
      elements.unresolvedQuestions.forEach(question => {
        summary += `• ${question}\n`;
      });
      summary += '\n';
    }

    if (elements.topicContinuity.length > 0) {
      summary += 'TOPIC CONTINUITY:\n';
      elements.topicContinuity.forEach(topic => {
        summary += `• ${topic}\n`;
      });
      summary += '\n';
    }

    if (elements.relationshipDynamics && elements.relationshipDynamics.length > 0) {
      summary += 'RELATIONSHIP DYNAMICS:\n';
      elements.relationshipDynamics.forEach((dynamic: string) => {
        summary += `• ${dynamic}\n`;
      });
      summary += '\n';
    }

    if (elements.personalityInsights.length > 0) {
      summary += 'PERSONALITY INSIGHTS:\n';
      elements.personalityInsights.forEach(insight => {
        summary += `• ${insight}\n`;
      });
      summary += '\n';
    }

    return summary;
  }

  /**
   * Extract topics from message content
   */
  private extractTopics(content: string): string[] {
    const topics: string[] = [];
    const lines = content.split('\n');

    // Look for explicit topic markers
    for (const line of lines) {
      const topicMatch = line.match(/^(?:topic|about|regarding|on)\s*:\s*(.+)$/i);
      if (topicMatch) {
        topics.push(topicMatch[1].trim());
      }
    }

    // Extract technical terms and proper nouns
    const words = content.split(/\s+/);
    const technicalTerms = [
      'function', 'class', 'method', 'api', 'database', 'server', 'client',
      'component', 'module', 'package', 'library', 'framework', 'algorithm'
    ];

    for (const word of words) {
      if (word.length > 4 && technicalTerms.some(term => word.toLowerCase().includes(term))) {
        topics.push(word);
      }
    }

    return [...new Set(topics)].slice(0, 5);
  }

  /**
   * Analyze emotional state of message
   */
  private analyzeEmotionalState(content: string): string {
    const positiveWords = ['great', 'good', 'excellent', 'awesome', 'perfect', 'love', 'amazing'];
    const negativeWords = ['problem', 'error', 'bug', 'issue', 'fail', 'wrong', 'bad', 'hate', 'frustrated'];
    const urgentWords = ['urgent', 'important', 'critical', 'asap', 'now', 'immediately'];

    const positiveCount = positiveWords.filter(word => content.includes(word)).length;
    const negativeCount = negativeWords.filter(word => content.includes(word)).length;
    const urgentCount = urgentWords.filter(word => content.includes(word)).length;

    if (negativeCount > positiveCount) return 'negative';
    if (positiveCount > negativeCount) return 'positive';
    if (urgentCount > 0) return 'urgent';
    return 'neutral';
  }

  /**
   * Analyze relationship dynamic between messages
   */
  private analyzeRelationshipDynamic(prevMsg: ConversationMessage, currMsg: ConversationMessage): string | null {
    const prevContent = prevMsg.content.toLowerCase();
    const currContent = currMsg.content.toLowerCase();

    // Help-seeking patterns
    if (currMsg.role === 'user' && (currContent.includes('help') || currContent.includes('how do i'))) {
      return `${currMsg.role} seeking assistance`;
    }

    // Gratitude patterns
    if (currMsg.role === 'user' && (currContent.includes('thank') || currContent.includes('great help'))) {
      return `${currMsg.role} expressing gratitude`;
    }

    // Clarification requests
    if (currMsg.role === 'user' && (currContent.includes('what do you mean') || currContent.includes('clarify'))) {
      return `${currMsg.role} requesting clarification`;
    }

    // Problem resolution
    if (prevMsg.role === 'assistant' && currMsg.role === 'user' &&
        (currContent.includes('that worked') || currContent.includes('fixed'))) {
      return 'problem resolved successfully';
    }

    return null;
  }

  /**
   * Determine emotional arc of conversation
   */
  private determineEmotionalArc(emotions: string[]): string {
    if (emotions.length < 2) return 'stable';

    const firstHalf = emotions.slice(0, Math.floor(emotions.length / 2));
    const secondHalf = emotions.slice(Math.floor(emotions.length / 2));

    const firstNegative = firstHalf.filter(e => e === 'negative').length;
    const secondNegative = secondHalf.filter(e => e === 'negative').length;

    if (firstNegative > secondNegative) return 'improving';
    if (secondNegative > firstNegative) return 'declining';
    return 'stable';
  }

  /**
   * Check if message contains a decision
   */
  private containsDecision(content: string): boolean {
    const decisionWords = ['decide', 'choose', 'select', 'go with', 'use', 'implement', 'prefer'];
    return decisionWords.some(word => content.toLowerCase().includes(word));
  }

  /**
   * Check if message is a question
   */
  private isQuestion(content: string): boolean {
    return content.includes('?') || content.match(/^(what|how|why|when|where|who|can you|could you)/i) !== null;
  }

  /**
   * Check if a question has been answered
   */
  private hasAnswer(messages: ConversationMessage[], question: ConversationMessage): boolean {
    const questionIndex = messages.indexOf(question);
    const subsequentMessages = messages.slice(questionIndex + 1);

    // Look for assistant responses that seem to answer the question
    return subsequentMessages.some(msg => msg.role === 'assistant' && msg.content.length > 50);
  }

  /**
   * Extract personality insights from conversation
   */
  private extractPersonalityInsights(messages: ConversationMessage[]): string[] {
    const insights: string[] = [];
    const userMessages = messages.filter(m => m.role === 'user');

    // Analyze communication style
    const avgMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
    if (avgMessageLength > 500) insights.push('prefers detailed explanations');
    else if (avgMessageLength < 100) insights.push('prefers concise communication');

    // Analyze technical level
    const technicalTerms = ['function', 'class', 'api', 'database', 'algorithm', 'framework'];
    const technicalUsage = userMessages.filter(m =>
      technicalTerms.some(term => m.content.toLowerCase().includes(term))
    ).length / userMessages.length;

    if (technicalUsage > 0.5) insights.push('high technical proficiency');
    else if (technicalUsage < 0.2) insights.push('beginner to intermediate technical level');

    return insights;
  }

  /**
   * Check if message represents a milestone event
   */
  private isMilestoneEvent(content: string): boolean {
    const milestoneWords = [
      'completed', 'finished', 'done', 'success', 'achieved', 'implemented',
      'created', 'built', 'deployed', 'released', 'launched'
    ];
    return milestoneWords.some(word => content.toLowerCase().includes(word));
  }

  /**
   * Summarize message intent
   */
  private summarizeMessageIntent(content: string): string {
    if (content.includes('?')) return 'asking question';
    if (content.includes('thank')) return 'expressing gratitude';
    if (content.includes('help')) return 'requesting help';
    if (content.includes('error') || content.includes('problem')) return 'reporting issue';
    if (content.includes('create') || content.includes('add')) return 'requesting creation';
    if (content.includes('fix') || content.includes('change')) return 'requesting modification';
    return 'general communication';
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if compression is needed
   */
  shouldCompress(tokenCount: number): boolean {
    return tokenCount > this.maxContextLength * this.compressionThreshold;
  }

  /**
   * Get compression statistics
   */
  getStats(): {
    maxContextLength: number;
    compressionThreshold: number;
    essentialRetentionRatio: number;
  } {
    return {
      maxContextLength: this.maxContextLength,
      compressionThreshold: this.compressionThreshold,
      essentialRetentionRatio: this.essentialRetentionRatio
    };
  }
}

export default ContextCompressionEngine;
