const WebSocket = require('ws');
const EventEmitter = require('events');
const { ErrorTracker } = require('../utils/error-tracker');
const { DebugMode } = require('../utils/debug-mode');
const { MCPClientConnection } = require('./client-connection');

const HUB_PORT = 54321;

// Central WebSocket hub that manages all MCP client connections
// This is the core component that Chrome extension and MCP clients connect to
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
        version: '2.5.0',
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

    // Emit extension connected event
    this.emitExtensionConnected();
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

    // Emit client joined event
    this.emitClientJoined(clientInfo);
  }

  handleDisconnection(ws, code, reason) {
    const clientId = ws.clientId;
    const clientInfo = ws.clientInfo;
    
    console.error(`WebSocket Hub: Client ${clientId} disconnected (code: ${code}, reason: ${reason})`);

    if (ws === this.chromeExtensionConnection) {
      console.error('WebSocket Hub: Chrome extension disconnected');
      this.chromeExtensionConnection = null;
      
      // Emit extension disconnected event
      this.emitExtensionDisconnected();
      
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
      
      // Emit client left event
      this.emitClientLeft(clientInfo);
    }

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
    // Enhanced shutdown condition handling (Fix 3)
    // Shut down if no MCP clients remain and we're not the extension
    if (this.clients.size === 0 && !this.chromeExtensionConnection) {
      console.error('WebSocket Hub: No clients remaining, scheduling graceful shutdown...');
      
      // Use graceful shutdown with proper cleanup sequencing
      setTimeout(() => {
        if (this.clients.size === 0 && !this.chromeExtensionConnection) {
          console.error('WebSocket Hub: Confirming graceful shutdown - no clients remain');
          this.shutdown('no_clients_remaining');
        } else {
          console.error('WebSocket Hub: Shutdown cancelled - clients reconnected');
        }
      }, 5000); // 5 second grace period for reconnections
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

  // ===== EVENT-DRIVEN NOTIFICATION SYSTEM =====
  // Replaces complex polling/notification with simple event broadcasting
  
  broadcastEvent(eventType, eventData = {}) {
    if (!this.chromeExtensionConnection || this.chromeExtensionConnection.readyState !== WebSocket.OPEN) {
      console.log(`Hub: Cannot broadcast ${eventType} - extension not connected`);
      return;
    }

    const event = {
      type: 'hub_event',
      eventType,
      data: eventData,
      timestamp: Date.now(),
      hubInfo: this.getConnectionState()
    };

    console.log(`Hub: Broadcasting event '${eventType}' to extension`);
    this.sendToClient(this.chromeExtensionConnection, event);
  }

  // Get current connection state (single source of truth)
  getConnectionState() {
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

    return {
      hubConnected: true,
      isReconnecting: false,
      connectedClients: clientList,
      extensionConnected: !!this.chromeExtensionConnection,
      hubUptime: Date.now() - this.startTime,
      timestamp: Date.now()
    };
  }

  // Event types for different state changes
  emitConnectionChanged() {
    this.broadcastEvent('connection_changed', {
      reason: 'hub_state_updated'
    });
  }

  emitClientJoined(clientInfo) {
    this.broadcastEvent('client_joined', {
      client: clientInfo,
      reason: 'new_client_connected'
    });
  }

  emitClientLeft(clientInfo) {
    this.broadcastEvent('client_left', {
      client: clientInfo,
      reason: 'client_disconnected'
    });
  }

  emitExtensionConnected() {
    this.broadcastEvent('extension_connected', {
      reason: 'chrome_extension_connected'
    });
  }

  emitExtensionDisconnected() {
    this.broadcastEvent('extension_disconnected', {
      reason: 'chrome_extension_disconnected'
    });
  }

  // Legacy method for backward compatibility (will be removed)
  broadcastClientListUpdate() {
    // Deprecated: Use emitConnectionChanged() instead
    this.emitConnectionChanged();
  }

  getHubInfo() {
    return {
      name: 'Claude Chrome MCP Hub',
      version: '2.5.0',
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
    console.error(`WebSocket Hub: Shutdown initiated (reason: ${reason})`);

    // Clear intervals
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Enhanced shutdown sequencing (Fix 3)
    // STEP 1: Notify extension BEFORE closing connections
    if (this.chromeExtensionConnection && this.chromeExtensionConnection.readyState === WebSocket.OPEN) {
      try {
        this.sendToClient(this.chromeExtensionConnection, {
          type: 'hub_shutdown',
          reason: reason,
          timestamp: Date.now()
        });
        
        // Give extension time to process the shutdown message
        console.error('WebSocket Hub: Notified extension, waiting for processing...');
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('WebSocket Hub: Error notifying extension of shutdown:', error);
      }
    }

    // STEP 2: Notify all MCP clients
    for (const [id, client] of this.clients) {
      try {
        this.sendToClient(client.ws, {
          type: 'hub_shutdown',
          reason: reason,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error(`WebSocket Hub: Error notifying client ${id}:`, error);
      }
    }

    // STEP 3: Wait for messages to be sent
    console.error('WebSocket Hub: Waiting for shutdown messages to be delivered...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // STEP 4: Close all connections gracefully first
    if (this.server) {
      console.error('WebSocket Hub: Closing connections gracefully...');
      this.server.clients.forEach(ws => {
        try {
          ws.close(1000, 'Server shutdown');
        } catch (error) {
          // If graceful close fails, terminate
          ws.terminate();
        }
      });
      
      // STEP 5: Close server with timeout
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


module.exports = { WebSocketHub, HUB_PORT };
