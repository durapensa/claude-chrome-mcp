#!/usr/bin/env node

/**
 * Claude Chrome MCP Server - Modular Architecture
 * 
 * This is the new modular entry point that imports and coordinates
 * all the extracted components for the MCP-Server-as-Hub architecture.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Import modular components
const { ErrorTracker } = require('./utils/error-tracker');
const { DebugMode } = require('./utils/debug-mode');
const { OperationManager } = require('./utils/operation-manager');
const { NotificationManager } = require('./utils/notification-manager');
const { ProcessLifecycleManager } = require('./lifecycle/process-manager');
const { WebSocketHub } = require('./hub/websocket-hub');
const { AutoHubClient } = require('./hub/hub-client');
const { MultiHubManager } = require('./hub/multi-hub-manager');

/**
 * Main Chrome MCP Server class with modular architecture
 * Integrates all components for browser automation via Chrome extension
 */
class ChromeMCPServer {
  constructor() {
    // Initialize core components
    this.server = new Server({
      name: 'claude-chrome-mcp',
      version: '2.5.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Initialize utility modules
    this.errorTracker = new ErrorTracker();
    this.debug = new DebugMode().createLogger('ChromeMCPServer');
    this.operationManager = new OperationManager();
    this.notificationManager = new NotificationManager();
    
    // Initialize lifecycle manager
    this.lifecycleManager = new ProcessLifecycleManager();
    
    // Initialize hub client for multi-server coordination
    this.hubClient = new AutoHubClient({
      id: 'claude-chrome-mcp',
      name: 'Claude Chrome MCP',
      type: 'automation_server',
      capabilities: ['chrome_tabs', 'debugger', 'claude_automation']
    });
    
    // Initialize multi-hub manager
    this.multiHubManager = new MultiHubManager(this.hubClient);
    
    // Connection state
    this.isConnected = false;
    this.startTime = Date.now();
    
    this.setupMCPHandlers();
    this.setupLifecycleIntegration();
    
    this.debug.info('ChromeMCPServer initialized with modular architecture');
  }

  setupMCPHandlers() {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_connection_health',
            description: 'Get connection health and status information',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'spawn_claude_dot_ai_tab',
            description: 'Open a new Claude.ai tab with optional content script injection',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string', 
                  description: 'URL to open',
                  default: 'https://claude.ai'
                },
                injectContentScript: {
                  type: 'boolean',
                  description: 'Whether to inject content script for interaction',
                  default: true
                },
                waitForLoad: {
                  type: 'boolean',
                  description: 'Wait for page to fully load',
                  default: true
                }
              },
              additionalProperties: false
            }
          },
          {
            name: 'send_message_async',
            description: 'Send message asynchronously to Claude tab (returns immediately)',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to send message to'
                },
                message: {
                  type: 'string',
                  description: 'Message to send to Claude'
                },
                waitForCompletion: {
                  type: 'boolean',
                  description: 'Whether to wait for response completion',
                  default: false
                }
              },
              required: ['tabId', 'message'],
              additionalProperties: false
            }
          },
          {
            name: 'get_claude_dot_ai_response',
            description: 'Get the latest response from Claude tab with auto-completion detection',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to get response from'
                },
                timeoutMs: {
                  type: 'number',
                  description: 'Timeout in milliseconds',
                  default: 30000
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'forward_response_to_claude_dot_ai_tab',
            description: 'Forward Claude response from source tab to target tab',
            inputSchema: {
              type: 'object',
              properties: {
                sourceTabId: {
                  type: 'number',
                  description: 'Source tab ID to get response from'
                },
                targetTabId: {
                  type: 'number', 
                  description: 'Target tab ID to send response to'
                },
                transformTemplate: {
                  type: 'string',
                  description: 'Optional transformation template with ${response} placeholder'
                }
              },
              required: ['sourceTabId', 'targetTabId'],
              additionalProperties: false
            }
          },
          {
            name: 'wait_for_operation',
            description: 'Wait for async operation completion',
            inputSchema: {
              type: 'object',
              properties: {
                operationId: {
                  type: 'string',
                  description: 'Operation ID to wait for'
                },
                timeoutMs: {
                  type: 'number',
                  description: 'Timeout in milliseconds',
                  default: 30000
                }
              },
              required: ['operationId'],
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
        this.debug.verbose(`Tool call: ${name}`, args);
        
        // Route to appropriate handler
        switch (name) {
          case 'get_connection_health':
            return await this.handleGetConnectionHealth(args);
          case 'spawn_claude_dot_ai_tab':
            return await this.handleSpawnTab(args);
          case 'send_message_async':
            return await this.handleSendMessageAsync(args);
          case 'get_claude_dot_ai_response':
            return await this.handleGetResponse(args);
          case 'forward_response_to_claude_dot_ai_tab':
            return await this.handleForwardResponse(args);
          case 'wait_for_operation':
            return await this.handleWaitForOperation(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        this.errorTracker.logError(error, { tool: name, args });
        throw error;
      }
    });
  }

  setupLifecycleIntegration() {
    // Register cleanup tasks with lifecycle manager
    this.lifecycleManager.addCleanupTask('hub-client', async () => {
      if (this.hubClient.connected) {
        await this.hubClient.close();
      }
    });

    this.lifecycleManager.addCleanupTask('multi-hub-manager', async () => {
      if (this.multiHubManager) {
        await this.multiHubManager.shutdown();
      }
    });

    this.lifecycleManager.addCleanupTask('operation-manager', async () => {
      this.operationManager.saveState();
    });
  }

  // Tool handlers that delegate to hub client
  async handleGetConnectionHealth(args) {
    const status = {
      hubClient: {
        connected: this.hubClient.connected,
        connectionState: this.hubClient.connectionState,
        isHubOwner: this.hubClient.isHubOwner,
        lastActivityTime: this.hubClient.lastActivityTime
      },
      server: {
        uptime: Date.now() - this.startTime,
        operationsCount: this.operationManager.operations.size,
        errorsCount: this.errorTracker.errors.length
      },
      multiHub: this.multiHubManager.getHubStatus()
    };
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(status, null, 2)
      }]
    };
  }

  async handleSpawnTab(args) {
    const operationId = this.operationManager.createOperation('spawn_tab', args);
    
    // Delegate to hub client using sendRequest method
    const result = await this.hubClient.sendRequest('spawn_claude_dot_ai_tab', args);
    
    this.operationManager.updateOperation(operationId, 'completed', result);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async handleSendMessageAsync(args) {
    const operationId = this.operationManager.createOperation('send_message_async', args);
    
    // Delegate to hub client for async operation
    const result = await this.hubClient.sendRequest('send_message_async', args);
    
    this.operationManager.updateOperation(operationId, 'completed', result);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async handleGetResponse(args) {
    const operationId = this.operationManager.createOperation('get_response', args);
    
    // Delegate to hub client
    const result = await this.hubClient.sendRequest('get_claude_dot_ai_response', args);
    
    this.operationManager.updateOperation(operationId, 'completed', result);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async handleForwardResponse(args) {
    const operationId = this.operationManager.createOperation('forward_response', args);
    
    // Delegate to hub client
    const result = await this.hubClient.sendRequest('forward_response_to_claude_dot_ai_tab', args);
    
    this.operationManager.updateOperation(operationId, 'completed', result);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async handleWaitForOperation(args) {
    const { operationId, timeoutMs = 30000 } = args;
    
    try {
      const operation = await this.operationManager.waitForCompletion(operationId, timeoutMs);
      
      const result = {
        operationId,
        status: operation.status,
        milestones: operation.milestones,
        result: operation.milestones.find(m => m.milestone === 'completed')?.data || {},
        completedAt: operation.lastUpdated
      };
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      const operation = this.operationManager.getOperation(operationId);
      
      const result = {
        operationId,
        status: operation ? operation.status : 'not_found',
        error: error.message,
        milestones: operation ? operation.milestones : [],
        failedAt: Date.now()
      };
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  }

  async start() {
    try {
      // Start hub client (will either connect to existing hub or create own)
      await this.hubClient.connect();
      
      // Start MCP server on stdio
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.isConnected = true;
      this.debug.info('ChromeMCPServer started successfully');
      
    } catch (error) {
      this.errorTracker.logError(error, { context: 'server_startup' });
      this.debug.error('Failed to start ChromeMCPServer', error);
      throw error;
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  try {
    const server = new ChromeMCPServer();
    await server.start();
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.error('CCM: Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('CCM: Fatal error:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  main().catch(error => {
    console.error('CCM: Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { ChromeMCPServer };