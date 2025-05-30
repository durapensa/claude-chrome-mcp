#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const WebSocket = require('ws');
const EventEmitter = require('events');

// Enhanced error handling and debugging utilities
class ErrorTracker {
  constructor(maxErrors = 100) {
    this.errors = [];
    this.maxErrors = maxErrors;
    this.errorCounts = new Map();
  }

  logError(error, context = {}) {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message || error,
      stack: error.stack,
      context,
      id: this.generateErrorId()
    };

    this.errors.push(errorEntry);
    
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    const errorKey = error.message || error.toString();
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    console.error(`[${errorEntry.id}] Error:`, error.message, context);
    
    return errorEntry.id;
  }

  generateErrorId() {
    return Math.random().toString(36).substr(2, 9);
  }

  getRecentErrors(count = 10) {
    return this.errors.slice(-count);
  }

  getErrorStats() {
    return {
      totalErrors: this.errors.length,
      uniqueErrors: this.errorCounts.size,
      mostFrequentErrors: Array.from(this.errorCounts.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
    };
  }
}

class DebugMode {
  constructor() {
    this.enabled = process.env.CCM_DEBUG === '1' || process.env.NODE_ENV === 'development';
    this.verboseEnabled = process.env.CCM_VERBOSE === '1';
    this.loggers = new Map();
  }

  createLogger(component) {
    const logger = {
      debug: (message, data = {}) => {
        if (this.enabled) {
          console.error(`[${component}] DEBUG:`, message, data);
        }
      },
      
      verbose: (message, data = {}) => {
        if (this.verboseEnabled) {
          console.error(`[${component}] VERBOSE:`, message, data);
        }
      },
      
      info: (message, data = {}) => {
        console.error(`[${component}] INFO:`, message, data);
      },
      
      warn: (message, data = {}) => {
        console.error(`[${component}] WARN:`, message, data);
      },
      
      error: (message, error = null, data = {}) => {
        console.error(`[${component}] ERROR:`, message, error?.message || error, data);
      }
    };

    this.loggers.set(component, logger);
    return logger;
  }

  getLogger(component) {
    return this.loggers.get(component) || this.createLogger(component);
  }
}

// Enhanced process lifecycle management
class ProcessLifecycleManager {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    this.shutdownTimeoutMs = 5000;
    this.parentPid = process.ppid;
    this.parentCheckInterval = null;
    this.cleanupTasks = [];
    this.lastParentCheck = Date.now();
    this.lastActivityTime = Date.now();
    
