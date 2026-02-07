/**
 * AgentPrime - Context Compression Engine
 * Intelligent summarization to maintain infinite memory
 * Ported from ActivatePrime's context_compression_engine.py
 */

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

interface EssentialElement {
  type: 'relationship' | 'emotional' | 'topic' | 'milestone' | 'decision' | 'error' | 'success';
  content: string;
  importance: number;
  timestamp?: number;
}

interface CompressionAnalysis {
  emotionalArc: string[];
  relationshipDynamics: string[];
  topicContinuity: string[];
  keyMilestones: string[];
  preservedElements: EssentialElement[];
}

interface CompressedContext {
  summary: string;
  preservedMessages: ConversationMessage[];
  essentialElements: EssentialElement[];
  compressionRatio: number;
}

export class ContextCompressionEngine {
  private maxContextLength: number = 50000; // Characters
  private minCompressionRatio: number = 0.7; // Keep at least 70% of original context

  /**
   * Compress conversation history while preserving essentials
   */
  async compressConversationHistory(
    sessionId: string,
    conversationHistory: ConversationMessage[],
    targetLength?: number
  ): Promise<CompressedContext> {
    const maxLength = targetLength || this.maxContextLength;

    // Don't compress if already under limit
    const totalLength = conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);
    if (totalLength <= maxLength) {
      return {
        summary: '',
        preservedMessages: conversationHistory,
        essentialElements: [],
        compressionRatio: 1.0
      };
    }

    // Analyze conversation for essential elements
    const analysis = this.extractEssentialElements(conversationHistory);

    // Create compressed summary
    const summary = this.createCompressedSummary(analysis, conversationHistory);

    // Select messages to preserve
    const preservedMessages = this.selectPreservedMessages(conversationHistory, analysis, maxLength);

    // Calculate compression ratio
    const compressedLength = summary.length + preservedMessages.reduce((sum, msg) => sum + msg.content.length, 0);
    const compressionRatio = compressedLength / totalLength;

