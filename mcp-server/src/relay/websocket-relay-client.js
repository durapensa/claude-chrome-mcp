/**
 * WebSocket relay client for MCP server
 * Connects to the relay server for inter-process communication
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class RelayClient extends EventEmitter {
  constructor(clientInfo, port = 54321) {
    super();
    this.clientInfo = clientInfo;
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.isConnected = false;
    this.messageQueue = [];
    this.reconnectTimer = null;
    this.relayUrl = process.env.RELAY_URL || `ws://localhost:${port}`;
    
    console.log('[RelayClient] Initialized for', this.clientInfo.name);
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[RelayClient] Connecting to relay at', this.relayUrl);
        this.ws = new WebSocket(this.relayUrl);
        
        this.ws.on('open', () => {
          console.log('[RelayClient] Connected to relay');
          this.isConnected = true;
          this.reconnectDelay = 1000; // Reset delay
          
          // Identify ourselves to the relay
          this.send({
            type: 'identify',
            clientType: this.clientInfo.type,
            name: this.clientInfo.name,
            capabilities: this.clientInfo.capabilities
          });
          
          // Send any queued messages
          while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.send(message);
          }
          
          resolve();
        });
        
        this.ws.on('close', (code, reason) => {
          console.log('[RelayClient] Disconnected from relay:', code, reason);
          this.isConnected = false;
          this.emit('disconnected', { code, reason });
          this.scheduleReconnect();
        });
        
        this.ws.on('error', (error) => {
          console.error('[RelayClient] WebSocket error:', error);
          if (!this.isConnected) {
            reject(error);
          } else {
            this.emit('error', error);
          }
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('[RelayClient] Failed to parse message:', error);
          }
        });
        
      } catch (error) {
        console.error('[RelayClient] Connection error:', error);
        reject(error);
      }
    });
  }
  
  handleMessage(message) {
    console.log('[RelayClient] Received message:', message.type);
    
    switch (message.type) {
      case 'relay_welcome':
        console.log('[RelayClient] Welcome from relay, client ID:', message.clientId);
        this.clientId = message.clientId;
        this.emit('connected', { clientId: message.clientId });
        break;
        
      case 'client_list_update':
        this.emit('client_list', message.clients);
        break;
        
      case 'relay_message':
        // Message from another client
        this.emit('message', message);
        break;
        
      case 'relay_shutdown':
        console.log('[RelayClient] Relay is shutting down');
        this.emit('relay_shutdown');
        break;
        
      default:
        // Handle other message types
        this.emit('message', message);
    }
  }
  
  send(message) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.log('[RelayClient] Queueing message, not connected');
      this.messageQueue.push(message);
    }
  }
  
  broadcast(data) {
    this.send({
      type: 'broadcast',
      data: data
    });
  }
  
  unicast(targetId, data) {
    this.send({
      type: 'unicast',
      targetId: targetId,
      data: data
    });
  }
  
  multicast(targetType, data) {
    this.send({
      type: 'multicast',
      targetType: targetType,
      data: data
    });
  }
  
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    console.log(`[RelayClient] Reconnecting in ${this.reconnectDelay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('[RelayClient] Reconnection failed:', error);
      });
    }, this.reconnectDelay);
    
    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
  
  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
  }
}

module.exports = { RelayClient };