/**
 * Matrix Mode Multi-Agent System - Type Definitions
 * Agent routing, sub-agents, and session management
 */

export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';
export type AgentCapability = 'chat' | 'code' | 'search' | 'browser' | 'system' | 'integration' | '*';

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  
  // Model configuration
  model?: string;
  provider?: string;
  systemPrompt?: string;
  
  // Capabilities and tools
  capabilities: AgentCapability[];
  allowedTools?: string[];
  deniedTools?: string[];
  
  // Routing rules
  routingRules?: RoutingRule[];
  priority?: number;
  
  // Limits
  maxConcurrentTasks?: number;
  maxTokensPerRequest?: number;
  timeout?: number;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
}

export interface RoutingRule {
  type: 'channel' | 'user' | 'keyword' | 'capability' | 'pattern';
  value: string | string[];
  priority?: number;
}

export interface AgentInstance {
  config: AgentConfig;
  status: AgentStatus;
  currentTasks: number;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  lastActivityAt?: number;
  error?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface AgentRequest {
  id: string;
  message: string;
  sessionId: string;
  channelId?: string;
  userId?: string;
  context?: AgentMessage[];
  metadata?: Record<string, any>;
  timeout?: number;
}

export interface AgentResponse {
  requestId: string;
  agentId: string;
  content: string;
  actions?: AgentAction[];
  metadata?: Record<string, any>;
  tokensUsed?: number;
  duration?: number;
}

export interface AgentAction {
  type: string;
  params: Record<string, any>;
  result?: any;
  error?: string;
  executed: boolean;
}

export interface SubAgentConfig {
  parentId: string;
  task: string;
  model?: string;
  timeout?: number;
  maxTokens?: number;
  tools?: string[];
}

export interface SubAgentResult {
  subAgentId: string;
  parentId: string;
  task: string;
  status: 'completed' | 'failed' | 'timeout';
  result?: any;
  error?: string;
  duration: number;
}

export interface AgentSession {
  id: string;
  agentId: string;
  channelId?: string;
  userId?: string;
  startedAt: number;
  lastMessageAt: number;
  messageCount: number;
  context: AgentMessage[];
  metadata?: Record<string, any>;
}

export interface AgentStats {
  totalAgents: number;
  activeAgents: number;
  busyAgents: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
}

export const DEFAULT_AGENT_CONFIG: Partial<AgentConfig> = {
  capabilities: ['chat'],
  maxConcurrentTasks: 5,
  maxTokensPerRequest: 4096,
  timeout: 60000,
  priority: 0,
  enabled: true
};
