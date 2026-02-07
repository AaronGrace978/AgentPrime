/**
 * Matrix Mode Memory Compaction
 * Context compression for long conversations to manage token limits
 * 
 * Enhanced with:
 * - Structured summaries (topics, decisions, entities)
 * - Importance-weighted retention
 * - Episodic memory for key moments
 * - Semantic clustering
 */

import { MemoryEntry, CompactionResult } from './types';
import { MemoryStore, getMemoryStore } from './memory-store';

// Simple token estimation (rough approximation)
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Structured summary format
 */
export interface StructuredSummary {
  /** Main topics discussed */
  topics: string[];
  /** Key decisions or conclusions reached */
  decisions: string[];
  /** Important entities mentioned (files, functions, etc.) */
  entities: Array<{ type: string; name: string; context?: string }>;
  /** Action items or pending tasks */
  actionItems: string[];
  /** Key facts or information shared */
  facts: string[];
  /** Emotional/sentiment context */
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  /** Time span covered */
  timeSpan: { start: number; end: number };
  /** Original message count */
  messageCount: number;
}

/**
 * Importance score for a message
 */
interface ImportanceScore {
  score: number;
  factors: string[];
}

export interface CompactionStrategy {
  name: string;
  compact(entries: MemoryEntry[]): Promise<{ summary: string; tokensReduced: number; structured?: StructuredSummary }>;
}

/**
 * Importance scoring for messages
 */
function scoreImportance(entry: MemoryEntry): ImportanceScore {
  const factors: string[] = [];
  let score = 0.5; // Base score

  const content = entry.content.toLowerCase();
  const wordCount = content.split(/\s+/).length;

  // User messages are generally more important than assistant
  if (entry.role === 'user') {
    score += 0.1;
    factors.push('user message');
  }

  // Questions are important
  if (content.includes('?')) {
    score += 0.1;
    factors.push('contains question');
  }

  // Decision/conclusion keywords
  if (/\b(decided|concluded|agreed|confirmed|final|done|complete)\b/i.test(content)) {
    score += 0.2;
    factors.push('decision/conclusion');
  }

  // Error/problem mentions
  if (/\b(error|bug|issue|problem|fix|broken|failed)\b/i.test(content)) {
    score += 0.15;
    factors.push('problem discussion');
  }

  // Code-related
  if (content.includes('```') || /\b(function|class|const|let|var|def|import)\b/.test(content)) {
    score += 0.15;
    factors.push('contains code');
  }

  // File/path mentions
  if (/\.(ts|js|py|tsx|jsx|json|md|css|html)/i.test(content)) {
    score += 0.1;
    factors.push('file reference');
  }

  // Very short messages are less important
  if (wordCount < 5) {
    score -= 0.2;
    factors.push('very short');
  }

  // Very long messages might contain important details
  if (wordCount > 100) {
    score += 0.1;
    factors.push('detailed message');
  }

  // Action keywords
  if (/\b(please|need|want|create|update|change|add|remove|fix)\b/i.test(content)) {
    score += 0.1;
    factors.push('action request');
  }

  return { score: Math.max(0, Math.min(1, score)), factors };
}

/**
 * Basic summarization strategy using extractive summarization
 */
class ExtractiveCompactionStrategy implements CompactionStrategy {
  name = 'extractive';

  async compact(entries: MemoryEntry[]): Promise<{ summary: string; tokensReduced: number }> {
    if (entries.length === 0) {
      return { summary: '', tokensReduced: 0 };
    }

    const originalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);

    // Extract key sentences from each entry
    const keyPoints: string[] = [];
    
    for (const entry of entries) {
      const sentences = entry.content
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20);

      // Take first and last meaningful sentence from each entry
      if (sentences.length > 0) {
        const prefix = entry.role === 'user' ? 'User asked:' : 'Assistant:';
        keyPoints.push(`${prefix} ${sentences[0]}`);
        
        if (sentences.length > 2) {
          keyPoints.push(`...${sentences[sentences.length - 1]}`);
        }
      }
    }

    // Combine into summary
    const summary = `[Summary of ${entries.length} messages]\n${keyPoints.join('\n')}`;
    const summaryTokens = estimateTokens(summary);

    return {
      summary,
      tokensReduced: originalTokens - summaryTokens
    };
  }
}

/**
 * Structured compaction strategy - extracts topics, decisions, entities
 */
class StructuredCompactionStrategy implements CompactionStrategy {
  name = 'structured';

