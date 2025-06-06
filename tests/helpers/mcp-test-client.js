const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

class MCPTestClient {
  constructor() {
    this.client = new Client({
      name: "test-client",
      version: "1.0.0"
    }, {
      capabilities: {}
    });
    this.createdTabs = [];
    this.transport = null;
  }
  
  async connect() {
    // Connect to actual MCP server via stdio
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '../../mcp-server/src/server.js')]
    });
    
    await this.client.connect(this.transport);
  }
  
  async callTool(toolName, params = {}) {
    const fullToolName = `mcp__claude-chrome-mcp__${toolName}`;
    const result = await this.client.callTool(fullToolName, params);
    
    // Track created resources for cleanup
    if (toolName === 'tab_create' && result.tabId) {
      this.createdTabs.push(result.tabId);
    }
    
    return result;
  }
  
  async cleanup() {
    // Clean up all created resources
    for (const tabId of this.createdTabs) {
      try {
        await this.callTool('tab_close', { tabId, force: true });
      } catch (e) {
        // Tab might already be closed
        console.log(`Warning: Failed to close tab ${tabId}:`, e.message);
      }
    }
    this.createdTabs = [];
  }
  
  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}

module.exports = { MCPTestClient };