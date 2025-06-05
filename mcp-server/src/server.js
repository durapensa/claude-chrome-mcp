#!/usr/bin/env node

/**
 * Claude Chrome MCP Server - Modular Architecture
 * 
 * This is the new modular entry point that imports and coordinates
 * all the extracted components for the MCP-Server with embedded relay architecture.
 */

// CRITICAL: Redirect all console output to stderr to keep stdout clean for JSON-RPC
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
console.log = console.error;
console.warn = console.error;
console.info = console.error;

// Also ensure stdout doesn't get any debug output
if (process.stdout.write.bind) {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = function(...args) {
    // Only allow JSON-RPC messages (they start with {")
    const str = args[0];
    if (typeof str === 'string' && (str.startsWith('{"') || str.trim() === '')) {
      return originalStdoutWrite.apply(process.stdout, args);
    }
    // Redirect everything else to stderr
    return process.stderr.write.apply(process.stderr, args);
  };
}

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import modular components
const { ErrorTracker } = require('./utils/error-tracker');
const { DebugMode } = require('./utils/debug-mode');
const { OperationManager } = require('./utils/operation-manager');
const { NotificationManager } = require('./utils/notification-manager');
const { MCPRelayClient } = require('./relay/mcp-relay-client');

// Import modular tools
const { allTools, getToolHandler, hasHandler } = require('./tools/index');

/**
 * Main Chrome MCP Server class with modular architecture
 * Integrates all components for browser automation via Chrome extension
 */
class ChromeMCPServer {
  constructor() {
    // Initialize core components
    this.server = new McpServer({
      name: 'claude-chrome-mcp',
      version: '2.6.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Initialize utility modules
    this.errorTracker = new ErrorTracker();
    this.debug = new DebugMode().createLogger('ChromeMCPServer');
    this.operationManager = new OperationManager();
    this.notificationManager = new NotificationManager(this.server, this.errorTracker);
    
    // Initialize relay client (WebSocket relay mode only)
    // Force relay mode by setting environment variable
    process.env.USE_WEBSOCKET_RELAY = 'true';
    
    // Initialize with minimal client info, will be updated after MCP initialization
    this.relayClient = new MCPRelayClient({
      // This will be replaced with actual MCP client info after initialization
      type: 'mcp-client',
      name: 'Awaiting MCP Client',
      version: '2.6.0',
      capabilities: ['chrome_tabs', 'debugger', 'claude_automation']
    }, this.operationManager, this.notificationManager);

    this.setupTools();
    this.setupInitializationHandler();
  }

  setupInitializationHandler() {
    // Store original initialization handler if any
    const originalHandler = this.server._oninitialize;
    
    // Override initialization handler to capture client info
    this.server._oninitialize = async (params) => {
      // Call original handler if exists
      let result;
      if (originalHandler) {
        result = await originalHandler.call(this.server, params);
      }
      
      // Log complete initialization params to understand what's being sent
      this.debug.info('=== MCP INITIALIZATION START ===');
      this.debug.info('MCP initialization params received', {
        params: params,
        paramsJSON: JSON.stringify(params, null, 2),
        hasClientInfo: !!params?.params?.clientInfo,
        clientInfoName: params?.params?.clientInfo?.name
      });
      
      // Get client info from initialization params (authoritative source)
      // The handler receives the full request, so clientInfo is at params.params.clientInfo
      const clientInfo = params?.params?.clientInfo;
      
      if (!clientInfo) {
        this.debug.warn('No clientInfo object in initialization params', {
          params: params
        });
      } else if (!clientInfo.name) {
        this.debug.warn('clientInfo exists but has no name', {
          clientInfo: clientInfo
        });
      } else {
        this.debug.info('clientInfo found', {
          clientInfo: clientInfo
        });
      }
      
      // Use exactly what the client provides, no mappings
      const clientName = clientInfo?.name || 'Unknown MCP Client';
      const clientVersion = clientInfo?.version || 'unknown';
      
      this.debug.info('MCP client identified', {
        name: clientName,
        version: clientVersion,
        rawClientInfo: clientInfo
      });
      this.debug.info('=== MCP INITIALIZATION END ===');
      
      // Update relay with the exact client name from initialization
      this.relayClient.updateClientInfo({
        type: 'mcp-client',
        name: clientName,
        version: clientVersion,
        capabilities: ['chrome_tabs', 'debugger', 'claude_automation']
      });
      
      return result;
    };
  }

  setupTools() {
    // Register each tool using modern MCP server.tool() method
    for (const tool of allTools) {
      const handler = getToolHandler(tool.name);
      
      if (!handler) {
        this.debug.warn(`Warning: No handler found for tool: ${tool.name}`);
        continue;
      }

      // Register tool with proper MCP syntax using Zod schema
      this.server.tool(
        tool.name,
        tool.description,
        tool.zodSchema || {},
        async (args, extra) => {
          try {
            // Modern MCP SDK passes args as first parameter
            this.debug.info(`Tool ${tool.name} called with args:`, { args });
            this.debug.info(`Tool ${tool.name} extra context:`, { extra });
            this.debug.info(`Tool ${tool.name} args analysis:`, { 
              argsType: typeof args, 
              argsKeys: Object.keys(args || {}),
              extraType: typeof extra,
              extraKeys: Object.keys(extra || {}),
              argsCount: Object.keys(args || {}).length
            });
            const result = await handler(this, args);
            
            // Convert result to MCP format if needed
            if (result && typeof result === 'object' && !result.content) {
              return {
                content: [
                  {
                    type: 'text',
                    text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                  }
                ]
              };
            }
            
            return result;
          } catch (error) {
            this.errorTracker.logError(error, { tool: tool.name, args });
            throw error;
          }
        }
      );
    }
    
    this.debug.info(`Registered ${allTools.length} tools using modern MCP server.tool() method`);
  }

  async getConnectionHealth() {
    // Get server-side health
    const serverHealth = {
      relayClient: this.relayClient.getConnectionStats(),
      server: {
        uptime: Date.now() - this.startTime,
        operationsCount: this.operationManager.operations.size,
        errorsCount: this.errorTracker.errors ? this.errorTracker.errors.length : 0
      },
      relayMode: true,
      relayConnected: this.relayClient.connected
    };

    // Try to get extension-side health
    let extensionHealth = null;
    try {
      const extensionResult = await this.relayClient.sendRequest('get_connection_health', {});
      if (extensionResult && extensionResult.health) {
        extensionHealth = extensionResult.health;
      }
    } catch (error) {
      console.warn('Failed to get extension health:', error.message);
      extensionHealth = { error: 'Extension health unavailable', message: error.message };
    }

    // Combine both health reports
    const combinedHealth = {
      ...serverHealth,
      extension: extensionHealth
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(combinedHealth, null, 2)
      }]
    };
  }