    this.setupSignalHandlers();
    this.setupParentMonitoring();
    this.setupOrphanDetection();
  }

  addCleanupTask(name, cleanupFn) {
    this.cleanupTasks.push({ name, cleanupFn });
  }

  setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGPIPE'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        console.error(`CCM: Received ${signal}, initiating graceful shutdown`);
        this.gracefulShutdown(`signal:${signal}`);
      });
    });

    process.on('disconnect', () => {
      console.error('CCM: Parent process disconnected');
      this.gracefulShutdown('parent_disconnect');
    });

    process.on('uncaughtException', (error) => {
      console.error('CCM: Uncaught exception:', error);
      this.emergencyShutdown('uncaught_exception');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('CCM: Unhandled rejection:', reason);
      this.emergencyShutdown('unhandled_rejection');
    });
  }

  setupParentMonitoring() {
    if (this.parentPid && this.parentPid !== 1) {
      this.parentCheckInterval = setInterval(() => {
        this.checkParentProcess();
      }, 2000);
    }

    if (process.env.CCM_PARENT_PID) {
      const envParentPid = parseInt(process.env.CCM_PARENT_PID);
      if (envParentPid && envParentPid !== this.parentPid) {
        console.warn(`CCM: ENV parent PID (${envParentPid}) differs from process parent PID (${this.parentPid})`);
        this.parentPid = envParentPid;
      }
    }

    if (process.stdin.isTTY === false && !process.env.CCM_NO_STDIN_MONITOR) {
      process.stdin.on('end', () => {
        console.error('CCM: stdin closed, parent likely disconnected');
        this.gracefulShutdown('stdin_closed');
      });

      process.stdin.on('error', (error) => {
        console.error('CCM: stdin error:', error);
        this.gracefulShutdown('stdin_error');
      });
    }
  }

  setupOrphanDetection() {
    const checkOrphanStatus = () => {
      if (process.ppid === 1 && this.parentPid !== 1) {
        console.error('CCM: Process orphaned (parent PID is now 1)');
        this.gracefulShutdown('orphaned');
        return;
      }

      const maxIdleTime = parseInt(process.env.CCM_MAX_IDLE_TIME || '300000');
      if (maxIdleTime > 0) {
        const timeSinceLastActivity = Date.now() - this.lastActivityTime;
        if (timeSinceLastActivity > maxIdleTime) {
          console.error(`CCM: No activity for ${timeSinceLastActivity}ms, shutting down`);
          this.gracefulShutdown('max_idle_time');
        }
      }
    };

    setInterval(checkOrphanStatus, 10000);
  }

  checkParentProcess() {
    try {
      if (this.parentPid && this.parentPid !== 1) {
        process.kill(this.parentPid, 0);
        this.lastParentCheck = Date.now();
      }
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.error(`CCM: Parent process ${this.parentPid} no longer exists`);
        this.gracefulShutdown('parent_dead');
      } else if (error.code === 'EPERM') {
        console.warn(`CCM: Cannot signal parent process ${this.parentPid} (permission denied)`);
      } else {
        console.error('CCM: Error checking parent process:', error);
      }
    }
  }

  updateActivity() {
    this.lastActivityTime = Date.now();
  }

  async gracefulShutdown(reason = 'unknown') {
    if (this.isShuttingDown) {
      return this.shutdownPromise;
    }

    console.error(`CCM: Graceful shutdown initiated (reason: ${reason})`);
    this.isShuttingDown = true;

    this.shutdownPromise = this.performShutdown(reason);
    return this.shutdownPromise;
  }

  async performShutdown(reason) {
    const shutdownStart = Date.now();
    
    try {
      if (this.parentCheckInterval) {
        clearInterval(this.parentCheckInterval);
        this.parentCheckInterval = null;
      }

      const cleanupPromises = this.cleanupTasks.map(async ({ name, cleanupFn }) => {
        try {
          console.error(`CCM: Running cleanup task: ${name}`);
          await cleanupFn();
          console.error(`CCM: Cleanup task completed: ${name}`);
        } catch (error) {
          console.error(`CCM: Cleanup task failed: ${name}`, error);
        }
      });

      await Promise.race([
        Promise.all(cleanupPromises),
        new Promise(resolve => setTimeout(resolve, this.shutdownTimeoutMs))
      ]);

      const shutdownDuration = Date.now() - shutdownStart;
      console.error(`CCM: Graceful shutdown completed in ${shutdownDuration}ms (reason: ${reason})`);
      
      process.exit(0);
      
    } catch (error) {
      console.error('CCM: Error during graceful shutdown:', error);
      this.emergencyShutdown('shutdown_error');
    }
  }

  emergencyShutdown(reason = 'unknown') {
    console.error(`CCM: Emergency shutdown initiated (reason: ${reason})`);
    
    setTimeout(() => {
      console.error('CCM: Force exit');
      process.exit(1);
    }, 1000);
  }

  startHeartbeat(intervalMs = 30000) {
    setInterval(() => {
      this.updateActivity();
    }, intervalMs);
  }
}

const HUB_PORT = 54321;

// ============================================================================
// WebSocket Hub Classes (embedded)
// ============================================================================

class MCPClientConnection {
  constructor(ws, clientInfo) {
    this.id = clientInfo.id || `client-${Date.now()}`;
    this.name = clientInfo.name || 'Unknown Client';
    this.type = clientInfo.type || 'mcp';
    this.capabilities = clientInfo.capabilities || [];
    this.websocket = ws;
    this.connected = true;
    this.connectedAt = Date.now();
    this.lastActivity = Date.now();
    this.requestCount = 0;
  }

  send(message) {
    if (this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
      this.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      capabilities: this.capabilities,
      connected: this.connected,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      requestCount: this.requestCount,
      websocketState: this.websocket.readyState
    };
  }
}

