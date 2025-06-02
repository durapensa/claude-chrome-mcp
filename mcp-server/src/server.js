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
    
    // Initialize workflow template storage
    this.workflowTemplates = new Map();
    this.workflowOrchestrations = new Map();
    this.workflowStates = new Map();
    
    this.setupMCPHandlers();
    this.setupLifecycleIntegration();
    this.initializeBuiltInTemplates();
    
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
          case 'execute_workflow_template':
            return await this.handleExecuteWorkflowTemplate(args);
          case 'list_workflow_templates':
            return await this.handleListWorkflowTemplates(args);
          case 'create_workflow_template':
            return await this.handleCreateWorkflowTemplate(args);
          case 'execute_workflow_orchestration':
            return await this.handleExecuteWorkflowOrchestration(args);
          case 'create_workflow_orchestration':
            return await this.handleCreateWorkflowOrchestration(args);
          case 'list_workflow_orchestrations':
            return await this.handleListWorkflowOrchestrations(args);
          case 'save_workflow_state':
            return await this.handleSaveWorkflowState(args);
          case 'load_workflow_state':
            return await this.handleLoadWorkflowState(args);
          case 'list_workflow_states':
            return await this.handleListWorkflowStates(args);
          case 'delete_workflow_state':
            return await this.handleDeleteWorkflowState(args);
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

  // ============================================================================
  // Workflow Template Management
  // ============================================================================

  initializeBuiltInTemplates() {
    // Research workflow template
    this.workflowTemplates.set('research-workflow', {
      name: 'research-workflow',
      description: 'Multi-Claude research workflow with cross-instance comparison',
      steps: [
        {
          tool: 'spawn_claude_dot_ai_tab',
          parameters: { injectContentScript: true, waitForLoad: false }
        },
        {
          tool: 'send_message_async',
          parameters: { message: '${query}', tabId: '${tabId1}' }
        },
        {
          tool: 'spawn_claude_dot_ai_tab',
          parameters: { injectContentScript: true, waitForLoad: false }
        },
        {
          tool: 'send_message_async',
          parameters: { message: '${query}', tabId: '${tabId2}' }
        },
        {
          tool: 'get_claude_dot_ai_response',
          parameters: { tabId: '${tabId1}' }
        },
        {
          tool: 'get_claude_dot_ai_response',
          parameters: { tabId: '${tabId2}' }
        }
      ],
      errorHandling: {
        retryAttempts: 2,
        continueOnError: false,
        retryDelay: 1000,
        exponentialBackoff: true,
        maxRetryDelay: 10000,
        retryOnErrors: ['timeout', 'network', 'connection_failed']
      }
    });

    // A/B testing template
    this.workflowTemplates.set('ab-test-workflow', {
      name: 'ab-test-workflow',
      description: 'A/B testing automation with cross-instance comparison',
      steps: [
        {
          tool: 'spawn_claude_dot_ai_tab',
          parameters: { injectContentScript: true }
        },
        {
          tool: 'send_message_async',
          parameters: { message: '${promptA}', tabId: '${tabId1}' }
        },
        {
          tool: 'spawn_claude_dot_ai_tab',
          parameters: { injectContentScript: true }
        },
        {
          tool: 'send_message_async',
          parameters: { message: '${promptB}', tabId: '${tabId2}' }
        },
        {
          tool: 'forward_response_to_claude_dot_ai_tab',
          parameters: {
            sourceTabId: '${tabId1}',
            targetTabId: '${tabId2}',
            transformTemplate: 'Compare this with your previous response: ${response}'
          }
        }
      ],
      errorHandling: {
        retryAttempts: 3,
        continueOnError: true,
        retryDelay: 2000,
        exponentialBackoff: true,
        maxRetryDelay: 15000,
        retryOnErrors: ['timeout', 'network', 'rate_limit', 'temporary']
      }
    });

    // Content generation pipeline
    this.workflowTemplates.set('content-pipeline', {
      name: 'content-pipeline',
      description: 'Content generation pipeline with validation stages',
      steps: [
        {
          tool: 'spawn_claude_dot_ai_tab',
          parameters: { injectContentScript: true }
        },
        {
          tool: 'send_message_async',
          parameters: { message: 'Generate ${contentType}: ${topic}', tabId: '${generatorTab}' }
        },
        {
          tool: 'spawn_claude_dot_ai_tab',
          parameters: { injectContentScript: true }
        },
        {
          tool: 'forward_response_to_claude_dot_ai_tab',
          parameters: {
            sourceTabId: '${generatorTab}',
            targetTabId: '${reviewerTab}',
            transformTemplate: 'Review and provide feedback on this content: ${response}'
          }
        }
      ],
      errorHandling: {
        retryAttempts: 2,
        continueOnError: false,
        retryDelay: 1500,
        exponentialBackoff: true,
        maxRetryDelay: 12000,
        retryOnErrors: ['timeout', 'network', 'validation_failed', 'temporary']
      }
    });
  }

  async handleExecuteWorkflowTemplate(args) {
    const { templateName, parameters = {}, async: isAsync = true } = args;
    const operationId = this.operationManager.createOperation('execute_workflow_template', args);

    try {
      const template = this.workflowTemplates.get(templateName);
      if (!template) {
        throw new Error(`Workflow template '${templateName}' not found`);
      }

      this.debug.info(`Executing workflow template: ${templateName}`, { parameters, isAsync });

      if (isAsync) {
        // Execute workflow asynchronously
        this.executeWorkflowAsync(template, parameters, operationId);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              operationId,
              status: 'started',
              template: templateName,
              message: 'Workflow started asynchronously. Use get_claude_dot_ai_response or wait_for_operation to check progress.'
            }, null, 2)
          }]
        };
      } else {
        // Execute workflow synchronously
        const result = await this.executeWorkflowSync(template, parameters);
        this.operationManager.updateOperation(operationId, 'completed', result);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }
    } catch (error) {
      this.operationManager.updateOperation(operationId, 'failed', { error: error.message });
      throw error;
    }
  }

  async handleListWorkflowTemplates(args) {
    const templates = Array.from(this.workflowTemplates.values()).map(template => ({
      name: template.name,
      description: template.description,
      stepCount: template.steps.length,
      errorHandling: template.errorHandling
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          templates,
          count: templates.length
        }, null, 2)
      }]
    };
  }

  async handleCreateWorkflowTemplate(args) {
    const { name, description, steps, errorHandling } = args;

    // Validate template
    if (this.workflowTemplates.has(name)) {
      throw new Error(`Workflow template '${name}' already exists`);
    }

    // Validate steps
    for (const step of steps) {
      if (!this.isValidTool(step.tool)) {
        throw new Error(`Invalid tool in workflow step: ${step.tool}`);
      }
    }

    const template = {
      name,
      description,
      steps,
      errorHandling: errorHandling || { retryAttempts: 0, continueOnError: false },
      createdAt: Date.now()
    };

    this.workflowTemplates.set(name, template);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: `Workflow template '${name}' created successfully`,
          template
        }, null, 2)
      }]
    };
  }

  async executeWorkflowAsync(template, parameters, operationId) {
    try {
      this.operationManager.updateOperation(operationId, 'in_progress', { step: 0, totalSteps: template.steps.length });
      
      const context = { ...parameters };
      const results = [];

      for (let i = 0; i < template.steps.length; i++) {
        const step = template.steps[i];
        
        this.operationManager.updateOperation(operationId, 'in_progress', { 
          step: i + 1, 
          totalSteps: template.steps.length,
          currentStep: step.tool
        });

        try {
          const resolvedParams = this.resolveParameterTemplate(step.parameters, context);
          const result = await this.executeStepWithRetry(step.tool, resolvedParams, template.errorHandling);
          
          // Update context with result
          context[`step${i}_result`] = result;
          if (result.tabId) context[`tabId${i + 1}`] = result.tabId;
          
          results.push({ step: i + 1, tool: step.tool, result });

          // Save checkpoint after successful step
          const checkpointKey = `${operationId}_checkpoint_${i + 1}`;
          await this.saveWorkflowCheckpoint(checkpointKey, template.name, i + 1, context, results);
          
        } catch (error) {
          if (!template.errorHandling.continueOnError) {
            throw error;
          }
          results.push({ step: i + 1, tool: step.tool, error: error.message, retries: error.retryCount || 0 });
        }
      }

      this.operationManager.updateOperation(operationId, 'completed', { results, context });
      
    } catch (error) {
      this.operationManager.updateOperation(operationId, 'failed', { error: error.message });
    }
  }

  async executeWorkflowSync(template, parameters) {
    const context = { ...parameters };
    const results = [];

    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      
      try {
        const resolvedParams = this.resolveParameterTemplate(step.parameters, context);
        const result = await this.executeStepWithRetry(step.tool, resolvedParams, template.errorHandling);
        
        // Update context with result
        context[`step${i}_result`] = result;
        if (result.tabId) context[`tabId${i + 1}`] = result.tabId;
        
        results.push({ step: i + 1, tool: step.tool, result });

        // Save checkpoint after successful step (sync mode)
        const checkpointKey = `sync_${template.name}_checkpoint_${i + 1}_${Date.now()}`;
        await this.saveWorkflowCheckpoint(checkpointKey, template.name, i + 1, context, results);
        
      } catch (error) {
        if (!template.errorHandling.continueOnError) {
          throw error;
        }
        results.push({ step: i + 1, tool: step.tool, error: error.message, retries: error.retryCount || 0 });
      }
    }

    return { results, context };
  }

  resolveParameterTemplate(parameters, context) {
    const resolved = {};
    
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.includes('${')) {
        resolved[key] = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          return context[varName] || match;
        });
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }

  async executeToolCall(toolName, parameters) {
    // Map tool names to handler methods
    switch (toolName) {
      case 'spawn_claude_dot_ai_tab':
        return await this.handleSpawnTab(parameters);
      case 'send_message_async':
        return await this.handleSendMessageAsync(parameters);
      case 'get_claude_dot_ai_response':
        return await this.handleGetResponse(parameters);
      case 'forward_response_to_claude_dot_ai_tab':
        return await this.handleForwardResponse(parameters);
      case 'get_connection_health':
        return await this.handleGetConnectionHealth(parameters);
      default:
        throw new Error(`Tool '${toolName}' not supported in workflows`);
    }
  }

  async executeStepWithRetry(toolName, parameters, errorHandling) {
    const maxAttempts = (errorHandling?.retryAttempts || 0) + 1;
    const baseDelay = errorHandling?.retryDelay || 1000;
    const useExponentialBackoff = errorHandling?.exponentialBackoff !== false;
    const maxDelay = errorHandling?.maxRetryDelay || 30000;
    const retryOnErrors = errorHandling?.retryOnErrors || ['timeout', 'network', 'temporary'];

    let lastError;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        this.debug.verbose(`Executing ${toolName} (attempt ${attempt + 1}/${maxAttempts})`, parameters);
        const result = await this.executeToolCall(toolName, parameters);
        
        if (attempt > 0) {
          this.debug.info(`Step succeeded after ${attempt} retries: ${toolName}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        attempt++;
        
        // Check if we should retry this error
        const shouldRetry = this.shouldRetryError(error, retryOnErrors);
        
        if (attempt >= maxAttempts || !shouldRetry) {
          this.debug.error(`Step failed after ${attempt} attempts: ${toolName}`, error);
          // Add retry count to error for reporting
          error.retryCount = attempt - 1;
          throw error;
        }

        // Calculate delay for next retry
        const delay = this.calculateRetryDelay(attempt - 1, baseDelay, useExponentialBackoff, maxDelay);
        
        this.debug.warn(`Step failed, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts}): ${toolName}`, {
          error: error.message,
          nextAttempt: attempt + 1
        });

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // This should never be reached, but just in case
    throw lastError;
  }

  shouldRetryError(error, retryOnErrors) {
    if (!retryOnErrors || retryOnErrors.length === 0) {
      return true; // Retry all errors if no specific types specified
    }

    const errorMessage = error.message.toLowerCase();
    
    return retryOnErrors.some(errorType => {
      switch (errorType) {
        case 'timeout':
          return errorMessage.includes('timeout') || errorMessage.includes('timed out');
        case 'network':
          return errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('econnreset');
        case 'rate_limit':
          return errorMessage.includes('rate limit') || errorMessage.includes('too many requests');
        case 'temporary':
          return errorMessage.includes('temporary') || errorMessage.includes('unavailable') || errorMessage.includes('503');
        case 'connection_failed':
          return errorMessage.includes('connection failed') || errorMessage.includes('enotfound') || errorMessage.includes('econnrefused');
        case 'validation_failed':
          return errorMessage.includes('validation') || errorMessage.includes('invalid response');
        default:
          return errorMessage.includes(errorType);
      }
    });
  }

  calculateRetryDelay(attemptNumber, baseDelay, useExponentialBackoff, maxDelay) {
    if (!useExponentialBackoff) {
      return Math.min(baseDelay, maxDelay);
    }

    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);
    const jitter = Math.random() * 0.1 * exponentialDelay; // Add up to 10% jitter
    const delayWithJitter = exponentialDelay + jitter;
    
    return Math.min(delayWithJitter, maxDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isValidTool(toolName) {
    const validTools = [
      'spawn_claude_dot_ai_tab',
      'send_message_async', 
      'get_claude_dot_ai_response',
      'forward_response_to_claude_dot_ai_tab',
      'get_connection_health'
    ];
    return validTools.includes(toolName);
  }

  // ============================================================================
  // Workflow Orchestration Engine
  // ============================================================================

  async handleExecuteWorkflowOrchestration(args) {
    const { orchestrationConfig, parameters = {} } = args;
    const operationId = this.operationManager.createOperation('execute_workflow_orchestration', args);

    try {
      this.debug.info(`Executing workflow orchestration: ${orchestrationConfig.name}`, { parameters });

      // Load or restore state if persistence is enabled
      let workflowState = { ...parameters };
      if (orchestrationConfig.persistence?.enabled && orchestrationConfig.persistence.stateKey) {
        const savedState = this.workflowStates.get(orchestrationConfig.persistence.stateKey);
        if (savedState) {
          workflowState = { ...savedState, ...parameters };
          this.debug.info(`Restored workflow state for key: ${orchestrationConfig.persistence.stateKey}`);
        }
      }

      const result = await this.executeOrchestration(orchestrationConfig, workflowState, operationId);
      
      // Save state if persistence is enabled
      if (orchestrationConfig.persistence?.enabled && orchestrationConfig.persistence.stateKey) {
        this.workflowStates.set(orchestrationConfig.persistence.stateKey, result.finalState);
      }

      this.operationManager.updateOperation(operationId, 'completed', result);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      this.operationManager.updateOperation(operationId, 'failed', { error: error.message });
      throw error;
    }
  }

  async handleCreateWorkflowOrchestration(args) {
    const { config, format = 'json' } = args;

    try {
      let orchestrationConfig;
      
      if (format === 'yaml') {
        // For this implementation, we'll expect JSON for now
        // In a full implementation, you'd use a YAML parser like js-yaml
        throw new Error('YAML format not yet implemented. Please use JSON format.');
      } else {
        orchestrationConfig = JSON.parse(config);
      }

      // Validate orchestration config
      if (!orchestrationConfig.name) {
        throw new Error('Orchestration config must have a name');
      }

      if (this.workflowOrchestrations.has(orchestrationConfig.name)) {
        throw new Error(`Workflow orchestration '${orchestrationConfig.name}' already exists`);
      }

      // Add metadata
      orchestrationConfig.createdAt = Date.now();
      orchestrationConfig.format = format;

      this.workflowOrchestrations.set(orchestrationConfig.name, orchestrationConfig);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `Workflow orchestration '${orchestrationConfig.name}' created successfully`,
            orchestration: orchestrationConfig
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create workflow orchestration: ${error.message}`);
    }
  }

  async handleListWorkflowOrchestrations(args) {
    const orchestrations = Array.from(this.workflowOrchestrations.values()).map(orch => ({
      name: orch.name,
      description: orch.description || 'No description',
      parallel: orch.parallel || false,
      branchCount: orch.branches?.length || 0,
      persistenceEnabled: orch.persistence?.enabled || false,
      createdAt: orch.createdAt
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          orchestrations,
          count: orchestrations.length
        }, null, 2)
      }]
    };
  }

  async executeOrchestration(config, initialState, operationId) {
    const context = { ...initialState };
    const results = [];
    let currentStep = 0;

    this.operationManager.updateOperation(operationId, 'in_progress', { 
      step: currentStep, 
      phase: 'initialization',
      orchestration: config.name
    });

    // Execute main workflow branches
    if (config.branches && config.branches.length > 0) {
      for (const branch of config.branches) {
        currentStep++;
        
        this.operationManager.updateOperation(operationId, 'in_progress', { 
          step: currentStep, 
          totalBranches: config.branches.length,
          phase: 'evaluating_condition',
          condition: branch.condition
        });

        // Evaluate branch condition
        const shouldExecute = this.evaluateCondition(branch.condition, context);
        
        if (shouldExecute) {
          this.operationManager.updateOperation(operationId, 'in_progress', { 
            step: currentStep, 
            phase: 'executing_branch',
            stepCount: branch.steps?.length || 0
          });

          if (config.parallel && branch.steps?.length > 1) {
            // Execute steps in parallel
            const parallelResults = await Promise.allSettled(
              branch.steps.map(step => this.executeOrchestrationStep(step, context, config.errorHandling))
            );
            
            parallelResults.forEach((result, index) => {
              if (result.status === 'fulfilled') {
                results.push({ branch: currentStep, step: index + 1, result: result.value });
                // Update context with results
                Object.assign(context, result.value.context || {});
              } else {
                results.push({ branch: currentStep, step: index + 1, error: result.reason.message });
              }
            });
          } else {
            // Execute steps sequentially
            if (branch.steps) {
              for (let stepIndex = 0; stepIndex < branch.steps.length; stepIndex++) {
                const step = branch.steps[stepIndex];
                try {
                  const stepResult = await this.executeOrchestrationStep(step, context, config.errorHandling);
                  results.push({ branch: currentStep, step: stepIndex + 1, result: stepResult });
                  
                  // Update context with step results
                  Object.assign(context, stepResult.context || {});
                  if (stepResult.tabId) context[`branch${currentStep}_step${stepIndex + 1}_tabId`] = stepResult.tabId;
                  
                } catch (error) {
                  results.push({ branch: currentStep, step: stepIndex + 1, error: error.message, retries: error.retryCount || 0 });
                  
                  // Check if we should continue on error
                  if (!config.errorHandling?.continueOnError) {
                    throw error;
                  }
                }
              }
            }
          }
        } else {
          results.push({ 
            branch: currentStep, 
            skipped: true, 
            reason: `Condition '${branch.condition}' evaluated to false` 
          });
        }
      }
    }

    return {
      orchestration: config.name,
      results,
      finalState: context,
      executedAt: Date.now()
    };
  }

  async executeOrchestrationStep(step, context, errorHandling = {}) {
    // Resolve parameter templates
    const resolvedParams = this.resolveParameterTemplate(step.parameters || {}, context);
    
    // Execute the tool with retry logic
    const result = await this.executeStepWithRetry(step.tool, resolvedParams, errorHandling);
    
    return {
      tool: step.tool,
      parameters: resolvedParams,
      result,
      context: result
    };
  }

  evaluateCondition(condition, context) {
    if (!condition) return true;
    
    try {
      // Simple condition evaluation - in production, use a safer evaluator
      // This is a basic implementation for demonstration
      const func = new Function('context', `with(context) { return ${condition}; }`);
      return func(context);
    } catch (error) {
      this.debug.warn(`Condition evaluation failed: ${condition}`, error);
      return false;
    }
  }

  // ============================================================================
  // Workflow State Persistence
  // ============================================================================

  async handleSaveWorkflowState(args) {
    const { stateKey, state, metadata = {} } = args;

    try {
      const stateRecord = {
        key: stateKey,
        state,
        metadata: {
          ...metadata,
          savedAt: Date.now(),
          version: '1.0'
        }
      };

      this.workflowStates.set(stateKey, stateRecord);

      this.debug.info(`Workflow state saved: ${stateKey}`, { metadata });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `Workflow state saved successfully`,
            stateKey,
            savedAt: stateRecord.metadata.savedAt,
            metadata: stateRecord.metadata
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to save workflow state: ${error.message}`);
    }
  }

  async handleLoadWorkflowState(args) {
    const { stateKey } = args;

    try {
      const stateRecord = this.workflowStates.get(stateKey);

      if (!stateRecord) {
        throw new Error(`Workflow state not found: ${stateKey}`);
      }

      this.debug.info(`Workflow state loaded: ${stateKey}`, { metadata: stateRecord.metadata });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            stateKey,
            state: stateRecord.state,
            metadata: stateRecord.metadata,
            loadedAt: Date.now()
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to load workflow state: ${error.message}`);
    }
  }

  async handleListWorkflowStates(args) {
    const { workflowName } = args;

    try {
      let states = Array.from(this.workflowStates.entries()).map(([key, record]) => ({
        stateKey: key,
        workflowName: record.metadata.workflowName,
        description: record.metadata.description,
        stepIndex: record.metadata.stepIndex,
        savedAt: record.metadata.savedAt,
        stateSize: Object.keys(record.state).length
      }));

      // Filter by workflow name if provided
      if (workflowName) {
        states = states.filter(state => state.workflowName === workflowName);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            states,
            count: states.length,
            filteredBy: workflowName ? { workflowName } : null
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to list workflow states: ${error.message}`);
    }
  }

  async handleDeleteWorkflowState(args) {
    const { stateKey } = args;

    try {
      const existed = this.workflowStates.has(stateKey);
      
      if (!existed) {
        throw new Error(`Workflow state not found: ${stateKey}`);
      }

      this.workflowStates.delete(stateKey);

      this.debug.info(`Workflow state deleted: ${stateKey}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `Workflow state deleted successfully`,
            stateKey,
            deletedAt: Date.now()
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to delete workflow state: ${error.message}`);
    }
  }

  async saveWorkflowCheckpoint(checkpointKey, workflowName, stepIndex, context, results) {
    try {
      const checkpoint = {
        key: checkpointKey,
        state: {
          context,
          results,
          currentStep: stepIndex,
          resumable: true
        },
        metadata: {
          workflowName,
          stepIndex,
          description: `Checkpoint after step ${stepIndex}`,
          savedAt: Date.now(),
          version: '1.0',
          type: 'checkpoint'
        }
      };

      this.workflowStates.set(checkpointKey, checkpoint);
      
      this.debug.verbose(`Workflow checkpoint saved: ${checkpointKey}`, { 
        workflowName, 
        stepIndex,
        contextKeys: Object.keys(context),
        resultCount: results.length
      });

    } catch (error) {
      // Don't fail the workflow if checkpoint saving fails
      this.debug.warn(`Failed to save workflow checkpoint: ${checkpointKey}`, error);
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