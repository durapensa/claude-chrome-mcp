const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * Test client that connects to the daemon's MCP server
 * instead of spawning its own isolated server
 */
class MCPDaemonClient {
  constructor() {
    this.socket = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.createdTabs = [];
    this.testId = `test-${Date.now()}`;
  }
  
  async connect() {
    const socketPath = path.join(os.homedir(), '.mcp', 'daemon.sock');
    
    if (!fs.existsSync(socketPath)) {
      throw new Error(
        'MCP daemon is not running.\n' +
        'Start it with: mcp daemon start\n' +
        'Check status with: mcp daemon status'
      );
    }
    
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(socketPath);
      
      let buffer = '';
      this.socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleResponse(response);
            } catch (error) {
              console.error('Invalid JSON from daemon:', line);
            }
          }
        }
      });
      
      this.socket.on('connect', () => {
        console.log(`Test client connected to daemon with ID: ${this.testId}`);
        resolve();
      });
      
      this.socket.on('error', (error) => {
        reject(new Error(`Failed to connect to daemon: ${error.message}`));
      });
      
      this.socket.on('close', () => {
        this.socket = null;
        // Reject all pending requests
        for (const [requestId, { reject, timeout }] of this.pendingRequests) {
          clearTimeout(timeout);
          reject(new Error('Connection to daemon lost'));
        }
        this.pendingRequests.clear();
      });
    });
  }
  
  async callTool(toolName, params = {}) {
    if (!this.socket) {
      throw new Error('Not connected to daemon');
    }
    
    const requestId = `req_${++this.requestId}`;
    const request = {
      type: 'tool_call',
      request_id: requestId,
      server_id: 'claude-chrome-mcp', // Use the daemon's MCP server
      tool_name: toolName.startsWith('mcp__') ? toolName : `mcp__claude-chrome-mcp__${toolName}`,
      args: params
    };
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(
          `TIMEOUT: Tool '${toolName}' did not respond within 15s.\n` +
          `This usually means:\n` +
          `1. Chrome extension is not connected to the relay\n` +
          `2. Extension cannot perform the requested operation\n` +
          `3. Chrome browser is not running or accessible`
        ));
      }, 15000);
      
      this.pendingRequests.set(requestId, { 
        resolve: (response) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          
          if (response.status === 'success') {
            // Track created resources for cleanup
            if (toolName.includes('tab_create') && response.data?.tabId) {
              this.createdTabs.push(response.data.tabId);
            }
            resolve(response.data);
          } else if (response.status === 'error') {
            reject(new Error(response.error || 'Tool call failed'));
          }
        },
        reject,
        timeout
      });
      
      const message = JSON.stringify(request) + '\n';
      this.socket.write(message);
    });
  }
  
  handleResponse(response) {
    const pending = this.pendingRequests.get(response.request_id);
    if (pending) {
      pending.resolve(response);
    }
  }
  
  async cleanup() {
    // Clean up all created resources
    for (const tabId of this.createdTabs) {
      try {
        await this.callTool('tab_close', { tabId, force: true });
      } catch (e) {
        console.log(`Warning: Failed to close tab ${tabId}:`, e.message);
      }
    }
    this.createdTabs = [];
  }
  
  async disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

module.exports = { MCPDaemonClient };
