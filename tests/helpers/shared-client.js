/**
 * Shared MCP Client for Tests
 * 
 * This module provides a singleton MCP client that all tests can share,
 * avoiding the timeout issues caused by spawning multiple MCP servers.
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

class SharedMCPClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.connectionPromise = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxReconnectAttempts = 3;
    
    // Generate unique client ID for this test session
    this.clientId = `test-client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Track connection health
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
  }

  async connect() {
    // If already connected, return existing client
    if (this.isConnected && this.client) {
      return this.client;
    }

    // If connection is in progress, wait for it
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    // Start new connection
    this.isConnecting = true;
    this.connectionPromise = this._doConnect();
    
    try {
      await this.connectionPromise;
      this.isConnected = true;
      return this.client;
    } catch (error) {
      this.isConnecting = false;
      this.connectionPromise = null;
      throw error;
    }
  }

  async _doConnect() {
    console.log('🔌 Connecting to MCP server with shared client...');
    
    // Create transport with unique client ID
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [require('path').join(__dirname, '../../mcp-server/src/server.js')],
      env: {
        ...process.env,
        CCM_CLIENT_ID: this.clientId,
        CCM_CLIENT_NAME: `Test Suite ${this.clientId}`,
        CCM_CLIENT_TYPE: 'test-suite',
        // Disable parent process monitoring for tests
        CCM_NO_STDIN_MONITOR: '1',
        CCM_MAX_IDLE_TIME: '0' // Disable idle timeout
      }
    });

    // Create client
    this.client = new Client({
      name: this.clientId,
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    // Connect
    await this.client.connect(this.transport);
    console.log('✅ Connected to MCP server');
    
    return this.client;
  }

  async callTool(toolName, args) {
    try {
      const client = await this.connect();
      return await client.callTool(toolName, args);
    } catch (error) {
      // If connection error, try to reconnect once
      if (this.isConnectionError(error) && this.connectionAttempts < this.maxReconnectAttempts) {
        console.log('⚠️  Connection error detected, attempting reconnect...');
        this.isConnected = false;
        this.connectionAttempts++;
        
        // Close existing connection
        if (this.client) {
          try {
            await this.client.close();
          } catch (e) {
            // Ignore close errors
          }
          this.client = null;
          this.transport = null;
        }
        
        // Reconnect and retry
        const client = await this.connect();
        return await client.callTool(toolName, args);
      }
      
      throw error;
    }
  }
  
  isConnectionError(error) {
    const errorMessage = error.message || '';
    return errorMessage.includes('EPIPE') || 
           errorMessage.includes('ECONNRESET') ||
           errorMessage.includes('transport') ||
           errorMessage.includes('disconnected');
  }
  
  async startHealthCheck() {
    if (this.healthCheckInterval) return;
    
    this.healthCheckInterval = setInterval(async () => {
      if (this.isConnected && this.client) {
        try {
          // Try a lightweight operation to check connection
          await this.client.callTool('system_health', {});
          this.lastHealthCheck = Date.now();
        } catch (error) {
          console.warn('Health check failed:', error.message);
          this.isConnected = false;
        }
      }
    }, 30000); // Check every 30 seconds
  }
  
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async close() {
    this.stopHealthCheck();
    
    if (this.client) {
      console.log('🔌 Closing shared MCP client...');
      try {
        await this.client.close();
      } catch (error) {
        console.error('Error closing client:', error.message);
      }
      this.client = null;
      this.transport = null;
      this.isConnected = false;
      this.isConnecting = false;
      this.connectionPromise = null;
      this.connectionAttempts = 0;
    }
  }

  // Get client info for logging
  getInfo() {
    return {
      clientId: this.clientId,
      isConnected: this.isConnected,
      isConnecting: this.isConnecting
    };
  }
}

// Export singleton instance
const sharedClient = new SharedMCPClient();

// Ensure cleanup on process exit
process.on('exit', () => {
  if (sharedClient.isConnected) {
    sharedClient.close().catch(() => {});
  }
});

process.on('SIGINT', () => {
  sharedClient.close().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  sharedClient.close().then(() => process.exit(0)).catch(() => process.exit(1));
});

module.exports = sharedClient;