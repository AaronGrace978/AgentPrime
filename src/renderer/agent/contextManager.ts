/**
 * Progressive Context Manager for AgentPrime
 * 
 * As conversations grow, this system:
 * 1. Summarizes older context to save tokens
 * 2. Keeps recent context verbatim
 * 3. Intelligently decides what to keep vs. compress
 * 4. Manages the context window efficiently
 */

import { shortTermMemory } from './shortTermMemory';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // Metadata for context management
  importance?: number; // 0-1, higher = keep verbatim longer
  category?: 'planning' | 'tool_call' | 'tool_result' | 'error' | 'general';
  toolCalls?: Array<{ name: string; path?: string }>;
  summary?: string; // If this message has been summarized
}

export interface ContextConfig {
  maxTokens: number;        // Target max tokens for context
  verbatimMessages: number; // Keep last N messages verbatim
  summaryRatio: number;     // Compress to this fraction (e.g., 0.3 = 30%)
}

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 8000,
  verbatimMessages: 6,
  summaryRatio: 0.3
};

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Categorize a message based on its content
 */
function categorizeMessage(message: ChatMessage): ChatMessage['category'] {
  const content = message.content.toLowerCase();
  
  if (content.includes('"plan"') || content.includes('"current_step"')) {
    return 'planning';
  }
  if (content.includes('"tool_calls"') || content.includes('"name":')) {
    return 'tool_call';
  }
  if (content.includes('tool results:') || content.includes('✅') || content.includes('❌')) {
    return 'tool_result';
  }
  if (content.includes('error') || content.includes('failed')) {
    return 'error';
  }
  return 'general';
}

/**
 * Calculate importance of a message
 */
function calculateImportance(message: ChatMessage): number {
  const category = message.category || categorizeMessage(message);
  const content = message.content;
  
  // Base importance by role
  let importance = message.role === 'user' ? 0.7 : 0.5;
  
  // Adjust by category
  switch (category) {
    case 'planning':
      importance += 0.2; // Plans are important
      break;
    case 'error':
      importance += 0.3; // Errors are very important to remember
      break;
    case 'tool_result':
      // Tool results can be reconstructed, less important
      importance -= 0.2;
      break;
  }
  
  // Adjust by content length (very long = probably tool result, less important)
  if (content.length > 2000) {
    importance -= 0.1;
  }
  
  // Adjust by keywords
  if (content.includes('IMPORTANT') || content.includes('CRITICAL')) {
    importance += 0.2;
  }
  if (content.includes('"done": true')) {
    importance += 0.3; // Completion is important
  }
  
  return Math.max(0, Math.min(1, importance));
}

/**
 * Summarize a message to reduce its token count
 */
function summarizeMessage(message: ChatMessage): string {
  const content = message.content;
  const category = message.category || categorizeMessage(message);
  
  switch (category) {
    case 'planning':
      // Extract just the plan steps
      const planMatch = content.match(/"plan"\s*:\s*\[(.*?)\]/s);
      if (planMatch) {
        return `[Plan: ${planMatch[1].replace(/"/g, '').slice(0, 200)}...]`;
      }
      return `[Planning message, ${estimateTokens(content)} tokens]`;
      
    case 'tool_call':
      // Extract tool names and paths
      const toolMatches = content.matchAll(/"name"\s*:\s*"(\w+)"/g);
      const pathMatches = content.matchAll(/"path"\s*:\s*"([^"]+)"/g);
      const tools = [...toolMatches].map(m => m[1]);
      const paths = [...pathMatches].map(m => m[1]);
      return `[Tools: ${tools.join(', ')}${paths.length > 0 ? ` on ${paths.join(', ')}` : ''}]`;
      
    case 'tool_result':
      // Extract just success/failure status
      const successCount = (content.match(/✅/g) || []).length;
      const failCount = (content.match(/❌/g) || []).length;
      return `[Results: ${successCount} success, ${failCount} failed]`;
      
    case 'error':
      // Keep error messages but truncate
      const errorMatch = content.match(/error.*?[:]/i);
      return errorMatch 
        ? `[Error: ${content.slice(0, 200)}...]`
        : `[Error occurred, ${estimateTokens(content)} tokens]`;
      
    default:
      // General summarization - keep first 100 chars
      return content.length > 150 
        ? `${content.slice(0, 150)}... [truncated]`
        : content;
  }
}

/**
 * Extract key information that must be preserved
 */
function extractKeyInfo(messages: ChatMessage[]): string[] {
  const keyInfo: string[] = [];
  
  for (const msg of messages) {
    // Extract file paths that were modified
    const pathMatches = msg.content.matchAll(/"path"\s*:\s*"([^"]+)"/g);
    for (const match of pathMatches) {
      keyInfo.push(`Modified: ${match[1]}`);
    }
    
    // Extract plan steps
    const planMatch = msg.content.match(/"plan"\s*:\s*\[(.*?)\]/s);
    if (planMatch) {
      keyInfo.push(`Plan: ${planMatch[1].slice(0, 200)}`);
    }
    
    // Extract errors
    if (msg.category === 'error' || msg.content.toLowerCase().includes('error')) {
      const errorLine = msg.content.split('\n').find(l => l.toLowerCase().includes('error'));
      if (errorLine) {
        keyInfo.push(`Error: ${errorLine.slice(0, 100)}`);
      }
    }
  }
  
  // Deduplicate
  return [...new Set(keyInfo)];
}

