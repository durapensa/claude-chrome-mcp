const EventEmitter = require('events');
const { ErrorTracker } = require('../utils/error-tracker');
const { DebugMode } = require('../utils/debug-mode');
const { EmbeddedRelayManager } = require('../relay/embedded-relay-manager');

// WebSocket relay client for MCP server
// Uses persistent WebSocket connection via relay for all communication

class AutoHubClient extends EventEmitter {
  constructor(clientInfo = {}, operationManager = null, notificationManager = null) {
    super();
    this.clientInfo = this.mergeClientInfo(clientInfo);
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
    this.debug = new DebugMode().createLogger('RelayClient');
    
    console.error('RelayClient: Initializing WebSocket relay mode');
    this.initializeRelayClient();
  }


  mergeClientInfo(clientInfo) {
    const autoDetected = this.detectClientInfo();
    const finalInfo = {
      id: process.env.CCM_CLIENT_ID || clientInfo.id || autoDetected.id,
      name: process.env.CCM_CLIENT_NAME || clientInfo.name || autoDetected.name,
      type: process.env.CCM_CLIENT_TYPE || clientInfo.type || autoDetected.type,
      capabilities: ['chrome_tabs', 'debugger', 'claude_automation'],
      ...clientInfo
    };
    
    console.error(`CCM: Detected client: ${finalInfo.name} (${finalInfo.type})`);
    console.error(`CCM: Auto-detected info:`, JSON.stringify(autoDetected, null, 2));
    console.error(`CCM: Final client info:`, JSON.stringify(finalInfo, null, 2));
    return finalInfo;
  }

  detectClientInfo() {
    const processName = process.title || process.argv[0] || '';
    const parentProcess = process.env._ || '';
    const execPath = process.execPath || '';
    const argv = process.argv.join(' ');
    const cwd = process.cwd();
    const parentPid = process.ppid;
    
    // Debug logging (can be enabled with CCM_DEBUG_DETECTION=1)
    if (process.env.CCM_DEBUG_DETECTION) {
      console.error('CCM Detection Debug:');
      console.error('  processName:', processName);
      console.error('  parentProcess:', parentProcess);
      console.error('  execPath:', execPath);
      console.error('  argv:', argv);
      console.error('  cwd:', cwd);
      console.error('  parentPid:', parentPid);
      console.error('  CLAUDE_DESKTOP_APP:', process.env.CLAUDE_DESKTOP_APP);
      console.error('  CLAUDE_DESKTOP:', process.env.CLAUDE_DESKTOP);
      console.error('  _:', process.env._);
    }
    
    // Try to detect Claude Desktop FIRST (more specific patterns)
    // Check for explicit Claude Desktop environment variables first
    if (process.env.CLAUDE_DESKTOP_APP || process.env.CLAUDE_DESKTOP) {
      return {
        id: 'claude-desktop',
        name: 'Claude Desktop',
        type: 'claude-desktop'
      };
    }
    
    // Check parent process via ps command to see if it's Claude Desktop
    try {
      const { execSync } = require('child_process');
      const parentInfo = execSync(`ps -p ${parentPid} -o comm=`, { encoding: 'utf8' }).trim();
      if (parentInfo.toLowerCase().includes('claude') && !parentInfo.toLowerCase().includes('claude-code')) {
        return {
          id: 'claude-desktop',
          name: 'Claude Desktop',
          type: 'claude-desktop'
        };
      }
    } catch (e) {
      // ps command failed, continue with other detection methods
    }
    
    // Check for Claude Desktop specific patterns
    if (argv.toLowerCase().includes('claude.app') ||
        execPath.toLowerCase().includes('claude.app') ||
        parentProcess.toLowerCase().includes('claude.app') ||
        (parentProcess.toLowerCase().includes('claude') && 
         !parentProcess.toLowerCase().includes('claude-code') && 
         !parentProcess.toLowerCase().includes('/bin/claude'))) {
      return {
        id: 'claude-desktop',
        name: 'Claude Desktop',
        type: 'claude-desktop'
      };
    }
    
    // Try to detect Claude Code (more specific detection)
    if (process.env.CLAUDE_CODE_SESSION || 
        process.env.CLAUDE_CODE || 
        argv.includes('/bin/claude') ||
        argv.includes('claude-code') ||
        parentProcess.toLowerCase().includes('/bin/claude') ||
        (argv.toLowerCase().includes('claude') && !argv.toLowerCase().includes('claude.app'))) {
      return {
        id: 'claude-code', 
        name: 'Claude Code',
        type: 'claude-code'
      };
    }
    
    // Try to detect VS Code
    if (parentProcess.toLowerCase().includes('vscode') ||
        processName.toLowerCase().includes('vscode') ||
        process.env.VSCODE_PID) {
      return {
        id: 'vscode',
        name: 'VS Code',
        type: 'vscode'
      };
    }
    
    // Try to detect Cursor
    if (parentProcess.toLowerCase().includes('cursor') ||
        processName.toLowerCase().includes('cursor') ||
        process.env.CURSOR_PID) {
      return {
        id: 'cursor',
        name: 'Cursor',
        type: 'cursor'
      };
    }
    
    // Generic detection from process title/path
    const cleanName = processName.replace(/\.exe$/, '').replace(/^.*[/\\]/, '');
    if (cleanName && cleanName !== 'node') {
      return {
        id: cleanName.toLowerCase(),
        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        type: 'auto-detected'
      };
    }
    
    // Fallback
    return {
      id: 'mcp-client',
      name: 'MCP Client',
      type: 'generic'
    };
  }

