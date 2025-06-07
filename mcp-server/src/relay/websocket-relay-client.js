/**
 * WebSocket relay client for MCP server
 * Connects to the relay server for inter-process communication
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { createLogger } = require('../utils/logger');
const config = require('../config');

class RelayClient extends EventEmitter {
  constructor(clientInfo, port = config.WEBSOCKET_PORT) {
    super();
    this.clientInfo = clientInfo;
    this.ws = null;
    this.reconnectDelay = config.RECONNECT_INTERVAL;
    this.maxReconnectDelay = config.MAX_RECONNECT_DELAY;
    this.isConnected = false;
    this.messageQueue = [];
    this.reconnectTimer = null;
    this.relayUrl = `ws://localhost:${port}`;
    this.logger = createLogger('RelayClient');
    
    this.logger.info('Initialized', { clientName: this.clientInfo.name });
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.logger.info('Connecting to relay', { url: this.relayUrl });
        this.ws = new WebSocket(this.relayUrl);
        
        this.ws.on('open', () => {
          this.logger.info('Connected to relay');
          this.isConnected = true;
          this.reconnectDelay = config.RECONNECT_INTERVAL; // Reset delay
          
          // Identify ourselves to the relay
          this.send({
            type: 'identify',
            clientType: this.clientInfo.type,
            name: this.clientInfo.name,
            capabilities: this.clientInfo.capabilities,
            isRelayHost: this.clientInfo.isRelayHost || false,
            pid: process.pid,
            version: this.clientInfo.version || config.VERSION,
            component: config.COMPONENT_NAME
          });
          
          // Send any queued messages
          while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.send(message);
          }
          
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
    this.logger.info('Received message', { messageType: message.type });
    
    switch (message.type) {
      case '_relay_welcome':
        this.logger.info('Welcome from relay', { clientId: message._clientId });
        this.clientId = message._clientId;
        this.emit('connected', { clientId: message._clientId });
        break;
        
      case '_client_list_update':
        this.emit('client_list', message._clients);
        break;
        
      case '_relay_shutdown':
        this.logger.info('Relay is shutting down');
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
      this.logger.info('Queueing message, not connected');
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
    
    this.logger.info('Reconnecting', { delayMs: this.reconnectDelay });
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        this.logger.error('Reconnection failed', error);
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