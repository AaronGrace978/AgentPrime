/**
 * Matrix Mode Agent Registry
 * Agent registration, management, and configuration
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  AgentConfig,
  AgentInstance,
  AgentStatus,
  AgentStats,
  DEFAULT_AGENT_CONFIG
} from './types';

// Generate unique ID
function generateId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export class AgentRegistry {
  private agents: Map<string, AgentInstance> = new Map();
  private configPath: string;
  private defaultAgentId: string | null = null;

  constructor(configPath?: string) {
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.configPath = configPath || path.join(userDataPath, 'matrix-agents.json');
  }

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    await this.loadAgents();
    
    // Ensure there's at least a default agent
    if (this.agents.size === 0) {
      this.registerDefaultAgent();
    }

    console.log(`[AgentRegistry] Initialized with ${this.agents.size} agents`);
  }

  /**
   * Register the default Matrix Agent
   */
  private registerDefaultAgent(): void {
    const defaultConfig: AgentConfig = {
      ...DEFAULT_AGENT_CONFIG as AgentConfig,
      id: 'matrix-default',
      name: 'Matrix Agent',
      description: 'Default Matrix Mode agent with full capabilities',
      capabilities: ['chat', 'code', 'search', 'browser', 'system', 'integration'],
      systemPrompt: `You are Matrix Agent, an AI assistant with full control of the user's computer. 
You can execute system commands, control applications, search the web, and automate tasks.
Always explain what you're about to do before taking actions.
Be helpful, precise, and safe.`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true
    };

    this.register(defaultConfig);
    this.defaultAgentId = defaultConfig.id;
  }

  /**
   * Load agents from disk
   */
  private async loadAgents(): Promise<void> {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const configs: AgentConfig[] = JSON.parse(data);
        
        for (const config of configs) {
          this.agents.set(config.id, this.createInstance(config));
        }
      }
    } catch (error) {
      console.warn('[AgentRegistry] Failed to load agents:', error);
    }
  }

  /**
   * Save agents to disk
   */
  private async saveAgents(): Promise<void> {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const configs = Array.from(this.agents.values()).map(a => a.config);
      fs.writeFileSync(this.configPath, JSON.stringify(configs, null, 2));
    } catch (error) {
      console.error('[AgentRegistry] Failed to save agents:', error);
    }
  }

  /**
   * Create an agent instance from config
   */
  private createInstance(config: AgentConfig): AgentInstance {
    return {
      config,
      status: 'idle',
      currentTasks: 0,
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0
    };
  }

  /**
   * Register a new agent
   */
  register(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): AgentConfig {
    const fullConfig: AgentConfig = {
      ...DEFAULT_AGENT_CONFIG,
      ...config,
      id: config.id || generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as AgentConfig;

    this.agents.set(fullConfig.id, this.createInstance(fullConfig));
    this.saveAgents();

    console.log(`[AgentRegistry] Registered agent: ${fullConfig.name} (${fullConfig.id})`);
    return fullConfig;
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    if (agentId === this.defaultAgentId) {
      console.warn('[AgentRegistry] Cannot unregister default agent');
      return false;
    }

    const deleted = this.agents.delete(agentId);
    if (deleted) {
      this.saveAgents();
      console.log(`[AgentRegistry] Unregistered agent: ${agentId}`);
    }
    return deleted;
  }

  /**
   * Get an agent by ID
   */
  get(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agent config
   */
  getConfig(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId)?.config;
  }

  /**
   * Get all agents
   */
  getAll(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all enabled agents
   */
  getEnabled(): AgentInstance[] {
    return this.getAll().filter(a => a.config.enabled);
  }

  /**
   * Get default agent
   */
  getDefault(): AgentInstance | undefined {
    return this.defaultAgentId ? this.agents.get(this.defaultAgentId) : undefined;
  }

  /**
   * Set default agent
   */
  setDefault(agentId: string): boolean {
    if (!this.agents.has(agentId)) {
      return false;
    }
    this.defaultAgentId = agentId;
    return true;
  }

  /**
   * Update agent config
   */
  update(agentId: string, updates: Partial<AgentConfig>): AgentConfig | null {
    const instance = this.agents.get(agentId);
    if (!instance) return null;

    instance.config = {
      ...instance.config,
      ...updates,
      id: agentId, // Prevent ID change
      updatedAt: Date.now()
    };

    this.saveAgents();
    return instance.config;
  }

  /**
   * Update agent status
   */
  updateStatus(agentId: string, status: AgentStatus, error?: string): void {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.status = status;
      instance.error = error;
      instance.lastActivityAt = Date.now();
    }
  }

  /**
   * Record task start
   */
  recordTaskStart(agentId: string): void {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.currentTasks++;
      instance.totalTasks++;
      instance.lastActivityAt = Date.now();
      
      if (instance.currentTasks >= (instance.config.maxConcurrentTasks || 5)) {
        instance.status = 'busy';
      }
    }
  }

  /**
   * Record task completion
   */
  recordTaskComplete(agentId: string, success: boolean): void {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.currentTasks = Math.max(0, instance.currentTasks - 1);
      
      if (success) {
        instance.successfulTasks++;
      } else {
        instance.failedTasks++;
      }
      
      if (instance.currentTasks === 0) {
        instance.status = 'idle';
      }
      
      instance.lastActivityAt = Date.now();
    }
  }

  /**
   * Check if agent can accept new task
   */
  canAcceptTask(agentId: string): boolean {
    const instance = this.agents.get(agentId);
    if (!instance || !instance.config.enabled) {
      return false;
    }

    const maxTasks = instance.config.maxConcurrentTasks || 5;
    return instance.currentTasks < maxTasks;
  }

  /**
   * Get agents by capability
   */
  getByCapability(capability: string): AgentInstance[] {
    return this.getEnabled().filter(a => 
      a.config.capabilities.includes(capability as any) ||
      a.config.capabilities.includes('*')
    );
  }

  /**
   * Get agent statistics
   */
  getStats(): AgentStats {
    const all = this.getAll();
    const active = all.filter(a => a.status !== 'offline' && a.config.enabled);
    const busy = all.filter(a => a.status === 'busy');

    const totalRequests = all.reduce((sum, a) => sum + a.totalTasks, 0);
    const successfulRequests = all.reduce((sum, a) => sum + a.successfulTasks, 0);
    const failedRequests = all.reduce((sum, a) => sum + a.failedTasks, 0);

    return {
      totalAgents: all.length,
      activeAgents: active.length,
      busyAgents: busy.length,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: 0 // Would need to track this separately
    };
  }

  /**
   * Enable an agent
   */
  enable(agentId: string): boolean {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.config.enabled = true;
      instance.config.updatedAt = Date.now();
      this.saveAgents();
      return true;
    }
    return false;
  }

  /**
   * Disable an agent
   */
  disable(agentId: string): boolean {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.config.enabled = false;
      instance.config.updatedAt = Date.now();
      this.saveAgents();
      return true;
    }
    return false;
  }

  /**
   * Clone an agent with new ID
   */
  clone(agentId: string, newName: string): AgentConfig | null {
    const instance = this.agents.get(agentId);
    if (!instance) return null;

    const clonedConfig: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      ...instance.config,
      name: newName
    };
    
    delete (clonedConfig as any).id;
    delete (clonedConfig as any).createdAt;
    delete (clonedConfig as any).updatedAt;

    return this.register(clonedConfig);
  }
}

// Singleton instance
let agentRegistryInstance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!agentRegistryInstance) {
    agentRegistryInstance = new AgentRegistry();
  }
  return agentRegistryInstance;
}

export default AgentRegistry;
