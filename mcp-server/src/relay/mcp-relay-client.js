const EventEmitter = require('events');
const { ErrorTracker } = require('../utils/error-tracker');
const { DebugMode } = require('../utils/debug-mode');
const { EmbeddedRelayManager } = require('./embedded-relay-manager');

// MCP Relay Client for MCP server
// Uses persistent WebSocket connection via relay for all communication

class MCPRelayClient extends EventEmitter {
  constructor(clientInfo = {}, operationManager = null, notificationManager = null) {
    super();
    this.clientInfo = clientInfo;
    this.operationManager = operationManager;
    this.notificationManager = notificationManager;
    this.connected = false;
    this.requestCounter = 0;
    this.pendingRequests = new Map();
    
    // Embedded relay manager handles election automatically
    this.relayManager = null;
    
    // Connection state tracking
    this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting
    this.lastSuccessfulConnection = null;
    
    // Enhanced debugging and error tracking
    this.errorTracker = new ErrorTracker();
    this.debug = new DebugMode().createLogger('RelayClient');
    
    console.error('RelayClient: Initializing WebSocket relay mode');
    this.initializeRelayClient();
  }

  initializeRelayClient() {
    this.relayManager = new EmbeddedRelayManager(this.clientInfo);
    
    // Handle relay events
    this.relayManager.on('connected', () => {
      console.error('RelayClient: Connected to relay');
      this.connected = true;
      this.connectionState = 'connected';
      this.lastSuccessfulConnection = Date.now();
      this.emit('connected');
    });
    
    this.relayManager.on('disconnected', () => {
      console.error('RelayClient: Disconnected from relay');
      this.connected = false;
      this.connectionState = 'disconnected';
      this.emit('connection_lost');
    });
    
    this.relayManager.on('message', (message) => {
      this.handleRelayMessage(message);
    });
    
    this.relayManager.on('relayClientConnected', (client) => {
      console.error('RelayClient: New client connected to relay:', client.name);
    });
    
    this.relayManager.on('relayClientDisconnected', (clientId) => {
      console.error('RelayClient: Client disconnected from relay:', clientId);
    });
  }

  handleRelayMessage(message) {
    // Handle messages from relay
    if (message.type === 'relay_message' && message.data) {
      const data = message.data;
      
      // Check if this is a response to one of our requests
      if (data.id && this.pendingRequests.has(data.id)) {
        const callback = this.pendingRequests.get(data.id);
        this.pendingRequests.delete(data.id);
        
        // Extract the result from the response
        if (data.type === 'error') {
          callback(new Error(data.error || 'Unknown error'));
        } else if (data.type === 'response' && data.result !== undefined) {
          callback(null, data.result);
        } else {
          // Fallback to sending the whole data object if no result field
          callback(null, data);
        }
        return;
      }
      
      // Otherwise, emit the message for other handlers
      this.emit('message', data);
    }
  }

  updateClientInfo(clientInfo) {
    this.clientInfo = clientInfo;
    console.error('RelayClient: Updated client info:', clientInfo);
    
    // Update relay manager with new client info if initialized
    if (this.relayManager && this.relayManager.client) {
      this.relayManager.updateClientInfo(clientInfo);
    }
  }

  async connect() {
    if (this.connectionState === 'connecting') {
      console.error('RelayClient: Connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    
    try {
      console.error('RelayClient: Initializing embedded relay...');
      await this.relayManager.initialize();
      // Events will be handled by the relay manager listeners
      
      const status = this.relayManager.getStatus();
      if (status.isRelayHost) {
        console.error('RelayClient: Running as relay host');
      } else {
        console.error('RelayClient: Connected to existing relay');
      }
    } catch (error) {
      console.error('RelayClient: Failed to initialize relay:', error);
      this.connectionState = 'disconnected';
      throw error;
    }
  }



  handleOperationMilestone(message) {
    const { operationId, milestone, timestamp, tabId, ...data } = message;
    
    console.error(`[RelayClient] Received milestone: ${operationId} - ${milestone}`);
    
    // Update operation manager
    if (this.operationManager) {
      this.operationManager.updateOperation(operationId, milestone, { tabId, ...data });
    }
    
    // Send MCP notification
    if (this.notificationManager) {
      this.notificationManager.sendProgress(operationId, milestone, { tabId, ...data });
    }
  }

  async sendRequest(type, params = {}) {
    // Handle relay mode only
    if (!this.relayManager || !this.relayManager.client || !this.relayManager.client.isConnected) {
      if (this.connectionState === 'disconnected') {
        this.debug.info('Attempting to reconnect to relay for request');
        await this.connect();
      }
      
      if (!this.relayManager.client || !this.relayManager.client.isConnected) {
        throw new Error('Not connected to relay and reconnection failed');
      }
    }
    
    const requestId = `req-${++this.requestCounter}`;
    
    return new Promise((resolve, reject) => {
      const timeoutMs = 10000;
      
      this.pendingRequests.set(requestId, (error, response) => {
        clearTimeout(timeoutId);
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
      
      // Send via relay - broadcast to extension clients
      this.relayManager.client.multicast('extension', {
        id: requestId,
        type,
        params,
        from: this.relayManager.client.clientId || this.clientInfo.name,
        timestamp: Date.now()
      });
      
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout after ${timeoutMs}ms (requestId: ${requestId}, type: ${type})`));
        }
      }, timeoutMs);
    });
  }

  async gracefulShutdown() {
    console.error('RelayClient: Initiating graceful shutdown');
    this.connectionState = 'shutting_down';
    
    // Close connection
    await this.close();
    
    // Force exit immediately
    process.exit(0);
  }

  async close() {
    this.connectionState = 'shutting_down';
    
    if (this.relayManager) {
      await this.relayManager.stop();
      this.relayManager = null;
    }
    
    this.connected = false;
    
    // Clear pending requests
    for (const [requestId, callback] of this.pendingRequests) {
      callback(new Error('Client shutting down'));
    }
    this.pendingRequests.clear();
  }

  async disconnect() {
    // Alias for close() to match expected interface
    return this.close();
  }

  getConnectionStats() {
    const relayStatus = this.relayManager ? this.relayManager.getStatus() : null;
    return {
      state: this.connectionState,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      pendingRequests: this.pendingRequests.size,
      relayConnected: this.connected,
      relayMode: true,
      ...relayStatus
    };
  }
}


module.exports = { MCPRelayClient };