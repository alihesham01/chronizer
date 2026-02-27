import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../lib/logger.js';
import { pubsub } from './pubsub.js';

interface Client {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: number;
  isAlive: boolean;
  metadata: {
    ip: string;
    userAgent?: string;
    connectedAt: number;
  };
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
  channels?: string[];
  data?: any;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Client>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CLIENT_TIMEOUT = 60000; // 60 seconds
  private readonly MAX_CLIENTS = 10000;
  private readonly MAX_SUBSCRIPTIONS_PER_CLIENT = 50;

  constructor(server: any) {
    this.initialize(server);
  }

  private initialize(server: any) {
    try {
      this.wss = new WebSocketServer({ 
        server,
        perMessageDeflate: {
          zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
          },
          zlibInflateOptions: {
            chunkSize: 10 * 1024
          },
          clientNoContextTakeover: true,
          serverNoContextTakeover: true,
          serverMaxWindowBits: 10,
          concurrencyLimit: 10,
          threshold: 1024
        },
        maxPayload: 100 * 1024 // 100KB max message size
      });

      this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error:', error);
      });

      this.startHeartbeat();
      this.startCleanup();
      this.setupPubSubBridge();

      logger.info('WebSocket server initialized');
    } catch (error) {
      logger.error('Failed to initialize WebSocket server:', error);
      throw error;
    }
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    // Check max clients
    if (this.clients.size >= this.MAX_CLIENTS) {
      logger.warn('Max clients reached, rejecting connection');
      ws.close(1008, 'Server at capacity');
      return;
    }

    const clientId = this.generateClientId();
    const ip = req.headers['x-forwarded-for']?.toString() || 
               req.headers['x-real-ip']?.toString() || 
               req.socket.remoteAddress || 
               'unknown';

    const client: Client = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      lastPing: Date.now(),
      isAlive: true,
      metadata: {
        ip,
        userAgent: req.headers['user-agent'],
        connectedAt: Date.now()
      }
    };

    this.clients.set(clientId, client);
    logger.info(`Client connected: ${clientId} from ${ip}`);

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });

    // Handle messages
    ws.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    // Handle pong
    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPing = Date.now();
    });

    // Handle close
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnect(client, code, reason.toString());
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for client ${clientId}:`, error);
      this.handleDisconnect(client, 1011, 'Internal error');
    });
  }

  private handleMessage(client: Client, data: Buffer) {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(client, message.channels || []);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(client, message.channels || []);
          break;

        case 'ping':
          this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
          client.lastPing = Date.now();
          break;

        default:
          logger.warn(`Unknown message type from ${client.id}:`, message.type);
      }
    } catch (error) {
      logger.error(`Error parsing message from ${client.id}:`, error);
      this.sendToClient(client, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  private handleSubscribe(client: Client, channels: string[]) {
    const validChannels = channels.filter(ch => {
      if (client.subscriptions.size >= this.MAX_SUBSCRIPTIONS_PER_CLIENT) {
        logger.warn(`Client ${client.id} exceeded max subscriptions`);
        return false;
      }
      return true;
    });

    validChannels.forEach(channel => {
      client.subscriptions.add(channel);
    });

    this.sendToClient(client, {
      type: 'subscribed',
      channels: Array.from(client.subscriptions)
    });

    logger.debug(`Client ${client.id} subscribed to:`, validChannels);
  }

  private handleUnsubscribe(client: Client, channels: string[]) {
    channels.forEach(channel => {
      client.subscriptions.delete(channel);
    });

    this.sendToClient(client, {
      type: 'unsubscribed',
      channels: Array.from(client.subscriptions)
    });

    logger.debug(`Client ${client.id} unsubscribed from:`, channels);
  }

  private handleDisconnect(client: Client, code: number, reason: string) {
    logger.info(`Client disconnected: ${client.id} (code: ${code}, reason: ${reason})`);
    this.clients.delete(client.id);
  }

  private sendToClient(client: Client, message: any): boolean {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`Failed to send to client ${client.id}:`, error);
      return false;
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const now = Date.now();
      
      this.clients.forEach((client) => {
        // Check if client is alive
        if (!client.isAlive) {
          logger.warn(`Client ${client.id} timeout, terminating`);
          client.ws.terminate();
          this.clients.delete(client.id);
          return;
        }

        // Check last ping time
        if (now - client.lastPing > this.CLIENT_TIMEOUT) {
          logger.warn(`Client ${client.id} ping timeout`);
          client.ws.terminate();
          this.clients.delete(client.id);
          return;
        }

        // Send ping
        client.isAlive = false;
        try {
          client.ws.ping();
        } catch (error) {
          logger.error(`Ping failed for ${client.id}:`, error);
          this.clients.delete(client.id);
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleClients: string[] = [];

      this.clients.forEach((client, id) => {
        if (client.ws.readyState === WebSocket.CLOSED || 
            client.ws.readyState === WebSocket.CLOSING) {
          staleClients.push(id);
        }
      });

      staleClients.forEach(id => {
        this.clients.delete(id);
      });

      if (staleClients.length > 0) {
        logger.info(`Cleaned up ${staleClients.length} stale clients`);
      }
    }, 60000); // Every minute
  }

  private setupPubSubBridge() {
    // Bridge Redis pub/sub to WebSocket clients
    const channels = [
      'transactions:created',
      'transactions:updated',
      'transactions:deleted',
      'transactions:bulk',
      'system:notification'
    ];

    channels.forEach(channel => {
      pubsub.subscribe(channel, (message) => {
        this.broadcast(channel, message);
      });
    });

    logger.info('PubSub bridge established for channels:', channels);
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  broadcast(channel: string, message: any): number {
    let sent = 0;

    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel) || client.subscriptions.has('*')) {
        const success = this.sendToClient(client, {
          type: 'message',
          channel,
          data: message,
          timestamp: Date.now()
        });
        if (success) sent++;
      }
    });

    logger.debug(`Broadcast to ${sent} clients on channel: ${channel}`);
    return sent;
  }

  /**
   * Send to specific client
   */
  sendToClientById(clientId: string, message: any): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    return this.sendToClient(client, message);
  }

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients by subscription
   */
  getClientsBySubscription(channel: string): string[] {
    const clients: string[] = [];
    this.clients.forEach((client, id) => {
      if (client.subscriptions.has(channel)) {
        clients.push(id);
      }
    });
    return clients;
  }

  /**
   * Get server stats
   */
  getStats() {
    const subscriptionCounts = new Map<string, number>();
    
    this.clients.forEach((client) => {
      client.subscriptions.forEach((channel) => {
        subscriptionCounts.set(channel, (subscriptionCounts.get(channel) || 0) + 1);
      });
    });

    return {
      connectedClients: this.clients.size,
      subscriptions: Object.fromEntries(subscriptionCounts),
      uptime: process.uptime()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    logger.info('Shutting down WebSocket server...');

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all client connections
    const closePromises: Promise<void>[] = [];
    
    this.clients.forEach((client) => {
      closePromises.push(
        new Promise((resolve) => {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.close(1001, 'Server shutting down');
            client.ws.once('close', () => resolve());
            
            // Force close after 5 seconds
            setTimeout(() => {
              client.ws.terminate();
              resolve();
            }, 5000);
          } else {
            resolve();
          }
        })
      );
    });

    await Promise.all(closePromises);
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve, reject) => {
        this.wss!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    logger.info('WebSocket server shut down');
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

let wsManager: WebSocketManager | null = null;

export function initializeWebSocket(server: any): WebSocketManager {
  if (wsManager) {
    return wsManager;
  }
  wsManager = new WebSocketManager(server);
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}