  async compact(entries: MemoryEntry[]): Promise<{ summary: string; tokensReduced: number; structured: StructuredSummary }> {
    if (entries.length === 0) {
      return { 
        summary: '', 
        tokensReduced: 0,
        structured: {
          topics: [],
          decisions: [],
          entities: [],
          actionItems: [],
          facts: [],
          timeSpan: { start: 0, end: 0 },
          messageCount: 0
        }
      };
    }

    const originalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);

    // Extract structured information
    const structured = this.extractStructuredInfo(entries);
    
    // Build summary from structured data
    const summaryParts: string[] = [];
    
    summaryParts.push(`[Structured Summary - ${entries.length} messages]`);
    summaryParts.push(`Time: ${new Date(structured.timeSpan.start).toLocaleString()} - ${new Date(structured.timeSpan.end).toLocaleString()}`);
    
    if (structured.topics.length > 0) {
      summaryParts.push(`\n📋 Topics: ${structured.topics.join(', ')}`);
    }
    
    if (structured.decisions.length > 0) {
      summaryParts.push(`\n✅ Decisions:\n${structured.decisions.map(d => `  • ${d}`).join('\n')}`);
    }
    
    if (structured.entities.length > 0) {
      const entityStr = structured.entities
        .slice(0, 10)
        .map(e => `${e.type}:${e.name}`)
        .join(', ');
      summaryParts.push(`\n📁 Entities: ${entityStr}`);
    }
    
    if (structured.actionItems.length > 0) {
      summaryParts.push(`\n📌 Action items:\n${structured.actionItems.map(a => `  • ${a}`).join('\n')}`);
    }
    
    if (structured.facts.length > 0) {
      summaryParts.push(`\n💡 Key facts:\n${structured.facts.slice(0, 5).map(f => `  • ${f}`).join('\n')}`);
    }

    const summary = summaryParts.join('\n');
    const summaryTokens = estimateTokens(summary);

    return {
      summary,
      tokensReduced: originalTokens - summaryTokens,
      structured
    };
  }

  /**
   * Extract structured information from entries
   */
  private extractStructuredInfo(entries: MemoryEntry[]): StructuredSummary {
    const topics = new Set<string>();
    const decisions: string[] = [];
    const entities: Array<{ type: string; name: string; context?: string }> = [];
    const actionItems: string[] = [];
    const facts: string[] = [];
    let positiveCount = 0;
    let negativeCount = 0;

    // Patterns for extraction
    const topicPatterns = [
      { pattern: /(?:about|regarding|discussing|working on)\s+([^.!?\n]{10,50})/gi, label: 'topic' },
      { pattern: /\b(implement|create|build|fix|update|refactor)\s+(?:the\s+)?([a-z]+\s+[a-z]+)/gi, label: 'task' }
    ];

    const decisionPatterns = [
      /(?:decided|concluded|agreed|let's|we'll|I'll|going to)\s+([^.!?\n]{10,80})/gi,
      /(?:the solution is|the fix is|the answer is)\s+([^.!?\n]{10,80})/gi
    ];

    const actionPatterns = [
      /(?:need to|should|must|have to|TODO|FIXME)\s+([^.!?\n]{10,80})/gi,
      /(?:please|can you|could you)\s+([^.!?\n]{10,80})/gi
    ];

    const entityPatterns = [
      { pattern: /([a-zA-Z_][a-zA-Z0-9_]*\.[a-z]{2,4})\b/g, type: 'file' },
      { pattern: /([A-Z][a-zA-Z0-9]*(?:Component|Service|Controller|Manager|Handler))/g, type: 'class' },
      { pattern: /`([a-zA-Z_][a-zA-Z0-9_]+)`/g, type: 'code' },
      { pattern: /function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g, type: 'function' }
    ];

    const positiveWords = /\b(great|thanks|perfect|awesome|works|success|done|complete)\b/gi;
    const negativeWords = /\b(error|bug|issue|problem|broken|failed|wrong|fix)\b/gi;

    for (const entry of entries) {
      const content = entry.content;

      // Extract topics
      for (const { pattern } of topicPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(content)) !== null) {
          const topic = (match[2] || match[1]).trim();
          if (topic.length > 5 && topic.length < 50) {
            topics.add(topic.toLowerCase());
          }
        }
      }

      // Extract decisions
      for (const pattern of decisionPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(content)) !== null) {
          const decision = match[1].trim();
          if (decision.length > 10 && !decisions.includes(decision)) {
            decisions.push(decision);
          }
        }
      }

      // Extract action items (only from user messages)
      if (entry.role === 'user') {
        for (const pattern of actionPatterns) {
          let match;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(content)) !== null) {
            const action = match[1].trim();
            if (action.length > 10 && !actionItems.includes(action)) {
              actionItems.push(action);
            }
          }
        }
      }

      // Extract entities
      for (const { pattern, type } of entityPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(content)) !== null) {
          const name = match[1];
          if (!entities.some(e => e.name === name)) {
            entities.push({ type, name });
          }
        }
      }

      // Count sentiment
      positiveCount += (content.match(positiveWords) || []).length;
      negativeCount += (content.match(negativeWords) || []).length;

      // Extract facts (statements with "is", "are", "has")
      const factMatches = content.match(/(?:^|\. )([A-Z][^.!?]*(?:is|are|has|have|uses|requires)[^.!?]{10,60})/g);
      if (factMatches) {
        for (const fact of factMatches.slice(0, 3)) {
          if (!facts.includes(fact.trim())) {
            facts.push(fact.trim());
          }
        }
      }
    }

    // Determine sentiment
    let sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
    if (positiveCount > negativeCount * 2) {
      sentiment = 'positive';
    } else if (negativeCount > positiveCount * 2) {
      sentiment = 'negative';
    } else if (positiveCount > 0 && negativeCount > 0) {
      sentiment = 'mixed';
    }

    return {
      topics: Array.from(topics).slice(0, 5),
      decisions: decisions.slice(0, 5),
      entities: entities.slice(0, 15),
      actionItems: actionItems.slice(0, 5),
      facts: facts.slice(0, 5),
      sentiment,
      timeSpan: {
        start: entries[0]?.timestamp || 0,
        end: entries[entries.length - 1]?.timestamp || 0
      },
      messageCount: entries.length
    };
  }
}

