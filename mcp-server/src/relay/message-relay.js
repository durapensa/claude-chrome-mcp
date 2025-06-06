/**
 * Minimal WebSocket relay server for Chrome extension communication
 * Pure message routing with no business logic
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const http = require('http');
const { createLogger } = require('../utils/logger');

const RELAY_PORT = 54321;

class MessageRelay extends EventEmitter {
  constructor(port = RELAY_PORT, version = 'unknown') {
    super();
    this.port = port;
    this.version = version;
    this.clients = new Map(); // clientId -> WebSocket
    this.wss = null;
    this.clientCounter = 0;
    this.isShuttingDown = false;
    this.logger = createLogger('Relay');
    
    // Metrics
    this.metrics = {
      startTime: Date.now(),
      messagesRouted: 0,
      clientsConnected: 0,
      clientsDisconnected: 0,
      errors: 0
    };
    
    this.logger.info('Message relay initialized', { port: this.port, version: this.version });
  }
  
  start() {
    return new Promise((resolve, reject) => {
      // Start WebSocket server
      this.wss = new WebSocket.Server({ 
        port: this.port,
        clientTracking: true 
      });
      
      this.wss.on('listening', () => {
        this.logger.info('WebSocket relay listening', { port: this.port });
        
        // Start health endpoint
        this.startHealthEndpoint();
        
        resolve();
      });
      
      this.wss.on('error', (error) => {
        this.metrics.errors++;
        if (error.code === 'EADDRINUSE') {
          this.logger.error('Port already in use', { port: this.port });
          const addrInUseError = new Error(`Port ${this.port} already in use`);
          addrInUseError.code = 'EADDRINUSE';
          reject(addrInUseError);
        } else {
          this.logger.error('Server error', error);
          reject(error);
        }
      });
      
      this.wss.on('connection', this.handleConnection.bind(this));
    });
  }
  
  startHealthEndpoint() {
    const healthPort = this.port + 1; // 54322
    
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        const health = {
          status: 'healthy',
          version: this.version,
          uptime: Date.now() - this.metrics.startTime,
          metrics: {
            ...this.metrics,
            currentClients: this.clients.size,
            clientList: Array.from(this.clients.entries()).map(([id, client]) => ({
              id,
              type: client.info.type,
              name: client.info.name,
              connectedFor: Date.now() - client.info.connectedAt,
              isRelayHost: client.info.isRelayHost || false,
              lastPingAt: client.info.lastPingAt,
              lastPongAt: client.info.lastPongAt,
              pingLatency: client.info.lastPongAt && client.info.lastPingAt 
                ? client.info.lastPongAt - client.info.lastPingAt 
                : null
            }))
          }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } else if (req.url === '/takeover' && req.method === 'POST') {
        // Manual takeover endpoint - triggers graceful shutdown
        if (this.isShuttingDown) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Already shutting down' }));
          return;
        }
        
        this.logger.info('Takeover requested via health endpoint');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'accepted',
          message: 'Relay will shut down gracefully',
          currentClients: this.clients.size
        }));
        
        // Schedule graceful shutdown after response
        setTimeout(() => {
          this.stop('takeover').catch(err => {
            this.logger.error('Error during takeover shutdown', err);
          });
        }, 100);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(healthPort, () => {
      this.logger.info('Health endpoint listening', { port: healthPort });
    });
    
    this.healthServer = server;
  }
  
  handleConnection(ws, req) {
    const clientId = `client-${++this.clientCounter}`;
    const clientInfo = {
      id: clientId,
      type: 'unknown', // Will be set by client identification
      connectedAt: Date.now(),
      remoteAddress: req.socket.remoteAddress,
      lastPingAt: null,
      lastPongAt: null
    };
    
    this.logger.info('New connection', { clientId, remoteAddress: clientInfo.remoteAddress });
    
    // Update metrics
    this.metrics.clientsConnected++;
    
    // Setup ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        clientInfo.lastPingAt = Date.now();
        this.logger.debug('Ping sent', { clientId, timestamp: clientInfo.lastPingAt });
      }
    }, 30000); // Ping every 30 seconds
    
    // Store client with ping interval
    this.clients.set(clientId, { ws, info: clientInfo, pingInterval });
    
    // Send welcome message
    this.sendToClient(ws, {
      type: '_relay_welcome',
      _clientId: clientId,
      _timestamp: Date.now()
    });
    
    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (error) {
        this.logger.error('Failed to parse message', { clientId, error });
      }
    });
    
    // Handle pong responses
    ws.on('pong', () => {
      clientInfo.lastPongAt = Date.now();
      this.logger.debug('Pong received', { clientId, timestamp: clientInfo.lastPongAt });
    });
    
    // Handle close
    ws.on('close', () => {
      this.logger.info('Client disconnected', { clientId });
      this.metrics.clientsDisconnected++;
      
      // Clean up ping interval
      const client = this.clients.get(clientId);
      if (client && client.pingInterval) {
        clearInterval(client.pingInterval);
      }
      
      this.clients.delete(clientId);
      this.broadcastClientList();
    });
    
    // Handle errors
    ws.on('error', (error) => {
      this.logger.error('WebSocket error', { clientId, error });
      this.metrics.errors++;
    });
    
    // Broadcast updated client list
    this.broadcastClientList();
  }
  
  handleMessage(fromClientId, message) {
    const client = this.clients.get(fromClientId);
    if (!client) {
      this.logger.error('Message from unknown client', { fromClientId });
      return;
    }
    
    this.logger.info('Message received', { fromClientId, messageType: message.type });
    
    // Handle client identification
    if (message.type === 'identify') {
      client.info.type = message.clientType || 'unknown';
      client.info.name = message.name || fromClientId;
      client.info.isRelayHost = message.isRelayHost || false;
      this.logger.info('Client identified', { 
        fromClientId, 
        clientType: client.info.type, 
        clientName: client.info.name,
        isRelayHost: client.info.isRelayHost 
      });
      this.broadcastClientList();
      return;
    }
    
    // Route messages based on type
    this.metrics.messagesRouted++;
    
    // Inject sender information
    message._from = fromClientId;
    
    switch (message.type) {
      case 'broadcast':
        // Send to all clients except sender
        // For legacy broadcast format, inject _from into the data
        if (message.data) {
          message.data._from = fromClientId;
          this.broadcast(message.data, fromClientId);
        } else {
          this.broadcast(message, fromClientId);
        }
        break;
        
      case 'unicast':
        // Send to specific client
        if (message.targetId) {
          const targetClient = this.clients.get(message.targetId);
          if (targetClient) {
            // Inject _from and send directly
            if (message.data) {
              message.data._from = fromClientId;
              this.sendToClient(targetClient.ws, message.data);
            } else {
              this.sendToClient(targetClient.ws, message);
            }
          }
        }
        break;
        
      case 'multicast':
        // Send to clients of specific type
        if (message.targetType) {
          if (message.data) {
            message.data._from = fromClientId;
            this.multicast(message.targetType, message.data, fromClientId);
          } else {
            // Remove routing metadata and inject _from
            const { type, targetType, ...payload } = message;
            payload._from = fromClientId;
            this.multicast(message.targetType, payload, fromClientId);
          }
        }
        break;
        
      default:
        // Default: route to all clients except sender
        this.broadcast(message, fromClientId);
    }
  }
  
  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
  
  
  broadcast(data, excludeClientId = null) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId) {
        this.sendToClient(client.ws, data);
      }
    });
  }
  
  multicast(targetType, data, excludeClientId = null) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.info.type === targetType) {
        // Send data directly - _from should already be injected
        this.sendToClient(client.ws, data);
      }
    });
  }
  
  broadcastClientList() {
    const clientList = Array.from(this.clients.entries()).map(([id, client]) => ({
      id: id,
      type: client.info.type,
      name: client.info.name,
      connectedAt: client.info.connectedAt,
      isRelayHost: client.info.isRelayHost || false
    }));
    
    this.broadcast({
      type: '_client_list_update',
      _clients: clientList,
      _timestamp: Date.now()
    });
  }
  
  async stop(reason = 'normal') {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Shutting down...', { reason });
    
    // Notify all clients with shutdown reason and grace period
    this.broadcast({
      type: '_relay_shutdown',
      _reason: reason,
      _gracePeriodMs: 2000,
      _timestamp: Date.now()
    });
    
    // Give clients time to prepare for shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close all client connections
    this.clients.forEach((client, clientId) => {
      this.logger.info('Closing connection', { clientId });
      
      // Clean up ping interval
      if (client.pingInterval) {
        clearInterval(client.pingInterval);
      }
      
      client.ws.close();
    });
    
    // Close WebSocket server
    if (this.wss) {
      await new Promise((resolve) => {
        this.wss.close(() => {
          this.logger.info('WebSocket server closed');
          resolve();
        });
      });
    }
    
    // Close health server
    if (this.healthServer) {
      await new Promise((resolve) => {
        this.healthServer.close(() => {
          this.logger.info('Health server closed');
          resolve();
        });
      });
    }
    
    this.logger.info('Shutdown complete');
  }
}

module.exports = { MessageRelay };