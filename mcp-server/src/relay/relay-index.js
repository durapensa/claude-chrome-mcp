/**
 * WebSocket Relay with automatic election
 * First server to start becomes the relay host, others connect as clients
 */

const EventEmitter = require('events');
const { WebSocketRelayServer } = require('./websocket-relay-server');
const { WebSocketRelayClient } = require('./websocket-relay-client');
const { createLogger } = require('../utils/logger');
const config = require('../config');

class AutoElectionRelay extends EventEmitter {
  constructor(clientInfo = {}, port = config.WEBSOCKET_PORT) {
    super();
    this.clientInfo = clientInfo;
    this.port = port;
    this.logger = createLogger('AutoElectionRelay');
    
    // State
    this.isRelayHost = false;
    this.server = null;
    this.client = null;
    this.initialized = false;
  }
  
  async initialize() {
    if (this.initialized) {
      this.logger.warn('Already initialized');
      return;
    }
    
    this.logger.info('Initializing relay with auto-election');
    
    // First check if a relay is already running
    try {
      const healthCheck = await this.checkExistingRelay();
      if (healthCheck && healthCheck.status === 'healthy') {
        this.logger.info('Found existing relay', { 
          version: healthCheck.version,
          clients: healthCheck.metrics.currentClients 
        });
        await this.connectAsClient();
      } else {
        throw new Error('No healthy relay found');
      }
    } catch (error) {
      // No relay running or unhealthy, try to become host
      this.logger.info('No existing relay found, attempting to become host');
      try {
        await this.startAsHost();
      } catch (hostError) {
        if (hostError.code === 'EADDRINUSE') {
          // Port in use but health check failed, still try client
          this.logger.info('Port in use, connecting as client');
          await this.connectAsClient();
        } else {
          throw hostError;
        }
      }
    }
    
    this.initialized = true;
  }
  
  async checkExistingRelay() {
    const healthUrl = config.RELAY_URLS.health();
    
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(config.HEALTH_CHECK_TIMEOUT)
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      // Health check failed
      this.logger.debug('Health check failed', { error: error.message });
    }
    
    return null;
  }
  
  async startAsHost() {
    this.logger.info('Starting as relay host');
    
    // Get version for the server
    let version = 'unknown';
    try {
      const packageJson = require('../../package.json');
      version = packageJson.version || 'unknown';
    } catch (error) {
      this.logger.debug('Could not read version from package.json');
    }
    
    // Create and start server
    this.server = new WebSocketRelayServer(this.port, version);
    
    // Forward server events
    this.server.on('clientConnected', (client) => {
      this.emit('relayClientConnected', client);
    });
    
    this.server.on('clientDisconnected', (clientId) => {
      this.emit('relayClientDisconnected', clientId);
    });
    
    await this.server.start();
    this.isRelayHost = true;
    
    this.logger.info('Successfully started as relay host', { port: this.port });
    
    // Also connect as a client to our own relay
    this.clientInfo.isRelayHost = true;
    await this.connectAsClient();
  }
  
  async connectAsClient() {
    this.logger.info('Connecting as relay client');
    
    this.client = new WebSocketRelayClient(this.clientInfo, this.port);
    
    // Forward client events
    this.client.on('connected', (info) => {
      this.logger.info('Connected to relay', info);
      this.emit('connected', info);
    });
    
    this.client.on('disconnected', (reason) => {
      this.logger.info('Disconnected from relay', reason);
      this.emit('disconnected', reason);
      
      // If we were the relay host and disconnected, something is wrong
      if (this.isRelayHost) {
        this.logger.error('Relay host disconnected unexpectedly!');
      }
    });
    
    this.client.on('message', (message) => {
      this.emit('message', message);
    });
    
    this.client.on('client_list', (clients) => {
      this.emit('client_list', clients);
    });
    
    this.client.on('relay_shutdown', (info) => {
      this.emit('relay_shutdown', info);
    });
    
    this.client.on('error', (error) => {
      this.emit('error', error);
    });
    
    await this.client.connect();
  }
  
  // Proxy methods to client
  send(message) {
    if (!this.client) {
      throw new Error('Not connected to relay');
    }
    return this.client.send(message);
  }
  
  broadcast(data) {
    if (!this.client) {
      throw new Error('Not connected to relay');
    }
    return this.client.broadcast(data);
  }
  
  unicast(targetId, data) {
    if (!this.client) {
      throw new Error('Not connected to relay');
    }
    return this.client.unicast(targetId, data);
  }
  
  multicast(targetType, data) {
    if (!this.client) {
      throw new Error('Not connected to relay');
    }
    return this.client.multicast(targetType, data);
  }
  
  sendToExtension(targetId, type, params) {
    if (!this.client) {
      throw new Error('Not connected to relay');
    }
    return this.client.sendToExtension(targetId, type, params);
  }
  
  async stop() {
    this.logger.info('Stopping relay');
    
    // Disconnect client first
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    
    // Stop server if we're the host
    if (this.isRelayHost && this.server) {
      await this.server.stop();
      this.server = null;
      this.isRelayHost = false;
    }
    
    this.initialized = false;
  }
  
  getStatus() {
    const status = {
      initialized: this.initialized,
      isRelayHost: this.isRelayHost,
      relayConnected: this.client ? this.client.isConnected : false
    };
    
    if (this.client) {
      status.client = this.client.getStatus();
    }
    
    if (this.isRelayHost && this.server) {
      status.server = {
        metrics: this.server.metrics,
        clientCount: this.server.clients.size
      };
    }
    
    return status;
  }
}

// Export everything needed
module.exports = {
  AutoElectionRelay,
  WebSocketRelayServer,
  WebSocketRelayClient,
  ...require('./relay-core')
};