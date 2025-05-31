#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const WebSocket = require('ws');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Enhanced error tracking with comprehensive logging
class EnhancedErrorTracker {
  constructor(maxErrors = 100) {
    this.errors = [];
    this.maxErrors = maxErrors;
    this.errorCounts = new Map();
    this.criticalErrors = [];
    this.lastHeartbeat = Date.now();
  }

  logError(error, context = {}, severity = 'error') {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message || error,
      stack: error.stack,
      context,
      severity,
      id: this.generateErrorId()
    };

    this.errors.push(errorEntry);
    
    if (severity === 'critical') {
      this.criticalErrors.push(errorEntry);
      console.error(`[CRITICAL] ${errorEntry.id}:`, error.message, context);
    } else {
      console.error(`[${severity.toUpperCase()}] ${errorEntry.id}:`, error.message, context);
    }

    // Prevent memory leaks
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    const errorKey = error.message || error.toString();
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    return errorEntry.id;
  }

  generateErrorId() {
    return Math.random().toString(36).substr(2, 9);
  }

  updateHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  getHealthStatus() {
    const timeSinceHeartbeat = Date.now() - this.lastHeartbeat;
    const recentErrors = this.errors.filter(e => Date.now() - e.timestamp < 60000);
    
    return {
      healthy: timeSinceHeartbeat < 30000 && recentErrors.length < 10,
      timeSinceHeartbeat,
      recentErrorCount: recentErrors.length,
      criticalErrorCount: this.criticalErrors.length,
      totalErrors: this.errors.length
    };
  }

  getRecentErrors(count = 10) {
    return this.errors.slice(-count);
  }
}

// Enhanced lifecycle manager with proper signal handling
class EnhancedLifecycleManager extends EventEmitter {
  constructor(errorTracker) {
    super();
    this.state = 'initializing';
    this.connections = new Map();
    this.shutdownPromise = null;
    this.heartbeatInterval = null;
    this.errorTracker = errorTracker;
    this.setupSignalHandlers();
    this.setupHeartbeat();
  }

