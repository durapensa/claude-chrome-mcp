#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const TabPool = require('../../shared/tab-pool-v2');

// Import existing classes from server.js
const fs = require('fs');
const path = require('path');

// Read the original server.js to get the supporting classes
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf-8');

// Extract and evaluate the supporting classes (ErrorTracker, DebugMode, etc.)
// This is a temporary solution - in production, these should be in separate modules
const classMatch = serverContent.match(/class (ErrorTracker|DebugMode|ProcessLifecycleManager|MCPClientConnection|WebSocketHub|AutoHubClient)[\s\S]*?(?=class|\/\/|$)/g);
if (classMatch) {
  classMatch.forEach(classCode => {
    eval(classCode);
  });
}

// Enhanced ChromeMCPServer with Tab Pool integration
class ChromeMCPServerWithPool {
  constructor() {
    this.server = new Server(
      {
        name: 'claude-chrome-mcp',
        version: '2.2.0', // Bumped version for tab pool feature
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.hubClient = new AutoHubClient();
    this.lifecycleManager = new ProcessLifecycleManager();
    
    // Initialize tab pool if enabled
    this.tabPool = null;
    if (process.env.TAB_POOL_ENABLED !== '0') {
      this.initializeTabPool();
    }
    
    this.setupLifecycleIntegration();
    this.setupToolHandlers();
  }

  initializeTabPool() {
    console.error('Claude Chrome MCP: Initializing tab pool...');
    
    this.tabPool = new TabPool(this.hubClient, {
      maxSize: parseInt(process.env.TAB_POOL_MAX_SIZE) || 5,
      minSize: parseInt(process.env.TAB_POOL_MIN_SIZE) || 2,
      idleTimeout: parseInt(process.env.TAB_POOL_IDLE_TIMEOUT) || 300000,
      warmupDelay: parseInt(process.env.TAB_POOL_WARMUP_DELAY) || 5000,
      logLevel: process.env.TAB_POOL_LOG_LEVEL || 'info'
    });
    
    // Log pool events
    this.tabPool.on('error', (error) => {
      console.error('Claude Chrome MCP: Tab pool error:', error);
    });
  }

  setupLifecycleIntegration() {
    // Register cleanup tasks
    this.lifecycleManager.addCleanupTask('tab-pool', async () => {
      if (this.tabPool) {
        console.error('Claude Chrome MCP: Shutting down tab pool...');
        await this.tabPool.shutdown();
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
    // List available tools - include new pool management tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const baseTools = [
        {
          name: 'spawn_claude_tab',
          description: 'Create a new Claude.ai tab (uses tab pool if enabled)',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'Optional URL to navigate to (defaults to claude.ai)',
                default: 'https://claude.ai'
              },
              usePool: {
                type: 'boolean',
                description: 'Whether to use tab pool (default: true if pool enabled)',
                default: true
              }
            },
            additionalProperties: false
          }
        },
        // ... (include all other existing tools from original server.js)
      ];
      
      // Add pool management tools if pool is enabled
      if (this.tabPool) {
        baseTools.push(
          {
            name: 'get_tab_pool_stats',
            description: 'Get statistics and status of the tab pool',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'release_tab_to_pool',
            description: 'Release a tab back to the pool for reuse',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'The tab ID to release back to the pool'
                }
              },
              required: ['tabId'],
              additionalProperties: false
            }
          },
          {
            name: 'configure_tab_pool',
            description: 'Dynamically configure tab pool settings',
            inputSchema: {
              type: 'object',
              properties: {
                maxSize: {
                  type: 'number',
                  description: 'Maximum number of tabs in the pool',
                  minimum: 1,
                  maximum: 20
                },
                minSize: {
                  type: 'number',
                  description: 'Minimum number of tabs to maintain',
                  minimum: 0,
                  maximum: 10
                },
                idleTimeout: {
                  type: 'number',
                  description: 'Idle timeout in milliseconds',
                  minimum: 60000
                }
              },
              additionalProperties: false
            }
          }
        );
      }
      
      return { tools: baseTools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Update activity for lifecycle management
      this.lifecycleManager.updateActivity();

      try {
        let result;
        
        switch (name) {
          case 'spawn_claude_tab':
            // Use tab pool if enabled and requested
            if (this.tabPool && args.usePool !== false) {
              try {
                const tabId = await this.tabPool.acquire();
                result = {
                  success: true,
                  id: tabId,
                  source: 'pool',
                  message: `Acquired tab ${tabId} from pool`
                };
              } catch (poolError) {
                console.error('Claude Chrome MCP: Tab pool acquire failed:', poolError);
                // Fallback to regular spawn
                result = await this.hubClient.sendRequest('spawn_claude_tab', args);
              }
            } else {
              result = await this.hubClient.sendRequest('spawn_claude_tab', args);
            }
            break;
            
          case 'release_tab_to_pool':
            if (!this.tabPool) {
              throw new Error('Tab pool is not enabled');
            }
            await this.tabPool.release(args.tabId);
            result = {
              success: true,
              message: `Tab ${args.tabId} released to pool`
            };
            break;
            
          case 'get_tab_pool_stats':
            if (!this.tabPool) {
              throw new Error('Tab pool is not enabled');
            }
            result = this.tabPool.getStats();
            break;
            
          case 'configure_tab_pool':
            if (!this.tabPool) {
              throw new Error('Tab pool is not enabled');
            }
            
            // Apply configuration changes
            if (args.maxSize !== undefined) {
              this.tabPool.maxSize = args.maxSize;
            }
            if (args.minSize !== undefined) {
              this.tabPool.minSize = args.minSize;
            }
            if (args.idleTimeout !== undefined) {
              this.tabPool.idleTimeout = args.idleTimeout;
            }
            
            result = {
              success: true,
              config: {
                maxSize: this.tabPool.maxSize,
                minSize: this.tabPool.minSize,
                idleTimeout: this.tabPool.idleTimeout
              }
            };
            break;
            
          // All other existing tools
          case 'get_claude_tabs':
            result = await this.hubClient.sendRequest('get_claude_tabs');
            break;
          case 'get_claude_conversations':
            result = await this.hubClient.sendRequest('get_claude_conversations');
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
          case 'get_connection_health':
            result = await this.hubClient.sendRequest('get_connection_health', args);
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
      
      if (this.tabPool) {
        console.error('Claude Chrome MCP: Tab pool enabled with config:', {
          minSize: this.tabPool.minSize,
          maxSize: this.tabPool.maxSize,
          idleTimeout: this.tabPool.idleTimeout
        });
      }
      
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
      if (this.tabPool) {
        await this.tabPool.shutdown();
      }
      await this.hubClient.close();
      await this.server.close();
      console.error('Claude Chrome MCP: Shutdown complete');
    } catch (error) {
      console.error('Claude Chrome MCP: Error during shutdown:', error);
      // Force exit if shutdown fails
      setTimeout(() => process.exit(1), 100);
    }
  }
}

// Main entry point
const server = new ChromeMCPServerWithPool();
server.start().catch(error => {
  console.error('Claude Chrome MCP: Fatal error:', error);
  process.exit(1);
});