/**
 * Importance-weighted compaction - keeps the most important messages
 */
class ImportanceWeightedStrategy implements CompactionStrategy {
  name = 'importance-weighted';
  private retentionRatio: number;

  constructor(retentionRatio: number = 0.3) {
    this.retentionRatio = retentionRatio;
  }

  async compact(entries: MemoryEntry[]): Promise<{ summary: string; tokensReduced: number }> {
    if (entries.length === 0) {
      return { summary: '', tokensReduced: 0 };
    }

    const originalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);

    // Score all entries
    const scored = entries.map((entry, index) => ({
      entry,
      index,
      importance: scoreImportance(entry)
    }));

    // Sort by importance
    scored.sort((a, b) => b.importance.score - a.importance.score);

    // Keep top N% based on importance
    const keepCount = Math.max(3, Math.ceil(entries.length * this.retentionRatio));
    const kept = scored.slice(0, keepCount);

    // Re-sort by original order
    kept.sort((a, b) => a.index - b.index);

    // Build summary
    const summaryParts = [`[Importance-Weighted Summary - kept ${keepCount}/${entries.length} key messages]\n`];
    
    for (const { entry, importance } of kept) {
      const prefix = entry.role === 'user' ? '👤 User' : '🤖 Assistant';
      const shortContent = entry.content.length > 200 
        ? entry.content.substring(0, 200) + '...'
        : entry.content;
      summaryParts.push(`${prefix} (importance: ${importance.score.toFixed(2)}): ${shortContent}`);
    }

    const summary = summaryParts.join('\n\n');
    const summaryTokens = estimateTokens(summary);

    return {
      summary,
      tokensReduced: originalTokens - summaryTokens
    };
  }
}

/**
 * AI-powered summarization strategy
 */
class AICompactionStrategy implements CompactionStrategy {
  name = 'ai';
  private aiProvider: ((messages: any[]) => Promise<string>) | null;

  constructor(aiProvider?: (messages: any[]) => Promise<string>) {
    this.aiProvider = aiProvider || null;
  }

  async compact(entries: MemoryEntry[]): Promise<{ summary: string; tokensReduced: number }> {
    if (entries.length === 0) {
      return { summary: '', tokensReduced: 0 };
    }

    const originalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);

    // Format conversation for summarization
    const conversation = entries
      .map(e => `${e.role.toUpperCase()}: ${e.content}`)
      .join('\n\n');

    let summary: string;

    if (this.aiProvider) {
      try {
        summary = await this.aiProvider([
          {
            role: 'system',
            content: `You are a conversation summarizer. Create a concise summary that captures:
1. Main topics discussed
2. Key decisions or conclusions
3. Important context for future reference
Keep the summary under 200 words.`
          },
          {
            role: 'user',
            content: `Summarize this conversation:\n\n${conversation}`
          }
        ]);
      } catch (error) {
        console.warn('[MemoryCompaction] AI summarization failed, falling back to extractive');
        const fallback = new ExtractiveCompactionStrategy();
        return fallback.compact(entries);
      }
    } else {
      // Fallback to extractive
      const fallback = new ExtractiveCompactionStrategy();
      return fallback.compact(entries);
    }

