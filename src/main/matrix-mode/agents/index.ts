/**
 * Matrix Mode Multi-Agent System
 * Agent routing, sub-agents, and session management
 * 
 * Features:
 * - Agent registration and configuration
 * - Capability-based routing
 * - Rule-based message routing
 * - Sub-agent spawning for parallel tasks
 * - Inter-agent communication (ping-pong)
 * - Session isolation and management
 */

export * from './types';
export { AgentRegistry, getAgentRegistry } from './agent-registry';
export { AgentRouter, getAgentRouter, RoutingContext, RoutingResult, AgentExecutor } from './agent-router';
export { SubAgentSpawner, getSubAgentSpawner, SubAgentExecutor } from './sub-agent-spawner';
export { SessionTool, getSessionTool, SessionSendOptions, SessionSendResult, MessageHandler } from './session-tool';

import { AgentRegistry, getAgentRegistry } from './agent-registry';
import { AgentRouter, getAgentRouter, AgentExecutor } from './agent-router';
import { SubAgentSpawner, getSubAgentSpawner, SubAgentExecutor } from './sub-agent-spawner';
import { SessionTool, getSessionTool } from './session-tool';
import { 
  AgentConfig, 
  AgentInstance, 
  AgentRequest, 
  AgentResponse, 
  SubAgentConfig,
  AgentMessage
} from './types';
import type { AgentExecutor } from './agent-router';

/**
 * Unified Multi-Agent Manager
 */
export class MultiAgentManager {
  private registry: AgentRegistry;
  private router: AgentRouter;
  private spawner: SubAgentSpawner;
  private sessionTool: SessionTool;
  private initialized: boolean = false;
  private aiRouter: any = null;

  constructor() {
    this.registry = getAgentRegistry();
    this.router = getAgentRouter();
    this.spawner = getSubAgentSpawner();
    this.sessionTool = getSessionTool();
  }

  /**
   * Initialize the multi-agent system
   * @param aiRouter Optional AI router for agent execution
   */
  async initialize(aiRouter?: any): Promise<void> {
    if (this.initialized) return;

    await this.registry.initialize();
    
    // Store AI router reference
    if (aiRouter) {
      this.aiRouter = aiRouter;
    } else {
      // Try to load AI router dynamically
      try {
        const router = await import('../../ai-providers');
        this.aiRouter = router.default;
      } catch (err) {
        console.warn('[MultiAgentManager] Could not load AI router:', err);
      }
    }

    // Set up default executor if we have an AI router
    if (this.aiRouter) {
      this.setAgentExecutor(this.createDefaultExecutor());
      console.log('[MultiAgentManager] Default executor configured');
    }

    this.initialized = true;
    console.log('[MultiAgentManager] Initialized');
  }

  /**
   * Create a default agent executor using the AI router
   */
  private createDefaultExecutor(): AgentExecutor {
    return async (agent: AgentInstance, request: AgentRequest): Promise<AgentResponse> => {
      const startTime = Date.now();
      
      // Build messages for AI
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
      
      // Add system prompt if agent has one
      if (agent.config.systemPrompt) {
        messages.push({ 
          role: 'system', 
          content: agent.config.systemPrompt 
        });
      } else {
        // Default system prompt for agents
        messages.push({
          role: 'system',
          content: `You are ${agent.config.name}${agent.config.description ? `: ${agent.config.description}` : ''}. 
Be helpful, concise, and accurate in your responses.`
        });
      }

      // Add context from request if available
      if (request.context && request.context.length > 0) {
        for (const msg of request.context.slice(-10)) { // Last 10 messages
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          });
        }
      }

      // Add the current message
      messages.push({ role: 'user', content: request.message });

      // Call AI router
      let responseContent = '';
      try {
        await this.aiRouter.stream(messages, (chunk: { content?: string }) => {
          if (chunk.content) {
            responseContent += chunk.content;
          }
        }, {
          model: agent.config.model,
          maxTokens: agent.config.maxTokensPerRequest || 4096
        });
      } catch (aiError: any) {
        console.error('[MultiAgentManager] AI call failed:', aiError);
        return {
          requestId: request.id,
          agentId: agent.config.id,
          content: `Error: ${aiError.message}`,
          duration: Date.now() - startTime
        };
      }

