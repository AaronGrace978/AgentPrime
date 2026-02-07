/**
 * Matrix Mode Nodes System
 * Remote agent nodes for mobile and cross-device support
 */

import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import crypto from 'crypto';

// Types
export interface NodeConfig {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'server' | 'iot';
  platform: string;
  capabilities: NodeCapability[];
  paired: boolean;
  pairingCode?: string;
  lastSeen?: number;
  metadata?: Record<string, any>;
}

export type NodeCapability = 
  | 'camera'
  | 'microphone'
  | 'screen'
  | 'location'
  | 'notifications'
  | 'clipboard'
  | 'files'
  | 'commands'
  | 'canvas';

export interface NodeCommand {
  id: string;
  type: string;
  params: Record<string, any>;
  timeout?: number;
}

export interface NodeResponse {
  commandId: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface NodeMessage {
  type: 'command' | 'response' | 'event' | 'ping' | 'pong' | 'pair' | 'unpair';
  payload: any;
  timestamp: number;
}

// Generate codes/IDs
function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generatePairingCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Node Manager - Manages remote agent nodes
 */
export class NodeManager extends EventEmitter {
  private nodes: Map<string, NodeConfig> = new Map();
  private connections: Map<string, WebSocket> = new Map();
  private pendingPairings: Map<string, { code: string; expires: number; nodeId: string }> = new Map();
  private server: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private port: number = 18792;
  private pairingTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor(port?: number) {
    super();
    if (port) this.port = port;
  }