    const summaryTokens = estimateTokens(summary);

    return {
      summary: `[AI Summary of ${entries.length} messages]\n${summary}`,
      tokensReduced: originalTokens - summaryTokens
    };
  }
}

/**
 * Hierarchical compaction - summarize in chunks then summarize summaries
 */
class HierarchicalCompactionStrategy implements CompactionStrategy {
  name = 'hierarchical';
  private chunkSize: number;
  private baseStrategy: CompactionStrategy;

  constructor(chunkSize: number = 10, baseStrategy?: CompactionStrategy) {
    this.chunkSize = chunkSize;
    this.baseStrategy = baseStrategy || new ExtractiveCompactionStrategy();
  }

  async compact(entries: MemoryEntry[]): Promise<{ summary: string; tokensReduced: number }> {
    if (entries.length === 0) {
      return { summary: '', tokensReduced: 0 };
    }

    const originalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);

    // Split into chunks
    const chunks: MemoryEntry[][] = [];
    for (let i = 0; i < entries.length; i += this.chunkSize) {
      chunks.push(entries.slice(i, i + this.chunkSize));
    }

    // Summarize each chunk
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const result = await this.baseStrategy.compact(chunks[i]);
      chunkSummaries.push(`[Part ${i + 1}/${chunks.length}]\n${result.summary}`);
    }

    // If we have multiple chunks, combine them
    const finalSummary = chunkSummaries.length > 1
      ? `[Hierarchical Summary - ${entries.length} messages in ${chunks.length} parts]\n\n${chunkSummaries.join('\n\n---\n\n')}`
      : chunkSummaries[0];

    const summaryTokens = estimateTokens(finalSummary);

    return {
      summary: finalSummary,
      tokensReduced: originalTokens - summaryTokens
    };
  }
}

export class MemoryCompaction {
  private store: MemoryStore;
  private strategies: Map<string, CompactionStrategy> = new Map();
  private defaultStrategy: string = 'structured';

  constructor(store?: MemoryStore, aiProvider?: (messages: any[]) => Promise<string>) {
    this.store = store || getMemoryStore();
    
    // Register default strategies
    this.strategies.set('extractive', new ExtractiveCompactionStrategy());
    this.strategies.set('structured', new StructuredCompactionStrategy());
    this.strategies.set('importance', new ImportanceWeightedStrategy());
    this.strategies.set('ai', new AICompactionStrategy(aiProvider));
    this.strategies.set('hierarchical', new HierarchicalCompactionStrategy());
  }

  /**
   * Get structured summary for a session (without compacting)
   */
  async getStructuredSummary(sessionId: string): Promise<StructuredSummary | null> {
    const entries = await this.store.getEntries({ sessionId, includeCompacted: false });
    if (entries.length === 0) return null;

    const strategy = this.strategies.get('structured') as StructuredCompactionStrategy;
    const result = await strategy.compact(entries);
    return result.structured || null;
  }

  /**
   * Score message importance
   */
  getMessageImportance(entry: MemoryEntry): ImportanceScore {
    return scoreImportance(entry);
  }

  /**
   * Get the most important messages from a session
   */
  async getImportantMessages(
    sessionId: string,
    limit: number = 10
  ): Promise<Array<{ entry: MemoryEntry; importance: ImportanceScore }>> {
    const entries = await this.store.getEntries({ sessionId, includeCompacted: false });
    
    const scored = entries.map(entry => ({
      entry,
      importance: scoreImportance(entry)
    }));

    scored.sort((a, b) => b.importance.score - a.importance.score);
    return scored.slice(0, limit);
  }

  /**
   * Register a custom compaction strategy
   */
  registerStrategy(strategy: CompactionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Set the default strategy
   */
  setDefaultStrategy(name: string): void {
    if (this.strategies.has(name)) {
      this.defaultStrategy = name;
    }
  }

  /**
   * Check if a session needs compaction
   */
  async needsCompaction(sessionId: string, threshold: number = 500): Promise<boolean> {
    const entries = await this.store.getEntries({ sessionId, includeCompacted: false });
    const totalTokens = entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);
    return totalTokens > threshold || entries.length > 100;
  }

