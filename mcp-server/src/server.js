#!/usr/bin/env node

/**
 * Claude Chrome MCP Server - Modular Architecture
 * 
 * This is the new modular entry point that imports and coordinates
 * all the extracted components for the MCP-Server-as-Hub architecture.
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

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Import modular components
const { ErrorTracker } = require('./utils/error-tracker');
const { DebugMode } = require('./utils/debug-mode');
const { OperationManager } = require('./utils/operation-manager');
const { NotificationManager } = require('./utils/notification-manager');
const { AutoHubClient } = require('./hub/hub-client');

// Import modular tools
const { allTools, getToolHandler, hasHandler } = require('./tools/index');

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
    this.notificationManager = new NotificationManager(this.server, this.errorTracker);
    
    // Initialize relay client (WebSocket relay mode only)
    // Force relay mode by setting environment variable
    process.env.USE_WEBSOCKET_RELAY = 'true';
    
    this.hubClient = new AutoHubClient({
      id: 'claude-chrome-mcp',
      name: 'Claude Chrome MCP',
      type: 'automation_server',
      capabilities: ['chrome_tabs', 'debugger', 'claude_automation']
    }, this.operationManager, this.notificationManager);

    this.setupTools();
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: allTools
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Use dynamic handler lookup
        if (!hasHandler(name)) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const handler = getToolHandler(name);
        return await handler(this, args);
      } catch (error) {
        this.errorTracker.logError(error, { tool: name, args });
        throw error;
      }
    });
  }

  async getConnectionHealth() {
    const health = {
      hubClient: this.hubClient.getConnectionStats(),
      server: {
        uptime: Date.now() - this.startTime,
        operationsCount: this.operationManager.operations.size,
        errorsCount: this.errorTracker.errors ? this.errorTracker.errors.length : 0
      },
      relayMode: true,
      relayConnected: this.hubClient.connected
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(health, null, 2)
      }]
    };
  }

  async forwardToExtension(toolName, params) {
    const result = await this.hubClient.sendRequest(toolName, params);
    
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

  async executeWorkflowTemplate(params) {
    // Workflow implementation placeholder
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Workflow template execution not yet implemented',
          params
        }, null, 2)
      }]
    };
  }

  async listWorkflowTemplates() {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          templates: []
        }, null, 2)
      }]
    };
  }

  async createWorkflowTemplate(params) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Workflow template creation not yet implemented',
          params
        }, null, 2)
      }]
    };
  }

  async executeWorkflowOrchestration(params) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Workflow orchestration not yet implemented',
          params
        }, null, 2)
      }]
    };
  }

  async createWorkflowOrchestration(params) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Workflow orchestration creation not yet implemented',
          params
        }, null, 2)
      }]
    };
  }

  async listWorkflowOrchestrations() {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          orchestrations: []
        }, null, 2)
      }]
    };
  }

  async saveWorkflowState(params) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Workflow state saving not yet implemented',
          params
        }, null, 2)
      }]
    };
  }

  async loadWorkflowState(params) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Workflow state loading not yet implemented',
          params
        }, null, 2)
      }]
    };
  }

  async listWorkflowStates(params) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          states: []
        }, null, 2)
      }]
    };
  }

  async deleteWorkflowState(params) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Workflow state deletion not yet implemented',
          params
        }, null, 2)
      }]
    };
  }

  async start() {
    try {
      this.startTime = Date.now();
      
      // Load saved operations
      await this.operationManager.loadState();
      
      // Connect hub client
      await this.hubClient.connect();
      
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
    // Set process title to identify which tool spawned this server
    const spawner = process.env.MCP_SPAWNER || process.argv[2] || 'unknown';
    const parentPid = process.ppid; // Get parent process ID
    const myPid = process.pid;
    
    // Create detailed process title with spawner and parent PID
    process.title = `claude-chrome-mcp[${spawner}:${parentPid}]`;
    
    // Log spawner info to stderr for debugging
    console.error(`CCM: Started by ${spawner} (Parent PID: ${parentPid}, My PID: ${myPid})`);
    console.error(`CCM: Process title set to: ${process.title}`);
    
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