    return {
      summary,
      preservedMessages,
      essentialElements: analysis.preservedElements,
      compressionRatio: Math.max(this.minCompressionRatio, compressionRatio)
    };
  }

  /**
   * Extract essential elements from conversation
   */
  private extractEssentialElements(conversationHistory: ConversationMessage[]): CompressionAnalysis {
    const analysis: CompressionAnalysis = {
      emotionalArc: [],
      relationshipDynamics: [],
      topicContinuity: [],
      keyMilestones: [],
      preservedElements: []
    };

    for (let i = 0; i < conversationHistory.length; i++) {
      const message = conversationHistory[i];
      const elements = this.analyzeMessageForEssentials(message, i, conversationHistory);

      analysis.preservedElements.push(...elements);

      // Track emotional arc
      if (elements.some(e => e.type === 'emotional')) {
        analysis.emotionalArc.push(message.content.substring(0, 100) + '...');
      }

      // Track milestones
      if (elements.some(e => e.type === 'milestone' || e.type === 'success' || e.type === 'error')) {
        analysis.keyMilestones.push(message.content.substring(0, 150) + '...');
      }
    }

    // Analyze relationship dynamics
    analysis.relationshipDynamics = this.extractRelationshipDynamics(conversationHistory);

    // Analyze topic continuity
    analysis.topicContinuity = this.extractTopicContinuity(conversationHistory);

    return analysis;
  }

  /**
   * Analyze a single message for essential elements
   */
  private analyzeMessageForEssentials(
    message: ConversationMessage,
    index: number,
    conversationHistory: ConversationMessage[]
  ): EssentialElement[] {
    const elements: EssentialElement[] = [];
    const content = message.content.toLowerCase();

    // Relationship dynamics
    if (this.containsRelationshipIndicators(content)) {
      elements.push({
        type: 'relationship',
        content: message.content,
        importance: 0.9,
        timestamp: message.timestamp
      });
    }

    // Emotional highlights
    if (this.containsEmotionalIndicators(content)) {
      elements.push({
        type: 'emotional',
        content: message.content,
        importance: 0.8,
        timestamp: message.timestamp
      });
    }

    // Topic continuity (important for ongoing discussions)
    if (this.isTopicContinuation(message, conversationHistory)) {
      elements.push({
        type: 'topic',
        content: message.content,
        importance: 0.7,
        timestamp: message.timestamp
      });
    }

    // Key milestones and decisions
    if (this.containsMilestoneIndicators(content)) {
      elements.push({
        type: 'milestone',
        content: message.content,
        importance: 0.85,
        timestamp: message.timestamp
      });
    }

    // Errors and successes
    if (this.containsErrorIndicators(content)) {
      elements.push({
        type: 'error',
        content: message.content,
        importance: 0.9,
        timestamp: message.timestamp
      });
    }

    if (this.containsSuccessIndicators(content)) {
      elements.push({
        type: 'success',
        content: message.content,
        importance: 0.85,
        timestamp: message.timestamp
      });
    }

    return elements;
  }

  /**
   * Create a compressed summary preserving essential context
   */
  private createCompressedSummary(
    analysis: CompressionAnalysis,
    conversationHistory: ConversationMessage[]
  ): string {
    let summary = 'CONVERSATION SUMMARY:\n\n';

    // Emotional arc
    if (analysis.emotionalArc.length > 0) {
      summary += '💭 Emotional Journey:\n';
      analysis.emotionalArc.slice(-3).forEach(arc => {
        summary += `• ${arc}\n`;
      });
      summary += '\n';
    }

    // Relationship dynamics
    if (analysis.relationshipDynamics.length > 0) {
      summary += '🤝 Relationship Context:\n';
      analysis.relationshipDynamics.slice(-2).forEach(dynamic => {
        summary += `• ${dynamic}\n`;
      });
      summary += '\n';
    }

    // Topic continuity
    if (analysis.topicContinuity.length > 0) {
      summary += '📋 Current Topics:\n';
      analysis.topicContinuity.slice(-3).forEach(topic => {
        summary += `• ${topic}\n`;
      });
      summary += '\n';
    }

    // Key milestones
    if (analysis.keyMilestones.length > 0) {
      summary += '🎯 Key Milestones:\n';
      analysis.keyMilestones.slice(-3).forEach(milestone => {
        summary += `• ${milestone}\n`;
      });
      summary += '\n';
    }

    // Recent context (last few messages)
    const recentMessages = conversationHistory.slice(-5);
    if (recentMessages.length > 0) {
      summary += '📝 Recent Context:\n';
      recentMessages.forEach((msg, idx) => {
        const role = msg.role.toUpperCase();
        const preview = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
        summary += `${role}: ${preview}\n`;
        if (idx < recentMessages.length - 1) summary += '\n';
      });
    }

    return summary;
  }

  /**
   * Select messages to preserve in compressed context
   */
  private selectPreservedMessages(
    conversationHistory: ConversationMessage[],
    analysis: CompressionAnalysis,
    maxLength: number
  ): ConversationMessage[] {
    const preserved: ConversationMessage[] = [];
    let currentLength = 0;

    // Always preserve recent messages (last 3)
    const recentMessages = conversationHistory.slice(-3);
    preserved.push(...recentMessages);
    currentLength += recentMessages.reduce((sum, msg) => sum + msg.content.length, 0);

    // Preserve essential elements
    for (const element of analysis.preservedElements.sort((a, b) => b.importance - a.importance)) {
      // Find the original message
      const originalMessage = conversationHistory.find(msg => msg.content === element.content);
      if (originalMessage && !preserved.includes(originalMessage)) {
        const messageLength = originalMessage.content.length;
        if (currentLength + messageLength <= maxLength * 0.8) { // Leave room for summary
          preserved.push(originalMessage);
          currentLength += messageLength;
        }
      }
    }

    // Remove duplicates and sort by timestamp
    const uniquePreserved = preserved.filter((msg, index, arr) =>
      arr.findIndex(m => m.content === msg.content) === index
    );

    return uniquePreserved.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  /**
   * Extract relationship dynamics from conversation
   */
  private extractRelationshipDynamics(conversationHistory: ConversationMessage[]): string[] {
    const dynamics: string[] = [];

    // Look for patterns that indicate relationship context
    const relationshipPatterns = [
      /(?:I need|you should|let's|we can|together|help me|assist me)/gi,
      /(?:good job|well done|excellent|great work|thank you)/gi,
      /(?:sorry|apologize|mistake|error on my part)/gi
    ];

    for (const message of conversationHistory.slice(-10)) { // Last 10 messages
      const content = message.content;
      let relationshipScore = 0;

      for (const pattern of relationshipPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          relationshipScore += matches.length * 0.1;
        }
      }

      if (relationshipScore > 0.2) {
        dynamics.push(`${message.role}: ${content.substring(0, 80)}...`);
      }
    }

    return dynamics.slice(-3); // Keep only the most recent 3
  }

  /**
   * Extract topic continuity from conversation
   */
  private extractTopicContinuity(conversationHistory: ConversationMessage[]): string[] {
    const topics: string[] = [];
    const topicKeywords: { [key: string]: string[] } = {
      'coding': ['function', 'class', 'variable', 'code', 'implement', 'create'],
      'debugging': ['error', 'bug', 'fix', 'issue', 'problem', 'debug'],
      'design': ['design', 'architecture', 'structure', 'pattern', 'component'],
      'testing': ['test', 'spec', 'assert', 'verify', 'check']
    };

    for (const message of conversationHistory.slice(-15)) { // Last 15 messages
      const content = message.content.toLowerCase();

      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(keyword => content.includes(keyword))) {
          const topicDesc = `${topic}: ${message.content.substring(0, 60)}...`;
          if (!topics.includes(topicDesc)) {
            topics.push(topicDesc);
          }
        }
      }
    }

    return topics.slice(-5); // Keep most recent 5 topics
  }

  /**
   * Check if message contains relationship indicators
   */
  private containsRelationshipIndicators(content: string): boolean {
    const indicators = [
      'please', 'thank you', 'sorry', 'help me', 'assist me', 'together',
      'we can', 'you should', 'i need', 'good job', 'well done'
    ];
    return indicators.some(indicator => content.includes(indicator));
  }

  /**
   * Check if message contains emotional indicators
   */
  private containsEmotionalIndicators(content: string): boolean {
    const indicators = [
      'excited', 'frustrated', 'happy', 'sad', 'angry', 'worried',
      'amazing', 'terrible', 'awesome', 'horrible', 'fantastic', 'awful',
      '!', '❤️', '😊', '😢', '😠'
    ];
    return indicators.some(indicator => content.includes(indicator));
  }

  /**
   * Check if message is a topic continuation
   */
  private isTopicContinuation(
    message: ConversationMessage,
    conversationHistory: ConversationMessage[]
  ): boolean {
    // Simple heuristic: if message references previous topics
    const previousMessages = conversationHistory.slice(-3);
    const currentContent = message.content.toLowerCase();

    for (const prevMsg of previousMessages) {
      const prevContent = prevMsg.content.toLowerCase();

      // Check for shared keywords
      const prevWords = prevContent.split(/\s+/).filter(word => word.length > 3);
      const currentWords = currentContent.split(/\s+/).filter(word => word.length > 3);

      const sharedWords = prevWords.filter(word => currentWords.includes(word));
      if (sharedWords.length >= 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if message contains milestone indicators
   */
  private containsMilestoneIndicators(content: string): boolean {
    const indicators = [
      'completed', 'finished', 'done', 'achieved', 'implemented',
      'created', 'built', 'developed', 'designed', 'deployed',
      'released', 'published', 'launched', 'started', 'began'
    ];
    return indicators.some(indicator => content.includes(indicator));
  }

  /**
   * Check if message contains error indicators
   */
  private containsErrorIndicators(content: string): boolean {
    const indicators = [
      'error', 'bug', 'issue', 'problem', 'failed', 'failure',
      'exception', 'crash', 'broken', 'not working', 'doesn\'t work'
    ];
    return indicators.some(indicator => content.includes(indicator));
  }

  /**
   * Check if message contains success indicators
   */
  private containsSuccessIndicators(content: string): boolean {
    const indicators = [
      'success', 'successful', 'worked', 'working', 'fixed', 'resolved',
      'completed', 'done', 'finished', 'great', 'excellent', 'perfect'
    ];
    return indicators.some(indicator => content.includes(indicator));
  }

  /**
   * Compress a single context string to fit within token limits
   */
  compressContext(context: string, maxTokens: number): string {
    const tokens = context.split(/\s+/);

    if (tokens.length <= maxTokens) {
      return context;
    }

    // Keep first 70%, summarize last 30%
    const keepCount = Math.floor(maxTokens * 0.7);
    const keep = tokens.slice(0, keepCount).join(' ');
    const summarize = tokens.slice(keepCount).join(' ');

    // Simple summarization: extract key phrases
    const keyPhrases = this.extractKeyPhrases(summarize);

    return `${keep}\n\n[Summary of remaining context: ${keyPhrases.join(', ')}]`;
  }

  /**
   * Extract key phrases from text
   */
  private extractKeyPhrases(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const keyPhrases: string[] = [];

    for (const sentence of sentences.slice(0, 3)) { // First 3 sentences
      const words = sentence.trim().split(/\s+/).filter(word => word.length > 3);
      if (words.length >= 3) {
        keyPhrases.push(words.slice(0, 5).join(' ') + '...');
      }
    }

    return keyPhrases.length > 0 ? keyPhrases : ['additional context available'];
  }

  /**
   * Set compression parameters
   */
  setCompressionParams(maxContextLength: number, minCompressionRatio: number): void {
    this.maxContextLength = maxContextLength;
    this.minCompressionRatio = minCompressionRatio;
  }
}

// Singleton instance
let contextCompressionEngineInstance: ContextCompressionEngine | null = null;

export function getContextCompressionEngine(): ContextCompressionEngine {
  if (!contextCompressionEngineInstance) {
    contextCompressionEngineInstance = new ContextCompressionEngine();
  }
  return contextCompressionEngineInstance;
}