  /**
   * Compact a session's memory
   */
  async compactSession(
    sessionId: string,
    options: {
      strategy?: string;
      keepRecent?: number;
      targetTokens?: number;
    } = {}
  ): Promise<CompactionResult> {
    const { strategy = this.defaultStrategy, keepRecent = 10, targetTokens = 2000 } = options;

    const compactionStrategy = this.strategies.get(strategy);
    if (!compactionStrategy) {
      throw new Error(`Unknown compaction strategy: ${strategy}`);
    }

    // Get all entries for session
    const entries = await this.store.getEntries({ sessionId, includeCompacted: false });

    if (entries.length <= keepRecent) {
      return {
        originalCount: entries.length,
        compactedCount: 0,
        summary: '',
        tokensReduced: 0
      };
    }

    // Keep recent entries, compact the rest
    const toKeep = entries.slice(-keepRecent);
    const toCompact = entries.slice(0, -keepRecent);

    // Perform compaction
    const result = await compactionStrategy.compact(toCompact);

    // Mark entries as compacted
    await this.store.markAsCompacted(toCompact.map(e => e.id));

    // Store compaction summary as a special entry
    const summaryEntry: MemoryEntry = {
      id: `compaction-${sessionId}-${Date.now()}`,
      sessionId,
      channelId: toCompact[0]?.channelId || 'unknown',
      role: 'system',
      content: result.summary,
      timestamp: Date.now(),
      metadata: {
        type: 'compaction_summary',
        originalCount: toCompact.length,
        strategy: strategy
      }
    };

    await this.store.addEntry(summaryEntry);

    return {
      originalCount: toCompact.length,
      compactedCount: 1,
      summary: result.summary,
      tokensReduced: result.tokensReduced
    };
  }

  /**
   * Auto-compact sessions that exceed threshold
   */
  async autoCompact(
    options: {
      threshold?: number;
      strategy?: string;
      maxSessions?: number;
    } = {}
  ): Promise<Map<string, CompactionResult>> {
    const { threshold = 500, strategy, maxSessions = 10 } = options;
    const results = new Map<string, CompactionResult>();

    // Get active sessions
    const sessions = await this.store.getSessions({ status: 'active', limit: maxSessions });

    for (const session of sessions) {
      if (await this.needsCompaction(session.id, threshold)) {
        try {
          const result = await this.compactSession(session.id, { strategy });
          results.set(session.id, result);
          console.log(`[MemoryCompaction] Compacted session ${session.id}: ${result.tokensReduced} tokens reduced`);
        } catch (error) {
          console.error(`[MemoryCompaction] Failed to compact session ${session.id}:`, error);
        }
      }
    }

    return results;
  }

  /**
   * Get compaction history for a session
   */
  async getCompactionHistory(sessionId: string): Promise<MemoryEntry[]> {
    const entries = await this.store.getEntries({ sessionId, includeCompacted: true });
    return entries.filter(e => e.metadata?.type === 'compaction_summary');
  }

  /**
   * Estimate tokens in session
   */
  async estimateSessionTokens(sessionId: string): Promise<number> {
    const entries = await this.store.getEntries({ sessionId, includeCompacted: false });
    return entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);
  }

  /**
   * Get optimal context window for a session
   */
  async getOptimalContext(
    sessionId: string,
    maxTokens: number = 4000
  ): Promise<MemoryEntry[]> {
    const entries = await this.store.getEntries({ sessionId, includeCompacted: false });
    
    // Start from most recent and work backwards
    const result: MemoryEntry[] = [];
    let totalTokens = 0;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const entryTokens = estimateTokens(entry.content);

      if (totalTokens + entryTokens > maxTokens) {
        break;
      }

      result.unshift(entry);
      totalTokens += entryTokens;
    }

    // If we couldn't fit recent messages, get compaction summaries
    if (result.length < 3) {
      const summaries = await this.getCompactionHistory(sessionId);
      if (summaries.length > 0) {
        const latestSummary = summaries[summaries.length - 1];
        const summaryTokens = estimateTokens(latestSummary.content);
        
        if (totalTokens + summaryTokens <= maxTokens) {
          result.unshift(latestSummary);
        }
      }
    }

    return result;
  }
}

// Export token estimation utility
export { estimateTokens };

// Singleton instance
let memoryCompactionInstance: MemoryCompaction | null = null;

export function getMemoryCompaction(aiProvider?: (messages: any[]) => Promise<string>): MemoryCompaction {
  if (!memoryCompactionInstance) {
    memoryCompactionInstance = new MemoryCompaction(undefined, aiProvider);
  }
  return memoryCompactionInstance;
}

export default MemoryCompaction;
