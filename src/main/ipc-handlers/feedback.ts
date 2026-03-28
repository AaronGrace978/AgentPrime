/**
 * User Feedback IPC Handlers
 * 
 * Allows the UI to submit ratings on agent outputs:
 * - 5 stars: Store all patterns with high confidence
 * - 1 star: Store as anti-patterns
 * - 3 stars: Neutral, store with moderate confidence
 * 
 * This enables Phase 1 of the Evolution Roadmap:
 * "Let YOU rate what it creates"
 */

import { ipcMain } from 'electron';
import { storeTaskLearning, getMirrorMemory } from '../mirror/mirror-singleton';

interface FeedbackData {
  taskId: string;
  task: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  filesCreated?: string[];
  patterns?: Array<{
    type: string;
    description: string;
    code?: string;
  }>;
}

interface FeedbackResult {
  success: boolean;
  message: string;
  patternsStored?: number;
  antiPatternsStored?: number;
}

// Store recent tasks for feedback association
const recentTasks: Map<string, { task: string; filesCreated: string[]; timestamp: number }> = new Map();
const MAX_RECENT_TASKS = 50;

// Track feedback ratings for real positiveRate calculation
const feedbackLog: Array<{ rating: number; timestamp: number }> = [];
const MAX_FEEDBACK_LOG = 500;

/**
 * Register a task for potential feedback
 */
export function registerTaskForFeedback(taskId: string, task: string, filesCreated: string[] = []): void {
  // Clean old tasks
  const now = Date.now();
  for (const [id, data] of recentTasks.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      recentTasks.delete(id);
    }
  }
  
  // Limit size
  if (recentTasks.size >= MAX_RECENT_TASKS) {
    const oldest = [...recentTasks.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) recentTasks.delete(oldest[0]);
  }
  
  recentTasks.set(taskId, { task, filesCreated, timestamp: now });
  console.log(`[Feedback] Registered task ${taskId} for feedback`);
}

/**
 * Register feedback IPC handlers
 */
