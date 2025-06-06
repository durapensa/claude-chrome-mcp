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
    this.serverPid = null;
  }
  
  async connect() {
    // Generate unique test suite ID
    const testId = `test-${Date.now()}`;
    
    // Connect to actual MCP server via stdio
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '../../mcp-server/src/server.js')],
      env: {
        ...process.env,
        CCM_CLIENT_ID: testId,
        CCM_CLIENT_NAME: `Test Suite ${testId}`,
        CCM_CLIENT_TYPE: 'test-suite',
        // Disable parent process monitoring for tests
        CCM_NO_STDIN_MONITOR: '1',
        CCM_MAX_IDLE_TIME: '0' // Disable idle timeout
      }
    });
    
    await this.client.connect(this.transport);
    
    // Get the spawned process PID for log tracking
    this.serverPid = this.transport.process?.pid;
    console.log(`Test client connected with ID: ${testId}${this.serverPid ? ` (MCP Server PID: ${this.serverPid})` : ''}`);
  }
  
  async callTool(toolName, params = {}) {
    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: params
      });
      
      // Handle MCP SDK 1.12.1+ response format
      if (result.isError) {
        const errorMessage = result.content?.[0]?.text || 'Unknown error';
        throw new Error(errorMessage);
      }
      
      // Parse the actual response from content[0].text
      let actualResult;
      if (result.content?.[0]?.type === 'text') {
        try {
          actualResult = JSON.parse(result.content[0].text);
        } catch (parseError) {
          // If parsing fails, return the text directly
          actualResult = result.content[0].text;
        }
      } else {
        actualResult = result;
      }
      
      // Track created resources for cleanup
      if (toolName === 'tab_create' && actualResult.tabId) {
        this.createdTabs.push(actualResult.tabId);
      }
      
      return actualResult;
    } catch (error) {
      // Provide more context for common errors
      if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        throw new Error(
          `TIMEOUT: Tool '${toolName}' did not respond within timeout period.\n` +
          `This usually means:\n` +
          `1. Chrome extension is not connected to the relay\n` +
          `2. Extension cannot perform the requested operation\n` +
          `3. Chrome browser is not running or accessible\n` +
          `Original error: ${error.message}`
        );
      }
      
      if (error.message?.includes('not found') || error.message?.includes('Unknown tool')) {
        throw new Error(
          `TOOL NOT FOUND: '${fullToolName}' is not available.\n` +
          `This means the MCP server is running but the tool registry is incomplete.\n` +
          `Check that the server started correctly.\n` +
          `Original error: ${error.message}`
        );
      }
      
      if (error.message?.includes('locked')) {
        throw new Error(
          `OPERATION LOCKED: Tab is already processing another operation.\n` +
          `Wait for the current operation to complete before sending new requests.\n` +
          `Tool: ${toolName}\n` +
          `Original error: ${error.message}`
        );
      }
      
      // Re-throw with tool context
      throw new Error(`Tool '${toolName}' failed: ${error.message}`);
    }
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
  
  getLogFilePath() {
    if (!this.serverPid) return null;
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), '.claude-chrome-mcp', 'logs', `claude-chrome-mcp-server-PID-${this.serverPid}.log`);
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}

module.exports = { MCPTestClient };
