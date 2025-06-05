// System Tools
// Core infrastructure tools for system health and operation management

/**
 * System tool definitions
 */
const systemTools = [
  {
    name: 'system_health',
    description: 'Get connection health and status information',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'system_wait_operation',
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
    name: 'system_get_logs',
    description: 'Get Chrome extension logs for debugging and troubleshooting',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          description: 'Filter by log level',
          enum: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']
        },
        component: {
          type: 'string',
          description: 'Filter by component name'
        },
        since: {
          type: 'number',
          description: 'Unix timestamp - only show logs since this time'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of logs to return',
          default: 100
        },
        format: {
          type: 'string',
          description: 'Output format',
          enum: ['json', 'text'],
          default: 'text'
        }
      },
      additionalProperties: false
    }
  }
];

/**
 * System tool handlers
 */
const systemHandlers = {
  'system_health': async (server, args) => {
    return await server.getConnectionHealth();
  },

  'system_wait_operation': async (server, args) => {
    return await server.waitForOperation(args);
  },

  'system_get_logs': async (server, args) => {
    return await server.forwardToExtension('get_extension_logs', args);
  }
};

module.exports = {
  systemTools,
  systemHandlers
};