/**
 * AgentPrime - Distributed Coordinator
 * Multi-instance coordination and load balancing
 */

import type {
  DistributedNode,
  DistributedTask,
  ClusterState,
  LoadBalancingStrategy,
  LeaderElection,
  DistributedConfig,
  NodeCommunication,
  DistributedEvent,
  ClusterHealth,
  ClusterAlert
} from '../../types/distributed-coordinator';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as dgram from 'dgram';
import * as net from 'net';
import * as os from 'os';

// Raft log entry for persistent state
interface RaftLogEntry {
  term: number;
  index: number;
  command: any;
  timestamp: number;
}

// TCP connection info
interface PeerConnection {
  socket: net.Socket;
  nodeId: string;
  lastActivity: number;
}

export class DistributedCoordinator extends EventEmitter {
  private config: DistributedConfig;
  private node: DistributedNode;
  private clusterState: ClusterState;
  private leaderElection: LeaderElection;
  private pendingTasks: Map<string, DistributedTask> = new Map();
  private runningTasks: Map<string, DistributedTask> = new Map();
  private completedTasks: Map<string, DistributedTask> = new Map();

  private heartbeatTimer?: NodeJS.Timeout;
  private electionTimer?: NodeJS.Timeout;
  private discoverySocket?: dgram.Socket;
  
  // TCP transport
  private tcpServer?: net.Server;
  private peerConnections: Map<string, PeerConnection> = new Map();
  
  // Raft persistent state (WAL)
  private raftLog: RaftLogEntry[] = [];
  private commitIndex: number = 0;
  private lastApplied: number = 0;

  constructor(config: DistributedConfig) {
    super();

    this.config = config;
    this.node = this.createLocalNode();
    this.clusterState = this.initializeClusterState();
    this.leaderElection = this.initializeLeaderElection();

    this.startNode();
  }

  /**
   * Submit a task for distributed execution
   */
  async submitTask(task: Omit<DistributedTask, 'id' | 'submittedBy' | 'submittedAt' | 'status' | 'retries'>): Promise<string> {
    const distributedTask: DistributedTask = {
      id: crypto.randomUUID(),
      submittedBy: this.node.id,
      submittedAt: Date.now(),
      status: 'pending',
      retries: 0,
      ...task
    };

    this.pendingTasks.set(distributedTask.id, distributedTask);
    this.clusterState.tasks.push(distributedTask);

    this.emitEvent('task_submitted', this.node.id, { task: distributedTask });

    // Try to assign task immediately
    await this.assignTask(distributedTask);

    return distributedTask.id;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): DistributedTask | null {
    return this.pendingTasks.get(taskId) ||
           this.runningTasks.get(taskId) ||
           this.completedTasks.get(taskId) ||
           null;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.getTaskStatus(taskId);
    if (!task) return false;

    if (task.status === 'running' && task.assignedTo) {
      // Send cancellation to assigned node
      await this.sendMessage(task.assignedTo, {
        type: 'task_cancellation',
        payload: { taskId }
      });
    }

    task.status = 'cancelled';
    this.pendingTasks.delete(taskId);
    this.runningTasks.delete(taskId);

    this.emitEvent('task_cancelled', this.node.id, { taskId });

    return true;
  }

  /**
   * Get cluster status
   */
  getClusterStatus(): ClusterState {
    return { ...this.clusterState };
  }

  /**
   * Check if current node is leader
   */
  isLeader(): boolean {
    return this.leaderElection.leader === this.node.id;
  }

  /**
   * Get current leader
   */
  getLeader(): DistributedNode | null {
    return this.clusterState.nodes.find(node => node.id === this.leaderElection.leader) || null;
  }

  /**
   * Manually trigger leader election
   */
  async triggerElection(): Promise<void> {
    if (this.isLeader()) {
      // Leader steps down
      this.leaderElection.leader = '';
      this.leaderElection.term++;
    }

    await this.startElection();
  }

  // Private methods

  private createLocalNode(): DistributedNode {
    return {
      id: this.config.nodeId,
      name: `AgentPrime-${this.config.nodeId.slice(0, 8)}`,
      address: '127.0.0.1', // Would detect actual IP
      port: 3000, // Would be configurable
      role: 'follower',
      status: 'online',
      capabilities: {
        supportsAI: true,
        supportsPlugins: true,
        supportsCollaboration: true,
        supportsCloudSync: true,
        maxConcurrentTasks: 10,
        availableMemory: 4096, // MB
        availableCPU: 4,
        supportedLanguages: ['javascript', 'typescript', 'python', 'java'],
        supportedProviders: ['anthropic', 'openai', 'ollama']
      },
      load: {
        activeTasks: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        networkLatency: 0,
        taskQueueLength: 0,
        uptime: 0
      },
      lastHeartbeat: Date.now(),
      joinedAt: Date.now(),
      metadata: {}
    };
  }

