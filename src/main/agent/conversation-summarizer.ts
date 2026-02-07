/**
 * AgentPrime - Conversation Summarizer
 * 
 * For long coding sessions, the conversation history can become too long
 * for context windows. This summarizes older parts of the conversation
 * while preserving:
 * - Key decisions made
 * - Files created/modified
 * - Important code snippets
 * - User preferences expressed
 * 
 * Like a good pair programmer who remembers what you discussed yesterday
 * without recalling every word.
 */

import aiRouter from '../ai-providers';
import type { ChatMessage } from '../../types/ai-providers';

export interface ConversationSummary {
  summary: string;
  keyDecisions: string[];
  filesModified: string[];
  codeSnippets: CodeSnippet[];
  userPreferences: string[];
  taskProgress: TaskProgressEntry[];
  timestamp: number;
  messagesCount: number;
  tokensSaved: number;
}

interface CodeSnippet {
  language: string;
  code: string;
  context: string;
  filePath?: string;
}

interface TaskProgressEntry {
  task: string;
  status: 'completed' | 'in_progress' | 'blocked' | 'cancelled';
  result?: string;
}

interface SummarizationOptions {
  maxSummaryLength?: number;
  preserveRecentMessages?: number;
  extractCodeSnippets?: boolean;
  summarizationModel?: string;
}

/**
 * Conversation Summarizer
 */
export class ConversationSummarizer {
  private readonly DEFAULT_MAX_LENGTH = 2000;
  private readonly DEFAULT_PRESERVE_RECENT = 10;
  private readonly SUMMARIZATION_MODEL = 'claude-3-5-haiku-20241022';
  
