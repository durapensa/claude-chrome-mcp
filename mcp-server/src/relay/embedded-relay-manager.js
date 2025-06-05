/**
 * Embedded Relay Manager
 * Handles automatic relay election for MCP servers
 * First server to start becomes the relay host, others connect as clients
 */

const { MessageRelay } = require('./message-relay');
const { RelayClient } = require('./websocket-relay-client');
const EventEmitter = require('events');
const { createLogger } = require('../utils/logger');

class EmbeddedRelayManager extends EventEmitter {
  constructor(clientInfo, port = 54321) {
    super();
    this.clientInfo = clientInfo;
    this.port = port;
    this.isRelayHost = false;
    this.relay = null;
    this.client = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.logger = createLogger('EmbeddedRelay');
  }

  async initialize() {
    console.error('[EmbeddedRelay] Checking for existing relay...');
    
    // First check if a relay is already running via health endpoint
    try {
      const response = await fetch(`http://localhost:${this.port + 1}/health`);
      if (response.ok) {
        const health = await response.json();
        console.error('[EmbeddedRelay] Found existing relay:', health.status);
        // Connect as client to existing relay
        await this.connectAsClient();
        return;
      }
    } catch (error) {
      // No relay running, we can try to become host
      console.error('[EmbeddedRelay] No existing relay found, attempting to become host...');
    }
    
    try {
      // Try to become the relay host
      await this.startAsRelayHost();
    } catch (error) {
      if (error.code === 'EADDRINUSE' || error.message?.includes('already in use')) {
        this.logger.info('Port in use, connecting as client...');
        await this.connectAsClient();
      } else {
        throw error;
      }
    }
  }

  async startAsRelayHost() {
    this.relay = new MessageRelay(this.port);
    
    // Forward relay events
    this.relay.on('clientConnected', (client) => {
      this.emit('relayClientConnected', client);
    });
    
    this.relay.on('clientDisconnected', (clientId) => {
      this.emit('relayClientDisconnected', clientId);
    });
    
    await this.relay.start();
    this.isRelayHost = true;
    console.error('[EmbeddedRelay] Successfully started as relay host on port', this.port);
    
    // Also connect as a client to our own relay for sending messages
    await this.connectAsClient();
  }

  async connectAsClient() {
    this.client = new RelayClient(this.clientInfo, this.port);
    
    // Forward client events
    this.client.on('connected', () => {
      console.error('[EmbeddedRelay] Connected to relay as client');
      this.emit('connected');
    });
    
    this.client.on('disconnected', () => {
      console.error('[EmbeddedRelay] Disconnected from relay');
      this.emit('disconnected');
      
      // If we were the relay host and disconnected, something is wrong
      if (this.isRelayHost) {
        console.error('[EmbeddedRelay] Relay host disconnected unexpectedly!');
      }
    });
    
    this.client.on('message', (message) => {
      this.emit('message', message);
    });
    
    this.client.on('error', (error) => {
      this.emit('error', error);
    });
    
    await this.client.connect();
  }

  async sendToExtension(targetId, type, params) {
    if (!this.client) {
      throw new Error('Not connected to relay');
    }
    
    return this.client.sendToExtension(targetId, type, params);
  }

  updateClientInfo(clientInfo) {
    this.clientInfo = clientInfo;
    
    // Update the client connection if we're connected as a client
    if (this.client && this.client.isConnected) {
      // Re-identify with new client info
      this.client.send({
        type: 'identify',
        clientType: clientInfo.type || 'mcp-server',
        name: clientInfo.name || 'Claude Chrome MCP',
        capabilities: clientInfo.capabilities
      });
    }
  }

  async stop() {
    console.error('[EmbeddedRelay] Stopping embedded relay manager...');
    
    // Disconnect client first
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    
    // Stop relay if we're the host
    if (this.isRelayHost && this.relay) {
      await this.relay.stop();
      this.relay = null;
      this.isRelayHost = false;
    }
  }

  getStatus() {
    return {
      isRelayHost: this.isRelayHost,
      relayConnected: this.client?.isConnected || false,
      relayMetrics: this.isRelayHost ? this.relay?.metrics : null
    };
  }
}

module.exports = { EmbeddedRelayManager };