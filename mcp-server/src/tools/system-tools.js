// System Tools
// Core infrastructure tools for system health and operation management

const { z } = require('zod');

/**
 * System tool definitions
 */
const systemTools = [
  {
    name: 'system_health',
    description: 'Get connection health and status information',
    zodSchema: {}
  },
  {
    name: 'system_wait_operation',
    description: 'Wait for async operation completion',
    zodSchema: {
      operationId: z.string().describe('Operation ID to wait for'),
      timeoutMs: z.number().default(30000).describe('Timeout in milliseconds')
    }
  },
  {
    name: 'system_get_logs',
    description: 'Get Chrome extension logs for debugging and troubleshooting',
    zodSchema: {
      level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']).describe('Filter by log level').optional(),
      component: z.string().describe('Filter by component name').optional(),
      since: z.number().describe('Unix timestamp - only show logs since this time').optional(),
      limit: z.number().describe('Maximum number of logs to return').default(100),
      format: z.enum(['json', 'text']).describe('Output format').default('text')
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