/**
 * Progressive context compression
 */
export function compressContext(
  messages: ChatMessage[],
  config: ContextConfig = DEFAULT_CONFIG
): ChatMessage[] {
  if (messages.length <= config.verbatimMessages) {
    return messages; // Not enough messages to compress
  }
  
  // Calculate current token estimate
  let totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  
  if (totalTokens <= config.maxTokens) {
    return messages; // Under limit, no compression needed
  }
  
  console.log(`[ContextManager] Compressing ${messages.length} messages (${totalTokens} tokens)`);
  
  // Separate into keep-verbatim and compress sections
  const keepVerbatim = messages.slice(-config.verbatimMessages);
  const toCompress = messages.slice(0, -config.verbatimMessages);
  
  // Add importance scores
  const scored = toCompress.map(msg => ({
    ...msg,
    importance: msg.importance ?? calculateImportance(msg),
    category: msg.category ?? categorizeMessage(msg)
  }));
  
  // Sort by importance (keep most important)
  scored.sort((a, b) => (b.importance || 0) - (a.importance || 0));
  
  // Calculate how many tokens we need to free
  const verbatimTokens = keepVerbatim.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const targetCompressedTokens = config.maxTokens - verbatimTokens;
  
  // Compress messages from least to most important
  const compressed: ChatMessage[] = [];
  let compressedTokens = 0;
  
  for (const msg of scored.reverse()) { // Process least important first
    const originalTokens = estimateTokens(msg.content);
    
    if (compressedTokens + originalTokens > targetCompressedTokens * config.summaryRatio) {
      // Need to summarize this message
      const summary = summarizeMessage(msg);
      compressed.push({
        ...msg,
        content: summary,
        summary: summary
      });
      compressedTokens += estimateTokens(summary);
    } else {
      // Can keep verbatim
      compressed.push(msg);
      compressedTokens += originalTokens;
    }
  }
  
  // Restore original order
  compressed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // Build summary header
  const keyInfo = extractKeyInfo(toCompress);
  if (keyInfo.length > 0) {
    const summaryHeader: ChatMessage = {
      role: 'assistant',
      content: `[Context Summary: ${keyInfo.slice(0, 5).join('; ')}]`,
      timestamp: new Date(toCompress[0]?.timestamp || Date.now())
    };
    compressed.unshift(summaryHeader);
  }
  
  const result = [...compressed, ...keepVerbatim];
  const newTokens = result.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  
  console.log(`[ContextManager] Compressed to ${result.length} messages (${newTokens} tokens)`);
  
  return result;
}

/**
 * Build an optimized context for the AI
 */
export function buildOptimizedContext(
  messages: ChatMessage[],
  currentTask: string,
  config: ContextConfig = DEFAULT_CONFIG
): string {
  // Add short-term memory context
  const recentActions = shortTermMemory.getRecentActionsSummary();
  const readFiles = shortTermMemory.getReadFiles();
  
  // Compress chat history
  const compressed = compressContext(messages, config);
  
  // Build context sections
  const sections: string[] = [];
  
  // Working memory section
  if (recentActions !== 'No recent actions.') {
    sections.push(`## WORKING MEMORY (Recently Accessed)\n${recentActions}`);
  }
  
  // Files we've already read (don't need to read again)
  if (readFiles.length > 0) {
    sections.push(`## FILES IN MEMORY\nYou have already read these files: ${readFiles.join(', ')}\nDo NOT read them again unless you need to verify changes.`);
  }
  
  // Compressed history
  if (compressed.length > 0) {
    const historyText = compressed.map(m => {
      const role = m.role.toUpperCase();
      const time = m.timestamp.toLocaleTimeString();
      const indicator = m.summary ? ' [compressed]' : '';
      return `[${time}] ${role}${indicator}: ${m.content}`;
    }).join('\n\n');
    
    sections.push(`## CONVERSATION HISTORY\n${historyText}`);
  }
  
  // Current task
  sections.push(`## CURRENT TASK\n${currentTask}`);
  
  return sections.join('\n\n---\n\n');
}

/**
 * Context manager singleton
 */
class ContextManager {
  private config: ContextConfig = DEFAULT_CONFIG;
  
  setConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  compress(messages: ChatMessage[]): ChatMessage[] {
    return compressContext(messages, this.config);
  }
  
  buildContext(messages: ChatMessage[], currentTask: string): string {
    return buildOptimizedContext(messages, currentTask, this.config);
  }
  
  getConfig(): ContextConfig {
    return { ...this.config };
  }
}

export const contextManager = new ContextManager();

