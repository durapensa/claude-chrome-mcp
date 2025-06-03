// Core Tools
// Core system tools that don't forward to extension

/**
 * Core tool definitions (tools that don't require extension forwarding)
 */
const coreTools = [
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
    name: 'reload_extension',
    description: 'Reload the Chrome extension to apply code changes',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
];

/**
 * Core tool handlers
 */
const coreHandlers = {
  async 'get_connection_health'(server, args) {
    return await server.getConnectionHealth();
  },

  async 'wait_for_operation'(server, args) {
    return await server.waitForOperation(args);
  },

  async 'reload_extension'(server, args) {
    return await server.forwardToExtension('reload_extension', args);
  }
};

module.exports = {
  coreTools,
  coreHandlers
};