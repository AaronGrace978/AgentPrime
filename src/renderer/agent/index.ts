/**
 * AgentPrime Enhanced Agent System
 * 
 * This module exports all the intelligent agent components:
 * 
 * 1. ShortTermMemory - Caches recent operations to prevent redundancy
 * 2. SelfVerification - Validates agent changes automatically
 * 3. ContextManager - Progressive context compression for long conversations
 * 4. SmartRouter - Task-aware model routing
 * 5. EnhancedAgentLoop - The main agent loop with all improvements
 * 
 * Usage:
 *   import { enhancedAgentLoop, smartRouter, shortTermMemory } from './agent';
 *   
 *   // Configure smart routing
 *   smartRouter.configure({
 *     fastModel: 'devstral-small-2:24b-cloud',
 *     deepModel: 'qwen3-coder:480b-cloud',
 *     threshold: 6
 *   });
 *   
 *   // Start the agent
 *   await enhancedAgentLoop.startAgent('Build a React app');
 */

// Import for local use in this file
import { 
  enhancedAgentLoop as _enhancedAgentLoop,
  EnhancedAgentCallbacks as _EnhancedAgentCallbacks
} from './enhancedAgentLoop';
import { shortTermMemory as _shortTermMemory } from './shortTermMemory';
import { contextManager as _contextManager } from './contextManager';
import { smartRouter as _smartRouter } from './smartRouter';

// Core agent loop
export { 
  EnhancedAgentLoop, 
  enhancedAgentLoop,
  EnhancedAgentState,
  EnhancedAgentCallbacks,
  Checkpoint 
} from './enhancedAgentLoop';

// Short-term memory
export { 
  shortTermMemory, 
  MemoryEntry, 
  MemoryStats 
} from './shortTermMemory';

// Self-verification
export { 
  verifyFileWrite, 
  verifyChanges, 
  verifySelectorConsistency,
  VerificationResult,
  VerificationCheck 
} from './selfVerification';

// Context management
export { 
  contextManager, 
  compressContext, 
  buildOptimizedContext,
  ChatMessage,
  ContextConfig 
} from './contextManager';

// Smart routing
export { 
  smartRouter, 
  SmartRouter,
  analyzeTask, 
  TaskAnalysis, 
  TaskCategory,
  TaskContext 
} from './smartRouter';

// Original exports for backwards compatibility
export { enhancedAgentLoop as agentLoop } from './enhancedAgentLoop';
export { promptBuilder, PromptBuilder, PromptContext } from './promptBuilder';
export { toolSchemas, validateToolCall, ToolCall, AgentResponse } from './toolSchemas';
export { semanticContextBuilder } from './contextBuilder';

/**
 * Enhanced agent interface type
 */
export interface EnhancedAgentInterface {
  agent: typeof _enhancedAgentLoop;
  router: typeof _smartRouter;
  memory: typeof _shortTermMemory;
  context: typeof _contextManager;
  start: (task: string, callbacks?: _EnhancedAgentCallbacks) => Promise<void>;
  stop: () => void;
  getState: () => { agent: any; memory: any; routing: any };
}

/**
 * Quick start: Get a fully configured enhanced agent
 */
export function createEnhancedAgent(config?: {
  fastModel?: string;
  deepModel?: string;
  routingThreshold?: number;
  maxIterations?: number;
}): EnhancedAgentInterface {
  // Configure smart routing
  if (config) {
    _smartRouter.configure({
      fastModel: config.fastModel,
      deepModel: config.deepModel,
      threshold: config.routingThreshold
    });
  }
  
  return {
    agent: _enhancedAgentLoop,
    router: _smartRouter,
    memory: _shortTermMemory,
    context: _contextManager,
    
    // Convenience methods
    async start(task: string, callbacks?: _EnhancedAgentCallbacks) {
      if (callbacks) {
        _enhancedAgentLoop.setCallbacks(callbacks);
      }
      
      // Route to get the right model
      const { model } = _smartRouter.route(task, {
        isFirstMessage: true
      });
      
      _enhancedAgentLoop.setModel(model);
      await _enhancedAgentLoop.startAgent(task);
    },
    
    stop() {
      _enhancedAgentLoop.stopAgent();
    },
    
    getState() {
      return {
        agent: _enhancedAgentLoop.getState(),
        memory: _shortTermMemory.getStats(),
        routing: _smartRouter.getStats()
      };
    }
  };
}