  /**
   * Start the node server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        // QR code endpoint for pairing
        if (req.url?.startsWith('/pair/')) {
          const code = req.url.substring(6);
          const pairing = this.pendingPairings.get(code);
          
          if (pairing && Date.now() < pairing.expires) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              code,
              wsUrl: `ws://localhost:${this.port}`,
              nodeId: pairing.nodeId
            }));
          } else {
            res.writeHead(404);
            res.end('Pairing code expired or invalid');
          }
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', nodes: this.nodes.size }));
      });

      this.server = new WebSocketServer({ server: this.httpServer });

      this.server.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.httpServer.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          this.port++;
          this.httpServer?.listen(this.port);
        } else {
          reject(error);
        }
      });

      this.httpServer.listen(this.port, () => {
        console.log(`[NodeManager] Started on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the node server
   */
  async stop(): Promise<void> {
    // Close all connections
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();

    return new Promise((resolve) => {
      this.server?.close(() => {
        this.httpServer?.close(() => {
          console.log('[NodeManager] Stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Handle new connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    let nodeId: string | null = null;

    ws.on('message', (data) => {
      try {
        const message: NodeMessage = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'pair':
            nodeId = this.handlePairing(ws, message.payload);
            break;
          
          case 'response':
            if (nodeId) {
              this.emit('response', nodeId, message.payload as NodeResponse);
            }
            break;
          
          case 'event':
            if (nodeId) {
              this.emit('nodeEvent', nodeId, message.payload);
            }
            break;
          
          case 'ping':
            this.send(ws, { type: 'pong', payload: {}, timestamp: Date.now() });
            if (nodeId) {
              const node = this.nodes.get(nodeId);
              if (node) node.lastSeen = Date.now();
            }
            break;
        }
      } catch (error) {
        console.error('[NodeManager] Message error:', error);
      }
    });

    ws.on('close', () => {
      if (nodeId) {
        this.connections.delete(nodeId);
        this.emit('nodeDisconnected', nodeId);
        console.log(`[NodeManager] Node disconnected: ${nodeId}`);
      }
    });

    ws.on('error', (error) => {
      console.error('[NodeManager] WebSocket error:', error);
    });
  }

  /**
   * Handle pairing request
   */
  private handlePairing(ws: WebSocket, payload: any): string | null {
    const { code, nodeInfo } = payload;

    const pairing = this.pendingPairings.get(code);
    if (!pairing || Date.now() > pairing.expires) {
      this.send(ws, { 
        type: 'pair', 
        payload: { success: false, error: 'Invalid or expired code' },
        timestamp: Date.now()
      });
      return null;
    }

    // Create or update node
    const node: NodeConfig = {
      id: pairing.nodeId,
      name: nodeInfo.name || 'Unknown Node',
      type: nodeInfo.type || 'mobile',
      platform: nodeInfo.platform || 'unknown',
      capabilities: nodeInfo.capabilities || [],
      paired: true,
      lastSeen: Date.now(),
      metadata: nodeInfo.metadata
    };

    this.nodes.set(node.id, node);
    this.connections.set(node.id, ws);
    this.pendingPairings.delete(code);

    this.send(ws, {
      type: 'pair',
      payload: { success: true, nodeId: node.id },
      timestamp: Date.now()
    });

    this.emit('nodePaired', node);
    console.log(`[NodeManager] Node paired: ${node.name} (${node.id})`);

    return node.id;
  }

  /**
   * Send message to WebSocket
   */
  private send(ws: WebSocket, message: NodeMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Generate pairing code for new node
   */
  generatePairingCode(): { code: string; nodeId: string; expiresAt: number; qrUrl: string } {
    const code = generatePairingCode();
    const nodeId = generateId();
    const expiresAt = Date.now() + this.pairingTimeout;

    this.pendingPairings.set(code, {
      code,
      nodeId,
      expires: expiresAt
    });

    // Clean up expired pairings
    setTimeout(() => {
      this.pendingPairings.delete(code);
    }, this.pairingTimeout);

    return {
      code,
      nodeId,
      expiresAt,
      qrUrl: `http://localhost:${this.port}/pair/${code}`
    };
  }

  /**
   * Send command to a node
   */
  async sendCommand(nodeId: string, command: Omit<NodeCommand, 'id'>): Promise<NodeResponse> {
    const ws = this.connections.get(nodeId);
    if (!ws) {
      throw new Error(`Node not connected: ${nodeId}`);
    }

    const fullCommand: NodeCommand = {
      ...command,
      id: generateId()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('response', responseHandler);
        reject(new Error('Command timeout'));
      }, command.timeout || 30000);

      const responseHandler = (respNodeId: string, response: NodeResponse) => {
        if (respNodeId === nodeId && response.commandId === fullCommand.id) {
          clearTimeout(timeout);
          this.off('response', responseHandler);
          resolve(response);
        }
      };

      this.on('response', responseHandler);

      this.send(ws, {
        type: 'command',
        payload: fullCommand,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Get node info
   */
  getNode(nodeId: string): NodeConfig | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): NodeConfig[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get connected nodes
   */
  getConnectedNodes(): NodeConfig[] {
    return this.getAllNodes().filter(n => this.connections.has(n.id));
  }

  /**
   * Get nodes by capability
   */
  getNodesByCapability(capability: NodeCapability): NodeConfig[] {
    return this.getAllNodes().filter(n => 
      n.capabilities.includes(capability) && this.connections.has(n.id)
    );
  }

  /**
   * Unpair a node
   */
  unpairNode(nodeId: string): boolean {
    const ws = this.connections.get(nodeId);
    if (ws) {
      this.send(ws, { type: 'unpair', payload: {}, timestamp: Date.now() });
      ws.close();
    }
    
    this.connections.delete(nodeId);
    const deleted = this.nodes.delete(nodeId);
    
    if (deleted) {
      this.emit('nodeUnpaired', nodeId);
    }
    
    return deleted;
  }

  /**
   * Check if node is connected
   */
  isConnected(nodeId: string): boolean {
    const ws = this.connections.get(nodeId);
    return ws?.readyState === WebSocket.OPEN;
  }

  // Convenience methods for common commands

  /**
   * Request camera capture from node
   */
  async captureCamera(nodeId: string, options?: { facing?: 'front' | 'back' }): Promise<Buffer | null> {
    const response = await this.sendCommand(nodeId, {
      type: 'camera.capture',
      params: options || {}
    });
    
    if (response.success && response.data) {
      return Buffer.from(response.data, 'base64');
    }
    return null;
  }

  /**
   * Request screen capture from node
   */
  async captureScreen(nodeId: string): Promise<Buffer | null> {
    const response = await this.sendCommand(nodeId, {
      type: 'screen.capture',
      params: {}
    });
    
    if (response.success && response.data) {
      return Buffer.from(response.data, 'base64');
    }
    return null;
  }

  /**
   * Request location from node
   */
  async getLocation(nodeId: string): Promise<{ latitude: number; longitude: number } | null> {
    const response = await this.sendCommand(nodeId, {
      type: 'location.get',
      params: {}
    });
    
    return response.success ? response.data : null;
  }

  /**
   * Send notification to node
   */
  async sendNotification(nodeId: string, title: string, body: string): Promise<boolean> {
    const response = await this.sendCommand(nodeId, {
      type: 'notification.send',
      params: { title, body }
    });
    
    return response.success;
  }

  /**
   * Execute command on node
   */
  async executeCommand(nodeId: string, command: string, args?: string[]): Promise<string | null> {
    const response = await this.sendCommand(nodeId, {
      type: 'shell.execute',
      params: { command, args }
    });
    
    return response.success ? response.data : null;
  }

  /**
   * Display canvas on node
   */
  async displayCanvas(nodeId: string, html: string): Promise<boolean> {
    const response = await this.sendCommand(nodeId, {
      type: 'canvas.display',
      params: { html }
    });
    
    return response.success;
  }
}

// Singleton
let nodeManagerInstance: NodeManager | null = null;

export function getNodeManager(port?: number): NodeManager {
  if (!nodeManagerInstance) {
    nodeManagerInstance = new NodeManager(port);
  }
  return nodeManagerInstance;
}

export async function initializeNodeManager(port?: number): Promise<NodeManager> {
  const manager = getNodeManager(port);
  await manager.start();
  return manager;
}

export default NodeManager;
