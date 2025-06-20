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

// CRITICAL: Load config first before any other modules
const config = require('./config');

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import modular components
const { ErrorTracker } = require('./utils/error-tracker');
const { createLogger } = require('./utils/logger');
const { MCPOperationManager } = require('./utils/mcp-operation-manager');
const { ResourceStateManager } = require('./utils/resource-state-manager');
const { MCPNotificationManager } = require('./utils/mcp-notification-manager');
const { MCPRelayClient } = require('./relay/mcp-relay-client');
const { formatMCPResponse } = require('./utils/response-formatter');

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
      version: config.VERSION
    }, {
      capabilities: {
        tools: {},
        logging: {}  // Enable logging capabilities for notifications/message
      }
    });

    // Initialize utility modules
    this.errorTracker = new ErrorTracker();
    this.debug = createLogger('ChromeMCPServer');
    this.operationManager = new MCPOperationManager();
    this.resourceStateManager = new ResourceStateManager();
    this.notificationManager = new MCPNotificationManager(this.server, this.errorTracker);
    
    // Initialize relay client  
    this.relayClient = null;
    this.clientInfo = null;
    
    const originalOnInitialize = this.server.server._oninitialize.bind(this.server.server);
    this.server.server._oninitialize = async (request) => {
      // Call original handler first
      const result = await originalOnInitialize(request);
      
      // Extract client name from initialization
      const clientInfo = request.params.clientInfo;
      const clientName = process.env.CCM_CLIENT_NAME || clientInfo.name || 'Claude Chrome MCP';
      const clientVersion = clientInfo.version || config.VERSION;
      
      // Check version compatibility
      if (clientVersion && !config.isVersionCompatible(clientVersion)) {
        this.debug.warn('Client version mismatch', {
          clientVersion,
          serverVersion: config.VERSION,
          message: config.getVersionMismatchMessage('MCP Client', clientVersion)
        });
      }
      
      this.clientInfo = {
        type: 'mcp-client',
        name: clientName,
        version: clientVersion,
        capabilities: ['chrome_tabs', 'debugger', 'claude_automation']
      };
      
      // Start relay connection after initialization is complete
      this.startRelay(this.clientInfo);
      
      return result;
    };

    this.setupTools();
  }

  startRelay(clientInfo) {
    this.relayClient = new MCPRelayClient(
      clientInfo,
      this.operationManager,
      this.notificationManager
    );
    
    // Start relay connection asynchronously (don't await)
    this.relayClient.connect().catch(error => {
      this.debug.error('Failed to connect relay', error);
    });
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
    const relayStats = this.relayClient ? this.relayClient.getConnectionStats() : { status: 'not_initialized' };
    const serverHealth = {
      relayClient: relayStats,
      server: {
        uptime: Date.now() - this.startTime,
        operationsCount: this.operationManager.operations.size,
        errorsCount: this.errorTracker.errors ? this.errorTracker.errors.length : 0,
        role: relayStats.isRelayHost ? 'RELAY HOST' : 'relay client'
      },
      relayMode: true,
      relayConnected: this.relayClient ? this.relayClient.connected : false
    };
    
    // Try to fetch relay health from endpoint
    let relayHealth = null;
    try {
      const response = await fetch(config.RELAY_URLS.health());
      if (response.ok) {
        relayHealth = await response.json();
      }
    } catch (error) {
      // Relay health endpoint not available
      this.debug.debug('Could not fetch relay health', { error: error.message });
    }

    // Try to get extension-side health
    let extensionHealth = null;
    if (this.relayClient) {
      try {
        const extensionResult = await this.relayClient.sendRequest('system_health', {});
        if (extensionResult && extensionResult.health) {
          extensionHealth = extensionResult.health;
        }
      } catch (error) {
        this.debug.warn('Failed to get extension health', { error: error.message });
        extensionHealth = { error: 'Extension health unavailable', message: error.message };
      }
    } else {
      extensionHealth = { error: 'Relay client not initialized' };
    }

    // Combine both health reports
    const combinedHealth = {
      ...serverHealth,
      extension: extensionHealth,
      relay: relayHealth
    };

    return formatMCPResponse(combinedHealth);
  }

  async waitForRelayConnection(timeoutMs = 10000) {
    if (!this.relayClient) {
      throw new Error('Relay client not initialized');
    }
    
    // If already connected, return immediately
    if (this.relayClient.connected) {
      return;
    }
    
    // Wait for connection with timeout
    const startTime = Date.now();
    while (!this.relayClient.connected) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Relay connection timeout after ${timeoutMs}ms`);
      }
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, config.POLL_INTERVAL_MS));
    }
  }

  async forwardToExtension(toolName, params) {
    if (!this.relayClient) {
      throw new Error('Relay client not initialized. MCP client must connect first.');
    }
    
    // Wait for relay connection if not ready yet
    await this.waitForRelayConnection();
    
    const result = await this.relayClient.sendRequest(toolName, params);
    
    if (result.error) {
      throw new Error(result.error);
    }

    return formatMCPResponse(result);
  }

  /**
   * Forward to extension with automatic resource state sync
   * @param {string} toolName - Extension tool to call
   * @param {Object} params - Tool parameters
   * @param {Function} syncHandler - (response, server, params) => void - Called on success to sync state
   * @returns {Object} Formatted result
   */
  async forwardWithResourceSync(toolName, params, syncHandler) {
    try {
      // Forward to extension for actual operation
      const result = await this.forwardToExtension(toolName, params);
      
      // Parse the extension response
      const extensionResponse = JSON.parse(result.content[0].text);
      
      if (extensionResponse.success && syncHandler) {
        // Call sync handler to update resource state
        syncHandler(extensionResponse, this, params);
      }
      
      return result;
    } catch (error) {
      this.debug.warn(`Failed to sync resource state for ${toolName}`, { 
        params, 
        error: error.message 
      });
      throw error;
    }
  }

  async waitForOperation(params) {
    const { operationId, timeoutMs = config.DEFAULT_TIMEOUT } = params;
    const operation = await this.operationManager.waitForCompletion(operationId, timeoutMs);
    
    return formatMCPResponse(operation);
  }


  async start() {
    try {
      this.startTime = Date.now();
      
      // Log where the file logger is writing
      this.debug.info('MCP Server logs are being written to:', {
        logDir: `~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-${process.pid}.log`
      });
      
      // Load saved operations
      await this.operationManager.loadState();
      
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
      
      this.debug.info('ChromeMCPServer started successfully, waiting for client initialization...');
    } catch (error) {
      this.debug.error('Failed to start ChromeMCPServer', error);
      throw error;
    }
  }
}

// Create main logger for module-level logging
const mainLogger = require('./utils/logger').createLogger('Main');

// Main entry point
async function main() {
  try {
    // Set simple process title
    const parentPid = process.ppid;
    const myPid = process.pid;
    process.title = `claude-chrome-mcp[${parentPid}]`;
    
    mainLogger.info('CCM Server started', { parentPid, myPid });
    
    // MCP-compliant signal handling
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGPIPE', () => process.exit(0));
    
    const server = new ChromeMCPServer();
    await server.start();
    
  } catch (error) {
    mainLogger.error('CCM: Fatal error', error);
    process.exit(1);
  }
}

// Run the server
if (require.main === module) {
  main().catch(error => {
    mainLogger.error('CCM: Unhandled error', error);
    process.exit(1);
  });
}