  initializeRelayClient() {
    this.relayManager = new EmbeddedRelayManager(this.clientInfo);
    
    // Handle relay events
    this.relayManager.on('connected', () => {
      console.error('RelayClient: Connected to relay');
      this.connected = true;
      this.connectionState = 'connected';
      this.lastSuccessfulConnection = Date.now();
      this.emit('connected');
    });
    
    this.relayManager.on('disconnected', () => {
      console.error('RelayClient: Disconnected from relay');
      this.connected = false;
      this.connectionState = 'disconnected';
      this.emit('connection_lost');
    });
    
    this.relayManager.on('message', (message) => {
      this.handleRelayMessage(message);
    });
    
    this.relayManager.on('relayClientConnected', (client) => {
      console.error('RelayClient: New client connected to relay:', client.name);
    });
    
    this.relayManager.on('relayClientDisconnected', (clientId) => {
      console.error('RelayClient: Client disconnected from relay:', clientId);
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
      
      // Otherwise, emit the message for other handlers
      this.emit('message', data);
    }
  }

  async connect() {
    if (this.connectionState === 'connecting') {
      console.error('RelayClient: Connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    
    try {
      console.error('RelayClient: Initializing embedded relay...');
      await this.relayManager.initialize();
      // Events will be handled by the relay manager listeners
      
      const status = this.relayManager.getStatus();
      if (status.isRelayHost) {
        console.error('RelayClient: Running as relay host');
      } else {
        console.error('RelayClient: Connected to existing relay');
      }
    } catch (error) {
      console.error('RelayClient: Failed to initialize relay:', error);
      this.connectionState = 'disconnected';
      throw error;
    }
  }



  handleOperationMilestone(message) {
    const { operationId, milestone, timestamp, tabId, ...data } = message;
    
    console.error(`[RelayClient] Received milestone: ${operationId} - ${milestone}`);
    
    // Update operation manager
    if (this.operationManager) {
      this.operationManager.updateOperation(operationId, milestone, { tabId, ...data });
    }
    
    // Send MCP notification
    if (this.notificationManager) {
      this.notificationManager.sendProgress(operationId, milestone, { tabId, ...data });
    }
  }

  async sendRequest(type, params = {}) {
    // Handle relay mode only
    if (!this.relayManager || !this.relayManager.client || !this.relayManager.client.isConnected) {
      if (this.connectionState === 'disconnected') {
        this.debug.info('Attempting to reconnect to relay for request');
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
      this.relayManager.client.multicast('chrome_extension', {
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
    console.error('RelayClient: Initiating graceful shutdown');
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
}


module.exports = { AutoHubClient };
