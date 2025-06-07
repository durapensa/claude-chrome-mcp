/**
 * WebSocket relay server
 * Handles client connections and message routing
 */

const WebSocket = require('ws');
const http = require('http');
const { RelayBase, ClientInfo, RELAY_MESSAGES } = require('./relay-core');
const config = require('../config');

class WebSocketRelayServer extends RelayBase {
  constructor(port = config.WEBSOCKET_PORT, version = config.VERSION) {
    super({ loggerName: 'WebSocketRelayServer' });
    this.port = port;
    this.version = version;
    this.clients = new Map(); // clientId -> { ws, info, pingInterval }
    this.wss = null;
    this.healthServer = null;
    this.clientCounter = 0;
    this.isShuttingDown = false;
    
    // Additional metrics
    this.metrics.clientsConnected = 0;
    this.metrics.clientsDisconnected = 0;
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
    const healthPort = this.port + 1;
    
    const server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        this.handleHealthRequest(res);
      } else if (req.url === '/takeover' && req.method === 'POST') {
        this.handleTakeoverRequest(req, res);
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
  
  handleHealthRequest(res) {
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
          pid: client.info.pid || null,
          version: client.info.version || null,
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
  }
  
  handleTakeoverRequest(req, res) {
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
  }
  
  handleConnection(ws, req) {
    const clientId = `client-${++this.clientCounter}`;
    const clientInfo = new ClientInfo({
      id: clientId,
      connectedAt: Date.now()
    });
    
    this.logger.info('New connection', { 
      clientId, 
      remoteAddress: req.socket.remoteAddress 
    });
    
    // Update metrics
    this.metrics.clientsConnected++;
    
    // Setup ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        clientInfo.lastPingAt = Date.now();
        this.logger.debug('Ping sent', { clientId });
      }
    }, 30000); // Ping every 30 seconds
    
    // Store client
    const client = { ws, info: clientInfo, pingInterval };
    this.clients.set(clientId, client);
    
    // Send welcome message
    this._sendToClient(client, {
      type: RELAY_MESSAGES.WELCOME,
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
        this.metrics.errors++;
      }
    });
    
    // Handle pong responses
    ws.on('pong', () => {
      clientInfo.lastPongAt = Date.now();
      this.logger.debug('Pong received', { clientId });
    });
    
    // Handle close
    ws.on('close', () => {
      this.logger.info('Client disconnected', { clientId });
      this.metrics.clientsDisconnected++;
      
      // Clean up
      const client = this.clients.get(clientId);
      if (client && client.pingInterval) {
        clearInterval(client.pingInterval);
      }
      
      this.clients.delete(clientId);
      this.broadcastClientList();
      this.emit('clientDisconnected', clientId);
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
    
    this.logger.info('Message received', { 
      fromClientId, 
      messageType: message.type 
    });
    
    // Handle client identification
    if (message.type === RELAY_MESSAGES.IDENTIFY) {
      // Update client info with identification data
      Object.assign(client.info, {
        type: message.clientType || message.type || 'unknown',
        name: message.name || fromClientId,
        pid: message.pid || null,
        version: message.version || null,
        isRelayHost: message.isRelayHost || false,
        capabilities: message.capabilities || [],
        component: message.component || null
      });
      
      this.logger.info('Client identified', { 
        fromClientId, 
        clientType: client.info.type, 
        clientName: client.info.name,
        isRelayHost: client.info.isRelayHost
      });
      
      this.broadcastClientList();
      this.emit('clientConnected', client.info);
      return;
    }
    
    // Route all other messages
    const result = this.routeMessage(message, fromClientId, this.clients);
    
    if (!result.success) {
      this.logger.warn('Routing failed', result);
    }
  }
  
  broadcastClientList() {
    const clientList = Array.from(this.clients.values())
      .map(client => client.info.toJSON());
    
    this.broadcast({
      type: RELAY_MESSAGES.CLIENT_LIST,
      _clients: clientList,
      _timestamp: Date.now()
    });
  }
  
  broadcast(data) {
    this.clients.forEach((client) => {
      this._sendToClient(client, data);
    });
  }
  
  async stop(reason = 'normal') {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Shutting down', { reason });
    
    // Notify all clients
    this.broadcast({
      type: RELAY_MESSAGES.SHUTDOWN,
      _reason: reason,
      _gracePeriodMs: 2000,
      _timestamp: Date.now()
    });
    
    // Give clients time to prepare
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close all client connections
    this.clients.forEach((client, clientId) => {
      this.logger.info('Closing connection', { clientId });
      
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
  
  // Implementation of abstract methods
  _canSendToClient(client) {
    return client.ws && client.ws.readyState === WebSocket.OPEN;
  }
  
  _sendToClient(client, data) {
    if (this._canSendToClient(client)) {
      client.ws.send(JSON.stringify(data));
    }
  }
}

module.exports = { WebSocketRelayServer };