  async forwardToExtension(toolName, params) {
    const result = await this.relayClient.sendRequest(toolName, params);
    
    if (result.error) {
      throw new Error(result.error);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async waitForOperation(params) {
    const { operationId, timeoutMs = 30000 } = params;
    const operation = await this.operationManager.waitForCompletion(operationId, timeoutMs);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(operation, null, 2)
      }]
    };
  }


  async start() {
    try {
      this.startTime = Date.now();
      
      // Log where the file logger is writing
      this.debug.info('MCP Server logs are being written to:', {
        logDir: `~/.claude-chrome-mcp-logs/mcp-server-${process.pid}.log`
      });
      
      // Load saved operations
      await this.operationManager.loadState();
      
      // Connect relay client
      await this.relayClient.connect();
      
      // Connect to stdio transport
      const transport = new StdioServerTransport();
      
      // Handle transport closure (parent process exit)
      transport.onclose = () => {
        this.debug.info('CCM: Transport closed (parent process likely exited), shutting down gracefully');
        process.exit(0);
      };
      
      // Also monitor stdin end event directly for immediate detection
      process.stdin.on('end', () => {
        this.debug.info('CCM: stdin ended (parent process exited), shutting down');
        process.exit(0);
      });
      
      await this.server.connect(transport);
      
      this.debug.info('ChromeMCPServer started successfully');
    } catch (error) {
      this.debug.error('Failed to start ChromeMCPServer', error);
      throw error;
    }
  }
}

// Main entry point
async function main() {
  try {
    // Set simple process title
    const parentPid = process.ppid;
    const myPid = process.pid;
    process.title = `claude-chrome-mcp[${parentPid}]`;
    
    console.error(`CCM: Started (Parent PID: ${parentPid}, My PID: ${myPid})`);
    
    // MCP-compliant signal handling
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGPIPE', () => process.exit(0));
    
    const server = new ChromeMCPServer();
    await server.start();
    
  } catch (error) {
    console.error('CCM: Fatal error:', error);
    process.exit(1);
  }
}

// Run the server
if (require.main === module) {
  main().catch(error => {
    console.error('CCM: Unhandled error:', error);
    process.exit(1);
  });
}