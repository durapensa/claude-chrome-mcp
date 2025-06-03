// Workflow Tools
// Tools for workflow templates, orchestration, and state management

/**
 * Workflow tool definitions  
 */
const workflowTools = [
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
          additionalProperties: true
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
          additionalProperties: true
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
          additionalProperties: true
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
];

/**
 * Workflow tool handlers
 */
const workflowHandlers = {
  async 'execute_workflow_template'(server, args) {
    return await server.executeWorkflowTemplate(args);
  },

  async 'list_workflow_templates'(server, args) {
    return await server.listWorkflowTemplates();
  },

  async 'create_workflow_template'(server, args) {
    return await server.createWorkflowTemplate(args);
  },

  async 'execute_workflow_orchestration'(server, args) {
    return await server.executeWorkflowOrchestration(args);
  },

  async 'create_workflow_orchestration'(server, args) {
    return await server.createWorkflowOrchestration(args);
  },

  async 'list_workflow_orchestrations'(server, args) {
    return await server.listWorkflowOrchestrations();
  },

  async 'save_workflow_state'(server, args) {
    return await server.saveWorkflowState(args);
  },

  async 'load_workflow_state'(server, args) {
    return await server.loadWorkflowState(args);
  },

  async 'list_workflow_states'(server, args) {
    return await server.listWorkflowStates(args);
  },

  async 'delete_workflow_state'(server, args) {
    return await server.deleteWorkflowState(args);
  }
};

module.exports = { workflowTools, workflowHandlers };