class WebSocketHub extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // clientId -> MCPClientConnection
    this.server = null;
    this.chromeExtensionConnection = null;
    this.requestCounter = 0;
    this.isShuttingDown = false;
    this.startTime = Date.now();
    this.messageCounter = 0;
    this.clientCounter = 0;
    
    // Health monitoring
    this.healthCheckInterval = null;
    this.keepaliveInterval = null;
    
    // Enhanced debugging
    this.errorTracker = new ErrorTracker();
    this.debug = new DebugMode().createLogger('WebSocketHub');
    
    this.setupSignalHandlers();
  }

  async start() {
    if (this.server) {
      throw new Error('Hub already started');
    }

    try {
      await this.startServer();
      this.startHealthMonitoring();
      console.error(`WebSocket Hub: Started on port ${HUB_PORT}`);
    } catch (error) {
      console.error(`WebSocket Hub: Failed to start:`, error);
      throw error;
    }
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = new WebSocket.Server({ 
        port: HUB_PORT,
        clientTracking: true
      });

      this.server.on('listening', () => {
        console.error(`WebSocket Hub: Listening on port ${HUB_PORT}`);
        resolve();
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`WebSocket Hub: Port ${HUB_PORT} already in use`);
          reject(new Error(`Port ${HUB_PORT} already in use`));
        } else {
          console.error('WebSocket Hub: Server error:', error);
          reject(error);
        }
      });

      this.server.on('connection', (ws, req) => {
        this.handleNewConnection(ws, req);
      });
    });
  }

  handleNewConnection(ws, req) {
    const clientId = `client-${++this.clientCounter}-${Date.now()}`;
    const remoteAddress = req.socket.remoteAddress;
    
    console.error(`WebSocket Hub: New connection ${clientId} from ${remoteAddress}`);

    // Set up basic connection state
    ws.clientId = clientId;
    ws.connectionTime = Date.now();
    ws.lastActivity = Date.now();
    ws.messageCount = 0;
    ws.isAlive = true;

    // Set up message handling
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(ws, code, reason);
    });

    ws.on('error', (error) => {
      this.errorTracker.logError(error, { clientId, action: 'client_error' });
      console.error(`WebSocket Hub: Client ${clientId} error:`, error);
    });

    // Set up ping/pong for connection health
    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastActivity = Date.now();
    });

    // Send welcome message
    this.sendToClient(ws, {
      type: 'welcome',
      clientId: clientId,
      serverInfo: {
        name: 'Claude Chrome MCP Hub',
        version: '2.1.0',
        port: HUB_PORT,
        startTime: this.startTime
      }
    });
  }

  handleMessage(ws, data) {
    try {
      const dataStr = data.toString();
      // Filter out non-JSON WebSocket protocol messages
      if (dataStr.startsWith('WebSocket') || dataStr === 'ping' || dataStr === 'pong') {
        this.debug.verbose('Ignoring WebSocket protocol message from client:', ws.clientId, dataStr);
        return;
      }
      
      const message = JSON.parse(dataStr);
      ws.lastActivity = Date.now();
      ws.messageCount++;
      this.messageCounter++;

      this.routeMessage(ws, message);
      
    } catch (error) {
      this.errorTracker.logError(error, { clientId: ws.clientId, action: 'parse_message', data: data.toString() });
      console.error(`WebSocket Hub: Invalid JSON from client ${ws.clientId}:`, error, 'Data:', data.toString());
      this.sendToClient(ws, {
        type: 'error',
        error: 'Invalid JSON message',
        timestamp: Date.now()
      });
    }
  }

  routeMessage(ws, message) {
    const { type } = message;

    switch (type) {
      case 'chrome_extension_register':
        this.registerChromeExtension(ws, message);
        break;
        
      case 'mcp_client_register':
        this.registerMCPClient(ws, message);
        break;
        
      case 'keepalive':
        this.handleKeepalive(ws, message);
        break;
        
      case 'request':
        this.forwardRequest(ws, message);
        break;
        
      case 'response':
      case 'error':
        this.forwardResponse(ws, message);
        break;
        
      default:
        // For MCP clients, forward any unrecognized message type as a potential tool request
        // This allows new tools to be added without updating the hub
        if (ws.clientType === 'mcp_client') {
          // Log unknown types for debugging, but still forward them
          if (!message.requestId) {
            console.warn(`WebSocket Hub: Forwarding unknown message type '${type}' from ${ws.clientId} (no requestId)`);
          }
          this.forwardRequest(ws, message);
        } else {
          console.warn(`WebSocket Hub: Unknown message type '${type}' from non-MCP client ${ws.clientId}`);
          this.sendToClient(ws, {
            type: 'error',
            error: `Unknown message type: ${type}`,
            timestamp: Date.now()
          });
        }
    }
  }

  handleKeepalive(ws, message) {
    this.sendToClient(ws, {
      type: 'keepalive_response',
      timestamp: Date.now()
    });
  }

  registerChromeExtension(ws, message) {
    if (this.chromeExtensionConnection && this.chromeExtensionConnection !== ws) {
      console.warn('WebSocket Hub: Replacing existing extension connection');
      this.chromeExtensionConnection.close(1000, 'New extension connected');
    }

    this.chromeExtensionConnection = ws;
    ws.clientType = 'chrome_extension';
    ws.clientInfo = {
      id: 'chrome-extension',
      name: 'Chrome Extension',
      type: 'chrome_extension',
      extensionId: message.extensionId
    };

    console.error('WebSocket Hub: Chrome extension registered from', message.extensionId);
    
    this.sendToClient(ws, {
      type: 'registration_confirmed',
      role: 'chrome_extension',
      hubInfo: this.getHubInfo()
    });

    this.broadcastClientListUpdate();
  }

  registerMCPClient(ws, message) {
    const clientInfo = {
      id: message.clientInfo?.id || `mcp-${ws.clientId}`,
      name: message.clientInfo?.name || 'MCP Client',
      type: message.clientInfo?.type || 'mcp',
      capabilities: message.clientInfo?.capabilities || [],
      ...message.clientInfo
    };

    ws.clientType = 'mcp_client';
    ws.clientInfo = clientInfo;
    
    this.clients.set(clientInfo.id, {
      ws,
      info: clientInfo,
      registeredAt: Date.now(),
      requestCount: 0
    });

    console.error(`WebSocket Hub: MCP client registered: ${clientInfo.name} (${clientInfo.id})`);
    
    this.sendToClient(ws, {
      type: 'registration_confirmed',
      clientId: clientInfo.id,
      role: 'mcp_client',
      hubInfo: this.getHubInfo()
    });

    this.broadcastClientListUpdate();
  }

  handleDisconnection(ws, code, reason) {
    const clientId = ws.clientId;
    const clientInfo = ws.clientInfo;
    
    console.error(`WebSocket Hub: Client ${clientId} disconnected (code: ${code}, reason: ${reason})`);

    if (ws === this.chromeExtensionConnection) {
      console.error('WebSocket Hub: Chrome extension disconnected');
      this.chromeExtensionConnection = null;
      
      // Notify all MCP clients about extension disconnect
      for (const [id, client] of this.clients) {
        this.sendToClient(client.ws, {
          type: 'extension_disconnected',
          timestamp: Date.now()
        });
      }
    } else if (ws.clientType === 'mcp_client' && clientInfo) {
      this.clients.delete(clientInfo.id);
      console.error(`WebSocket Hub: MCP client ${clientInfo.name} removed`);
    }

    this.broadcastClientListUpdate();

    // Check if we should shut down
    this.checkShutdownConditions();
  }

  checkShutdownConditions() {
    // Shut down if no MCP clients remain and we're not the extension
    if (this.clients.size === 0 && !this.chromeExtensionConnection) {
      console.error('WebSocket Hub: No clients remaining, scheduling shutdown...');
      setTimeout(() => {
        if (this.clients.size === 0 && !this.chromeExtensionConnection) {
          this.shutdown('no_clients');
        }
      }, 5000); // 5 second grace period
    }
  }

  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        this.errorTracker.logError(error, { action: 'send_message' });
        console.error('WebSocket Hub: Error sending message:', error);
        return false;
      }
    }
    return false;
  }

  forwardRequest(ws, message) {
    if (ws.clientType !== 'mcp_client') {
      this.sendToClient(ws, {
        type: 'error',
        requestId: message.requestId,
        error: 'Only MCP clients can send requests',
        timestamp: Date.now()
      });
      return;
    }

    if (!this.chromeExtensionConnection || this.chromeExtensionConnection.readyState !== WebSocket.OPEN) {
      this.sendToClient(ws, {
        type: 'error',
        requestId: message.requestId,
        error: 'Chrome extension not connected',
        timestamp: Date.now()
      });
      return;
    }

    // Add source information and forward
    const forwardedMessage = {
      ...message,
      sourceClientId: ws.clientInfo.id,
      sourceClientName: ws.clientInfo.name,
      hubMessageId: ++this.messageCounter
    };

    this.sendToClient(this.chromeExtensionConnection, forwardedMessage);

    // Update client stats
    const client = this.clients.get(ws.clientInfo.id);
    if (client) {
      client.requestCount++;
    }
  }

  forwardResponse(ws, message) {
    if (ws !== this.chromeExtensionConnection) {
      console.warn('WebSocket Hub: Received response from non-extension client');
      return;
    }

    const { targetClientId } = message;
    if (!targetClientId) {
      console.warn('WebSocket Hub: Response missing targetClientId');
      return;
    }

    const client = this.clients.get(targetClientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      console.warn(`WebSocket Hub: Target client ${targetClientId} not available`);
      return;
    }

    this.sendToClient(client.ws, message);
  }

  broadcastClientListUpdate() {
    if (!this.chromeExtensionConnection || this.chromeExtensionConnection.readyState !== WebSocket.OPEN) {
      return;
    }

    const clientList = Array.from(this.clients.values()).map(client => ({
      id: client.info.id,
      name: client.info.name,
      type: client.info.type,
      capabilities: client.info.capabilities,
      connected: client.ws.readyState === WebSocket.OPEN,
      registeredAt: client.registeredAt,
      requestCount: client.requestCount,
      lastActivity: client.ws.lastActivity
    }));

    this.sendToClient(this.chromeExtensionConnection, {
      type: 'client_list_update',
      clients: clientList,
      timestamp: Date.now()
    });
  }

  getHubInfo() {
    return {
      name: 'Claude Chrome MCP Hub',
      version: '2.1.0',
      port: HUB_PORT,
      startTime: this.startTime,
      clientCount: this.clients.size,
      extensionConnected: !!this.chromeExtensionConnection
    };
  }

  startHealthMonitoring() {
    // Ping all clients periodically
    this.keepaliveInterval = setInterval(() => {
      this.pingAllClients();
    }, 30000); // Every 30 seconds

    // Check for dead connections
    this.healthCheckInterval = setInterval(() => {
      this.checkClientHealth();
    }, 60000); // Every minute
  }

  pingAllClients() {
    const allConnections = [];
    
    if (this.chromeExtensionConnection) {
      allConnections.push(this.chromeExtensionConnection);
    }
    
    for (const client of this.clients.values()) {
      allConnections.push(client.ws);
    }

    allConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.isAlive = false;
        ws.ping();
      }
    });
  }

  checkClientHealth() {
    const now = Date.now();
    const deadConnections = [];

    // Check extension connection
    if (this.chromeExtensionConnection && !this.chromeExtensionConnection.isAlive) {
      const timeSinceActivity = now - this.chromeExtensionConnection.lastActivity;
      if (timeSinceActivity > 120000) { // 2 minutes
        console.warn('WebSocket Hub: Extension connection appears dead');
        deadConnections.push(this.chromeExtensionConnection);
      }
    }

    // Check MCP client connections
    for (const [clientId, client] of this.clients) {
      if (!client.ws.isAlive) {
        const timeSinceActivity = now - client.ws.lastActivity;
        if (timeSinceActivity > 120000) { // 2 minutes
          console.warn(`WebSocket Hub: MCP client ${clientId} appears dead`);
          deadConnections.push(client.ws);
        }
      }
    }

    // Close dead connections
    deadConnections.forEach(ws => {
      console.error(`WebSocket Hub: Closing dead connection ${ws.clientId}`);
      ws.terminate();
    });
  }

  setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        console.error(`WebSocket Hub: Received ${signal}, shutting down`);
        this.shutdown(`signal:${signal}`);
      });
    });
  }

  async shutdown(reason = 'unknown') {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.error(`WebSocket Hub: Shutting down (reason: ${reason})`);

    // Clear intervals
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Notify all clients
    const shutdownMessage = {
      type: 'hub_shutdown',
      reason,
      timestamp: Date.now()
    };

    if (this.chromeExtensionConnection) {
      this.sendToClient(this.chromeExtensionConnection, shutdownMessage);
    }

    for (const client of this.clients.values()) {
      this.sendToClient(client.ws, shutdownMessage);
    }

    // Close server
    if (this.server) {
      await new Promise(resolve => {
        this.server.close(() => {
          console.error('WebSocket Hub: Server closed');
          resolve();
        });
      });
    }

    console.error('WebSocket Hub: Shutdown complete');
    process.exit(0);
  }

  getStats() {
    return {
      port: HUB_PORT,
      startTime: this.startTime,
      uptime: Date.now() - this.startTime,
      clientCount: this.clients.size,
      extensionConnected: !!this.chromeExtensionConnection,
      messageCount: this.messageCounter,
      isShuttingDown: this.isShuttingDown
    };
  }

  stop() {
    this.shutdown();
  }
}

