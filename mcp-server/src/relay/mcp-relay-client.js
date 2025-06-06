const EventEmitter = require('events');
const { ErrorTracker } = require('../utils/error-tracker');
const { createLogger } = require('../utils/logger');
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
    this.logger = createLogger('RelayClient');
    
    this.logger.info('Initializing WebSocket relay mode');
    this.initializeRelayClient();
  }

  initializeRelayClient() {
    this.relayManager = new EmbeddedRelayManager(this.clientInfo);
    
    // Handle relay events
    this.relayManager.on('connected', () => {
      this.logger.info('Connected to relay');
      this.connected = true;
      this.connectionState = 'connected';
      this.lastSuccessfulConnection = Date.now();
      this.emit('connected');
    });
    
    this.relayManager.on('disconnected', () => {
      this.logger.info('Disconnected from relay');
      this.connected = false;
      this.connectionState = 'disconnected';
      this.emit('connection_lost');
    });
    
    this.relayManager.on('message', (message) => {
      this.handleRelayMessage(message);
    });
    
    this.relayManager.on('relayClientConnected', (client) => {
      this.logger.info('New client connected to relay', { clientName: client.name });
    });
    
    this.relayManager.on('relayClientDisconnected', (clientId) => {
      this.logger.info('Client disconnected from relay', { clientId });
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
      
      // Handle log notifications from extension
      if (data.type === 'log_notification' && data.log) {
        this.handleExtensionLog(data.log);
        return;
      }
      
      // Handle batched logs from extension
      if (data.type === 'log_batch' && data.logs) {
        data.logs.forEach(log => this.handleExtensionLog(log));
        return;
      }
      
      // Otherwise, emit the message for other handlers
      this.emit('message', data);
    }
  }


  async connect() {
    if (this.connectionState === 'connecting') {
      this.logger.warn('Connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    
    try {
      this.logger.info('Initializing embedded relay...');
      await this.relayManager.initialize();
      // Events will be handled by the relay manager listeners
      
      const status = this.relayManager.getStatus();
      if (status.isRelayHost) {
        this.logger.info('Running as relay host');
      } else {
        this.logger.info('Connected to existing relay');
      }
    } catch (error) {
      this.logger.error('Failed to initialize relay', error);
      this.connectionState = 'disconnected';
      throw error;
    }
  }



  async handleOperationMilestone(message) {
    const { operationId, milestone, timestamp, tabId, ...data } = message;
    
    this.logger.info('Received milestone', { operationId, milestone });
    
    // Update operation manager
    if (this.operationManager) {
      this.operationManager.updateOperation(operationId, milestone, { tabId, ...data });
    }
    
    // Send MCP notification
    if (this.notificationManager) {
      await this.notificationManager.sendProgress(operationId, milestone, { tabId, ...data });
    }
  }

  async sendRequest(type, params = {}) {
    // Handle relay mode only
    if (!this.relayManager || !this.relayManager.client || !this.relayManager.client.isConnected) {
      if (this.connectionState === 'disconnected') {
        this.logger.info('Attempting to reconnect to relay for request');
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
    this.logger.info('Initiating graceful shutdown');
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
  
  // Handle extension log notifications
  async handleExtensionLog(logEntry) {
    try {
      // Forward to NotificationManager using standard MCP logging notification
      if (this.notificationManager) {
        const { level, component, message, data } = logEntry;
        
        // Map extension log levels to MCP standard levels
        const mcpLevel = this.mapToMcpLogLevel(level);
        
        // Send using standard notifications/message
        await this.notificationManager.sendLoggingMessage(
          mcpLevel,
          {
            message,
            ...data,
            source: 'extension',
            component
          },
          `extension.${component}` // Logger name format: extension.{component}
        );
      }
      
      // Also log locally for debugging
      const { level, component, message, data } = logEntry;
      const prefix = `[Extension:${component}]`;
      
      // Map extension log levels to server logger methods
      switch (level) {
        case 'ERROR':
          this.logger.error(`${prefix} ${message}`, null, data);
          break;
        case 'WARN':
          this.logger.warn(`${prefix} ${message}`, data);
          break;
        case 'INFO':
          this.logger.info(`${prefix} ${message}`, data);
          break;
        case 'DEBUG':
          this.logger.debug(`${prefix} ${message}`, data);
          break;
        case 'VERBOSE':
          this.logger.verbose(`${prefix} ${message}`, data);
          break;
        default:
          this.logger.info(`${prefix} ${message}`, data);
      }
    } catch (error) {
      this.logger.error('Failed to handle extension log', error);
    }
  }
  
  // Map extension log levels to MCP standard log levels
  mapToMcpLogLevel(extensionLevel) {
    // MCP levels: debug, info, notice, warning, error, critical, alert, emergency
    const levelMap = {
      'VERBOSE': 'debug',
      'DEBUG': 'debug',
      'INFO': 'info',
      'WARN': 'warning',
      'ERROR': 'error'
    };
    
    return levelMap[extensionLevel] || 'info';
  }
}


module.exports = { MCPRelayClient };