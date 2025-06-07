/**
 * Core relay types and base functionality
 * Shared between WebSocket server and client
 */

const EventEmitter = require('events');
const { createLogger } = require('../utils/logger');

// Message types used by the relay protocol
const RELAY_MESSAGES = {
  // Control messages
  IDENTIFY: 'identify',
  WELCOME: '_relay_welcome',
  SHUTDOWN: '_relay_shutdown',
  CLIENT_LIST: '_client_list_update',
  
  // Routing types
  BROADCAST: 'broadcast',
  UNICAST: 'unicast',
  MULTICAST: 'multicast',
};

// Client types that can connect to relay
const CLIENT_TYPES = {
  MCP: 'mcp',
  EXTENSION: 'extension',
  CLI: 'cli'
};

/**
 * Client information structure used throughout relay
 */
class ClientInfo {
  constructor(data = {}) {
    this.id = data.id || null;
    this.type = data.type || CLIENT_TYPES.MCP;
    this.name = data.name || 'unknown';
    this.pid = data.pid || process.pid;
    this.version = data.version || null;
    this.isRelayHost = data.isRelayHost || false;
    this.capabilities = data.capabilities || [];
    this.connectedAt = data.connectedAt || Date.now();
    this.component = data.component || null;
    
    // Connection health tracking
    this.lastPingAt = data.lastPingAt || null;
    this.lastPongAt = data.lastPongAt || null;
  }
  
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      pid: this.pid,
      version: this.version,
      isRelayHost: this.isRelayHost,
      capabilities: this.capabilities,
      connectedAt: this.connectedAt,
      component: this.component
    };
  }
}

/**
 * Base class for relay components with common functionality
 */
class RelayBase extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = createLogger(options.loggerName || 'RelayBase');
    this.metrics = {
      startTime: Date.now(),
      messagesRouted: 0,
      errors: 0
    };
  }
  
  /**
   * Route a message based on its type
   * @param {Object} message - Message to route
   * @param {string} fromClientId - Sender client ID
   * @param {Map} clients - Map of clientId -> client info
   * @returns {Object} Routing result
   */
  routeMessage(message, fromClientId, clients) {
    try {
      // Inject sender information
      message._from = fromClientId;
      message._timestamp = message._timestamp || Date.now();
      
      this.metrics.messagesRouted++;
      
      this.logger.debug('Routing message', {
        fromClientId,
        messageType: message.type,
        hasTargetId: !!message.targetId,
        targetId: message.targetId,
        hasData: !!message.data
      });
      
      switch (message.type) {
        case RELAY_MESSAGES.BROADCAST:
          return this._routeBroadcast(message, fromClientId, clients);
          
        case RELAY_MESSAGES.UNICAST:
          return this._routeUnicast(message, clients);
          
        case RELAY_MESSAGES.MULTICAST:
          return this._routeMulticast(message, fromClientId, clients);
          
        default:
          // Default: broadcast to all except sender
          return this._routeBroadcast(message, fromClientId, clients);
      }
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Routing error', error);
      return { success: false, error: error.message };
    }
  }
  
  _routeBroadcast(message, excludeClientId, clients) {
    const targets = [];
    const data = message.data || message;
    
    clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && this._canSendToClient(client)) {
        targets.push(clientId);
        this._sendToClient(client, data);
      }
    });
    
    return { success: true, type: 'broadcast', targets };
  }
  
  _routeUnicast(message, clients) {
    const { targetId, data } = message;
    const client = clients.get(targetId);
    
    if (client && this._canSendToClient(client)) {
      const payload = data || message;
      this._sendToClient(client, payload);
      return { success: true, type: 'unicast', target: targetId };
    }
    
    return { success: false, error: `Target client not found: ${targetId}` };
  }
  
  _routeMulticast(message, excludeClientId, clients) {
    const { targetType, data } = message;
    const targets = [];
    
    // For multicast, use data field if available, otherwise strip routing metadata
    const payload = data || this._stripRoutingMetadata(message);
    
    // Ensure _from is included in the payload
    if (payload && typeof payload === 'object') {
      payload._from = message._from;
      payload._timestamp = payload._timestamp || Date.now();
    }
    
    clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && 
          client.info && 
          client.info.type === targetType && 
          this._canSendToClient(client)) {
        targets.push(clientId);
        this._sendToClient(client, payload);
      }
    });
    
    this.logger.debug('Multicast result', { targetType, targetCount: targets.length, targets });
    
    return { success: true, type: 'multicast', targetType, targets };
  }
  
  _stripRoutingMetadata(message) {
    const { type, targetType, targetId, data, ...payload } = message;
    return payload;
  }
  
  // Must be implemented by subclasses
  _canSendToClient(client) {
    throw new Error('Subclass must implement _canSendToClient');
  }
  
  _sendToClient(client, data) {
    throw new Error('Subclass must implement _sendToClient');
  }
}

module.exports = {
  RELAY_MESSAGES,
  CLIENT_TYPES,
  ClientInfo,
  RelayBase
};