      return {
        requestId: request.id,
        agentId: agent.config.id,
        content: responseContent,
        duration: Date.now() - startTime
      };
    };
  }

  /**
   * Set the main agent executor
   */
  setAgentExecutor(executor: AgentExecutor): void {
    this.router.setExecutor(executor);
    
    // Register handlers for all agents
    for (const agent of this.registry.getAll()) {
      this.sessionTool.registerHandler(agent.config.id, async (session, message) => {
        const request: AgentRequest = {
          id: message.id,
          message: message.content,
          sessionId: session.id,
          channelId: session.channelId,
          userId: session.userId,
          context: session.context
        };
        return executor(agent, request);
      });
    }
  }

  /**
   * Set the sub-agent executor
   */
  setSubAgentExecutor(executor: SubAgentExecutor): void {
    this.spawner.setExecutor(executor);
  }

  // Agent management (delegate to registry)

  registerAgent(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>): AgentConfig {
    return this.registry.register(config);
  }

  unregisterAgent(agentId: string): boolean {
    this.sessionTool.unregisterHandler(agentId);
    return this.registry.unregister(agentId);
  }

  getAgent(agentId: string): AgentInstance | undefined {
    return this.registry.get(agentId);
  }

  getAllAgents(): AgentInstance[] {
    return this.registry.getAll();
  }

  updateAgent(agentId: string, updates: Partial<AgentConfig>): AgentConfig | null {
    return this.registry.update(agentId, updates);
  }

  // Routing (delegate to router)

  route(message: string, channelId?: string, userId?: string): AgentInstance | null {
    const result = this.router.autoRoute(message, channelId, userId);
    return result?.agent || null;
  }

  async executeMessage(
    message: string,
    channelId?: string,
    userId?: string,
    preferredAgent?: string
  ): Promise<AgentResponse | null> {
    return this.router.execute({
      message,
      channelId,
      userId,
      preferredAgent,
      capabilities: this.router.detectCapabilities(message)
    });
  }

  // Sub-agents (delegate to spawner)

  async spawnSubAgent(
    parentAgentId: string,
    task: string,
    context: AgentMessage[] = [],
    options?: { model?: string; timeout?: number; tools?: string[] }
  ): Promise<any> {
    const config: SubAgentConfig = {
      parentId: parentAgentId,
      task,
      model: options?.model,
      timeout: options?.timeout,
      tools: options?.tools
    };
    
    const result = await this.spawner.spawn(config, context);
    return result;
  }

  async spawnSubAgentsParallel(
    parentAgentId: string,
    tasks: string[],
    context: AgentMessage[] = []
  ): Promise<any[]> {
    const configs: SubAgentConfig[] = tasks.map(task => ({
      parentId: parentAgentId,
      task
    }));
    
    const results = await this.spawner.spawnParallel(configs, context);
    return results;
  }

  // Session management (delegate to session tool)

  getSession(agentId: string, channelId?: string, userId?: string) {
    return this.sessionTool.getOrCreateSession(agentId, channelId, userId);
  }

  listSessions(agentId?: string) {
    return this.sessionTool.listSessions({ agentId });
  }

  getSessionHistory(sessionId: string, limit?: number) {
    return this.sessionTool.getHistory(sessionId, limit);
  }

  async sendToAgent(
    fromSessionId: string,
    toAgentId: string,
    message: string,
    waitForReply: boolean = true
  ) {
    return this.sessionTool.send(fromSessionId, toAgentId, message, { waitForReply });
  }

  // Stats

  getStats() {
    return {
      agents: this.registry.getStats(),
      subAgents: this.spawner.getStatus(),
      sessions: this.sessionTool.listSessions().length
    };
  }

  // Cleanup

  cleanup(): void {
    this.router.clearCache();
    this.spawner.clearCompleted();
    this.sessionTool.cleanup();
  }
}

// Singleton instance
let multiAgentManagerInstance: MultiAgentManager | null = null;

export function getMultiAgentManager(): MultiAgentManager {
  if (!multiAgentManagerInstance) {
    multiAgentManagerInstance = new MultiAgentManager();
  }
  return multiAgentManagerInstance;
}

/**
 * Initialize the multi-agent system
 */
export async function initializeMultiAgentSystem(): Promise<MultiAgentManager> {
  const manager = getMultiAgentManager();
  await manager.initialize();
  return manager;
}

export default MultiAgentManager;