  setupSignalHandlers() {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, initiating graceful shutdown...');
      this.initiateGracefulShutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('Received SIGINT, initiating graceful shutdown...');
      this.initiateGracefulShutdown('SIGINT');
    });

    // Handle uncaught exceptions without crashing
    process.on('uncaughtException', (error) => {
      this.errorTracker.logError(error, { source: 'uncaughtException' }, 'critical');
      // Don't exit - try to continue operation
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.errorTracker.logError(reason, { source: 'unhandledRejection' }, 'critical');
      // Don't exit - try to continue operation
    });
  }

  setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.errorTracker.updateHeartbeat();
      const health = this.errorTracker.getHealthStatus();
      this.emit('heartbeat', health);
      
      if (!health.healthy) {
        console.warn('Server health degraded:', health);
      }
    }, 5000); // 5 second heartbeat
  }

  async initiateGracefulShutdown(signal) {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.state = 'shutting_down';
    
    this.shutdownPromise = this.performGracefulShutdown(signal);
    return this.shutdownPromise;
  }

  async performGracefulShutdown(signal) {
    console.log(`Starting graceful shutdown due to ${signal}...`);
    
    try {
      // Stop accepting new connections
      this.state = 'draining';
      
      // Clear heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      // Wait for active connections to finish (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const shutdownStart = Date.now();
      
      while (this.connections.size > 0 && (Date.now() - shutdownStart) < shutdownTimeout) {
        console.log(`Waiting for ${this.connections.size} connections to finish...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Force close remaining connections
      for (const [id, connection] of this.connections) {
        try {
          if (connection && typeof connection.close === 'function') {
            connection.close();
          }
        } catch (error) {
          console.error(`Error closing connection ${id}:`, error);
        }
      }

      this.connections.clear();
      this.state = 'shutdown';
      
      console.log('Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  registerConnection(id, connection) {
    this.connections.set(id, connection);
    console.log(`Registered connection ${id}, total: ${this.connections.size}`);
  }

  unregisterConnection(id) {
    this.connections.delete(id);
    console.log(`Unregistered connection ${id}, remaining: ${this.connections.size}`);
  }
}

// Hub client for WebSocket communication
class HubClient extends EventEmitter {
  constructor(errorTracker, lifecycleManager) {
    super();
    this.errorTracker = errorTracker;
    this.lifecycleManager = lifecycleManager;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isConnecting = false;
    this.keepAliveInterval = null;
  }

  async connect(port = 54321) {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    const url = `ws://127.0.0.1:${port}/`;

    try {
      console.log(`Connecting to hub at ${url}...`);
      
      this.ws = new WebSocket(url);
      this.lifecycleManager.registerConnection('hub-websocket', this.ws);

      this.ws.on('open', () => {
        console.log('Connected to hub');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.setupKeepAlive();
        this.register();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.errorTracker.logError(error, { source: 'hub-message-parse', data: data.toString() });
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Hub connection closed: ${code} ${reason}`);
        this.isConnecting = false;
        this.clearKeepAlive();
        this.lifecycleManager.unregisterConnection('hub-websocket');
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        this.errorTracker.logError(error, { source: 'hub-websocket' });
        this.isConnecting = false;
      });

    } catch (error) {
      this.errorTracker.logError(error, { source: 'hub-connect' });
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  setupKeepAlive() {
    this.keepAliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // 30 second ping
  }

  clearKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  register() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'register',
        clientInfo: {
          id: 'claude-chrome-mcp-server',
          name: 'Claude Chrome MCP Server',
          type: 'mcp-server',
          capabilities: ['chrome_automation', 'async_operations']
        }
      }));
    }
  }

  handleMessage(message) {
    this.emit('message', message);
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.errorTracker.logError(new Error('Cannot send message: hub not connected'), { message });
    }
  }
}

// Main robust MCP server implementation
class RobustMcpServer {
  constructor() {
    this.server = null;
    this.transport = null;
    this.errorTracker = new EnhancedErrorTracker();
    this.lifecycleManager = new EnhancedLifecycleManager(this.errorTracker);
    this.hubClient = new HubClient(this.errorTracker, this.lifecycleManager);
    this.requestCount = 0;
    this.startTime = Date.now();
    this.activeOperations = new Map();
  }

  async start() {
    try {
      console.log('Starting robust MCP server...');
      
      // Create server with proper error handling
      this.server = new Server(
        {
          name: "claude-chrome-mcp",
          version: "2.4.0"
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Set up all tool handlers with error protection
      this.setupToolHandlers();
      
      // Create transport with error handling
      this.transport = new StdioServerTransport();
      
      // Register transport connection
      this.lifecycleManager.registerConnection('main-transport', this.transport);

      // Connect with error handling
      await this.server.connect(this.transport);
      
      this.lifecycleManager.state = 'operational';
      console.log('MCP server started successfully');
      
      // Connect to hub
      await this.hubClient.connect();
      
      // Set up periodic health checks
      this.setupHealthChecks();
      
    } catch (error) {
      this.errorTracker.logError(error, { source: 'startup' }, 'critical');
      console.error('Failed to start MCP server:', error);
      throw error;
    }
  }

  setupToolHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_connection_health",
            description: "Check the health status of the MCP server and hub connections",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "spawn_claude_dot_ai_tab",
            description: "Create a new Claude.ai tab with optional content script injection",
            inputSchema: {
              type: "object",
              properties: {
                injectContentScript: { type: "boolean", default: true },
                waitForLoad: { type: "boolean", default: true },
                waitForReady: { type: "boolean", default: false }
              }
            }
          },
          {
            name: "send_message_async",
            description: "Send a message to Claude and return immediately with operation ID",
            inputSchema: {
              type: "object",
              properties: {
                tabId: { type: "number" },
                message: { type: "string" }
              },
              required: ["tabId", "message"]
            }
          },
          {
            name: "get_claude_dot_ai_response",
            description: "Get the latest response from Claude",
            inputSchema: {
              type: "object",
              properties: {
                tabId: { type: "number" },
                waitForCompletion: { type: "boolean", default: false },
                timeoutMs: { type: "number", default: 30000 }
              },
              required: ["tabId"]
            }
          }
        ]
      };
    });

    // Call tool handler with comprehensive error protection
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.requestCount++;
      const requestId = `req_${this.requestCount}_${Date.now()}`;
      
      try {
        console.log(`[${requestId}] Handling tool: ${request.params.name}`);
        
        const result = await Promise.race([
          this.handleToolCall(request.params.name, request.params.arguments || {}, requestId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Tool call timeout')), 60000)
          )
        ]);
        
        console.log(`[${requestId}] Completed tool: ${request.params.name}`);
        return result;
        
      } catch (error) {
        this.errorTracker.logError(error, { 
          requestId, 
          toolName: request.params.name, 
          arguments: request.params.arguments 
        });
        
        // Return error response instead of crashing
        return {
          content: [{
            type: "text",
            text: `Error executing ${request.params.name}: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async handleToolCall(toolName, args, requestId) {
    switch (toolName) {
      case 'get_connection_health':
        return this.getConnectionHealth();
        
      case 'spawn_claude_dot_ai_tab':
        return this.spawnClaudeTab(args);
        
      case 'send_message_async':
        return this.sendMessageAsync(args, requestId);
        
      case 'get_claude_dot_ai_response':
        return this.getClaudeResponse(args);
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async getConnectionHealth() {
    const health = this.errorTracker.getHealthStatus();
    const uptime = Date.now() - this.startTime;
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          health: {
            timestamp: Date.now(),
            uptime,
            requestCount: this.requestCount,
            serverHealth: health,
            hub: {
              connected: this.hubClient.ws?.readyState === WebSocket.OPEN,
              reconnectAttempts: this.hubClient.reconnectAttempts
            },
            lifecycle: {
              state: this.lifecycleManager.state,
              connections: this.lifecycleManager.connections.size
            },
            activeOperations: this.activeOperations.size
          }
        }, null, 2)
      }]
    };
  }

  async spawnClaudeTab(args) {
    // Send request to hub for tab creation
    const operationId = `spawn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tab spawn timeout'));
      }, 30000);

      this.hubClient.once('spawn_response', (response) => {
        clearTimeout(timeout);
        if (response.success) {
          resolve({
            content: [{
              type: "text",
              text: JSON.stringify(response.result)
            }]
          });
        } else {
          reject(new Error(response.error || 'Tab spawn failed'));
        }
      });

      this.hubClient.send({
        type: 'spawn_claude_tab',
        operationId,
        ...args
      });
    });
  }

  async sendMessageAsync(args, requestId) {
    const operationId = `send_message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeOperations.set(operationId, {
      type: 'send_message',
      requestId,
      tabId: args.tabId,
      message: args.message,
      startTime: Date.now()
    });

    // Send async message request to hub
    this.hubClient.send({
      type: 'send_message_async',
      operationId,
      tabId: args.tabId,
      message: args.message
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          operationId,
          status: 'started',
          type: 'send_message',
          timestamp: Date.now()
        })
      }]
    };
  }

  async getClaudeResponse(args) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Get response timeout'));
      }, args.timeoutMs || 30000);

      this.hubClient.once('response_data', (response) => {
        clearTimeout(timeout);
        resolve({
          content: [{
            type: "text",
            text: JSON.stringify(response)
          }]
        });
      });

      this.hubClient.send({
        type: 'get_claude_response',
        tabId: args.tabId,
        waitForCompletion: args.waitForCompletion || false
      });
    });
  }

  setupHealthChecks() {
    setInterval(() => {
      const health = this.errorTracker.getHealthStatus();
      const uptime = Date.now() - this.startTime;
      
      if (health.healthy) {
        console.log(`Health: OK, uptime: ${Math.round(uptime/1000)}s, requests: ${this.requestCount}, ops: ${this.activeOperations.size}`);
      } else {
        console.warn(`Health: DEGRADED, uptime: ${Math.round(uptime/1000)}s, errors: ${health.recentErrorCount}`);
      }
    }, 30000); // 30 second health checks
  }
}

// Start the robust server
async function main() {
  console.log('Claude Chrome MCP Enhanced Server v2.4.0');
  console.log('Initializing with enhanced stability features...');
  
  const server = new RobustMcpServer();
  
  try {
    await server.start();
    
    // Keep the process alive
    process.stdin.resume();
    console.log('Server is running and ready to accept connections');
    
  } catch (error) {
    console.error('Server failed to start:', error);
    process.exit(1);
  }
}

// Only start if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { RobustMcpServer, EnhancedErrorTracker, EnhancedLifecycleManager };