  private initializeClusterState(): ClusterState {
    return {
      leader: '',
      nodes: [this.node],
      tasks: [],
      topology: {
        regions: { 'local': [this.node.id] },
        zones: { 'default': [this.node.id] },
        connections: []
      },
      health: {
        overall: 'healthy',
        nodeHealth: { [this.node.id]: 'healthy' },
        alerts: [],
        metrics: {
          totalNodes: 1,
          activeNodes: 1,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          averageLatency: 0,
          throughput: 0,
          uptime: 0
        }
      },
      lastUpdated: Date.now()
    };
  }

  private initializeLeaderElection(): LeaderElection {
    return {
      term: 0,
      leader: '',
      votesReceived: 0,
      electionTimeout: this.config.electionTimeout * 1000,
      lastHeartbeat: Date.now()
    };
  }

  private async startNode(): Promise<void> {
    // Start discovery
    await this.startDiscovery();

    // Start heartbeat
    this.startHeartbeat();

    // Try to join cluster
    await this.discoverPeers();

    // Start election if no leader
    if (!this.clusterState.leader) {
      await this.startElection();
    }
  }

  private async startDiscovery(): Promise<void> {
    // Start TCP server first
    try {
      await this.startTcpServer();
    } catch (error) {
      console.warn('[Distributed] Failed to start TCP server:', error);
    }
    
    // Start multicast discovery
    if (this.config.discoveryMethod === 'multicast') {
      this.discoverySocket = dgram.createSocket('udp4');

      this.discoverySocket.on('message', (msg, rinfo) => {
        try {
          const message = JSON.parse(msg.toString());
          this.handleDiscoveryMessage(message, rinfo);
        } catch (error) {
          console.warn('Invalid discovery message:', error);
        }
      });

      this.discoverySocket.bind(41234); // Discovery port
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (this.isLeader()) {
        // Send heartbeats to followers
        for (const node of this.clusterState.nodes) {
          if (node.id !== this.node.id && node.status === 'online') {
            await this.sendHeartbeat(node.id);
          }
        }
      } else {
        // Check leader heartbeat
        const leader = this.getLeader();
        if (leader && Date.now() - this.leaderElection.lastHeartbeat > this.leaderElection.electionTimeout) {
          console.log('Leader heartbeat timeout, starting election');
          await this.startElection();
        }
      }

      // Update node load
      await this.updateNodeLoad();

      // Update cluster health
      this.updateClusterHealth();

    }, this.config.heartbeatInterval * 1000);
  }

  private async assignTask(task: DistributedTask): Promise<void> {
    if (!this.isLeader()) {
      // Forward to leader
      await this.sendMessage(this.leaderElection.leader, {
        type: 'task_submission',
        payload: task
      });
      return;
    }

    // Find best node for task
    const targetNode = await this.selectNodeForTask(task);
    if (!targetNode) {
      console.warn('No suitable node found for task:', task.id);
      return;
    }

    task.assignedTo = targetNode.id;
    task.status = 'assigned';
    task.startedAt = Date.now();

    this.pendingTasks.delete(task.id);
    this.runningTasks.set(task.id, task);

    // Send task to node
    await this.sendMessage(targetNode.id, {
      type: 'task_assignment',
      payload: task
    });

    this.emitEvent('task_assigned', this.node.id, { task, assignedTo: targetNode.id });
  }

  private async selectNodeForTask(task: DistributedTask): Promise<DistributedNode | null> {
    const candidates = this.clusterState.nodes.filter(node =>
      node.status === 'online' &&
      node.capabilities.maxConcurrentTasks > node.load.activeTasks &&
      this.nodeSupportsTask(node, task)
    );

    if (candidates.length === 0) return null;

    switch (this.config.loadBalancingStrategy.name) {
      case 'least_loaded':
        return candidates.reduce((min, node) =>
          node.load.cpuUsage < min.load.cpuUsage ? node : min
        );

      case 'round_robin':
        // Simple round-robin implementation
        const index = Math.floor(Math.random() * candidates.length);
        return candidates[index];

      case 'capability_based':
        // Prefer nodes with specific capabilities
        return candidates.find(node =>
          task.type === 'ai_completion' ? node.capabilities.supportsAI : true
        ) || candidates[0];

      default:
        return candidates[0];
    }
  }

  private nodeSupportsTask(node: DistributedNode, task: DistributedTask): boolean {
    switch (task.type) {
      case 'ai_completion':
        return node.capabilities.supportsAI;
      case 'plugin_execution':
        return node.capabilities.supportsPlugins;
      case 'collaboration_sync':
        return node.capabilities.supportsCollaboration;
      default:
        return true;
    }
  }

  private async startElection(): Promise<void> {
    this.leaderElection.term++;
    this.leaderElection.votedFor = this.node.id;
    this.leaderElection.votesReceived = 1; // Vote for self

    // Send vote requests to other nodes
    for (const node of this.clusterState.nodes) {
      if (node.id !== this.node.id) {
        await this.sendMessage(node.id, {
          type: 'vote_request',
          payload: {
            term: this.leaderElection.term,
            candidateId: this.node.id
          }
        });
      }
    }

    // Set election timeout
    this.electionTimer = setTimeout(async () => {
      if (this.leaderElection.votesReceived > this.clusterState.nodes.length / 2) {
        // Won election
        this.leaderElection.leader = this.node.id;
        this.node.role = 'leader';
        this.emitEvent('leader_elected', this.node.id, { term: this.leaderElection.term });

        // Send leader announcements
        for (const node of this.clusterState.nodes) {
          if (node.id !== this.node.id) {
            await this.sendMessage(node.id, {
              type: 'leader_announcement',
              payload: {
                leader: this.node.id,
                term: this.leaderElection.term
              }
            });
          }
        }
      } else {
        // Election failed, try again
        setTimeout(() => this.startElection(), Math.random() * 1000);
      }
    }, Math.random() * this.leaderElection.electionTimeout);
  }

  private async handleMessage(message: NodeCommunication): Promise<void> {
    switch (message.type) {
      case 'heartbeat':
        await this.handleHeartbeat(message);
        break;
      case 'task_assignment':
        await this.handleTaskAssignment(message);
        break;
      case 'task_result':
        await this.handleTaskResult(message);
        break;
      case 'vote_request':
        await this.handleVoteRequest(message);
        break;
      case 'leader_announcement':
        await this.handleLeaderAnnouncement(message);
        break;
    }
  }

  private async handleHeartbeat(message: NodeCommunication): Promise<void> {
    if (this.isLeader()) {
      // Update follower status
      const node = this.clusterState.nodes.find(n => n.id === message.from);
      if (node) {
        node.lastHeartbeat = Date.now();
        node.load = message.payload.load;
      }
    }
  }

  private async handleTaskAssignment(message: NodeCommunication): Promise<void> {
    const task: DistributedTask = message.payload;

    // Execute task locally
    try {
      const result = await this.executeTaskLocally(task);
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();

      // Send result back
      await this.sendMessage(this.leaderElection.leader, {
        type: 'task_result',
        payload: task
      });

    } catch (error: unknown) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.retries++;

      if (task.retries < task.maxRetries) {
        // Retry task
        task.status = 'pending';
        this.pendingTasks.set(task.id, task);
      }

      await this.sendMessage(this.leaderElection.leader, {
        type: 'task_result',
        payload: task
      });
    }
  }

  private async handleTaskResult(message: NodeCommunication): Promise<void> {
    if (!this.isLeader()) return;

    const task: DistributedTask = message.payload;
    this.runningTasks.delete(task.id);
    this.completedTasks.set(task.id, task);

    this.emitEvent('task_completed', message.from, { task });
  }

  private async handleVoteRequest(message: NodeCommunication): Promise<void> {
    const { term, candidateId } = message.payload;

    if (term > this.leaderElection.term) {
      this.leaderElection.term = term;
      this.leaderElection.votedFor = candidateId;

      await this.sendMessage(candidateId, {
        type: 'vote_response',
        payload: { term, granted: true }
      });
    }
  }

  private async handleLeaderAnnouncement(message: NodeCommunication): Promise<void> {
    const { leader, term } = message.payload;

    if (term >= this.leaderElection.term) {
      this.leaderElection.term = term;
      this.leaderElection.leader = leader;
      this.leaderElection.lastHeartbeat = Date.now();

      // Clear any election timer
      if (this.electionTimer) {
        clearTimeout(this.electionTimer);
        this.electionTimer = undefined;
      }

      this.emitEvent('leader_changed', this.node.id, { leader, term });
    }
  }

  private async executeTaskLocally(task: DistributedTask): Promise<any> {
    // Placeholder task execution - would route to appropriate services
    switch (task.type) {
      case 'ai_completion':
        return { completion: 'Mock AI response' };
      case 'code_analysis':
        return { analysis: 'Mock analysis result' };
      default:
        return { result: 'Task completed' };
    }
  }

  private async sendHeartbeat(targetNodeId: string): Promise<void> {
    await this.sendMessage(targetNodeId, {
      type: 'heartbeat',
      payload: {
        leader: this.node.id,
        term: this.leaderElection.term,
        timestamp: Date.now()
      }
    });
  }

  private async sendMessage(targetNodeId: string, message: { type: NodeCommunication['type']; payload: any }): Promise<void> {
    const fullMessage: NodeCommunication = {
      type: message.type,
      from: this.node.id,
      to: targetNodeId,
      payload: message.payload,
      timestamp: Date.now(),
      correlationId: crypto.randomUUID()
    };

    // Try to send via existing connection
    const connection = this.peerConnections.get(targetNodeId);
    if (connection && !connection.socket.destroyed) {
      try {
        const data = JSON.stringify(fullMessage) + '\n';
        connection.socket.write(data);
        connection.lastActivity = Date.now();
        return;
      } catch (error) {
        console.warn(`[Distributed] Failed to send to ${targetNodeId}, will try to reconnect`);
        this.peerConnections.delete(targetNodeId);
      }
    }

    // Find node and establish connection
    const targetNode = this.clusterState.nodes.find(n => n.id === targetNodeId);
    if (!targetNode) {
      console.warn(`[Distributed] Unknown target node: ${targetNodeId}`);
      return;
    }

    // Establish new TCP connection
    await this.connectToPeer(targetNode, fullMessage);
  }

  /**
   * Start TCP server for peer communication
   */
  private async startTcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcpServer = net.createServer((socket) => {
        this.handlePeerConnection(socket);
      });

      this.tcpServer.on('error', (error) => {
        console.error('[Distributed] TCP server error:', error);
        reject(error);
      });

      this.tcpServer.listen(this.node.port, () => {
        console.log(`[Distributed] TCP server listening on port ${this.node.port}`);
        resolve();
      });
    });
  }

  /**
   * Handle incoming peer connection
   */
  private handlePeerConnection(socket: net.Socket): void {
    let buffer = '';
    let peerId: string | null = null;

    socket.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete messages (newline-delimited JSON)
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const messageStr = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        
        try {
          const message: NodeCommunication = JSON.parse(messageStr);
          
          // Track peer connection
          if (!peerId && message.from) {
            peerId = message.from;
            this.peerConnections.set(peerId, {
              socket,
              nodeId: peerId,
              lastActivity: Date.now()
            });
          }
          
          this.handleMessage(message);
        } catch (error) {
          console.warn('[Distributed] Invalid message:', error);
        }
      }
    });

    socket.on('close', () => {
      if (peerId) {
        this.peerConnections.delete(peerId);
        console.log(`[Distributed] Peer disconnected: ${peerId}`);
      }
    });

    socket.on('error', (error) => {
      console.warn('[Distributed] Socket error:', error);
    });
  }

  /**
   * Connect to a peer node
   */
  private async connectToPeer(node: DistributedNode, initialMessage?: NodeCommunication): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: node.address, port: node.port }, () => {
        console.log(`[Distributed] Connected to peer: ${node.id}`);
        
        this.peerConnections.set(node.id, {
          socket,
          nodeId: node.id,
          lastActivity: Date.now()
        });

        // Send initial message if provided
        if (initialMessage) {
          socket.write(JSON.stringify(initialMessage) + '\n');
        }

        resolve();
      });

      // Handle incoming data on this connection
      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const messageStr = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          
          try {
            const message: NodeCommunication = JSON.parse(messageStr);
            this.handleMessage(message);
          } catch (error) {
            console.warn('[Distributed] Invalid message:', error);
          }
        }
      });

      socket.on('close', () => {
        this.peerConnections.delete(node.id);
      });

      socket.on('error', (error) => {
        console.warn(`[Distributed] Connection error to ${node.id}:`, error);
        reject(error);
      });

      // Timeout for connection
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  // ==========================================
  // Raft Consensus - Persistent Log (WAL)
  // ==========================================

  /**
   * Append entry to Raft log
   */
  appendToLog(command: any): RaftLogEntry {
    const entry: RaftLogEntry = {
      term: this.leaderElection.term,
      index: this.raftLog.length,
      command,
      timestamp: Date.now()
    };
    
    this.raftLog.push(entry);
    
    // If leader, replicate to followers
    if (this.isLeader()) {
      this.replicateLogToFollowers(entry);
    }
    
    return entry;
  }

  /**
   * Replicate log entry to followers
   */
  private async replicateLogToFollowers(entry: RaftLogEntry): Promise<void> {
    const followers = this.clusterState.nodes.filter(
      n => n.id !== this.node.id && n.status === 'online'
    );
    
    const replicationPromises = followers.map(async (follower) => {
      await this.sendMessage(follower.id, {
        type: 'heartbeat', // Use heartbeat to carry log entries
        payload: {
          leader: this.node.id,
          term: this.leaderElection.term,
          logEntry: entry,
          leaderCommit: this.commitIndex
        }
      });
    });
    
    await Promise.allSettled(replicationPromises);
    
    // Update commit index when majority responds
    const majorityCount = Math.floor(followers.length / 2) + 1;
    // In a full implementation, track acknowledgments and update commitIndex
  }

  /**
   * Get real system resources
   */
  private getRealSystemResources(): { memory: number; cpu: number } {
    const totalMem = os.totalmem() / (1024 * 1024); // MB
    const freeMem = os.freemem() / (1024 * 1024);
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
    
    // CPU usage is harder to get synchronously, use load average
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuUsage = (loadAvg / cpuCount) * 100;
    
    return { memory: Math.round(memoryUsage), cpu: Math.round(cpuUsage) };
  }

  /**
   * Shutdown the coordinator gracefully
   */
  async shutdown(): Promise<void> {
    // Stop timers
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.electionTimer) clearTimeout(this.electionTimer);
    
    // Close TCP connections
    for (const [nodeId, conn] of this.peerConnections) {
      conn.socket.destroy();
    }
    this.peerConnections.clear();
    
    // Close TCP server
    if (this.tcpServer) {
      this.tcpServer.close();
    }
    
    // Close discovery socket
    if (this.discoverySocket) {
      this.discoverySocket.close();
    }
    
    this.emitEvent('node_shutdown', this.node.id, {});
    console.log('[Distributed] Coordinator shutdown complete');
  }

  private handleDiscoveryMessage(message: any, rinfo: any): void {
    // Handle node discovery messages
    console.log('Discovery message from:', rinfo.address, message);
  }

  private async discoverPeers(): Promise<void> {
    if (this.discoverySocket) {
      const discoveryMessage = {
        type: 'discovery',
        nodeId: this.node.id,
        address: this.node.address,
        port: this.node.port
      };

      this.discoverySocket.send(
        JSON.stringify(discoveryMessage),
        41234,
        '224.0.0.1' // Multicast address
      );
    }
  }

  private async updateNodeLoad(): Promise<void> {
    // Update local node load metrics with real system data
    const { memory, cpu } = this.getRealSystemResources();
    
    this.node.load.activeTasks = this.runningTasks.size;
    this.node.load.taskQueueLength = this.pendingTasks.size;
    this.node.load.memoryUsage = memory;
    this.node.load.cpuUsage = cpu;
    this.node.load.uptime = Date.now() - this.node.joinedAt;
    
    // Also update capabilities with real memory
    this.node.capabilities.availableMemory = Math.round(os.freemem() / (1024 * 1024));
    this.node.capabilities.availableCPU = os.cpus().length;
  }

  private updateClusterHealth(): void {
    const unhealthyNodes = this.clusterState.nodes.filter(node =>
      node.status !== 'online' ||
      Date.now() - node.lastHeartbeat > this.config.heartbeatInterval * 3 * 1000
    );

    this.clusterState.health.overall = unhealthyNodes.length > 0 ? 'degraded' : 'healthy';
    this.clusterState.health.metrics.activeNodes = this.clusterState.nodes.filter(n => n.status === 'online').length;
    this.clusterState.lastUpdated = Date.now();
  }

  private emitEvent(type: DistributedEvent['type'], nodeId: string, data: any): void {
    const event: DistributedEvent = {
      type,
      nodeId,
      data,
      timestamp: Date.now()
    };

    this.emit('distributed_event', event);
  }
}