  /**
   * Check if conversation needs summarization
   */
  needsSummarization(messages: ChatMessage[], maxTokens: number = 8000): boolean {
    // Rough token estimate (4 chars = 1 token)
    const estimatedTokens = messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return sum + Math.ceil(content.length / 4);
    }, 0);
    
    return estimatedTokens > maxTokens;
  }
  
  /**
   * Summarize a conversation, preserving recent messages
   */
  async summarize(
    messages: ChatMessage[],
    options: SummarizationOptions = {}
  ): Promise<{
    summary: ConversationSummary;
    condensedMessages: ChatMessage[];
  }> {
    const maxLength = options.maxSummaryLength || this.DEFAULT_MAX_LENGTH;
    const preserveRecent = options.preserveRecentMessages || this.DEFAULT_PRESERVE_RECENT;
    const model = options.summarizationModel || this.SUMMARIZATION_MODEL;
    
    // If conversation is short enough, don't summarize
    if (messages.length <= preserveRecent + 2) {
      return {
        summary: this.createEmptySummary(messages.length),
        condensedMessages: messages
      };
    }
    
    // Split into old (to summarize) and recent (to keep)
    const oldMessages = messages.slice(0, -preserveRecent);
    const recentMessages = messages.slice(-preserveRecent);
    
    // Extract structured information before summarizing
    const filesModified = this.extractFilesModified(oldMessages);
    const codeSnippets = options.extractCodeSnippets !== false 
      ? this.extractCodeSnippets(oldMessages) 
      : [];
    const userPreferences = this.extractPreferences(oldMessages);
    const taskProgress = this.extractTaskProgress(oldMessages);
    const keyDecisions = this.extractKeyDecisions(oldMessages);
    
    // Generate AI summary
    const summaryText = await this.generateSummary(oldMessages, model, maxLength);
    
    // Calculate token savings
    const oldTokens = this.estimateTokens(oldMessages);
    const summaryTokens = this.estimateTokens([{ role: 'system', content: summaryText }]);
    
    const summary: ConversationSummary = {
      summary: summaryText,
      keyDecisions,
      filesModified,
      codeSnippets: codeSnippets.slice(0, 10), // Keep top 10 snippets
      userPreferences,
      taskProgress,
      timestamp: Date.now(),
      messagesCount: oldMessages.length,
      tokensSaved: oldTokens - summaryTokens
    };
    
    // Create condensed message list with summary as system message
    const summaryMessage: ChatMessage = {
      role: 'system',
      content: this.formatSummaryAsSystemMessage(summary)
    };
    
    return {
      summary,
      condensedMessages: [summaryMessage, ...recentMessages]
    };
  }
  
  /**
   * Generate AI summary of messages
   */
  private async generateSummary(
    messages: ChatMessage[],
    model: string,
    maxLength: number
  ): Promise<string> {
    try {
      // Build a condensed representation of the conversation
      const conversationText = messages.map(m => {
        const role = m.role === 'user' ? 'USER' : 'ASSISTANT';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        // Truncate very long messages
        const truncated = content.length > 500 
          ? content.substring(0, 500) + '... [truncated]'
          : content;
        return `${role}: ${truncated}`;
      }).join('\n\n');
      
      const summaryPrompt: ChatMessage[] = [{
        role: 'user',
        content: `Summarize this coding conversation in ${maxLength} characters or less.

Focus on:
1. What the user wanted to accomplish
2. Key decisions made
3. Important files created or modified
4. Any user preferences expressed
5. Current state of the project

Conversation:
${conversationText}

Provide a concise summary that would help continue the conversation:
`
      }];
      
      const response = await aiRouter.chat(summaryPrompt, {
        model,
        max_tokens: Math.ceil(maxLength / 4), // Rough char-to-token conversion
        temperature: 0.3
      });
      
      return response.content || this.fallbackSummary(messages);
    } catch (error) {
      console.warn('[ConversationSummarizer] AI summary failed, using fallback:', error);
      return this.fallbackSummary(messages);
    }
  }
  
  /**
   * Fallback summary without AI
   */
  private fallbackSummary(messages: ChatMessage[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const lastTasks = userMessages.slice(-5).map(m => {
      const content = typeof m.content === 'string' ? m.content : '';
      return content.substring(0, 100);
    });
    
    return `Previous conversation (${messages.length} messages):
- User tasks: ${lastTasks.join('; ')}
- Files were modified during the session`;
  }
  
  /**
   * Extract files that were modified in the conversation
   */
  private extractFilesModified(messages: ChatMessage[]): string[] {
    const files = new Set<string>();
    
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      // Look for file paths in various formats
      const patterns = [
        /(?:created?|wrote|modified|updated|edited?)\s+[`']?([^\s`']+\.[a-z]+)[`']?/gi,
        /file:\s*[`']?([^\s`']+\.[a-z]+)[`']?/gi,
        /`([^\s`]+\.[a-z]+)`/gi,
        /saving?\s+(?:to\s+)?[`']?([^\s`']+\.[a-z]+)[`']?/gi
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const file = match[1];
          if (file && !file.includes('...') && file.length < 100) {
            files.add(file);
          }
        }
      }
    }
    
    return Array.from(files);
  }
  
  /**
   * Extract code snippets from the conversation
   */
  private extractCodeSnippets(messages: ChatMessage[]): CodeSnippet[] {
    const snippets: CodeSnippet[] = [];
    
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      // Match code blocks
      const codeBlockPattern = /```(\w*)\n([\s\S]*?)```/g;
      let match;
      
      while ((match = codeBlockPattern.exec(content)) !== null) {
        const language = match[1] || 'text';
        const code = match[2].trim();
        
        // Only keep significant code snippets
        if (code.length > 50 && code.length < 500) {
          // Try to extract context (text before the code block)
          const beforeCode = content.substring(Math.max(0, match.index - 100), match.index);
          const context = beforeCode.split('\n').pop()?.trim() || '';
          
          snippets.push({
            language,
            code,
            context
          });
        }
      }
    }
    
    // Deduplicate and prioritize unique snippets
    const seen = new Set<string>();
    return snippets.filter(s => {
      const hash = s.code.substring(0, 50);
      if (seen.has(hash)) return false;
      seen.add(hash);
      return true;
    });
  }
  
  /**
   * Extract user preferences expressed in conversation
   */
  private extractPreferences(messages: ChatMessage[]): string[] {
    const preferences: string[] = [];
    
    const preferencePatterns = [
      /(?:i prefer|i like|please (?:use|avoid)|don't use|always use|never use)\s+(.{10,50})/gi,
      /(?:style|format|naming)\s+(?:should be|like|as)\s+(.{10,50})/gi,
      /(?:make it|keep it)\s+(simple|clean|minimal|modular|readable)/gi
    ];
    
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      for (const pattern of preferencePatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const pref = match[1]?.trim();
          if (pref && pref.length < 100) {
            preferences.push(pref);
          }
        }
      }
    }
    
    return [...new Set(preferences)];
  }
  
  /**
   * Extract task progress from conversation
   */
  private extractTaskProgress(messages: ChatMessage[]): TaskProgressEntry[] {
    const tasks: TaskProgressEntry[] = [];
    
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      // Look for task completion indicators
      if (content.includes('✅') || content.toLowerCase().includes('done') ||
          content.toLowerCase().includes('completed') || content.toLowerCase().includes('finished')) {
        
        // Try to extract what was completed
        const taskMatch = content.match(/(?:created?|finished|completed|done[:\s]+)(.{10,80})/i);
        if (taskMatch) {
          tasks.push({
            task: taskMatch[1].trim(),
            status: 'completed'
          });
        }
      }
      
      // Look for in-progress tasks
      if (content.toLowerCase().includes('working on') || content.toLowerCase().includes('in progress')) {
        const taskMatch = content.match(/(?:working on|in progress[:\s]+)(.{10,80})/i);
        if (taskMatch) {
          tasks.push({
            task: taskMatch[1].trim(),
            status: 'in_progress'
          });
        }
      }
    }
    
    return tasks.slice(-10); // Keep last 10 tasks
  }
  
  /**
   * Extract key decisions from conversation
   */
  private extractKeyDecisions(messages: ChatMessage[]): string[] {
    const decisions: string[] = [];
    
    const decisionPatterns = [
      /(?:decided to|will use|chose|going with|better to)\s+(.{10,100})/gi,
      /(?:instead of|rather than)\s+(.{10,50}),?\s+(?:we|i)'ll\s+(.{10,50})/gi,
      /(?:the (?:best|right) (?:approach|way|solution) is)\s+(.{10,100})/gi
    ];
    
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      for (const pattern of decisionPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const decision = match[1]?.trim();
          if (decision && decision.length < 150) {
            decisions.push(decision);
          }
        }
      }
    }
    
    return [...new Set(decisions)].slice(0, 10);
  }
  
  /**
   * Format summary as a system message for context
   */
  private formatSummaryAsSystemMessage(summary: ConversationSummary): string {
    let formatted = `## 📋 CONVERSATION SUMMARY\n`;
    formatted += `*(${summary.messagesCount} messages summarized, ~${summary.tokensSaved} tokens saved)*\n\n`;
    
    formatted += summary.summary + '\n\n';
    
    if (summary.filesModified.length > 0) {
      formatted += `### 📁 Files Modified\n`;
      formatted += summary.filesModified.map(f => `- \`${f}\``).join('\n') + '\n\n';
    }
    
    if (summary.keyDecisions.length > 0) {
      formatted += `### 🎯 Key Decisions\n`;
      formatted += summary.keyDecisions.map(d => `- ${d}`).join('\n') + '\n\n';
    }
    
    if (summary.userPreferences.length > 0) {
      formatted += `### 👤 User Preferences\n`;
      formatted += summary.userPreferences.map(p => `- ${p}`).join('\n') + '\n\n';
    }
    
    if (summary.taskProgress.length > 0) {
      const completed = summary.taskProgress.filter(t => t.status === 'completed');
      const inProgress = summary.taskProgress.filter(t => t.status === 'in_progress');
      
      if (completed.length > 0) {
        formatted += `### ✅ Completed Tasks\n`;
        formatted += completed.map(t => `- ${t.task}`).join('\n') + '\n\n';
      }
      
      if (inProgress.length > 0) {
        formatted += `### 🔄 In Progress\n`;
        formatted += inProgress.map(t => `- ${t.task}`).join('\n') + '\n\n';
      }
    }
    
    formatted += `---\n*Continue the conversation with context preserved.*\n`;
    
    return formatted;
  }
  
  /**
   * Estimate tokens for messages
   */
  private estimateTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return sum + Math.ceil(content.length / 4);
    }, 0);
  }
  
  /**
   * Create empty summary
   */
  private createEmptySummary(messagesCount: number): ConversationSummary {
    return {
      summary: '',
      keyDecisions: [],
      filesModified: [],
      codeSnippets: [],
      userPreferences: [],
      taskProgress: [],
      timestamp: Date.now(),
      messagesCount,
      tokensSaved: 0
    };
  }
  
  /**
   * Incrementally update summary with new messages
   */
  async updateSummary(
    existingSummary: ConversationSummary,
    newMessages: ChatMessage[]
  ): Promise<ConversationSummary> {
    // Extract new information
    const newFiles = this.extractFilesModified(newMessages);
    const newPreferences = this.extractPreferences(newMessages);
    const newProgress = this.extractTaskProgress(newMessages);
    const newDecisions = this.extractKeyDecisions(newMessages);
    
    // Merge with existing
    return {
      ...existingSummary,
      filesModified: [...new Set([...existingSummary.filesModified, ...newFiles])],
      userPreferences: [...new Set([...existingSummary.userPreferences, ...newPreferences])],
      taskProgress: [...existingSummary.taskProgress, ...newProgress].slice(-20),
      keyDecisions: [...new Set([...existingSummary.keyDecisions, ...newDecisions])].slice(-15),
      messagesCount: existingSummary.messagesCount + newMessages.length,
      timestamp: Date.now()
    };
  }
}

/**
 * Singleton instance
 */
export const conversationSummarizer = new ConversationSummarizer();

/**
 * Quick summarization function
 */
export async function summarizeIfNeeded(
  messages: ChatMessage[],
  maxTokens: number = 8000
): Promise<ChatMessage[]> {
  if (!conversationSummarizer.needsSummarization(messages, maxTokens)) {
    return messages;
  }
  
  const result = await conversationSummarizer.summarize(messages);
  console.log(`[ConversationSummarizer] Summarized ${result.summary.messagesCount} messages, saved ~${result.summary.tokensSaved} tokens`);
  
  return result.condensedMessages;
}

