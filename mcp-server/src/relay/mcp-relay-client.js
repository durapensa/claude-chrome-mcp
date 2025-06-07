/**
 * MCP Relay Client
 * Handles MCP protocol over WebSocket relay transport
 */

const EventEmitter = require('events');
const { AutoElectionRelay } = require('./relay-index');
const { ErrorTracker } = require('../utils/error-tracker');
const { createLogger } = require('../utils/logger');

class MCPRelayClient extends EventEmitter {
  constructor(clientInfo = {}, operationManager = null, notificationManager = null) {
    super();
    this.clientInfo = clientInfo;
    this.operationManager = operationManager;
    this.notificationManager = notificationManager;
    this.logger = createLogger('MCPRelayClient');
    
    // Connection state
    this.connected = false;
    this.connectionState = 'disconnected';
    this.lastSuccessfulConnection = null;
    
    // Request/response tracking
    this.requestCounter = 0;
    this.pendingRequests = new Map();
    
    // Relay transport
    this.relay = null;
    
    // Error tracking
    this.errorTracker = new ErrorTracker();
    
    this.logger.info('Initializing MCP relay client');
  }
  
  async connect() {
    if (this.connectionState === 'connecting') {
      this.logger.warn('Connection already in progress');
      return;
    }
    
    this.connectionState = 'connecting';
    
    try {
      // Initialize relay with auto-election
      this.relay = new AutoElectionRelay(this.clientInfo);
      
      // Handle relay events
      this.relay.on('connected', (info) => {
        this.logger.info('Connected to relay', info);
        this.connected = true;
        this.connectionState = 'connected';
        this.lastSuccessfulConnection = Date.now();
        this.emit('connected');
      });
      
      this.relay.on('disconnected', (reason) => {
        this.logger.info('Disconnected from relay', reason);
        this.connected = false;
        this.connectionState = 'disconnected';
        this.emit('connection_lost');
      });
      
      this.relay.on('message', (message) => {
        this.handleRelayMessage(message);
      });
      
      this.relay.on('relayClientConnected', (client) => {
        this.logger.info('New client connected to relay', { 
          clientName: client.name,
          clientType: client.type 
        });
      });
      
      this.relay.on('relayClientDisconnected', (clientId) => {
        this.logger.info('Client disconnected from relay', { clientId });
      });
      
      // Initialize the relay
      await this.relay.initialize();
      
      const status = this.relay.getStatus();
      this.logger.info('Relay initialized', {
        isHost: status.isRelayHost,
        connected: status.relayConnected
      });
      
    } catch (error) {
      this.logger.error('Failed to connect', error);
      this.connectionState = 'disconnected';
      throw error;
    }
  }
  
  handleRelayMessage(message) {
    // Debug log all messages
    this.logger.debug('handleRelayMessage called', {
      hasFrom: !!message._from,
      messageType: message.type,
      messageId: message.id,
      messageKeys: Object.keys(message)
    });
    
    // Check if this is a response to one of our requests FIRST
    // Responses don't need _from since they're correlated by request ID
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timeoutId } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      clearTimeout(timeoutId);
      
      // Handle response
      if (message.type === 'error') {
        reject(new Error(message.error || 'Unknown error'));
      } else if (message.type === 'response' && message.result !== undefined) {
        resolve(message.result);
      } else {
        // Fallback to sending the whole message if no result field
        resolve(message);
      }
      return;
    }
    
    // For non-response messages (requests, notifications), _from is required
    if (!message._from) {
      this.logger.warn('Received message without _from field', { 
        messageType: message.type,
        messageKeys: Object.keys(message)
      });
      return;
    }
    
    // Handle log notifications from extension
    if (message.type === 'log_notification' && message.log) {
      this.handleExtensionLog(message.log);
      return;
    }
    
    // Handle batched logs from extension
    if (message.type === 'log_batch' && message.logs) {
      message.logs.forEach(log => this.handleExtensionLog(log));
      return;
    }
    
    // Handle operation milestones
    if (message.type === 'operation_milestone') {
      this.handleOperationMilestone(message);
      return;
    }
    
    // Emit other messages for application handling
    this.emit('message', message);
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
  
  async handleExtensionLog(logEntry) {
    try {
      // Forward to NotificationManager using standard MCP logging
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
          `extension.${component}` // Logger name format
        );
      }
      
      // Also log locally for debugging
      const { level, component, message, data } = logEntry;
      const prefix = `[Extension:${component}]`;
      
      // Map to local logger
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
  
  async sendRequest(type, params = {}) {
    if (!this.relay || !this.connected) {
      throw new Error('Not connected to relay');
    }
    
    const requestId = `req-${++this.requestCounter}`;
    const timeoutMs = 10000;
    
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeoutMs}ms (requestId: ${requestId}, type: ${type})`));
      }, timeoutMs);
      
      // Store request handler
      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });
      
      // Send via relay - multicast to all extension clients
      this.relay.multicast('extension', {
        id: requestId,
        type,
        params,
        timestamp: Date.now()
      });
    });
  }
  
  async gracefulShutdown() {
    this.logger.info('Initiating graceful shutdown');
    this.connectionState = 'shutting_down';
    
    // Clear pending requests
    for (const [requestId, { reject, timeoutId }] of this.pendingRequests) {
      clearTimeout(timeoutId);
      reject(new Error('Client shutting down'));
    }
    this.pendingRequests.clear();
    
    // Close relay connection
    await this.close();
    
    // Force exit
    process.exit(0);
  }
  
  async close() {
    this.connectionState = 'shutting_down';
    
    if (this.relay) {
      await this.relay.stop();
      this.relay = null;
    }
    
    this.connected = false;
  }
  
  async disconnect() {
    // Alias for close() for compatibility
    return this.close();
  }
  
  getConnectionStats() {
    const relayStatus = this.relay ? this.relay.getStatus() : null;
    
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