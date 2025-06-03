const WebSocket = require('ws');
const { ErrorTracker } = require('../utils/error-tracker');
const { DebugMode } = require('../utils/debug-mode');
const { WebSocketHub, HUB_PORT } = require('./websocket-hub');

// Hub client that can connect to existing hub or create its own
// Supports multi-server architecture with automatic hub election

class AutoHubClient {
  constructor(clientInfo = {}, operationManager = null, notificationManager = null) {
    this.clientInfo = this.mergeClientInfo(clientInfo);
    this.operationManager = operationManager;
    this.notificationManager = notificationManager;
    this.ws = null;
    this.connected = false;
    this.requestCounter = 0;
    this.pendingRequests = new Map();
    
    // Improved reconnection parameters
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = -1; // Infinite attempts
    this.baseReconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.connectionHealthInterval = null;
    
    this.ownedHub = null;
    this.isHubOwner = false;
    this.lastSuccessfulConnection = null;
    
    // Connection state tracking
    this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting
    this.connectionHistory = [];
    this.lastActivityTime = Date.now();
    
    // Enhanced debugging and error tracking
    this.errorTracker = new ErrorTracker();
    this.debug = new DebugMode().createLogger('AutoHubClient');
    
    this.setupProcessMonitoring();
  }

  setupProcessMonitoring() {
    // DISABLED: Parent monitoring is handled by ProcessLifecycleManager
    // Having it in multiple places causes premature shutdowns
    console.error('CCM: AutoHubClient parent monitoring disabled (handled by ProcessLifecycleManager)');
    return;
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

  async connect() {
    if (this.connectionState === 'connecting') {
      console.error('CCM: Connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    
    // Check if hub creation is forced
    const forceHubCreation = process.env.CCM_FORCE_HUB_CREATION === '1';
    
    if (!forceHubCreation) {
      try {
        // Try existing hub first with shorter timeout
        console.error('CCM: Checking for existing hub...');
        await this.connectToExistingHub(2000);
        this.onConnectionSuccess();
        console.error(`CCM: Connected to existing hub as ${this.clientInfo.name}`);
        return;
      } catch (error) {
        console.error('CCM: No existing hub found:', error.message);
      }
    } else {
      console.error('CCM: Forced hub creation mode - skipping existing hub check');
    }

    try {
      console.error('CCM: Starting new WebSocket hub...');
      await this.startHubAndConnect();
      this.onConnectionSuccess();
      console.error(`CCM: Successfully started hub and connected as ${this.clientInfo.name}`);
    } catch (error) {
      this.connectionState = 'disconnected';
      console.error('CCM: Failed to start hub:', error);
      
      // More detailed error reporting
      if (error.code === 'EADDRINUSE') {
        console.error('CCM: Port 54321 is already in use');
        console.error('CCM: Run "lsof -i :54321" to check what\'s using it');
      } else if (error.code === 'EACCES') {
        console.error('CCM: Permission denied to bind to port 54321');
      }
      
      throw error;
    }
  }

  onConnectionSuccess() {
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.lastSuccessfulConnection = Date.now();
    this.connectionHistory.push({
      timestamp: Date.now(),
      event: 'connected',
      attempt: this.reconnectAttempts
    });
    
    // Start connection health monitoring
    this.startConnectionHealthCheck();
  }

  startConnectionHealthCheck() {
    if (this.connectionHealthInterval) {
      clearInterval(this.connectionHealthInterval);
    }

    this.connectionHealthInterval = setInterval(() => {
      if (!this.isConnectionHealthy()) {
        this.debug.warn('Connection unhealthy, initiating reconnection');
        this.scheduleReconnect();
      }
    }, 10000); // Check every 10 seconds
  }

  isConnectionHealthy() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Check if we've had recent activity
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    if (timeSinceLastActivity > 60000) { // 1 minute without activity
      this.debug.warn('No recent activity detected');
      return false;
    }

    return true;
  }

  async connectToExistingHub(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
      };

      ws.on('open', () => {
        cleanup();
        this.ws = ws;
        this.setupWebSocketHandlers(resolve, reject);
        this.registerWithHub();
      });

      ws.on('error', (error) => {
        cleanup();
        reject(error);
      });
    });
  }

  async startHubAndConnect() {
    console.error('CCM: Creating WebSocketHub instance...');
    
    // Start embedded hub with error handling
    this.ownedHub = new WebSocketHub();
    
    try {
      console.error('CCM: Starting WebSocketHub on port 54321...');
      await this.ownedHub.start();
      console.error('CCM: WebSocketHub started successfully');
      this.isHubOwner = true;
    } catch (hubError) {
      console.error('CCM: WebSocketHub failed to start:', hubError);
      this.ownedHub = null;
      throw hubError;
    }

    // Wait for hub to be ready
    console.error('CCM: Waiting for hub to be ready...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Connect to our own hub
    console.error('CCM: Connecting to own hub...');
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout connecting to own hub'));
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        console.error('CCM: Connected to own hub successfully');
        this.ws = ws;
        this.setupWebSocketHandlers(resolve, reject);
        this.registerWithHub();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.error('CCM: Error connecting to own hub:', error);
        reject(error);
      });
    });
  }

  setupWebSocketHandlers(connectResolve, connectReject) {
    // Initialize message buffer for hub client
    this.messageBuffer = '';
    
    this.ws.on('message', (data) => {
      this.lastActivityTime = Date.now();
      try {
        const dataStr = data.toString();
        // Filter out non-JSON WebSocket protocol messages
        if (dataStr.startsWith('WebSocket') || dataStr === 'ping' || dataStr === 'pong') {
          this.debug.verbose('Ignoring WebSocket protocol message:', dataStr);
          return;
        }
        
        // Append to buffer
        this.messageBuffer += dataStr;
        
        // Try to parse complete JSON messages
        let processed = true;
        while (processed) {
          processed = false;
          try {
            const message = JSON.parse(this.messageBuffer);
            // Successfully parsed - clear buffer and process
            this.messageBuffer = '';
            this.handleMessage(message, connectResolve, connectReject);
            processed = false;
          } catch (parseError) {
            const trimmed = this.messageBuffer.trim();
            if (trimmed.length === 0) {
              this.messageBuffer = '';
              processed = false;
            } else if (this.isPartialJSON(trimmed)) {
              // Wait for more data
              processed = false;
            } else {
              // Genuine error - clear buffer and log
              throw parseError;
            }
          }
        }
      } catch (error) {
        this.messageBuffer = '';
        this.errorTracker.logError(error, { action: 'parse_message', data: data.toString() });
        console.error('CCM: Error parsing message:', error, 'Data:', data.toString());
      }
    });

    this.ws.on('close', (code, reason) => {
      console.error('CCM: Connection closed:', code, reason.toString());
      this.connected = false;
      this.connectionState = 'disconnected';
      
      if (this.connectionHealthInterval) {
        clearInterval(this.connectionHealthInterval);
        this.connectionHealthInterval = null;
      }
      
      this.connectionHistory.push({
        timestamp: Date.now(),
        event: 'disconnected',
        code,
        reason: reason.toString()
      });
      
      // Only reconnect if not intentionally closing
      if (code !== 1000 && this.connectionState !== 'shutting_down') {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error) => {
      this.errorTracker.logError(error, { action: 'websocket_error' });
      console.error('CCM: Connection error:', error);
      this.connectionHistory.push({
        timestamp: Date.now(),
        event: 'error',
        error: error.message
      });
      
      if (connectReject) connectReject(error);
    });

    // Setup ping/pong for connection health
    this.ws.on('ping', () => {
      this.ws.pong();
      this.lastActivityTime = Date.now();
    });

    this.ws.on('pong', () => {
      this.lastActivityTime = Date.now();
    });
  }

  isPartialJSON(str) {
    // Simple heuristic to detect partial JSON messages
    const openBrackets = (str.match(/\{/g) || []).length;
    const closeBrackets = (str.match(/\}/g) || []).length;
    const openSquare = (str.match(/\[/g) || []).length;
    const closeSquare = (str.match(/\]/g) || []).length;
    
    // If unmatched brackets/braces, likely partial
    if (openBrackets !== closeBrackets || openSquare !== closeSquare) {
      return true;
    }
    
    // If starts with expected characters but doesn't parse, likely partial
    if (str.startsWith('{') || str.startsWith('[') || str.startsWith('"')) {
      return true;
    }
    
    return false;
  }

  registerWithHub() {
    this.ws.send(JSON.stringify({
      type: 'mcp_client_register',
      clientInfo: this.clientInfo,
      timestamp: Date.now()
    }));
  }

  handleMessage(message, connectResolve, connectReject) {
    const { type } = message;

    switch (type) {
      case 'registration_confirmed':
        console.error(`CCM: Registration confirmed, client ID: ${message.clientId}`);
        this.connected = true;
        this.reconnectAttempts = 0;
        if (connectResolve) connectResolve();
        break;

      case 'response':
      case 'error':
        this.handleResponse(message);
        break;

      case 'keepalive':
        this.ws.send(JSON.stringify({
          type: 'keepalive_response',
          timestamp: Date.now()
        }));
        break;

      case 'hub_shutdown':
        console.error('CCM: Hub is shutting down');
        this.connected = false;
        break;

      case 'operation_milestone':
        this.handleOperationMilestone(message);
        break;

      default:
        console.error('CCM: Unknown message type:', type);
    }
  }

  handleResponse(message) {
    const { requestId, result, error } = message;
    const pendingRequest = this.pendingRequests.get(requestId);
    
    if (pendingRequest) {
      // Clear timeout
      if (pendingRequest.timeoutId) {
        clearTimeout(pendingRequest.timeoutId);
      }
      
      this.pendingRequests.delete(requestId);
      
      if (error) {
        pendingRequest.reject(new Error(error));
      } else {
        pendingRequest.resolve(result);
      }
    }
  }

  handleOperationMilestone(message) {
    const { operationId, milestone, timestamp, tabId, ...data } = message;
    
    console.error(`[AutoHubClient] Received milestone: ${operationId} - ${milestone}`);
    
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
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Try to reconnect if not connected
      if (this.connectionState === 'disconnected') {
        this.debug.info('Attempting to reconnect for request');
        await this.connect();
      }
      
      if (!this.connected) {
        throw new Error('Not connected to hub and reconnection failed');
      }
    }

    const requestId = `req-${++this.requestCounter}`;
    
    return new Promise((resolve, reject) => {
      const timeoutMs = 10000; // Reduced timeout for faster debugging
      
      this.pendingRequests.set(requestId, { resolve, reject });
      
      this.ws.send(JSON.stringify({
        type,
        requestId,
        params,
        timestamp: Date.now()
      }));
      
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout after ${timeoutMs}ms (requestId: ${requestId}, type: ${type})`));
        }
      }, timeoutMs);
      
      this.pendingRequests.get(requestId).timeoutId = timeoutId;
    });
  }

  async gracefulShutdown() {
    console.error('CCM: Initiating graceful shutdown');
    this.connectionState = 'shutting_down';
    
    // Clear intervals immediately
    if (this.connectionHealthInterval) {
      clearInterval(this.connectionHealthInterval);
      this.connectionHealthInterval = null;
    }
    if (this.parentCheckInterval) {
      clearInterval(this.parentCheckInterval);
      this.parentCheckInterval = null;
    }
    if (this.parentMonitor) {
      clearInterval(this.parentMonitor);
      this.parentMonitor = null;
    }
    
    // Close connection
    await this.close();
    
    // Force exit immediately
    process.exit(0);
  }

  scheduleReconnect() {
    if (this.connectionState === 'shutting_down') {
      return;
    }

    if (this.connectionState === 'reconnecting') {
      return; // Already reconnecting
    }

    this.connectionState = 'reconnecting';
    this.reconnectAttempts++;
    
    // Smart exponential backoff with jitter
    const baseDelay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    const delay = baseDelay + jitter;
    
    console.error(`CCM: Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
    
    this.connectionHistory.push({
      timestamp: Date.now(),
      event: 'reconnect_scheduled',
      attempt: this.reconnectAttempts,
      delay
    });
    
    setTimeout(async () => {
      try {
        await this.connect();
        console.error('CCM: Reconnection successful');
      } catch (error) {
        console.error('CCM: Reconnection failed:', error.message);
        // scheduleReconnect will be called again via the close handler
      }
    }, delay);
  }

  async close() {
    this.connectionState = 'shutting_down';
    
    if (this.connectionHealthInterval) {
      clearInterval(this.connectionHealthInterval);
      this.connectionHealthInterval = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client shutting down');
      this.ws = null;
    }
    
    if (this.isHubOwner && this.ownedHub) {
      console.error('CCM: Shutting down owned hub');
      await this.ownedHub.stop();
      this.ownedHub = null;
      this.isHubOwner = false;
    }
    
    this.connected = false;
    
    // Clear pending requests with timeout cleanup
    for (const [requestId, pendingRequest] of this.pendingRequests) {
      if (pendingRequest.timeoutId) {
        clearTimeout(pendingRequest.timeoutId);
      }
      pendingRequest.reject(new Error('Client shutting down'));
    }
    this.pendingRequests.clear();
  }

  async disconnect() {
    // Alias for close() to match expected interface
    return this.close();
  }

  getConnectionStats() {
    return {
      state: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      pendingRequests: this.pendingRequests.size,
      isHubOwner: this.isHubOwner,
      connectionHistory: this.connectionHistory.slice(-10) // Last 10 events
    };
  }
}

// ============================================================================
// Main MCP Server
// ============================================================================



module.exports = { AutoHubClient, HUB_PORT };
