#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const WebSocket = require('ws');
const EventEmitter = require('events');

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
  }

  async start() {
    this.server = new WebSocket.Server({ 
      port: HUB_PORT,
      clientTracking: true 
    });

    console.error(`WebSocket Hub: Server listening on port ${HUB_PORT}`);

    this.server.on('connection', (ws, req) => {
      console.error('WebSocket Hub: New connection from', req.socket.remoteAddress);
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('WebSocket Hub: Invalid JSON from client:', error);
          ws.close(1003, 'Invalid JSON');
        }
      });

      ws.on('close', (code, reason) => {
        this.handleWebSocketClose(ws, code, reason);
      });

      ws.on('error', (error) => {
        console.error('WebSocket Hub: Client error:', error);
      });
    });

    this.server.on('error', (error) => {
      console.error('WebSocket Hub: Server error:', error);
    });

    this.setupSignalHandlers();
    console.error('WebSocket Hub: Initialized for Extension-as-Hub architecture');
  }

  handleWebSocketMessage(ws, message) {
    const { type } = message;

    switch (type) {
      case 'chrome_extension_register':
        this.registerChromeExtension(ws, message);
        break;
        
      case 'mcp_client_register':
        this.registerMCPClient(ws, message);
        break;
        
      case 'chrome_request':
        this.forwardToChromeExtension(message);
        break;
        
      case 'mcp_request':
        this.forwardToMCPClient(message);
        break;
        
      default:
        if (ws === this.chromeExtensionConnection) {
          this.handleChromeExtensionMessage(message);
        } else {
          this.handleMCPClientMessage(ws, message);
        }
    }
  }

  registerChromeExtension(ws, message) {
    console.error('WebSocket Hub: Chrome extension connected');
    this.chromeExtensionConnection = ws;
    
    ws.send(JSON.stringify({
      type: 'registration_confirmed',
      role: 'chrome_extension',
      hubInfo: {
        name: 'Claude Chrome MCP Hub',
        version: '2.0.0',
        port: HUB_PORT
      }
    }));

    this.sendClientListToExtension();
  }

  registerMCPClient(ws, message) {
    const clientInfo = message.clientInfo || {};
    const client = new MCPClientConnection(ws, clientInfo);
    
    this.clients.set(client.id, client);
    console.error(`WebSocket Hub: Registered MCP client ${client.name} (${client.id}) - Type: ${client.type}`);
    console.error(`WebSocket Hub: Client info:`, JSON.stringify(clientInfo, null, 2));
    
    ws.send(JSON.stringify({
      type: 'registration_confirmed',
      clientId: client.id,
      role: 'mcp_client',
      hubInfo: {
        name: 'Claude Chrome MCP Hub',
        version: '2.0.0'
      }
    }));

    ws.clientId = client.id;
    this.notifyExtensionClientChange();
  }

  handleWebSocketClose(ws, code, reason) {
    if (ws === this.chromeExtensionConnection) {
      console.error('WebSocket Hub: Chrome extension disconnected');
      this.chromeExtensionConnection = null;
    } else if (ws.clientId) {
      const client = this.clients.get(ws.clientId);
      if (client) {
        console.error(`WebSocket Hub: MCP client ${client.name} disconnected (code: ${code})`);
        this.clients.delete(ws.clientId);
        this.notifyExtensionClientChange();
        
        // If no MCP clients remain, shut down the hub
        if (this.clients.size === 0) {
          console.error('WebSocket Hub: No MCP clients remaining, shutting down...');
          // Immediate shutdown to prevent stale processes
          setImmediate(() => {
            this.shutdown();
          });
        }
      }
    }
  }

  handleChromeExtensionMessage(message) {
    const { targetClientId } = message;
    const client = this.clients.get(targetClientId);
    
    if (client) {
      client.send(message);
    } else {
      console.error('WebSocket Hub: Target client not found:', targetClientId);
    }
  }

  handleMCPClientMessage(ws, message) {
    const client = this.clients.get(ws.clientId);
    if (!client) {
      console.error('WebSocket Hub: Message from unregistered client');
      return;
    }

    client.requestCount++;
    client.lastActivity = Date.now();

    if (this.chromeExtensionConnection) {
      const forwardedMessage = {
        ...message,
        sourceClientId: client.id,
        sourceClientName: client.name,
        hubRequestId: ++this.requestCounter
      };
      
      this.chromeExtensionConnection.send(JSON.stringify(forwardedMessage));
    } else {
      ws.send(JSON.stringify({
        type: 'error',
        requestId: message.requestId,
        error: 'Chrome extension not connected',
        timestamp: Date.now()
      }));
    }
  }

  sendClientListToExtension() {
    if (this.chromeExtensionConnection) {
      const clientList = Array.from(this.clients.values()).map(client => client.getStatus());
      
      console.error(`WebSocket Hub: Sending client list to extension: ${clientList.length} clients`);
      console.error(`WebSocket Hub: Client list:`, JSON.stringify(clientList, null, 2));
      
      this.chromeExtensionConnection.send(JSON.stringify({
        type: 'client_list_update',
        clients: clientList,
        timestamp: Date.now()
      }));
    }
  }

  notifyExtensionClientChange() {
    this.sendClientListToExtension();
  }

  setupSignalHandlers() {
    const cleanup = () => {
      console.error('WebSocket Hub: Shutting down...');
      
      this.clients.forEach(client => {
        client.send({
          type: 'hub_shutdown',
          timestamp: Date.now()
        });
      });

      if (this.chromeExtensionConnection) {
        this.chromeExtensionConnection.send(JSON.stringify({
          type: 'hub_shutdown',
          timestamp: Date.now()
        }));
      }

      if (this.server) {
        this.server.close(() => {
          console.error('WebSocket Hub: Server closed');
        });
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  shutdown() {
    console.error('WebSocket Hub: Graceful shutdown initiated');
    
    // Notify all clients about shutdown
    this.clients.forEach(client => {
      client.send({
        type: 'hub_shutdown',
        timestamp: Date.now()
      });
    });

    if (this.chromeExtensionConnection) {
      this.chromeExtensionConnection.send(JSON.stringify({
        type: 'hub_shutdown',
        timestamp: Date.now()
      }));
    }

    if (this.server) {
      this.server.close(() => {
        console.error('WebSocket Hub: Server closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
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
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.ownedHub = null;
    this.isHubOwner = false;
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
    // Try to connect to existing hub first
    try {
      await this.connectToExistingHub();
      console.error(`CCM: Connected to existing hub as ${this.clientInfo.name}`);
      return;
    } catch (error) {
      console.error('CCM: No existing hub found, starting new hub...');
    }

    // Start our own hub and connect to it
    try {
      await this.startHubAndConnect();
      console.error(`CCM: Started hub and connected as ${this.clientInfo.name}`);
    } catch (error) {
      console.error('CCM: Failed to start hub:', error);
      throw error;
    }
  }

  async connectToExistingHub() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 2000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.ws = ws;
        this.setupWebSocketHandlers(resolve, reject);
        this.registerWithHub();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
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
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message, connectResolve, connectReject);
      } catch (error) {
        console.error('CCM: Error parsing message:', error);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.error('CCM: Connection closed:', code, reason.toString());
      this.connected = false;
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('CCM: Connection error:', error);
      this.connected = false;
      if (connectReject) connectReject(error);
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
      throw new Error('Not connected to hub');
    }

    const requestId = `req-${++this.requestCounter}`;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      this.ws.send(JSON.stringify({
        type,
        requestId,
        params,
        timestamp: Date.now()
      }));
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('CCM: Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.error(`CCM: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(() => {
        // Connection failed, will retry again
      });
    }, delay);
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.isHubOwner && this.ownedHub) {
      console.error('CCM: Shutting down owned hub');
      this.ownedHub.stop();
      this.ownedHub = null;
      this.isHubOwner = false;
    }
    
    this.connected = false;
    this.pendingRequests.clear(); // Clear any pending requests
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
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.hubClient = new AutoHubClient();
    this.setupToolHandlers();
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
            name: 'get_claude_sessions',
            description: 'Get list of all Claude.ai tabs with their IDs and status',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'send_message_to_claude',
            description: 'Send a message to a specific Claude session',
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
            description: 'Get the latest response from a Claude session',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID of the Claude session'
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
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;
        
        switch (name) {
          case 'get_claude_sessions':
            result = await this.hubClient.sendRequest('get_claude_sessions');
            break;
          case 'spawn_claude_tab':
            result = await this.hubClient.sendRequest('spawn_claude_tab', args);
            break;
          case 'send_message_to_claude':
            result = await this.hubClient.sendRequest('send_message_to_claude', args);
            break;
          case 'get_claude_response':
            result = await this.hubClient.sendRequest('get_claude_response', args);
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
      
      // Listen for transport close to shutdown gracefully
      transport.onclose = () => {
        console.error('Claude Chrome MCP: Client disconnected, shutting down...');
        this.stop().then(() => {
          process.exit(0);
        }).catch((error) => {
          console.error('Claude Chrome MCP: Error during shutdown:', error);
          process.exit(1);
        });
      };
      
      await this.server.connect(transport);
      console.error('Claude Chrome MCP: MCP server started');
      
    } catch (error) {
      console.error('Claude Chrome MCP: Startup failed:', error);
      process.exit(1);
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

// Enhanced signal handling for graceful shutdown
const gracefulShutdown = async (signal) => {
  console.error(`Claude Chrome MCP: Received ${signal}, shutting down gracefully...`);
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Claude Chrome MCP: Force exit due to shutdown error:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGPIPE', () => gracefulShutdown('SIGPIPE'));

// Handle parent process exit (important for MCP clients)
process.on('disconnect', () => gracefulShutdown('disconnect'));

// Monitor parent process more aggressively
if (process.send) {
  const parentPid = process.ppid;
  const checkParent = () => {
    try {
      process.kill(parentPid, 0); // Check if parent is alive
    } catch (e) {
      console.error('Claude Chrome MCP: Parent process dead, shutting down...');
      gracefulShutdown('parent-dead');
    }
  };
  
  // Check parent every 5 seconds
  setInterval(checkParent, 5000);
}

// Handle uncaught errors to prevent hanging
process.on('uncaughtException', (error) => {
  console.error('Claude Chrome MCP: Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Claude Chrome MCP: Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
server.start().catch((error) => {
  console.error('Claude Chrome MCP: Fatal error:', error);
  process.exit(1);
});

module.exports = ChromeMCPServer;