// ============================================================================
// Hub Client Classes
// ============================================================================

class AutoHubClient {
  constructor(clientInfo = {}) {
    this.clientInfo = this.mergeClientInfo(clientInfo);
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
    // Skip parent monitoring if disabled
    if (process.env.CCM_NO_PARENT_MONITOR === '1') {
      console.error('CCM: Parent monitoring disabled');
      return;
    }
    
    // Enhanced parent process monitoring
    if (process.ppid) {
      this.parentCheckInterval = setInterval(() => {
        try {
          process.kill(process.ppid, 0);
        } catch (e) {
          console.error('CCM: Parent process no longer exists, shutting down');
          this.gracefulShutdown();
        }
      }, 2000);
    }

    // Monitor for orphaned processes
    if (process.env.CCM_PARENT_PID) {
      const parentPid = parseInt(process.env.CCM_PARENT_PID);
      this.parentMonitor = setInterval(() => {
        try {
          process.kill(parentPid, 0);
        } catch (e) {
          console.error('CCM: Specified parent process no longer exists');
          this.gracefulShutdown();
        }
      }, 3000);
    }
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
      this.debug.info('Connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    
    try {
      // Try existing hub first with shorter timeout
      await this.connectToExistingHub(5000);
      this.onConnectionSuccess();
      console.error(`CCM: Connected to existing hub as ${this.clientInfo.name}`);
      return;
    } catch (error) {
      console.error('CCM: No existing hub found, starting new hub...');
    }

    try {
      await this.startHubAndConnect();
      this.onConnectionSuccess();
      console.error(`CCM: Started hub and connected as ${this.clientInfo.name}`);
    } catch (error) {
      this.connectionState = 'disconnected';
      console.error('CCM: Failed to start hub:', error);
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

  async connectToExistingHub(timeoutMs = 5000) {
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
    // Start embedded hub
    this.ownedHub = new WebSocketHub();
    await this.ownedHub.start();
    this.isHubOwner = true;

    // Wait for hub to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Connect to our own hub
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
      
      ws.on('open', () => {
        this.ws = ws;
        this.setupWebSocketHandlers(resolve, reject);
        this.registerWithHub();
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  }

  setupWebSocketHandlers(connectResolve, connectReject) {
    this.ws.on('message', (data) => {
      this.lastActivityTime = Date.now();
      try {
        const dataStr = data.toString();
        // Filter out non-JSON WebSocket protocol messages
        if (dataStr.startsWith('WebSocket') || dataStr === 'ping' || dataStr === 'pong') {
          this.debug.verbose('Ignoring WebSocket protocol message:', dataStr);
          return;
        }
        const message = JSON.parse(dataStr);
        this.handleMessage(message, connectResolve, connectReject);
      } catch (error) {
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
      const timeoutMs = 30000; // Increased timeout
      
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

  gracefulShutdown() {
    console.error('CCM: Initiating graceful shutdown');
    this.connectionState = 'shutting_down';
    
    // Clear intervals
    if (this.connectionHealthInterval) {
      clearInterval(this.connectionHealthInterval);
    }
    if (this.parentCheckInterval) {
      clearInterval(this.parentCheckInterval);
    }
    if (this.parentMonitor) {
      clearInterval(this.parentMonitor);
    }
    
    // Close connection
    this.close();
    
    // Exit process
    setTimeout(() => {
      process.exit(0);
    }, 1000);
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

  close() {
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
      this.ownedHub.stop();
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

class ChromeMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'claude-chrome-mcp',
        version: '2.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.hubClient = new AutoHubClient();
    this.lifecycleManager = new ProcessLifecycleManager();
    this.setupLifecycleIntegration();
    this.setupToolHandlers();
  }

  setupLifecycleIntegration() {
    // Register cleanup tasks
    this.lifecycleManager.addCleanupTask('hub-client', async () => {
      if (this.hubClient) {
        this.hubClient.close();
      }
    });

    this.lifecycleManager.addCleanupTask('mcp-server', async () => {
      if (this.server) {
        await this.server.close();
      }
    });

    this.lifecycleManager.addCleanupTask('websocket-connections', async () => {
      // Close any remaining WebSocket connections
      if (this.hubClient && this.hubClient.ownedHub) {
        this.hubClient.ownedHub.stop();
      }
    });

    // Start activity heartbeat
    this.lifecycleManager.startHeartbeat(30000);
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'spawn_claude_tab',
            description: 'Create a new Claude.ai tab',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'Optional URL to navigate to (defaults to claude.ai)',
                  default: 'https://claude.ai'
                }
              },
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_tabs',
            description: 'Get list of all currently open Claude.ai tabs with their IDs, status, and conversation IDs (if available).',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_conversations',
            description: 'Get list of recent Claude conversations from API with UUIDs and current tab IDs (if open). Returns up to 30 recent conversations.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'send_message_to_claude_tab',
            description: 'Send a message to a specific Claude tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude session'
                },
                message: {
                  type: 'string',
                  description: 'The message to send'
                }
              },
              required: ['tabId', 'message'],
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_response',
            description: 'Get the latest response from a Claude tab with optional waiting for completion',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude session'
                },
                waitForCompletion: {
                  type: 'boolean',
                  description: 'Whether to wait for the response to complete before returning (default: true)',
                  default: true
                },
                timeoutMs: {
                  type: 'number',
                  description: 'Maximum time to wait for response completion in milliseconds (default: 10000). For longer responses, consider setting this based on expected generation time.',
                  default: 10000
                },
                includeMetadata: {
                  type: 'boolean',
                  description: 'Whether to include metadata about the response (completion indicators, timing, etc.)',
                  default: false
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'batch_send_messages',
            description: 'Send messages to multiple Claude tabs simultaneously or sequentially',
            inputSchema: {
              type: 'object',
              properties: {
                messages: {
                  type: 'array',
                  description: 'Array of message objects, each containing tabId and message',
                  items: {
                    type: 'object',
                    properties: {
                      tabId: {
                        type: 'number',
                        description: 'The tab ID to send the message to'
                      },
                      message: {
                        type: 'string',
                        description: 'The message to send'
                      }
                    },
                    required: ['tabId', 'message']
                  }
                },
                sequential: {
                  type: 'boolean',
                  description: 'Whether to send messages sequentially (wait for each) or in parallel',
                  default: false
                }
              },
              required: ['messages'],
              additionalProperties: false
            }
          },
          {
            name: 'get_conversation_metadata',
            description: 'Get detailed metadata about a Claude conversation including message count, content analysis, and features',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude conversation'
                },
                includeMessages: {
                  type: 'boolean',
                  description: 'Whether to include detailed message information',
                  default: false
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'export_conversation_transcript',
            description: 'Export a full conversation transcript with metadata in markdown or JSON format',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude conversation to export'
                },
                format: {
                  type: 'string',
                  enum: ['markdown', 'json'],
                  description: 'Export format (markdown or json)',
                  default: 'markdown'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'debug_attach',
            description: 'Attach Chrome debugger to a tab for advanced operations',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID to attach debugger to'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'execute_script',
            description: 'Execute JavaScript in a specific tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID to execute script in'
                },
                script: {
                  type: 'string',
                  description: 'The JavaScript code to execute'
                }
              },
              required: ['tabId', 'script'],
              additionalProperties: false
            }
          },
          {
            name: 'get_dom_elements',
            description: 'Query DOM elements in a specific tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID to query elements in'
                },
                selector: {
                  type: 'string',
                  description: 'CSS selector to find elements'
                }
              },
              required: ['tabId', 'selector'],
              additionalProperties: false
            }
          },
          {
            name: 'debug_claude_page',
            description: 'Debug Claude page readiness and get page information',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude page to debug'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'delete_claude_conversation',
            description: 'Delete a conversation from Claude.ai using API (works from any Claude tab)',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude session'
                },
                conversationId: {
                  type: 'string',
                  description: 'Optional conversation ID. If not provided, deletes current conversation',
                  default: null
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'reload_extension',
            description: 'Reload the Chrome extension to apply code changes',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'start_network_inspection',
            description: 'Start network request monitoring on a tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID to monitor network requests'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'stop_network_inspection',
            description: 'Stop network request monitoring on a tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID to stop monitoring'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'get_captured_requests',
            description: 'Get captured network requests from monitoring',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID to get captured requests for'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'close_claude_tab',
            description: 'Close a specific Claude.ai tab by tab ID',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The Chrome tab ID to close'
                },
                force: {
                  type: 'boolean',
                  description: 'Force close even if there are unsaved changes',
                  default: false
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'open_claude_conversation_tab',
            description: 'Open a specific Claude conversation in a new tab using conversation ID',
            inputSchema: {
              type: 'object',
              properties: {
                conversationId: {
                  type: 'string',
                  description: 'The Claude conversation ID (UUID format) to open. Example: "1c3bc7f5-24a2-4798-9c16-2530425da89b". Use get_claude_conversations to find existing conversation IDs.'
                },
                activate: {
                  type: 'boolean', 
                  description: 'Whether to activate the new tab',
                  default: true
                },
                waitForLoad: {
                  type: 'boolean',
                  description: 'Whether to wait for the page to load completely',
                  default: true
                },
                loadTimeoutMs: {
                  type: 'number',
                  description: 'Maximum time to wait for page load in milliseconds',
                  default: 10000
                }
              },
              required: ['conversationId'],
              additionalProperties: false
            }
          },
          {
            name: 'extract_conversation_elements',
            description: 'Extract conversation elements including artifacts, code blocks, and tool usage',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude conversation'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_response_status',
            description: 'Get real-time status of Claude response generation including progress estimation',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude conversation'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'batch_get_responses',
            description: 'Get responses from multiple Claude tabs with polling and progress tracking',
            inputSchema: {
              type: 'object',
              properties: {
                tabIds: {
                  type: 'array',
                  items: { type: 'number' },
                  description: 'Array of tab IDs to monitor'
                },
                timeoutMs: {
                  type: 'number',
                  description: 'Maximum time to wait for all responses in milliseconds',
                  default: 30000
                },
                waitForAll: {
                  type: 'boolean',
                  description: 'Whether to wait for all responses or return as they complete',
                  default: true
                },
                pollIntervalMs: {
                  type: 'number',
                  description: 'Polling interval in milliseconds',
                  default: 1000
                }
              },
              required: ['tabIds'],
              additionalProperties: false
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Update activity for lifecycle management
      this.lifecycleManager.updateActivity();

      try {
        let result;
        
        switch (name) {
          case 'get_claude_tabs':
            result = await this.hubClient.sendRequest('get_claude_tabs');
            break;
          case 'get_claude_conversations':
            result = await this.hubClient.sendRequest('get_claude_conversations');
            break;
          case 'spawn_claude_tab':
            result = await this.hubClient.sendRequest('spawn_claude_tab', args);
            break;
          case 'send_message_to_claude_tab':
            result = await this.hubClient.sendRequest('send_message_to_claude_tab', args);
            break;
          case 'get_claude_response':
            result = await this.hubClient.sendRequest('get_claude_response', args);
            break;
          case 'batch_send_messages':
            result = await this.hubClient.sendRequest('batch_send_messages', args);
            break;
          case 'get_conversation_metadata':
            result = await this.hubClient.sendRequest('get_conversation_metadata', args);
            break;
          case 'export_conversation_transcript':
            result = await this.hubClient.sendRequest('export_conversation_transcript', args);
            break;
          case 'debug_attach':
            result = await this.hubClient.sendRequest('debug_attach', args);
            break;
          case 'execute_script':
            result = await this.hubClient.sendRequest('execute_script', args);
            break;
          case 'get_dom_elements':
            result = await this.hubClient.sendRequest('get_dom_elements', args);
            break;
          case 'debug_claude_page':
            result = await this.hubClient.sendRequest('debug_claude_page', args);
            break;
          case 'delete_claude_conversation':
            result = await this.hubClient.sendRequest('delete_claude_conversation', args);
            break;
          case 'reload_extension':
            result = await this.hubClient.sendRequest('reload_extension', args);
            break;
          case 'start_network_inspection':
            result = await this.hubClient.sendRequest('start_network_inspection', args);
            break;
          case 'stop_network_inspection':
            result = await this.hubClient.sendRequest('stop_network_inspection', args);
            break;
          case 'get_captured_requests':
            result = await this.hubClient.sendRequest('get_captured_requests', args);
            break;
          case 'close_claude_tab':
            result = await this.hubClient.sendRequest('close_claude_tab', args);
            break;
          case 'open_claude_conversation_tab':
            result = await this.hubClient.sendRequest('open_claude_conversation_tab', args);
            break;
          case 'extract_conversation_elements':
            result = await this.hubClient.sendRequest('extract_conversation_elements', args);
            break;
          case 'get_claude_response_status':
            result = await this.hubClient.sendRequest('get_claude_response_status', args);
            break;
          case 'batch_get_responses':
            result = await this.hubClient.sendRequest('batch_get_responses', args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
        
      } catch (error) {
        return {
          content: [
            {
              type: 'text', 
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async start() {
    try {
      await this.hubClient.connect();
      console.error('Claude Chrome MCP: Connected to hub');
      
      const transport = new StdioServerTransport();
      
      // Enhanced transport close handler
      transport.onclose = () => {
        console.error('Claude Chrome MCP: Client disconnected, initiating shutdown...');
        this.lifecycleManager.gracefulShutdown('mcp_client_disconnect');
      };
      
      await this.server.connect(transport);
      console.error('Claude Chrome MCP: MCP server started');
      
      // Update activity on successful start
      this.lifecycleManager.updateActivity();
      
    } catch (error) {
      console.error('Claude Chrome MCP: Startup failed:', error);
      this.lifecycleManager.emergencyShutdown('startup_failed');
    }
  }

  async stop() {
    console.error('Claude Chrome MCP: Shutting down...');
    try {
      this.hubClient.close();
      await this.server.close();
      console.error('Claude Chrome MCP: Shutdown complete');
    } catch (error) {
      console.error('Claude Chrome MCP: Error during shutdown:', error);
      // Force exit if shutdown fails
      setTimeout(() => process.exit(1), 1000);
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

const server = new ChromeMCPServer();

// Process lifecycle is now handled by ProcessLifecycleManager
// which is integrated into the ChromeMCPServer class

// Start the server
server.start().catch((error) => {
  console.error('Claude Chrome MCP: Fatal error:', error);
  process.exit(1);
});

module.exports = ChromeMCPServer;