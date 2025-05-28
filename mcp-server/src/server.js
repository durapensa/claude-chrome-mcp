#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const WebSocketServer = require('./websocket-server.js');
const ChromeBridge = require('./chrome-bridge.js');

class CCMMCPServer {
  constructor() {
    const serverId = process.env.CCM_SERVER_ID || 'claude-desktop';
    const serverName = process.env.CCM_SERVER_NAME || 'Claude Chrome MCP';
    const websocketPort = parseInt(process.env.CCM_WEBSOCKET_PORT || '54321', 10);

    this.server = new Server(
      {
        name: `claude-chrome-mcp-${serverId}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.websocketServer = new WebSocketServer(websocketPort);
    this.chromeBridge = new ChromeBridge(this.websocketServer);
    this.serverId = serverId;
    this.serverName = serverName;
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
            },
          },
          {
            name: 'get_claude_sessions',
            description: 'List all active Claude.ai tabs and sessions',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'send_message_to_claude',
            description: 'Send a message to a specific Claude session',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID of the Claude session'
                },
                message: {
                  type: 'string',
                  description: 'Message to send'
                }
              },
              required: ['tabId', 'message'],
            },
          },
          {
            name: 'get_claude_response',
            description: 'Get the latest response from a Claude session',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID of the Claude session'
                }
              },
              required: ['tabId'],
            },
          },
          {
            name: 'debug_attach',
            description: 'Attach Chrome debugger to a tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to attach debugger to'
                }
              },
              required: ['tabId'],
            },
          },
          {
            name: 'execute_script',
            description: 'Execute JavaScript in a tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to execute script in'
                },
                script: {
                  type: 'string',
                  description: 'JavaScript code to execute'
                }
              },
              required: ['tabId', 'script'],
            },
          },
          {
            name: 'get_dom_elements',
            description: 'Get DOM elements matching a selector',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to query'
                },
                selector: {
                  type: 'string',
                  description: 'CSS selector to match elements'
                }
              },
              required: ['tabId', 'selector'],
            },
          },
          {
            name: 'debug_claude_page',
            description: 'Debug Claude page readiness and available utilities',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to debug'
                }
              },
              required: ['tabId'],
            },
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'spawn_claude_tab':
            result = await this.chromeBridge.createClaudeTab(args.url);
            break;

          case 'get_claude_sessions':
            result = await this.chromeBridge.getClaudeTabs();
            break;

          case 'send_message_to_claude':
            result = await this.chromeBridge.sendMessageToTab(args.tabId, args.message);
            break;

          case 'get_claude_response':
            result = await this.chromeBridge.getLatestResponse(args.tabId);
            break;

          case 'debug_attach':
            result = await this.chromeBridge.attachDebugger(args.tabId);
            break;

          case 'execute_script':
            result = await this.chromeBridge.executeScript(args.tabId, args.script);
            break;

          case 'get_dom_elements':
            result = await this.chromeBridge.getDOMElements(args.tabId, args.selector);
            break;

          case 'debug_claude_page':
            result = await this.chromeBridge.debugClaudePage(args.tabId);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start() {
    // Start WebSocket server for extension communication
    await this.websocketServer.start();
    console.error(`${this.serverName} WebSocket server started on port ${this.websocketServer.port}`);

    // Start MCP server for client communication
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.serverName} MCP server started`);
  }

  async stop() {
    console.error('CCM: Shutting down server...');
    if (this.websocketServer) {
      this.websocketServer.stop();
    }
    if (this.server) {
      await this.server.close();
    }
    console.error('CCM: Server shutdown complete');
  }
}

// Start the server
const server = new CCMMCPServer();

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  console.error(`CCM: Received ${signal}, shutting down gracefully...`);
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Handle stdin close (when Claude Desktop disconnects)
process.stdin.on('close', () => gracefulShutdown('stdin close'));
process.stdin.on('end', () => gracefulShutdown('stdin end'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

server.start().catch((error) => {
  console.error('Failed to start CCM MCP server:', error);
  process.exit(1);
});

module.exports = CCMMCPServer;