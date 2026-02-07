/**
 * Matrix Mode Gateway Server
 * WebSocket server for channel bridges and external connections
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { EventEmitter } from 'events';
import { GatewayConfig, DEFAULT_GATEWAY_CONFIG, Message, OutgoingMessage, MessageResult } from './types';

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface GatewayClient {
  id: string;
  ws: WebSocket;
  type: 'bridge' | 'client' | 'node';
  name?: string;
  channelId?: string;
  connectedAt: number;
  lastPingAt: number;
  authenticated: boolean;
  metadata?: Record<string, any>;
}

export interface GatewayMessage {
  type: string;
  payload: any;
  id?: string;
  timestamp?: number;
}

export class GatewayServer extends EventEmitter {
  private config: GatewayConfig;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, GatewayClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private started: boolean = false;
  private authToken?: string;

  constructor(config: Partial<GatewayConfig> = {}) {
    super();
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Start the gateway server
   */
  async start(): Promise<void> {
    if (this.started) return;

    return new Promise((resolve, reject) => {
      // Create HTTP server
      this.server = http.createServer((req, res) => {
        // Health check endpoint
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', clients: this.clients.size }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

      // Create WebSocket server
      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        console.error('[GatewayServer] WebSocket error:', error);
        this.emit('error', error);
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.warn(`[GatewayServer] Port ${this.config.port} in use, trying ${this.config.port + 1}`);
          this.config.port++;
          this.server?.listen(this.config.port, this.config.host);
        } else {
          reject(error);
        }
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.started = true;
        this.startHeartbeat();
        console.log(`[GatewayServer] Started on ws://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the gateway server
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.started = false;
          console.log('[GatewayServer] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const clientId = generateId();
    
    // Check max connections
    if (this.clients.size >= this.config.maxConnections) {
      ws.close(1013, 'Max connections reached');
      return;
    }

    const client: GatewayClient = {
      id: clientId,
      ws,
      type: 'client',
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
      authenticated: !this.authToken // Auto-authenticate if no token required
    };

    this.clients.set(clientId, client);

    console.log(`[GatewayServer] Client connected: ${clientId}`);
    this.emit('clientConnected', client);

    // Send welcome message
    this.send(clientId, {
      type: 'welcome',
      payload: {
        clientId,
        requiresAuth: !!this.authToken
      }
    });

    // Handle messages
    ws.on('message', (data) => {
      this.handleMessage(client, data);
    });

    // Handle close
    ws.on('close', (code, reason) => {
      this.clients.delete(clientId);
      console.log(`[GatewayServer] Client disconnected: ${clientId} (${code})`);
      this.emit('clientDisconnected', clientId, code, reason.toString());
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[GatewayServer] Client error ${clientId}:`, error);
      this.emit('clientError', clientId, error);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(client: GatewayClient, data: any): void {
    let message: GatewayMessage;
    
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.send(client.id, { type: 'error', payload: { error: 'Invalid JSON' } });
      return;
    }

    client.lastPingAt = Date.now();

    // Handle authentication
    if (!client.authenticated) {
      if (message.type === 'auth') {
        if (message.payload?.token === this.authToken) {
          client.authenticated = true;
          client.name = message.payload?.name;
          client.type = message.payload?.type || 'client';
          this.send(client.id, { type: 'auth_success', payload: { clientId: client.id } });
        } else {
          this.send(client.id, { type: 'auth_failed', payload: { error: 'Invalid token' } });
          client.ws.close(4001, 'Authentication failed');
        }
        return;
      } else {
        this.send(client.id, { type: 'error', payload: { error: 'Authentication required' } });
        return;
      }
    }

    // Handle message types
    switch (message.type) {
      case 'ping':
        this.send(client.id, { type: 'pong', payload: { timestamp: Date.now() } });
        break;

      case 'subscribe':
        // Subscribe to channel events
        client.channelId = message.payload?.channelId;
        this.send(client.id, { type: 'subscribed', payload: { channelId: client.channelId } });
        break;

      case 'unsubscribe':
        client.channelId = undefined;
        this.send(client.id, { type: 'unsubscribed', payload: {} });
        break;

      case 'message':
        // Handle incoming message from bridge
        this.emit('message', message.payload as Message, client);
        break;

      case 'send':
        // Handle outgoing message request
        this.emit('sendRequest', message.payload as OutgoingMessage, client, (result: MessageResult) => {
          this.send(client.id, { type: 'sendResult', payload: result, id: message.id });
        });
        break;

      case 'status':
        // Request status
        this.send(client.id, {
          type: 'statusResponse',
          payload: {
            clients: this.clients.size,
            uptime: Date.now() - (this.clients.values().next().value?.connectedAt || Date.now())
          }
        });
        break;

      default:
        // Emit for custom handling
        this.emit('customMessage', message, client);
    }
  }

  /**
   * Send message to a client
   */
  send(clientId: string, message: GatewayMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify({
        ...message,
        timestamp: Date.now()
      }));
      return true;
    } catch (error) {
      console.error(`[GatewayServer] Send error to ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: GatewayMessage, filter?: (client: GatewayClient) => boolean): number {
    let sent = 0;
    
    for (const client of this.clients.values()) {
      if (!client.authenticated) continue;
      if (filter && !filter(client)) continue;
      
      if (this.send(client.id, message)) {
        sent++;
      }
    }
    
    return sent;
  }

  /**
   * Broadcast to channel subscribers
   */
  broadcastToChannel(channelId: string, message: GatewayMessage): number {
    return this.broadcast(message, (client) => client.channelId === channelId);
  }

  /**
   * Start heartbeat checks
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = this.config.heartbeatInterval * 2;

      for (const [id, client] of this.clients) {
        if (now - client.lastPingAt > timeout) {
          console.log(`[GatewayServer] Client ${id} timed out`);
          client.ws.close(1001, 'Heartbeat timeout');
          this.clients.delete(id);
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Get connected clients
   */
  getClients(): GatewayClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): GatewayClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get clients by type
   */
  getClientsByType(type: GatewayClient['type']): GatewayClient[] {
    return this.getClients().filter(c => c.type === type);
  }

  /**
   * Disconnect a client
   */
  disconnectClient(clientId: string, reason?: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.ws.close(1000, reason || 'Disconnected by server');
      this.clients.delete(clientId);
      return true;
    }
    return false;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.started;
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `ws://${this.config.host}:${this.config.port}`;
  }

  /**
   * Get server stats
   */
  getStats(): {
    running: boolean;
    clients: number;
    bridges: number;
    nodes: number;
    url: string;
  } {
    const clients = this.getClients();
    return {
      running: this.started,
      clients: clients.filter(c => c.type === 'client').length,
      bridges: clients.filter(c => c.type === 'bridge').length,
      nodes: clients.filter(c => c.type === 'node').length,
      url: this.getUrl()
    };
  }
}

// Singleton instance
let gatewayServerInstance: GatewayServer | null = null;

export function getGatewayServer(config?: Partial<GatewayConfig>): GatewayServer {
  if (!gatewayServerInstance) {
    gatewayServerInstance = new GatewayServer(config);
  }
  return gatewayServerInstance;
}

export default GatewayServer;
