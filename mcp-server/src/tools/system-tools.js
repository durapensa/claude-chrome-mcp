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
    name: 'system_get_extension_logs',
    description: 'Get extension logs forwarded to MCP server (requires debug mode enabled first). Note: For MCP server logs, see ~/.claude-chrome-mcp/logs/',
    zodSchema: {
      level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']).describe('Filter by extension log level').optional(),
      component: z.string().describe('Filter by extension component name (e.g., background, relay-client, content-script)').optional(),
      since: z.number().describe('Unix timestamp - only show extension logs since this time').optional(),
      limit: z.number().describe('Maximum number of extension logs to return').default(100),
      format: z.enum(['json', 'text']).describe('Output format for extension logs').default('text')
    }
  },
  {
    name: 'system_enable_extension_debug_mode',
    description: 'Enable real-time forwarding of Chrome extension logs to MCP server. Extension logs distinct from MCP server logs (winston files in ~/.claude-chrome-mcp/logs/)',
    zodSchema: {
      components: z.array(z.string()).describe('Specific extension components to monitor: background, relay-client, content-script, etc. (empty = all)').default([]),
      errorOnly: z.boolean().describe('Only forward ERROR level extension logs (true) or all levels (false)').default(false),
      batchIntervalMs: z.number().describe('Batch interval for non-error extension logs in milliseconds').default(2000)
    }
  },
  {
    name: 'system_disable_extension_debug_mode',
    description: 'Disable real-time forwarding of Chrome extension logs to MCP server. Does not affect MCP server winston logs',
    zodSchema: {}
  },
  {
    name: 'system_set_extension_log_level',
    description: 'Set minimum log level captured by Chrome extension (affects what gets forwarded when debug mode enabled). Levels: ERROR > WARN > INFO > DEBUG > VERBOSE',
    zodSchema: {
      level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']).describe('Minimum extension log level to capture (ERROR=critical only, VERBOSE=everything)')
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

  'system_get_extension_logs': async (server, args) => {
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