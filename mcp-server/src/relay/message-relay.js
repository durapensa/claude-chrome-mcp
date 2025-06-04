/**
 * Minimal WebSocket relay server for Chrome extension communication
 * Pure message routing with no business logic
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

const RELAY_PORT = 54321;

class MessageRelay extends EventEmitter {
  constructor(port = RELAY_PORT) {
    super();
    this.port = port;
    this.clients = new Map(); // clientId -> WebSocket
    this.wss = null;
    this.clientCounter = 0;
    this.isShuttingDown = false;
    
    console.log('[Relay] Message relay initialized on port', this.port);
  }
  
  start() {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocket.Server({ 
        port: this.port,
        clientTracking: true 
      });
      
      this.wss.on('listening', () => {
        console.log('[Relay] WebSocket relay listening on port', this.port);
        resolve();
      });
      
      this.wss.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error('[Relay] Port', this.port, 'already in use');
          reject(new Error(`Port ${this.port} already in use`));
        } else {
          console.error('[Relay] Server error:', error);
          reject(error);
        }
      });
      
      this.wss.on('connection', this.handleConnection.bind(this));
    });
  }
  
  handleConnection(ws, req) {
    const clientId = `client-${++this.clientCounter}`;
    const clientInfo = {
      id: clientId,
      type: 'unknown', // Will be set by client identification
      connectedAt: Date.now(),
      remoteAddress: req.socket.remoteAddress
    };
    
    console.log('[Relay] New connection:', clientId, 'from', clientInfo.remoteAddress);
    
    // Store client
    this.clients.set(clientId, { ws, info: clientInfo });
    
    // Send welcome message
    this.sendToClient(ws, {
      type: 'relay_welcome',
      clientId: clientId,
      timestamp: Date.now()
    });
    
    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error('[Relay] Failed to parse message from', clientId, ':', error);
      }
    });
    
    // Handle close
    ws.on('close', () => {
      console.log('[Relay] Client disconnected:', clientId);
      this.clients.delete(clientId);
      this.broadcastClientList();
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error('[Relay] WebSocket error for', clientId, ':', error);
    });
    
    // Broadcast updated client list
    this.broadcastClientList();
  }
  
  handleMessage(fromClientId, message) {
    const client = this.clients.get(fromClientId);
    if (!client) {
      console.error('[Relay] Message from unknown client:', fromClientId);
      return;
    }
    
    console.log('[Relay] Message from', fromClientId, ':', message.type);
    
    // Handle client identification
    if (message.type === 'identify') {
      client.info.type = message.clientType || 'unknown';
      client.info.name = message.name || fromClientId;
      console.log('[Relay] Client identified:', fromClientId, 'as', client.info.type, '-', client.info.name);
      this.broadcastClientList();
      return;
    }
    
    // Route messages based on type
    switch (message.type) {
      case 'broadcast':
        // Send to all clients except sender
        this.broadcast(message.data, fromClientId);
        break;
        
      case 'unicast':
        // Send to specific client
        if (message.targetId) {
          this.sendToClientById(message.targetId, message.data);
        }
        break;
        
      case 'multicast':
        // Send to clients of specific type
        if (message.targetType) {
          this.multicast(message.targetType, message.data, fromClientId);
        }
        break;
        
      default:
        // Default: route to all clients except sender
        this.broadcast({
          type: 'relay_message',
          from: fromClientId,
          data: message
        }, fromClientId);
    }
  }
  
  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
  
  sendToClientById(clientId, data) {
    const client = this.clients.get(clientId);
    if (client) {
      this.sendToClient(client.ws, data);
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
        // Wrap the data in relay_message format
        this.sendToClient(client.ws, {
          type: 'relay_message',
          from: excludeClientId,
          data: data
        });
      }
    });
  }
  
  broadcastClientList() {
    const clientList = Array.from(this.clients.entries()).map(([id, client]) => ({
      id: id,
      type: client.info.type,
      name: client.info.name,
      connectedAt: client.info.connectedAt
    }));
    
    this.broadcast({
      type: 'client_list_update',
      clients: clientList,
      timestamp: Date.now()
    });
  }
  
  async stop() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('[Relay] Shutting down...');
    
    // Notify all clients
    this.broadcast({
      type: 'relay_shutdown',
      timestamp: Date.now()
    });
    
    // Close all client connections
    this.clients.forEach((client, clientId) => {
      console.log('[Relay] Closing connection:', clientId);
      client.ws.close();
    });
    
    // Close server
    if (this.wss) {
      await new Promise((resolve) => {
        this.wss.close(() => {
          console.log('[Relay] WebSocket server closed');
          resolve();
        });
      });
    }
    
    console.log('[Relay] Shutdown complete');
  }
}

module.exports = { MessageRelay };