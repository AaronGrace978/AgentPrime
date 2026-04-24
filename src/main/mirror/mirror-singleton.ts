/**
 * Mirror Memory Singleton Accessor
 * Provides global access to the mirror memory instance for the agent loop
 */

import type { MirrorMemory } from './mirror-memory';
import type { MirrorPattern } from '../../types';

let mirrorMemoryInstance: MirrorMemory | null = null;

/**
 * Set the mirror memory instance (called from main.ts during initialization)
 */
export function setMirrorMemory(instance: MirrorMemory): void {
  mirrorMemoryInstance = instance;
  console.log('[MirrorSingleton] Mirror memory instance registered');
}

/**
 * Get the mirror memory instance
 */
export function getMirrorMemory(): MirrorMemory | null {
  return mirrorMemoryInstance;
}

/**
 * Check if mirror memory is initialized
 */
export function isMirrorReady(): boolean {
  return mirrorMemoryInstance !== null;
}

/**
 * Get relevant patterns for a task
 */
export async function getRelevantPatterns(task: string, limit: number = 5): Promise<MirrorPattern[]> {
  if (!mirrorMemoryInstance) {
    console.log('[MirrorSingleton] Mirror memory not available');
    return [];
  }
  
  try {
    const patterns = await mirrorMemoryInstance.getRelevantPatterns(task, limit);
    const selected = patterns
      .slice(0, 3)
      .map(pattern => pattern.description || pattern.type || pattern.id)
      .filter(Boolean)
      .map(label => String(label).replace(/\s+/g, ' ').slice(0, 80));
    console.log(
      `[MirrorSingleton] Retrieved ${patterns.length} relevant pattern(s)` +
      (selected.length > 0 ? `: ${selected.join(' | ')}` : '')
    );
    return patterns;
  } catch (error) {
    console.error('[MirrorSingleton] Error getting patterns:', error);
    return [];
  }
}

/**
 * Store a learning from a task execution
 */
export async function storeTaskLearning(
  task: string, 
  success: boolean, 
  patterns: MirrorPattern[], 
  mistakes: string[] = []
): Promise<void> {
  if (!mirrorMemoryInstance) {
    return;
  }
  
  try {
    // Store successful patterns
    if (success && patterns.length > 0) {
      for (const pattern of patterns) {
        await mirrorMemoryInstance.storePattern({
          ...pattern,
          metadata: {
            ...pattern.metadata,
            source: 'agent_execution',
            task: task.substring(0, 100)
          },
          successRate: 0.8
        }, pattern.category || 'problemSolving');
      }
    }
    
    // Store anti-patterns from mistakes
    if (!success && mistakes.length > 0) {
      for (const mistake of mistakes) {
        await mirrorMemoryInstance.storePattern({
          id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'anti-pattern',
          description: mistake,
          metadata: {
            source: 'mistake_detection',
            task: task.substring(0, 100)
          },
          confidence: 0.9,
          successRate: 0.0
        }, 'antiPatterns');
      }
    }
    
    console.log(`[MirrorSingleton] Stored learning: success=${success}, patterns=${patterns.length}, mistakes=${mistakes.length}`);
  } catch (error) {
    console.error('[MirrorSingleton] Error storing learning:', error);
  }
}

/**
 * Get anti-patterns (things to avoid)
 */
export async function getAntiPatterns(limit: number = 5): Promise<MirrorPattern[]> {
  if (!mirrorMemoryInstance) {
    return [];
  }
  
  try {
    const antiPatterns = await mirrorMemoryInstance.retrievePatterns('antiPatterns', limit, 'recent');
    return antiPatterns || [];
  } catch (error) {
    console.error('[MirrorSingleton] Error getting anti-patterns:', error);
    return [];
  }
}

/**
 * Add an anti-pattern (something to avoid in future)
 */
export async function addAntiPattern(pattern: {
  description: string;
  context?: string;
  category?: string;
  severity?: string;
  examples?: string[];
}): Promise<void> {
  if (!mirrorMemoryInstance) {
    return;
  }
  
  try {
    await mirrorMemoryInstance.storePattern({
      id: `antipattern_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type: 'anti-pattern',
      description: pattern.description,
      metadata: {
        context: pattern.context || '',
        category: pattern.category || 'general',
        severity: pattern.severity || 'medium'
      },
      examples: pattern.examples || [],
      confidence: 0.9,
      successRate: 0.0
    }, 'antiPatterns');
    console.log(`[MirrorSingleton] Added anti-pattern: ${pattern.description.substring(0, 50)}...`);
  } catch (error) {
    console.error('[MirrorSingleton] Error adding anti-pattern:', error);
  }
}

/**
 * Store a single learning pattern (flexible object format)
 * Used for storing individual corrections, preferences, or patterns
 */
export async function storeLearning(learning: {
  type: 'pattern' | 'anti-pattern' | 'preference';
  description: string;
  context?: string;
  severity?: string;
  examples?: string[];
}): Promise<void> {
  if (!mirrorMemoryInstance) {
    return;
  }
  
  try {
    const category = learning.type === 'anti-pattern' ? 'antiPatterns' : 
                     learning.type === 'preference' ? 'userPreferences' : 'reasoning';
    
    await mirrorMemoryInstance.storePattern({
      id: `learning_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type: learning.type,
      description: learning.description,
      metadata: {
        context: learning.context || '',
        severity: learning.severity || 'medium'
      },
      examples: learning.examples || [],
      confidence: 0.8,
      successRate: learning.type === 'anti-pattern' ? 0.0 : 0.8
    }, category);
    console.log(`[MirrorSingleton] Stored learning (${learning.type}): ${learning.description.substring(0, 50)}...`);
  } catch (error) {
    console.error('[MirrorSingleton] Error storing learning:', error);
  }
}
