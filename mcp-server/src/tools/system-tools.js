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
  }
};

module.exports = {
  systemTools,
  systemHandlers
};