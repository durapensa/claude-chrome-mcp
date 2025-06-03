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
    this.notificationManager = new NotificationManager(this.server, this.errorTracker);
    
    // Initialize hub client for multi-server coordination
    this.hubClient = new AutoHubClient({
      id: 'claude-chrome-mcp',
      name: 'Claude Chrome MCP',
      type: 'automation_server',
      capabilities: ['chrome_tabs', 'debugger', 'claude_automation']
    }, this.operationManager, this.notificationManager);

    // Initialize multi-hub manager for distributed coordination
    this.multiHubManager = new MultiHubManager(this.hubClient);
    
    // Set up simplified hub failover - MultiHubManager handles connection loss
    this.hubClient.on('connection_lost', () => {
      this.multiHubManager.onHubConnectionLost();
    });

    this.setupTools();
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
        },
        {
          name: 'execute_workflow_template',
          description: 'Execute a predefined workflow template with given parameters',
          inputSchema: {
            type: 'object',
            properties: {
              templateName: {
                type: 'string',
                description: 'Name of the workflow template to execute'
              },
              parameters: {
                type: 'object',
                description: 'Parameters to pass to the workflow template',
                additionalProperties: true
              },
              async: {
                type: 'boolean',
                description: 'Whether to execute workflow asynchronously',
                default: true
              }
            },
            required: ['templateName'],
            additionalProperties: false
          }
        },
        {
          name: 'list_workflow_templates',
          description: 'List all available workflow templates',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },
        {
          name: 'create_workflow_template',
          description: 'Create a new workflow template with steps and configuration',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Unique name for the workflow template'
              },
              description: {
                type: 'string',
                description: 'Description of what this workflow does'
              },
              steps: {
                type: 'array',
                description: 'Array of workflow steps to execute',
                items: {
                  type: 'object',
                  properties: {
                    tool: {
                      type: 'string',
                      description: 'MCP tool name to execute'
                    },
                    parameters: {
                      type: 'object',
                      description: 'Parameters for the tool',
                      additionalProperties: true
                    },
                    condition: {
                      type: 'string',
                      description: 'Optional condition to execute this step'
                    }
                  },
                  required: ['tool', 'parameters']
                }
              },
              errorHandling: {
                type: 'object',
                description: 'Error handling configuration',
                properties: {
                  retryAttempts: {
                    type: 'number',
                    default: 0,
                    description: 'Number of retry attempts for failed steps'
                  },
                  continueOnError: {
                    type: 'boolean',
                    default: false,
                    description: 'Whether to continue workflow execution on step failure'
                  },
                  retryDelay: {
                    type: 'number',
                    default: 1000,
                    description: 'Initial delay between retries in milliseconds'
                  },
                  exponentialBackoff: {
                    type: 'boolean',
                    default: true,
                    description: 'Use exponential backoff for retry delays'
                  },
                  maxRetryDelay: {
                    type: 'number',
                    default: 30000,
                    description: 'Maximum retry delay in milliseconds'
                  },
                  retryOnErrors: {
                    type: 'array',
                    description: 'Specific error types to retry on',
                    items: {
                      type: 'string'
                    },
                    default: ['timeout', 'network', 'temporary']
                  }
                }
              }
            },
            required: ['name', 'description', 'steps'],
            additionalProperties: false
          }
        },
        {
          name: 'execute_workflow_orchestration',
          description: 'Execute a complex workflow orchestration with conditional branching and parallel execution',
          inputSchema: {
            type: 'object',
            properties: {
              orchestrationConfig: {
                type: 'object',
                description: 'Workflow orchestration configuration',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Name of the orchestration'
                  },
                  parallel: {
                    type: 'boolean',
                    description: 'Execute steps in parallel where possible',
                    default: false
                  },
                  branches: {
                    type: 'array',
                    description: 'Conditional workflow branches',
                    items: {
                      type: 'object',
                      properties: {
                        condition: {
                          type: 'string',
                          description: 'JavaScript condition to evaluate'
                        },
                        steps: {
                          type: 'array',
                          description: 'Steps to execute if condition is true'
                        }
                      }
                    }
                  },
                  persistence: {
                    type: 'object',
                    description: 'State persistence configuration',
                    properties: {
                      enabled: {
                        type: 'boolean',
                        default: true
                      },
                      stateKey: {
                        type: 'string',
                        description: 'Key to store/retrieve workflow state'
                      }
                    }
                  }
                },
                required: ['name']
              },
              parameters: {
                type: 'object',
                description: 'Initial parameters for the orchestration',
                additionalProperties: true
              }
            },
            required: ['orchestrationConfig'],
            additionalProperties: false
          }
        },
        {
          name: 'create_workflow_orchestration',
          description: 'Create a new workflow orchestration configuration',
          inputSchema: {
            type: 'object',
            properties: {
              config: {
                type: 'string',
                description: 'JSON or YAML configuration for the workflow orchestration'
              },
              format: {
                type: 'string',
                enum: ['json', 'yaml'],
                description: 'Configuration format',
                default: 'json'
              }
            },
            required: ['config'],
            additionalProperties: false
          }
        },
        {
          name: 'list_workflow_orchestrations',
          description: 'List all available workflow orchestrations',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },
        {
          name: 'save_workflow_state',
          description: 'Save workflow state for later resumption',
          inputSchema: {
            type: 'object',
            properties: {
              stateKey: {
                type: 'string',
                description: 'Unique key to identify the workflow state'
              },
              state: {
                type: 'object',
                description: 'Workflow state data to save',
                additionalProperties: true
              },
              metadata: {
                type: 'object',
                description: 'Optional metadata about the workflow state',
                properties: {
                  workflowName: {
                    type: 'string'
                  },
                  stepIndex: {
                    type: 'number'
                  },
                  description: {
                    type: 'string'
                  }
                }
              }
            },
            required: ['stateKey', 'state'],
            additionalProperties: false
          }
        },
        {
          name: 'load_workflow_state',
          description: 'Load previously saved workflow state',
          inputSchema: {
            type: 'object',
            properties: {
              stateKey: {
                type: 'string',
                description: 'Key of the workflow state to load'
              }
            },
            required: ['stateKey'],
            additionalProperties: false
          }
        },
        {
          name: 'list_workflow_states',
          description: 'List all saved workflow states',
          inputSchema: {
            type: 'object',
            properties: {
              workflowName: {
                type: 'string',
                description: 'Filter by workflow name'
              }
            },
            additionalProperties: false
          }
        },
        {
          name: 'delete_workflow_state',
          description: 'Delete a saved workflow state',
          inputSchema: {
            type: 'object',
            properties: {
              stateKey: {
                type: 'string',
                description: 'Key of the workflow state to delete'
              }
            },
            required: ['stateKey'],
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
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_connection_health':
            return await this.getConnectionHealth();

          case 'spawn_claude_dot_ai_tab':
            return await this.forwardToExtension('spawn_claude_dot_ai_tab', args);

          case 'send_message_async':
            return await this.forwardToExtension('send_message_async', args);

          case 'get_claude_dot_ai_response':
            return await this.forwardToExtension('get_claude_dot_ai_response', args);

          case 'forward_response_to_claude_dot_ai_tab':
            return await this.forwardToExtension('forward_response_to_claude_dot_ai_tab', args);

          case 'wait_for_operation':
            return await this.waitForOperation(args);

          case 'execute_workflow_template':
            return await this.executeWorkflowTemplate(args);

          case 'list_workflow_templates':
            return await this.listWorkflowTemplates();

          case 'create_workflow_template':
            return await this.createWorkflowTemplate(args);

          case 'execute_workflow_orchestration':
            return await this.executeWorkflowOrchestration(args);

          case 'create_workflow_orchestration':
            return await this.createWorkflowOrchestration(args);

          case 'list_workflow_orchestrations':
            return await this.listWorkflowOrchestrations();

          case 'save_workflow_state':
            return await this.saveWorkflowState(args);

          case 'load_workflow_state':
            return await this.loadWorkflowState(args);

          case 'list_workflow_states':
            return await this.listWorkflowStates(args);

          case 'delete_workflow_state':
            return await this.deleteWorkflowState(args);

          case 'reload_extension':
            return await this.forwardToExtension('reload_extension', args);

          case 'start_network_inspection':
            return await this.forwardToExtension('start_network_inspection', args);

          case 'stop_network_inspection':
            return await this.forwardToExtension('stop_network_inspection', args);

          case 'get_captured_requests':
            return await this.forwardToExtension('get_captured_requests', args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
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
      multiHub: this.multiHubManager.getHubStatus()
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
      
      // Multi-hub coordination starts automatically in constructor
      
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