export function registerFeedbackHandlers(): void {
  
  /**
   * Submit user feedback on an agent output
   */
  ipcMain.handle('feedback:submit', async (_, data: FeedbackData): Promise<FeedbackResult> => {
    try {
      console.log(`[Feedback] Received rating ${data.rating}/5 for task: "${data.task.substring(0, 50)}..."`);
      
      // Record rating for aggregation
      feedbackLog.push({ rating: data.rating, timestamp: Date.now() });
      if (feedbackLog.length > MAX_FEEDBACK_LOG) {
        feedbackLog.splice(0, feedbackLog.length - MAX_FEEDBACK_LOG);
      }
      
      let patternsStored = 0;
      let antiPatternsStored = 0;
      
      // High rating (4-5): Store patterns with high confidence
      if (data.rating >= 4) {
        const patterns = (data.patterns || []).map(p => ({
          id: `user_rated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: p.type || 'user-approved',
          description: p.description || `User-approved pattern for: ${data.task.substring(0, 50)}`,
          source: 'user-feedback',
          confidence: data.rating === 5 ? 1.0 : 0.9,
          successRate: data.rating === 5 ? 1.0 : 0.9,
          userRating: data.rating,
          comment: data.comment
        }));
        
        // If no explicit patterns, create a generic success pattern
        if (patterns.length === 0) {
          patterns.push({
            id: `user_approved_${Date.now()}`,
            type: 'task-approach',
            description: `Successful approach for: ${data.task.substring(0, 100)}`,
            source: 'user-feedback',
            confidence: data.rating === 5 ? 1.0 : 0.9,
            successRate: 1.0,
            userRating: data.rating,
            comment: data.comment
          });
        }
        
        await storeTaskLearning(data.task, true, patterns, []);
        patternsStored = patterns.length;
        
        console.log(`[Feedback] ✅ Stored ${patternsStored} patterns with high confidence`);
        
        return {
          success: true,
          message: `Thanks! Stored ${patternsStored} patterns for future use.`,
          patternsStored
        };
      }
      
      // Low rating (1-2): Store as anti-patterns
      if (data.rating <= 2) {
        const mistakes = [
          `User rejected approach for: ${data.task.substring(0, 100)}`,
          ...(data.comment ? [`Reason: ${data.comment}`] : [])
        ];
        
        await storeTaskLearning(data.task, false, [], mistakes);
        antiPatternsStored = mistakes.length;
        
        console.log(`[Feedback] ⚠️ Stored ${antiPatternsStored} anti-patterns`);
        
        return {
          success: true,
          message: `Noted! I'll avoid this approach in the future.`,
          antiPatternsStored
        };
      }
      
      // Neutral rating (3): Store with moderate confidence
      const patterns = [{
        id: `user_neutral_${Date.now()}`,
        type: 'task-approach',
        description: `Neutral approach for: ${data.task.substring(0, 100)}`,
        source: 'user-feedback',
        confidence: 0.5,
        successRate: 0.5,
        userRating: data.rating,
        comment: data.comment
      }];
      
      await storeTaskLearning(data.task, true, patterns, []);
      
      return {
        success: true,
        message: `Got it! Stored for reference.`,
        patternsStored: 1
      };
      
    } catch (error: any) {
      console.error('[Feedback] Error processing feedback:', error);
      return {
        success: false,
        message: `Failed to store feedback: ${error.message}`
      };
    }
  });
  
  /**
   * Quick thumbs up/down
   */
  ipcMain.handle('feedback:quick', async (_, taskId: string, thumbsUp: boolean): Promise<FeedbackResult> => {
    try {
      const taskData = recentTasks.get(taskId);
      const task = taskData?.task || `Task ${taskId}`;
      
      feedbackLog.push({ rating: thumbsUp ? 5 : 1, timestamp: Date.now() });
      if (feedbackLog.length > MAX_FEEDBACK_LOG) {
        feedbackLog.splice(0, feedbackLog.length - MAX_FEEDBACK_LOG);
      }
      
      if (thumbsUp) {
        const patterns = [{
          id: `thumbs_up_${Date.now()}`,
          type: 'quick-approval',
          description: `User approved: ${task.substring(0, 100)}`,
          source: 'quick-feedback',
          confidence: 0.85,
          successRate: 0.9
        }];
        
        await storeTaskLearning(task, true, patterns, []);
        
        console.log('[Feedback] 👍 Quick thumbs up recorded');
        return { success: true, message: '👍 Noted!', patternsStored: 1 };
      } else {
        const mistakes = [`User rejected: ${task.substring(0, 100)}`];
        
        await storeTaskLearning(task, false, [], mistakes);
        
        console.log('[Feedback] 👎 Quick thumbs down recorded');
        return { success: true, message: '👎 Noted! I\'ll improve.', antiPatternsStored: 1 };
      }
      
    } catch (error: any) {
      console.error('[Feedback] Error processing quick feedback:', error);
      return { success: false, message: error.message };
    }
  });
  
  /**
   * Get feedback stats
   */
  ipcMain.handle('feedback:stats', async (): Promise<{
    totalFeedback: number;
    positiveRate: number;
    recentTasks: number;
  }> => {
    try {
      const mirrorMemory = getMirrorMemory();
      const stats = mirrorMemory?.getStats?.() || { totalFeedbackLoops: 0 };
      
      const totalLogged = feedbackLog.length;
      const positiveCount = feedbackLog.filter(f => f.rating >= 4).length;
      const positiveRate = totalLogged > 0 ? positiveCount / totalLogged : 0;

      return {
        totalFeedback: Math.max(stats.totalFeedbackLoops || 0, totalLogged),
        positiveRate,
        recentTasks: recentTasks.size
      };
    } catch (error) {
      return { totalFeedback: 0, positiveRate: 0, recentTasks: 0 };
    }
  });
  
  console.log('[Feedback] ✅ Feedback IPC handlers registered');
}

export { FeedbackData, FeedbackResult };

