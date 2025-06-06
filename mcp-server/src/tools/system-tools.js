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
  },
  {
    name: 'system_relay_takeover',
    description: 'Request the current relay to shut down gracefully, allowing a new relay to take over. Use with caution.',
    zodSchema: {}
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
    return await server.forwardToExtension('system_get_extension_logs', args);
  },

  'system_enable_extension_debug_mode': async (server, args) => {
    return await server.forwardToExtension('enable_debug_mode', args);
  },

  'system_disable_extension_debug_mode': async (server, args) => {
    return await server.forwardToExtension('disable_debug_mode', args);
  },

  'system_set_extension_log_level': async (server, args) => {
    return await server.forwardToExtension('set_log_level', args);
  },

  'system_relay_takeover': async (server, args) => {
    try {
      // Check current relay health first
      const healthResponse = await fetch('http://localhost:54322/health');
      if (!healthResponse.ok) {
        return {
          content: [{
            type: 'text',
            text: 'No relay server found running on port 54321'
          }]
        };
      }
      
      const health = await healthResponse.json();
      
      // Request takeover
      const takeoverResponse = await fetch('http://localhost:54322/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!takeoverResponse.ok) {
        const error = await takeoverResponse.json();
        return {
          content: [{
            type: 'text',
            text: `Takeover failed: ${error.error || 'Unknown error'}`
          }]
        };
      }
      
      const result = await takeoverResponse.json();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            previousRelay: {
              version: health.version,
              uptime: health.uptime,
              clients: health.metrics.currentClients
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to request relay takeover: ${error.message}`
        }]
      };
    }
  }
};

module.exports = {
  systemTools,
  systemHandlers
};