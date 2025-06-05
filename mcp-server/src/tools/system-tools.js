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
  },
  {
    name: 'system_enable_extension_debug_mode',
    description: 'Enable real-time debug log forwarding from Chrome extension to MCP server',
    zodSchema: {
      components: z.array(z.string()).describe('Specific extension components to monitor (empty = all)').default([]),
      errorOnly: z.boolean().describe('Only forward ERROR level logs from extension').default(false),
      batchIntervalMs: z.number().describe('Batch interval for non-error logs in milliseconds').default(2000)
    }
  },
  {
    name: 'system_disable_extension_debug_mode',
    description: 'Disable real-time debug log forwarding from Chrome extension',
    zodSchema: {}
  },
  {
    name: 'system_set_extension_log_level',
    description: 'Set the minimum log level captured by the Chrome extension',
    zodSchema: {
      level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']).describe('Minimum log level to capture in extension')
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
  },

  'system_enable_extension_debug_mode': async (server, args) => {
    return await server.forwardToExtension('enable_debug_mode', args);
  },

  'system_disable_extension_debug_mode': async (server, args) => {
    return await server.forwardToExtension('disable_debug_mode', args);
  },

  'system_set_extension_log_level': async (server, args) => {
    return await server.forwardToExtension('set_log_level', args);
  }
};

module.exports = {
  systemTools,
  systemHandlers
};