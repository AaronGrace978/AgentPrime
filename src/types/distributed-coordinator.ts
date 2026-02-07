/**
 * AgentPrime - Distributed Coordinator Types
 * Multi-instance coordination and load balancing
 */

export interface DistributedNode {
  id: string;
  name: string;
  address: string;
  port: number;
  role: 'leader' | 'follower' | 'worker';
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  capabilities: NodeCapabilities;
  load: NodeLoad;
  lastHeartbeat: number;
  joinedAt: number;
  metadata: Record<string, any>;
}

export interface NodeCapabilities {
  supportsAI: boolean;
  supportsPlugins: boolean;
  supportsCollaboration: boolean;
  supportsCloudSync: boolean;
  maxConcurrentTasks: number;
  availableMemory: number; // MB
  availableCPU: number; // cores
  supportedLanguages: string[];
  supportedProviders: string[];
}

export interface NodeLoad {
  activeTasks: number;
  memoryUsage: number; // percentage
  cpuUsage: number; // percentage
  networkLatency: number; // ms
  taskQueueLength: number;
  uptime: number; // seconds
}

export interface DistributedTask {
  id: string;
  type: 'ai_completion' | 'code_analysis' | 'plugin_execution' | 'collaboration_sync' | 'marketplace_sync';
  priority: 'low' | 'normal' | 'high' | 'critical';
  payload: any;
  assignedTo?: string; // node ID
  submittedBy: string; // node ID
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
  retries: number;
  maxRetries: number;
  timeout: number; // seconds
  dependencies: string[]; // task IDs
}

export interface ClusterState {
  leader: string; // node ID
  nodes: DistributedNode[];
  tasks: DistributedTask[];
  topology: ClusterTopology;
  health: ClusterHealth;
  lastUpdated: number;
}

export interface ClusterTopology {
  regions: { [region: string]: string[] }; // region -> node IDs
  zones: { [zone: string]: string[] }; // zone -> node IDs
  connections: NodeConnection[];
}

export interface NodeConnection {
  from: string; // node ID
  to: string; // node ID
  latency: number; // ms
  bandwidth: number; // Mbps
  reliable: boolean;
}

export interface ClusterHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  nodeHealth: { [nodeId: string]: 'healthy' | 'degraded' | 'unhealthy' };
  alerts: ClusterAlert[];
  metrics: ClusterMetrics;
}

export interface ClusterAlert {
  id: string;
  type: 'node_down' | 'high_load' | 'network_issue' | 'task_timeout' | 'leader_election';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  affectedNodes: string[];
  timestamp: number;
  resolved: boolean;
}

export interface ClusterMetrics {
  totalNodes: number;
  activeNodes: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageLatency: number;
  throughput: number; // tasks per second
  uptime: number; // seconds
}

export interface LoadBalancingStrategy {
  name: 'round_robin' | 'least_loaded' | 'capability_based' | 'geographic' | 'weighted_random';
  weights?: { [nodeId: string]: number };
  constraints?: LoadBalancingConstraint[];
}

export interface LoadBalancingConstraint {
  type: 'cpu_limit' | 'memory_limit' | 'task_limit' | 'capability_required' | 'region_preference';
  value: any;
  priority: number;
}

export interface LeaderElection {
  term: number;
  leader: string;
  votedFor?: string;
  votesReceived: number;
  electionTimeout: number;
  lastHeartbeat: number;
}

export interface DistributedConfig {
  nodeId: string;
  clusterName: string;
  discoveryMethod: 'multicast' | 'static' | 'consul' | 'etcd' | 'kubernetes';
  discoveryConfig: Record<string, any>;
  heartbeatInterval: number; // seconds
  electionTimeout: number; // seconds
  maxRetries: number;
  taskTimeout: number; // seconds
  loadBalancingStrategy: LoadBalancingStrategy;
  enableFailover: boolean;
  enableLoadBalancing: boolean;
  replicationFactor: number;
}

export interface NodeCommunication {
  type: 'heartbeat' | 'task_assignment' | 'task_result' | 'state_sync' | 'leader_election' | 
        'task_submission' | 'task_cancellation' | 'vote_request' | 'vote_response' | 'leader_announcement';
  from: string;
  to: string;
  payload: any;
  timestamp: number;
  correlationId: string;
}

export interface ReplicationStrategy {
  type: 'none' | 'master_slave' | 'multi_master' | 'quorum';
  replicas: number;
  consistency: 'strong' | 'eventual' | 'causal';
  conflictResolution: 'last_write_wins' | 'manual' | 'merge';
}

export interface DistributedEvent {
  type: 'node_joined' | 'node_left' | 'leader_elected' | 'task_assigned' | 'task_completed' | 
        'health_changed' | 'topology_changed' | 'task_submitted' | 'task_cancelled' | 'leader_changed' | 'node_shutdown';
  nodeId: string;
  data: any;
  timestamp: number;
}
