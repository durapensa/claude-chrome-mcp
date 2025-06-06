/**
 * Test Client Adapter
 * 
 * Provides a compatibility layer for migrating tests from individual MCP connections
 * to the shared client pattern. This allows gradual migration without breaking existing tests.
 */

const sharedClient = require('./shared-client');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

class TestClientAdapter {
  constructor(options = {}) {
    this.useSharedClient = options.useSharedClient !== false; // Default to true
    this.client = null;
    this.transport = null;
    this.isOwnClient = false;
  }

  /**
   * Get a client instance - either shared or individual based on configuration
   */
  async getClient() {
    if (this.useSharedClient) {
      // Use shared client
      await sharedClient.connect();
      return sharedClient;
    } else {
      // Create individual client (legacy behavior)
      if (!this.client) {
        await this.createOwnClient();
      }
      return this;
    }
  }

  /**
   * Create an individual MCP client (legacy behavior)
   */
  async createOwnClient() {
    console.log('🔌 Creating individual MCP client...');
    
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [require('path').join(__dirname, '../../mcp-server/src/server.js')],
      env: {
        ...process.env,
        CCM_CLIENT_ID: `test-individual-${Date.now()}`,
        CCM_CLIENT_TYPE: 'test-individual',
        CCM_NO_STDIN_MONITOR: '1',
        CCM_MAX_IDLE_TIME: '0'
      }
    });

    this.client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await this.client.connect(this.transport);
    this.isOwnClient = true;
    console.log('✅ Individual client connected');
  }

  /**
   * Call a tool - routes to appropriate client
   */
  async callTool(toolName, args) {
    if (this.useSharedClient) {
      return sharedClient.callTool(toolName, args);
    } else {
      if (!this.client) {
        await this.createOwnClient();
      }
      return this.client.callTool(toolName, args);
    }
  }

  /**
   * Close the client connection
   */
  async close() {
    if (this.useSharedClient) {
      // Shared client manages its own lifecycle
      // Individual tests shouldn't close the shared client
      return;
    } else if (this.isOwnClient && this.client) {
      console.log('🔌 Closing individual MCP client...');
      try {
        await this.client.close();
      } catch (error) {
        console.error('Error closing client:', error.message);
      }
      this.client = null;
      this.transport = null;
      this.isOwnClient = false;
    }
  }

  /**
   * Static method to create a client based on environment
   */
  static async create(options = {}) {
    const adapter = new TestClientAdapter(options);
    await adapter.getClient();
    return adapter;
  }

  /**
   * Check if using shared client (for test awareness)
   */
  isShared() {
    return this.useSharedClient;
  }
}

// Helper function for easy migration
async function getTestClient(options = {}) {
  // Check environment variable to override default behavior
  if (process.env.USE_INDIVIDUAL_MCP_CLIENT === '1') {
    options.useSharedClient = false;
  } else if (process.env.USE_SHARED_MCP_CLIENT === '1') {
    options.useSharedClient = true;
  }
  
  return TestClientAdapter.create(options);
}

module.exports = {
  TestClientAdapter,
  getTestClient,
  sharedClient // Export shared client for direct access if needed
};