#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const WebSocket = require('ws');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

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

// Enhanced process lifecycle management with better shutdown handling
class ProcessLifecycleManager {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    this.shutdownTimeoutMs = 2000; // Reduced for faster exit
    this.forceExitTimeoutMs = 100; // Much faster force exit
    this.parentPid = process.ppid;
    this.parentCheckInterval = null;
    this.cleanupTasks = [];
    this.lastParentCheck = Date.now();
    this.lastActivityTime = Date.now();
    this.shutdownReason = null;
    this.allIntervals = []; // Track all intervals for cleanup
    
    this.setupSignalHandlers();
    this.setupParentMonitoring();
    this.setupOrphanDetection();
  }

  addCleanupTask(name, cleanupFn) {
    this.cleanupTasks.push({ name, cleanupFn });
  }

  addInterval(intervalId, name = 'unnamed') {
    this.allIntervals.push({ id: intervalId, name });
    return intervalId;
  }

  clearAllIntervals() {
    for (const interval of this.allIntervals) {
      clearInterval(interval.id);
    }
    this.allIntervals = [];
  }

  setupSignalHandlers() {
    // Handle SIGPIPE separately - it's not a shutdown signal
    process.on('SIGPIPE', () => {
      console.error('CCM: Received SIGPIPE, stdout likely closed - continuing operation');
      // Don't shutdown on SIGPIPE, just note it
    });

    // Real shutdown signals
    const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    shutdownSignals.forEach(signal => {
      process.on(signal, async () => {
        console.error(`CCM: Received ${signal}, initiating graceful shutdown`);
        await this.gracefulShutdown(`signal:${signal}`);
      });
    });

    // Handle parent process disconnect
    process.on('disconnect', async () => {
      console.error('CCM: Parent process disconnected');
      await this.gracefulShutdown('parent_disconnect');
    });

    // Handle uncaught exceptions with immediate exit
    process.on('uncaughtException', (error) => {
      console.error('CCM: Uncaught exception:', error);
      this.emergencyShutdown('uncaught_exception');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('CCM: Unhandled rejection:', reason);
      // Log but don't exit on unhandled rejections
    });
  }

  setupParentMonitoring() {
    if (this.parentPid && this.parentPid !== 1) {
      this.parentCheckInterval = this.addInterval(setInterval(() => {
        this.checkParentProcess();
      }, 30000), 'parentCheck'); // Check every 30 seconds instead of 1 second
    }

    if (process.env.CCM_PARENT_PID) {
      const envParentPid = parseInt(process.env.CCM_PARENT_PID);
      if (envParentPid && envParentPid !== this.parentPid) {
        console.warn(`CCM: ENV parent PID (${envParentPid}) differs from process parent PID (${this.parentPid})`);
        this.parentPid = envParentPid;
      }
    }

    // Enhanced stdin monitoring for MCP protocol
    if (process.stdin.isTTY === false) {
      let stdinClosed = false;
      
      process.stdin.on('end', async () => {
        if (!stdinClosed) {
          stdinClosed = true;
          console.error('CCM: stdin closed');
          await this.gracefulShutdown('stdin_closed');
        }
      });

      process.stdin.on('error', async (error) => {
        if (!stdinClosed) {
          stdinClosed = true;
          if (error.code === 'EPIPE') {
            console.error('CCM: stdin EPIPE error');
            await this.gracefulShutdown('stdin_epipe');
          } else {
            console.error('CCM: stdin error:', error);
            await this.gracefulShutdown('stdin_error');
          }
        }
      });

      process.stdin.on('close', async () => {
        if (!stdinClosed) {
          stdinClosed = true;
          console.error('CCM: stdin closed (close event)');
          await this.gracefulShutdown('stdin_close_event');
        }
      });

      // Keep stdin active to detect when it closes
      process.stdin.resume();
      
      // Add a data handler to detect actual stdin activity
      process.stdin.on('data', (chunk) => {
        this.updateActivity();
        // If we receive any data, it means the parent is still active
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

    this.addInterval(setInterval(checkOrphanStatus, 10000), 'orphanCheck');
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
    // Prevent multiple simultaneous shutdowns
    if (this.isShuttingDown) {
      console.error(`CCM: Shutdown already in progress (original: ${this.shutdownReason}, new: ${reason})`);
      return this.shutdownPromise;
    }

    console.error(`CCM: Graceful shutdown initiated (reason: ${reason})`);
    this.isShuttingDown = true;
    this.shutdownReason = reason;

    this.shutdownPromise = this.performShutdown(reason);
    return this.shutdownPromise;
  }

  async performShutdown(reason) {
    const shutdownStart = Date.now();
    
    try {
      // Clear all intervals immediately
      console.error('CCM: Clearing all intervals...');
      this.clearAllIntervals();

      // Stop stdin monitoring to prevent keeping process alive
      try {
        process.stdin.pause();
        process.stdin.removeAllListeners();
        process.stdin.destroy();
      } catch (e) {
        // Ignore errors destroying stdin
      }

      // Remove all signal handlers to prevent interference
      try {
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('SIGQUIT');
        process.removeAllListeners('disconnect');
      } catch (e) {
        // Ignore errors removing listeners
      }

      // Run cleanup tasks with aggressive timeout
      const cleanupPromises = this.cleanupTasks.map(async ({ name, cleanupFn }) => {
        try {
          console.error(`CCM: Running cleanup task: ${name}`);
          await Promise.race([
            cleanupFn(),
            new Promise(resolve => setTimeout(resolve, 500)) // 500ms max per task
          ]);
          console.error(`CCM: Cleanup task completed: ${name}`);
        } catch (error) {
          console.error(`CCM: Cleanup task failed: ${name}`, error);
        }
      });

      // Wait for cleanup with very short timeout
      await Promise.race([
        Promise.all(cleanupPromises),
        new Promise(resolve => setTimeout(resolve, this.shutdownTimeoutMs))
      ]);

      const shutdownDuration = Date.now() - shutdownStart;
      console.error(`CCM: Graceful shutdown completed in ${shutdownDuration}ms (reason: ${reason})`);
      
      // Force immediate exit
      setImmediate(() => {
        process.exit(0);
      });
      
    } catch (error) {
      console.error('CCM: Error during graceful shutdown:', error);
      // Force exit immediately on any error
      process.exit(1);
    }
  }

  emergencyShutdown(reason = 'unknown') {
    console.error(`CCM: Emergency shutdown initiated (reason: ${reason})`);
    
    // Clear any remaining intervals immediately
    try {
      this.clearAllIntervals();
    } catch (e) {
      // Ignore errors
    }
    
    // Remove all event listeners
    try {
      process.removeAllListeners();
    } catch (e) {
      // Ignore errors
    }
    
    // Force exit immediately - no delay
    console.error('CCM: Force exit');
    process.exit(1);
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

// Event-driven completion detection infrastructure
class OperationManager {
  constructor() {
    this.operations = new Map();
    this.stateFile = path.join(__dirname, '../.operations-state.json');
    this.loadState();
  }

  createOperation(type, params = {}) {
    const operationId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const operation = {
      id: operationId,
      type,
      params,
      status: 'pending',
      milestones: [],
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
    
    this.operations.set(operationId, operation);
    this.saveState();
    
    console.error(`[OperationManager] Created operation ${operationId} of type ${type}`);
    return operationId;
  }

  updateOperation(operationId, milestone, data = {}) {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.warn(`[OperationManager] Operation ${operationId} not found`);
      return false;
    }

    operation.milestones.push({
      milestone,
      timestamp: Date.now(),
      data
    });
    operation.lastUpdated = Date.now();
    
    // Update status based on milestone
    if (milestone === 'started') {
      operation.status = 'in_progress';
    } else if (milestone === 'completed' || milestone === 'response_completed') {
      operation.status = 'completed';
    } else if (milestone === 'error') {
      operation.status = 'failed';
    }
    
    this.saveState();
    
    console.error(`[OperationManager] Updated operation ${operationId}: ${milestone}`);
    return true;
  }

  getOperation(operationId) {
    return this.operations.get(operationId);
  }

  isCompleted(operationId) {
    const operation = this.operations.get(operationId);
    return operation ? operation.status === 'completed' : false;
  }

  waitForCompletion(operationId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkCompletion = () => {
        const operation = this.operations.get(operationId);
        
        if (!operation) {
          reject(new Error(`Operation ${operationId} not found`));
          return;
        }
        
        if (operation.status === 'completed') {
          resolve(operation);
          return;
        }
        
        if (operation.status === 'failed') {
          reject(new Error(`Operation ${operationId} failed`));
          return;
        }
        
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Operation ${operationId} timed out after ${timeoutMs}ms`));
          return;
        }
        
        setTimeout(checkCompletion, 100);
      };
      
      checkCompletion();
    });
  }

  cleanup(maxAge = 3600000) { // 1 hour
    const cutoff = Date.now() - maxAge;
    let cleanedCount = 0;
    
    for (const [id, operation] of this.operations) {
      if (operation.lastUpdated < cutoff) {
        this.operations.delete(id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.saveState();
      console.error(`[OperationManager] Cleaned up ${cleanedCount} old operations`);
    }
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.operations = new Map(data.operations || []);
        console.error(`[OperationManager] Loaded ${this.operations.size} operations from state`);
      }
    } catch (error) {
      console.warn('[OperationManager] Failed to load state:', error.message);
    }
  }

  saveState() {
    try {
      const data = {
        operations: Array.from(this.operations.entries()),
        lastSaved: Date.now()
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('[OperationManager] Failed to save state:', error.message);
    }
  }
}

class NotificationManager {
  constructor(server) {
    this.server = server;
  }

  sendProgress(operationId, milestone, data = {}) {
    const notification = {
      method: 'notifications/operation/progress',
      params: {
        operationId,
        milestone,
        timestamp: Date.now(),
        ...data
      }
    };
    
    console.log(`[NotificationManager] Sending progress: ${operationId} - ${milestone}`);
    
    try {
      this.server.sendNotification('operation/progress', notification.params);
    } catch (error) {
      console.warn('[NotificationManager] Failed to send notification:', error.message);
    }
  }

  sendCompletion(operationId, result = {}) {
    this.sendProgress(operationId, 'completed', { result });
  }

  sendError(operationId, error) {
    this.sendProgress(operationId, 'error', { 
      error: error.message || error.toString() 
    });
  }
}

// Global instances
let operationManager;
let notificationManager;

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
        version: '2.3.0',
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
      
      // Initialize message buffer for this client if not exists
      if (!ws.messageBuffer) {
        ws.messageBuffer = '';
      }
      
      // Append new data to buffer
      ws.messageBuffer += dataStr;
      
      // Try to parse complete JSON messages from buffer
      let processed = true;
      while (processed) {
        processed = false;
        try {
          const message = JSON.parse(ws.messageBuffer);
          // Successfully parsed - clear buffer and process message
          ws.messageBuffer = '';
          ws.lastActivity = Date.now();
          ws.messageCount++;
          this.messageCounter++;
          this.routeMessage(ws, message);
          processed = false; // Exit loop after successful parse
        } catch (parseError) {
          // Check if this looks like a partial JSON message
          const trimmed = ws.messageBuffer.trim();
          if (trimmed.length === 0) {
            ws.messageBuffer = '';
            processed = false;
          } else if (this.isPartialJSON(trimmed)) {
            // Likely partial message - wait for more data
            processed = false;
          } else {
            // Genuine parse error - clear buffer and log
            throw parseError;
          }
        }
      }
      
    } catch (error) {
      // Clear buffer on parse error to prevent corruption
      ws.messageBuffer = '';
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
      version: '2.3.0',
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

    // Close server aggressively
    if (this.server) {
      // Terminate all connections immediately
      this.server.clients.forEach(ws => {
        ws.terminate();
      });
      
      // Close server with timeout
      await Promise.race([
        new Promise((resolve) => {
          this.server.close(() => {
            console.error('WebSocket Hub: Server closed');
            resolve();
          });
        }),
        new Promise(resolve => setTimeout(resolve, 1000)) // 1 second timeout
      ]);
    }

    console.error('WebSocket Hub: Shutdown complete');
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
      console.error('CCM: Connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    
    // Force hub creation in Claude Code environment
    const forceHubCreation = process.env.CCM_FORCE_HUB_CREATION === '1' || 
                            process.env.ANTHROPIC_ENVIRONMENT === 'claude_code';
    
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
    
    console.log(`[AutoHubClient] Received milestone: ${operationId} - ${milestone}`);
    
    // Update operation manager
    if (operationManager) {
      operationManager.updateOperation(operationId, milestone, { tabId, ...data });
    }
    
    // Send MCP notification
    if (notificationManager) {
      notificationManager.sendProgress(operationId, milestone, { tabId, ...data });
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
        version: '2.3.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.hubClient = new AutoHubClient();
    this.lifecycleManager = new ProcessLifecycleManager();
    
    // Initialize event-driven completion detection
    operationManager = new OperationManager();
    notificationManager = new NotificationManager(this.server);
    this.setupLifecycleIntegration();
    this.setupToolHandlers();
  }

  setupLifecycleIntegration() {
    // Register cleanup tasks
    this.lifecycleManager.addCleanupTask('operation-manager', async () => {
      if (operationManager) {
        operationManager.cleanup();
        operationManager.saveState();
      }
    });

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
            name: 'spawn_claude_dot_ai_tab',
            description: 'Create a new Claude.ai tab. ASYNC-BY-DEFAULT: Use injectContentScript=true and waitForLoad=false for optimal async performance. Tab becomes immediately usable for send_message_async workflows. Only set waitForLoad=true when you need guaranteed page readiness.',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'Optional URL to navigate to (defaults to claude.ai)',
                  default: 'https://claude.ai'
                },
                waitForLoad: {
                  type: 'boolean',
                  description: 'Wait for tab to complete loading before returning',
                  default: false
                },
                injectContentScript: {
                  type: 'boolean',
                  description: 'Inject content script for async completion detection',
                  default: false
                },
                waitForReady: {
                  type: 'boolean',
                  description: 'Wait for page to be ready for interaction (requires waitForLoad)',
                  default: false
                }
              },
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_dot_ai_tabs',
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
            name: 'search_claude_conversations',
            description: 'Search and filter Claude conversations with advanced criteria (title search, date ranges, message counts, open status)',
            inputSchema: {
              type: 'object',
              properties: {
                titleSearch: {
                  type: 'string',
                  description: 'Search text to match against conversation titles (supports partial matching)'
                },
                titleRegex: {
                  type: 'string', 
                  description: 'Regular expression pattern for title matching'
                },
                createdAfter: {
                  type: 'string',
                  description: 'ISO date string - only return conversations created after this date'
                },
                createdBefore: {
                  type: 'string', 
                  description: 'ISO date string - only return conversations created before this date'
                },
                updatedAfter: {
                  type: 'string',
                  description: 'ISO date string - only return conversations updated after this date'  
                },
                updatedBefore: {
                  type: 'string',
                  description: 'ISO date string - only return conversations updated before this date'
                },
                minMessageCount: {
                  type: 'number',
                  description: 'Minimum number of messages in conversation'
                },
                maxMessageCount: {
                  type: 'number', 
                  description: 'Maximum number of messages in conversation'
                },
                isOpen: {
                  type: 'boolean',
                  description: 'Filter by whether conversation is currently open in a tab'
                },
                sortBy: {
                  type: 'string',
                  enum: ['created_at', 'updated_at', 'title', 'message_count'],
                  description: 'Field to sort results by',
                  default: 'updated_at'
                },
                sortOrder: {
                  type: 'string',
                  enum: ['asc', 'desc'], 
                  description: 'Sort direction',
                  default: 'desc'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 30,
                  maximum: 100
                }
              },
              additionalProperties: false
            }
          },
          {
            name: 'bulk_delete_conversations',
            description: 'Delete multiple conversations with safety checks and progress tracking. ASYNC-BY-DEFAULT: Batch processing with configurable delays and comprehensive safety mechanisms. CRITICAL SAFETY: Always use dryRun=true first to preview deletions. Use conservative filtering (e.g., titleSearch for test conversations only). Never bulk delete without explicit user confirmation of specific conversations.',
            inputSchema: {
              type: 'object',
              properties: {
                conversationIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of conversation UUIDs to delete'
                },
                filterCriteria: {
                  type: 'object',
                  description: 'Alternative to conversationIds - delete based on search criteria',
                  properties: {
                    titleSearch: { type: 'string' },
                    titleRegex: { type: 'string' },
                    createdAfter: { type: 'string' },
                    createdBefore: { type: 'string' },
                    updatedAfter: { type: 'string' },
                    updatedBefore: { type: 'string' },
                    minMessageCount: { type: 'number' },
                    maxMessageCount: { type: 'number' },
                    isOpen: { type: 'boolean' }
                  }
                },
                dryRun: {
                  type: 'boolean',
                  description: 'If true, only return what would be deleted without actually deleting',
                  default: false
                },
                batchSize: {
                  type: 'number',
                  description: 'Number of conversations to delete per batch',
                  default: 5,
                  maximum: 10
                },
                delayBetweenBatches: {
                  type: 'number',
                  description: 'Milliseconds to wait between batches',
                  default: 1000
                },
                skipOpenConversations: {
                  type: 'boolean', 
                  description: 'Skip conversations that are currently open in tabs',
                  default: true
                }
              },
              additionalProperties: false
            }
          },
          {
            name: 'send_message_to_claude_dot_ai_tab',
            description: 'Send a message to a specific Claude tab. ASYNC-BY-DEFAULT: Use send_message_async instead for async workflows. This tool waits for completion which may timeout.',
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
                },
                waitForReady: {
                  type: 'boolean',
                  description: 'Whether to wait for Claude to be ready before sending (default: true)',
                  default: true
                },
                maxRetries: {
                  type: 'number',
                  description: 'Maximum number of retry attempts if sending fails (default: 3)',
                  default: 3,
                  minimum: 1,
                  maximum: 5
                }
              },
              required: ['tabId', 'message'],
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_dot_ai_response',
            description: 'Get the latest response from a Claude tab with optional waiting for completion. ASYNC-BY-DEFAULT: Primary async response retrieval tool. Use after send_message_async for optimal performance.',
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
            description: 'Send messages to multiple Claude tabs simultaneously or sequentially. ASYNC-BY-DEFAULT: Optimal for parallel batch operations. Recommended workflow: use sequential=false for fastest execution, then use batch_get_responses or individual get_claude_dot_ai_response calls to retrieve completed responses.',
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
            name: 'send_message_async',
            description: 'ASYNC-BY-DEFAULT: Send a message to a Claude tab with event-driven completion detection (returns immediately with operation ID). Primary tool for async message workflows. RECOMMENDED WORKFLOW: 1) call send_message_async, 2) wait briefly or perform other tasks, 3) use get_claude_dot_ai_response to retrieve completed response. Much faster than synchronous alternatives.',
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
                },
                waitForReady: {
                  type: 'boolean',
                  description: 'Whether to wait for Claude to be ready before sending (default: true)',
                  default: true
                }
              },
              required: ['tabId', 'message'],
              additionalProperties: false
            }
          },
          {
            name: 'wait_for_operation',
            description: 'DEPRECATED: Wait for operation completion - DO NOT USE with async workflows. Only for rare synchronous operations. Use get_claude_dot_ai_response directly instead.',
            inputSchema: {
              type: 'object',
              properties: {
                operationId: {
                  type: 'string',
                  description: 'The operation ID returned by an async tool'
                },
                timeoutMs: {
                  type: 'number',
                  description: 'Maximum time to wait in milliseconds (default: 30000)',
                  default: 30000,
                  minimum: 1000,
                  maximum: 120000
                }
              },
              required: ['operationId'],
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
            name: 'debug_claude_dot_ai_page',
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
            description: 'Delete a conversation from Claude.ai using API (works from any Claude tab). SAFETY WARNING: Permanent deletion - cannot be undone. Verify conversation ID carefully before use.',
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
            name: 'close_claude_dot_ai_tab',
            description: 'Close a specific Claude.ai tab by tab ID. SAFETY WARNING: Will close tab and lose any unsaved work. Use force=true only when necessary.',
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
            name: 'open_claude_dot_ai_conversation_tab',
            description: 'Open a specific Claude conversation in a new tab using conversation ID. ASYNC-BY-DEFAULT: Use waitForLoad=false for immediate return.',
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
                },
                batchSize: {
                  type: 'number',
                  description: 'Max elements to process per type (default: 50)',
                  default: 50
                },
                maxElements: {
                  type: 'number',
                  description: 'Max total elements to extract before stopping (default: 1000)',
                  default: 1000
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_dot_ai_response_status',
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
            description: 'Get responses from multiple Claude tabs with polling and progress tracking. ASYNC-BY-DEFAULT: For completed responses only. Use after batch_send_messages or individual async operations complete. NOTE: Current implementation has readiness detection issues - recommend using individual get_claude_dot_ai_response calls until fixed.',
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
                },
                checkReadiness: {
                  type: 'boolean',
                  description: 'Whether to verify response readiness before fetching (default: true)',
                  default: true
                }
              },
              required: ['tabIds'],
              additionalProperties: false
            }
          },
          {
            name: 'get_connection_health',
            description: 'Get detailed health status of the Chrome extension connection, WebSocket hub, and Chrome alarms',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'forward_response_to_claude_dot_ai_tab',
            description: 'ASYNC-BY-DEFAULT: Forward a response from one Claude tab to another with optional processing (regex extraction, template substitution, prefix/suffix). Enables automated Claude-to-Claude workflows and response pipelines.',
            inputSchema: {
              type: 'object',
              properties: {
                sourceTabId: {
                  type: 'number',
                  description: 'Tab ID to get response from'
                },
                targetTabId: {
                  type: 'number', 
                  description: 'Tab ID to send processed response to'
                },
                template: {
                  type: 'string',
                  description: 'Optional template with {response} placeholder for response formatting'
                },
                prefixText: {
                  type: 'string',
                  description: 'Text to prepend to the response'
                },
                suffixText: {
                  type: 'string',
                  description: 'Text to append to the response'
                },
                extractPattern: {
                  type: 'string',
                  description: 'Regex pattern to extract specific parts of the response'
                },
                waitForCompletion: {
                  type: 'boolean',
                  description: 'Wait for source response completion (default: true)',
                  default: true
                },
                waitForReady: {
                  type: 'boolean',
                  description: 'Wait for target tab readiness (default: true)',
                  default: true
                },
                timeoutMs: {
                  type: 'number',
                  description: 'Timeout for source response in milliseconds (default: 30000)',
                  default: 30000
                },
                maxRetries: {
                  type: 'number',
                  description: 'Max retries for failed operations (default: 3)',
                  default: 3
                }
              },
              required: ['sourceTabId', 'targetTabId'],
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
          case 'get_claude_dot_ai_tabs':
            result = await this.hubClient.sendRequest('get_claude_dot_ai_tabs');
            break;
          case 'get_claude_conversations':
            result = await this.hubClient.sendRequest('get_claude_conversations');
            break;
          case 'search_claude_conversations':
            result = await this.searchConversations(args);
            break;
          case 'bulk_delete_conversations':
            result = await this.bulkDeleteConversations(args);
            break;
          case 'spawn_claude_dot_ai_tab':
            result = await this.hubClient.sendRequest('spawn_claude_dot_ai_tab', args);
            break;
          case 'send_message_to_claude_dot_ai_tab':
            result = await this.hubClient.sendRequest('send_message_to_claude_dot_ai_tab', args);
            break;
          case 'get_claude_dot_ai_response':
            result = await this.hubClient.sendRequest('get_claude_dot_ai_response', args);
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
          case 'send_message_async':
            result = await this.handleSendMessageAsync(args);
            break;
          case 'wait_for_operation':
            result = await this.handleWaitForOperation(args);
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
          case 'debug_claude_dot_ai_page':
            result = await this.hubClient.sendRequest('debug_claude_dot_ai_page', args);
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
          case 'close_claude_dot_ai_tab':
            result = await this.hubClient.sendRequest('close_claude_dot_ai_tab', args);
            break;
          case 'open_claude_dot_ai_conversation_tab':
            result = await this.hubClient.sendRequest('open_claude_dot_ai_conversation_tab', args);
            break;
          case 'extract_conversation_elements':
            result = await this.hubClient.sendRequest('extract_conversation_elements', args);
            break;
          case 'get_claude_dot_ai_response_status':
            result = await this.hubClient.sendRequest('get_claude_dot_ai_response_status', args);
            break;
          case 'batch_get_responses':
            result = await this.hubClient.sendRequest('batch_get_responses', args);
            break;
          case 'get_connection_health':
            result = await this.hubClient.sendRequest('get_connection_health', args);
            break;
          case 'forward_response_to_claude_dot_ai_tab':
            result = await this.handleForwardResponseAsync(args);
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

  async searchConversations(filters = {}) {
    try {
      // First get all conversations from the hub
      console.error('CCM: searchConversations called with filters:', JSON.stringify(filters));
      const allConversationsResult = await this.hubClient.sendRequest('get_claude_conversations');
      console.error('CCM: get_claude_conversations result type:', typeof allConversationsResult);
      console.error('CCM: get_claude_conversations result:', allConversationsResult ? JSON.stringify(allConversationsResult).slice(0, 200) : 'null');
      
      if (!allConversationsResult) {
        console.error('CCM: allConversationsResult is null/undefined');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Failed to retrieve conversations'
              })
            }
          ]
        };
      }
      
      let conversations;
      // Handle direct array response (for get_claude_conversations)
      if (Array.isArray(allConversationsResult)) {
        conversations = allConversationsResult;
      } else if (allConversationsResult.data) {
        // Handle wrapped response
        if (typeof allConversationsResult.data === 'string') {
          conversations = JSON.parse(allConversationsResult.data);
        } else {
          conversations = allConversationsResult.data;
        }
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Invalid response format from get_claude_conversations'
              })
            }
          ]
        };
      }
      
      if (!Array.isArray(conversations)) {
        return {
          content: [
            {
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: 'Invalid conversation data format'
              })
            }
          ]
        };
      }
      
      // Apply filters
      let filteredConversations = conversations.filter(conv => {
        // Title search (case-insensitive partial matching)
        if (filters.titleSearch) {
          const title = conv.title || '';
          if (!title.toLowerCase().includes(filters.titleSearch.toLowerCase())) {
            return false;
          }
        }
        
        // Title regex matching
        if (filters.titleRegex) {
          try {
            const regex = new RegExp(filters.titleRegex, 'i');
            const title = conv.title || '';
            if (!regex.test(title)) {
              return false;
            }
          } catch (e) {
            // Invalid regex, skip this filter
          }
        }
        
        // Date filtering
        if (filters.createdAfter) {
          const createdDate = new Date(conv.created_at);
          const afterDate = new Date(filters.createdAfter);
          if (createdDate < afterDate) {
            return false;
          }
        }
        
        if (filters.createdBefore) {
          const createdDate = new Date(conv.created_at);
          const beforeDate = new Date(filters.createdBefore);
          if (createdDate > beforeDate) {
            return false;
          }
        }
        
        if (filters.updatedAfter) {
          const updatedDate = new Date(conv.updated_at);
          const afterDate = new Date(filters.updatedAfter);
          if (updatedDate < afterDate) {
            return false;
          }
        }
        
        if (filters.updatedBefore) {
          const updatedDate = new Date(conv.updated_at);
          const beforeDate = new Date(filters.updatedBefore);
          if (updatedDate > beforeDate) {
            return false;
          }
        }
        
        // Message count filtering
        if (filters.minMessageCount !== undefined) {
          const messageCount = conv.message_count || 0;
          if (messageCount < filters.minMessageCount) {
            return false;
          }
        }
        
        if (filters.maxMessageCount !== undefined) {
          const messageCount = conv.message_count || 0;
          if (messageCount > filters.maxMessageCount) {
            return false;
          }
        }
        
        // Open status filtering
        if (filters.isOpen !== undefined) {
          const isOpen = conv.isOpen || false;
          if (isOpen !== filters.isOpen) {
            return false;
          }
        }
        
        return true;
      });
      
      // Apply sorting
      const sortBy = filters.sortBy || 'updated_at';
      const sortOrder = filters.sortOrder || 'desc';
      
      filteredConversations.sort((a, b) => {
        let aValue, bValue;
        
        switch (sortBy) {
          case 'created_at':
            aValue = new Date(a.created_at);
            bValue = new Date(b.created_at);
            break;
          case 'updated_at':
            aValue = new Date(a.updated_at);
            bValue = new Date(b.updated_at);
            break;
          case 'title':
            aValue = (a.title || '').toLowerCase();
            bValue = (b.title || '').toLowerCase();
            break;
          case 'message_count':
            aValue = a.message_count || 0;
            bValue = b.message_count || 0;
            break;
          default:
            aValue = new Date(a.updated_at);
            bValue = new Date(b.updated_at);
        }
        
        if (aValue < bValue) {
          return sortOrder === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortOrder === 'asc' ? 1 : -1;
        }
        return 0;
      });
      
      // Apply limit
      const limit = Math.min(filters.limit || 30, 100);
      const limitedConversations = filteredConversations.slice(0, limit);
      
      // Prepare result with search metadata
      const searchResult = {
        success: true,
        conversations: limitedConversations,
        search_metadata: {
          total_found: filteredConversations.length,
          returned: limitedConversations.length,
          filters_applied: Object.keys(filters).length,
          search_criteria: filters
        }
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(searchResult, null, 2)
          }
        ]
      };
      
    } catch (error) {
      console.error('CCM: Error in searchConversations:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
              details: 'Failed to search conversations'
            })
          }
        ],
        isError: true
      };
    }
  }

  async bulkDeleteConversations(options = {}) {
    try {
      const {
        conversationIds,
        filterCriteria,
        dryRun = false,
        batchSize = 5,
        delayBetweenBatches = 1000,
        skipOpenConversations = true
      } = options;
      
      let targetConversations = [];
      
      // Get conversations to delete
      if (conversationIds && conversationIds.length > 0) {
        // Get all conversations and filter by provided IDs
        const allConversationsResult = await this.hubClient.sendRequest('get_claude_conversations');
        if (!allConversationsResult || !Array.isArray(allConversationsResult)) {
          throw new Error('Failed to retrieve conversations');
        }
        
        targetConversations = allConversationsResult.filter(conv => conversationIds.includes(conv.id));
        
      } else if (filterCriteria) {
        // Use search functionality to find conversations based on criteria
        const searchResult = await this.searchConversations(filterCriteria);
        const searchData = JSON.parse(searchResult.content[0].text);
        
        if (!searchData.success) {
          throw new Error(`Search failed: ${searchData.error}`);
        }
        
        targetConversations = searchData.conversations;
      } else {
        throw new Error('Either conversationIds or filterCriteria must be provided');
      }
      
      // Filter out open conversations if requested
      if (skipOpenConversations) {
        const originalCount = targetConversations.length;
        targetConversations = targetConversations.filter(conv => !conv.isOpen);
        const skippedCount = originalCount - targetConversations.length;
        if (skippedCount > 0) {
          console.log(`CCM: Skipped ${skippedCount} open conversations`);
        }
      }
      
      if (targetConversations.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                deleted: 0,
                skipped: 0,
                errors: [],
                message: 'No conversations found matching criteria'
              })
            }
          ]
        };
      }
      
      // Dry run - just return what would be deleted
      if (dryRun) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                dry_run: true,
                would_delete: targetConversations.length,
                conversations: targetConversations.map(conv => ({
                  id: conv.id,
                  title: conv.title,
                  message_count: conv.message_count,
                  created_at: conv.created_at,
                  isOpen: conv.isOpen
                })),
                message: `Would delete ${targetConversations.length} conversations`
              })
            }
          ]
        };
      }
      
      // Get a Claude tab for executing delete operations
      const tabsResult = await this.hubClient.sendRequest('get_claude_dot_ai_tabs');
      const claudeTab = Array.isArray(tabsResult) ? tabsResult.find(tab => tab.url.includes('claude.ai')) : null;
      
      if (!claudeTab) {
        throw new Error('No Claude.ai tab found. Please open claude.ai first.');
      }
      
      // Perform actual deletion in batches
      const results = {
        deleted: 0,
        skipped: 0,
        errors: [],
        deletedConversations: []
      };
      
      const actualBatchSize = Math.min(batchSize, 10); // Safety limit
      
      for (let i = 0; i < targetConversations.length; i += actualBatchSize) {
        const batch = targetConversations.slice(i, i + actualBatchSize);
        
        // Delete conversations in this batch
        const batchPromises = batch.map(async (conv) => {
          try {
            const deleteResult = await this.hubClient.sendRequest('delete_claude_conversation', {
              tabId: claudeTab.id,
              conversationId: conv.id
            });
            
            // Check if deletion was successful - deleteResult is direct response now
            if (deleteResult && deleteResult.success) {
              results.deleted++;
              results.deletedConversations.push({
                id: conv.id,
                title: conv.title
              });
              return { success: true, conversation: conv };
            } else {
              const errorMsg = deleteResult?.reason || deleteResult?.error || 'Unknown error';
              results.errors.push(`Failed to delete "${conv.title}": ${errorMsg}`);
              return { success: false, conversation: conv, error: errorMsg };
            }
          } catch (error) {
            results.errors.push(`Failed to delete "${conv.title}": ${error.message}`);
            return { success: false, conversation: conv, error: error.message };
          }
        });
        
        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Delay between batches if there are more batches to process
        if (i + actualBatchSize < targetConversations.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              deleted: results.deleted,
              errors: results.errors,
              total_processed: targetConversations.length,
              deletion_summary: {
                successful: results.deleted,
                failed: results.errors.length,
                success_rate: `${Math.round((results.deleted / targetConversations.length) * 100)}%`
              },
              deleted_conversations: results.deletedConversations,
              message: `Bulk deletion completed: ${results.deleted} deleted, ${results.errors.length} errors`
            }, null, 2)
          }
        ]
      };
      
    } catch (error) {
      console.error('CCM: Error in bulkDeleteConversations:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
              details: 'Failed to perform bulk delete operation'
            })
          }
        ],
        isError: true
      };
    }
  }

  async start() {
    try {
      // Add enhanced signal handling for stability
      this.setupEnhancedSignalHandling();
      
      await this.hubClient.connect();
      console.error('Claude Chrome MCP: Connected to hub');
      
      const transport = new StdioServerTransport();
      
      // Enhanced transport close handler with immediate shutdown
      transport.onclose = () => {
        console.error('Claude Chrome MCP: Client disconnected, initiating immediate shutdown...');
        // Use emergency shutdown for faster exit when client disconnects
        this.lifecycleManager.emergencyShutdown('mcp_client_disconnect');
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

  setupEnhancedSignalHandling() {
    // Handle uncaught exceptions without crashing
    process.on('uncaughtException', (error) => {
      this.errorTracker.logError(error, { source: 'uncaughtException' });
      console.error('CCM: Uncaught Exception handled, continuing operation:', error.message);
      // Don't exit - try to continue operation
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.errorTracker.logError(reason, { source: 'unhandledRejection' });
      console.error('CCM: Unhandled Rejection handled, continuing operation:', reason);
      // Don't exit - try to continue operation
    });

    // Enhanced SIGTERM handling
    process.on('SIGTERM', () => {
      console.error('CCM: Received SIGTERM, initiating graceful shutdown...');
      this.lifecycleManager.emergencyShutdown('SIGTERM');
    });

    // Enhanced SIGINT handling
    process.on('SIGINT', () => {
      console.error('CCM: Received SIGINT, initiating graceful shutdown...');
      this.lifecycleManager.emergencyShutdown('SIGINT');
    });
  }

  async stop() {
    console.error('Claude Chrome MCP: Shutting down...');
    try {
      await this.hubClient.close();
      await this.server.close();
      console.error('Claude Chrome MCP: Shutdown complete');
    } catch (error) {
      console.error('Claude Chrome MCP: Error during shutdown:', error);
      // Force exit if shutdown fails
      setTimeout(() => process.exit(1), 100);
    }
  }

  async handleSendMessageAsync(args) {
    const { tabId, message, waitForReady = true } = args;
    
    // Create operation
    const operationId = operationManager.createOperation('send_message', { tabId, message, waitForReady });
    
    // Register operation with content script observer via message passing
    try {
      await this.hubClient.sendRequest('send_content_script_message', {
        tabId,
        message: {
          type: 'register_operation',
          operationId,
          operationType: 'send_message',
          params: { message, waitForReady }
        }
      });
    } catch (error) {
      console.warn('[handleSendMessageAsync] Failed to register operation with observer:', error);
    }
    
    // Start the send message operation
    setTimeout(async () => {
      try {
        // Send the message using existing tool
        await this.hubClient.sendRequest('send_message_to_claude_dot_ai_tab', { 
          tabId, 
          message, 
          waitForReady 
        });
        
        // If registration failed, simulate milestones
        if (!global.observerRegistered) {
          operationManager.updateOperation(operationId, 'message_sent');
          notificationManager.sendProgress(operationId, 'message_sent', { tabId });
        }
      } catch (error) {
        operationManager.updateOperation(operationId, 'error', { error: error.message });
        notificationManager.sendError(operationId, error);
      }
    }, 100);
    
    return {
      operationId,
      status: 'started',
      type: 'send_message',
      timestamp: Date.now()
    };
  }

  async handleForwardResponseAsync(args) {
    const { 
      sourceTabId, 
      targetTabId, 
      template, 
      prefixText, 
      suffixText, 
      extractPattern,
      waitForCompletion = true,
      waitForReady = true,
      timeoutMs = 30000,
      maxRetries = 3
    } = args;
    
    // Create operation
    const operationId = operationManager.createOperation('forward_response', { 
      sourceTabId, targetTabId, waitForCompletion, waitForReady, timeoutMs, maxRetries
    });
    
    // Register operation with content script observer
    try {
      await this.hubClient.sendRequest('send_content_script_message', {
        tabId: targetTabId,
        message: {
          type: 'register_operation',
          operationId,
          operationType: 'forward_response',
          params: { sourceTabId, targetTabId, waitForCompletion, waitForReady }
        }
      });
    } catch (error) {
      console.warn('[handleForwardResponseAsync] Failed to register operation with observer:', error);
    }
    
    // Start the forward response operation
    setTimeout(async () => {
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          // 1. Get response from source tab
          const responseResult = await this.hubClient.sendRequest('get_claude_dot_ai_response', { 
            tabId: sourceTabId,
            waitForCompletion,
            timeoutMs,
            includeMetadata: false
          });
          
          if (!responseResult.success || !responseResult.text) {
            throw new Error(`Failed to get response from source tab ${sourceTabId}: ${responseResult.reason || 'No response text'}`);
          }
          
          let processedMessage = responseResult.text;
          
          // Update milestone: response retrieved
          operationManager.updateOperation(operationId, 'response_retrieved');
          if (!global.observerRegistered) {
            notificationManager.sendProgress(operationId, 'response_retrieved', { 
              sourceTabId, responseLength: processedMessage.length 
            });
          }
          
          // 2. Apply processing pipeline in specified order
          
          // First: Extract using regex pattern if provided
          if (extractPattern) {
            try {
              const regex = new RegExp(extractPattern);
              const match = processedMessage.match(regex);
              if (match) {
                // Use the first capture group if available, otherwise the full match
                processedMessage = match[1] || match[0];
              } else {
                console.warn(`[handleForwardResponseAsync] Regex pattern "${extractPattern}" did not match any content`);
                // Continue with original text if no match
              }
            } catch (regexError) {
              console.warn(`[handleForwardResponseAsync] Invalid regex pattern "${extractPattern}":`, regexError);
              // Continue with original text if regex is invalid
            }
          }
          
          // Second: Apply template substitution if provided
          if (template) {
            processedMessage = template.replace(/\{response\}/g, processedMessage);
          }
          
          // Third: Add prefix and suffix text if provided
          if (prefixText) {
            processedMessage = prefixText + processedMessage;
          }
          if (suffixText) {
            processedMessage = processedMessage + suffixText;
          }
          
          // Update milestone: processing complete
          operationManager.updateOperation(operationId, 'processing_complete');
          if (!global.observerRegistered) {
            notificationManager.sendProgress(operationId, 'processing_complete', { 
              processedLength: processedMessage.length 
            });
          }
          
          // 3. Send processed message to target tab
          await this.hubClient.sendRequest('send_message_to_claude_dot_ai_tab', { 
            tabId: targetTabId, 
            message: processedMessage,
            waitForReady 
          });
          
          // Update milestone: message forwarded
          operationManager.updateOperation(operationId, 'message_forwarded');
          if (!global.observerRegistered) {
            notificationManager.sendProgress(operationId, 'message_forwarded', { 
              targetTabId, finalMessageLength: processedMessage.length 
            });
          }
          
          // Success - break retry loop
          break;
          
        } catch (error) {
          attempt++;
          console.error(`[handleForwardResponseAsync] Attempt ${attempt}/${maxRetries} failed:`, error);
          
          if (attempt >= maxRetries) {
            operationManager.updateOperation(operationId, 'error', { error: error.message });
            notificationManager.sendError(operationId, error);
          } else {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }
    }, 100);
    
    return {
      operationId,
      status: 'started',
      type: 'forward_response',
      timestamp: Date.now()
    };
  }

  async handleWaitForOperation(args) {
    const { operationId, timeoutMs = 30000 } = args;
    
    try {
      // Wait for operation completion
      const operation = await operationManager.waitForCompletion(operationId, timeoutMs);
      
      return {
        operationId,
        status: operation.status,
        milestones: operation.milestones,
        result: operation.milestones.find(m => m.milestone === 'completed')?.data || {},
        completedAt: operation.lastUpdated
      };
    } catch (error) {
      // Return current operation state even if timeout/error
      const operation = operationManager.getOperation(operationId);
      
      return {
        operationId,
        status: operation ? operation.status : 'not_found',
        error: error.message,
        milestones: operation ? operation.milestones : [],
        failedAt: Date.now()
      };
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

const server = new ChromeMCPServer();

// Process lifecycle is now handled by ProcessLifecycleManager
// which is integrated into the ChromeMCPServer class

// Start the server with enhanced error handling
server.start().catch((error) => {
  console.error('Claude Chrome MCP: Fatal error:', error);
  process.exit(1);
});

// Additional safeguard: force exit if process hangs for too long (increased to 30 minutes)
setTimeout(() => {
  console.error('CCM: Process timeout - forcing exit after 30 minutes of no activity');
  process.exit(1);
}, 1800000); // 30 minute timeout

// Override process.exit to ensure it actually exits
const originalExit = process.exit;
process.exit = function(code) {
  console.error(`CCM: Process exiting with code ${code || 0}`);
  originalExit.call(process, code || 0);
};

module.exports = ChromeMCPServer;