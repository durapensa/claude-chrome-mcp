/**
 * WebSocket relay client
 * Connects to relay server with automatic reconnection
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { ClientInfo, RELAY_MESSAGES } = require('./relay-core');
const { createLogger } = require('../utils/logger');
const config = require('../config');

class WebSocketRelayClient extends EventEmitter {
  constructor(clientInfo = {}, port = config.WEBSOCKET_PORT) {
    super();
    this.clientInfo = new ClientInfo(clientInfo);
    this.port = port;
    this.ws = null;
    this.url = `ws://${config.RELAY_HOST}:${port}`;
    this.logger = createLogger('WebSocketRelayClient');
    
    // Connection state
    this.isConnected = false;
    this.messageQueue = [];
    this.reconnectTimer = null;
    
    // Reconnection settings
    this.reconnectDelay = config.RECONNECT_INTERVAL || 1000;
    this.maxReconnectDelay = config.MAX_RECONNECT_DELAY || 30000;
    this.currentReconnectDelay = this.reconnectDelay;
    
    this.logger.info('Initialized', { clientName: this.clientInfo.name });
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.logger.info('Connecting to relay', { url: this.url });
        this.ws = new WebSocket(this.url);
        
        this.ws.on('open', () => {
          this.logger.info('Connected to relay');
          this.isConnected = true;
          this.currentReconnectDelay = this.reconnectDelay; // Reset delay
          
          // Identify ourselves to the relay
          this.send({
            type: RELAY_MESSAGES.IDENTIFY,
            clientType: this.clientInfo.type,
            name: this.clientInfo.name,
            capabilities: this.clientInfo.capabilities,
            isRelayHost: this.clientInfo.isRelayHost || false,
            pid: this.clientInfo.pid,
            version: this.clientInfo.version,
            component: this.clientInfo.component
          });
          
          // Flush queued messages
          this.flushMessageQueue();
          
          resolve();
        });
        
        this.ws.on('close', (code, reason) => {
          this.logger.info('Disconnected from relay', { code, reason });
          this.isConnected = false;
          this.emit('disconnected', { code, reason });
          this.scheduleReconnect();
        });
        
        this.ws.on('error', (error) => {
          this.logger.error('WebSocket error', error);
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
            this.logger.error('Failed to parse message', error);
          }
        });
        
      } catch (error) {
        this.logger.error('Connection error', error);
        reject(error);
      }
    });
  }
  
  handleMessage(message) {
    this.logger.debug('Received message', { 
      messageType: message.type,
      hasId: !!message.id,
      messageKeys: Object.keys(message).join(', ')
    });
    
    switch (message.type) {
      case RELAY_MESSAGES.WELCOME:
        this.logger.info('Welcome from relay', { clientId: message._clientId });
        this.clientInfo.id = message._clientId;
        this.emit('connected', { clientId: message._clientId });
        break;
        
      case RELAY_MESSAGES.CLIENT_LIST:
        this.emit('client_list', message._clients);
        break;
        
      case RELAY_MESSAGES.SHUTDOWN:
        this.logger.info('Relay is shutting down', { 
          reason: message._reason,
          gracePeriod: message._gracePeriodMs 
        });
        this.emit('relay_shutdown', message);
        break;
        
      default:
        // Emit all other messages for application handling
        this.emit('message', message);
    }
  }
  
  send(message) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.logger.debug('Queueing message, not connected');
      this.messageQueue.push(message);
    }
  }
  
  broadcast(data) {
    this.send({
      type: RELAY_MESSAGES.BROADCAST,
      data: data
    });
  }
  
  unicast(targetId, data) {
    this.send({
      type: RELAY_MESSAGES.UNICAST,
      targetId: targetId,
      data: data
    });
  }
  
  multicast(targetType, data) {
    this.send({
      type: RELAY_MESSAGES.MULTICAST,
      targetType: targetType,
      data: data
    });
  }
  
  sendToExtension(targetId, type, params) {
    // Helper method for backward compatibility with MCP
    return this.unicast(targetId, { type, params });
  }
  
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }
  
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.logger.info('Scheduling reconnection', { delayMs: this.currentReconnectDelay });
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        this.logger.error('Reconnection failed', error);
      });
    }, this.currentReconnectDelay);
    
    // Exponential backoff
    this.currentReconnectDelay = Math.min(
      this.currentReconnectDelay * 2, 
      this.maxReconnectDelay
    );
  }
  
  async disconnect() {
    this.logger.info('Disconnecting');
    
    // Cancel reconnection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.messageQueue = [];
  }
  
  // Alias for compatibility
  async close() {
    return this.disconnect();
  }
  
  getStatus() {
    return {
      connected: this.isConnected,
      clientId: this.clientInfo.id,
      queuedMessages: this.messageQueue.length,
      reconnectDelay: this.currentReconnectDelay
    };
  }
}

module.exports = { WebSocketRelayClient };