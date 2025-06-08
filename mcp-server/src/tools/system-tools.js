// System Tools
// Core infrastructure tools for system health and operation management

const { z } = require('zod');
const { createForwardingTool, createForwardingToolWithCommand, createCustomTool, extractToolsAndHandlers } = require('../utils/tool-factory');

/**
 * Create tools using factory patterns to reduce code duplication
 */

// Simple forwarding tools (tool name matches extension command name)
const forwardingToolResults = [
  createForwardingTool('system_get_extension_logs', 'Get extension logs forwarded to MCP server (requires debug mode enabled first). Note: For MCP server logs, see ~/.claude-chrome-mcp/logs/', {
    level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']).describe('Filter by extension log level').optional(),
    component: z.string().describe('Filter by extension component name (e.g., background, relay-client, content-script)').optional(),
    since: z.number().describe('Unix timestamp - only show extension logs since this time').optional(),
    limit: z.number().describe('Maximum number of extension logs to return').default(100),
    format: z.enum(['json', 'text']).describe('Output format for extension logs').default('text')
  })
];

// Forwarding tools with different command names 
const forwardingWithCommandResults = [
  createForwardingToolWithCommand('system_enable_extension_debug_mode', 'Enable real-time forwarding of Chrome extension logs to MCP server. Extension logs distinct from MCP server logs (winston files in ~/.claude-chrome-mcp/logs/)', {
    components: z.array(z.string()).describe('Specific extension components to monitor: background, relay-client, content-script, etc. (empty = all)').default([]),
    errorOnly: z.boolean().describe('Only forward ERROR level extension logs (true) or all levels (false)').default(false),
    batchIntervalMs: z.number().describe('Batch interval for non-error extension logs in milliseconds').default(2000)
  }, 'enable_debug_mode'),
  
  createForwardingToolWithCommand('system_disable_extension_debug_mode', 'Disable real-time forwarding of Chrome extension logs to MCP server. Does not affect MCP server winston logs', {}, 'disable_debug_mode'),
  
  createForwardingToolWithCommand('system_set_extension_log_level', 'Set minimum log level captured by Chrome extension (affects what gets forwarded when debug mode enabled). Levels: ERROR > WARN > INFO > DEBUG > VERBOSE', {
    level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']).describe('Minimum extension log level to capture (ERROR=critical only, VERBOSE=everything)')
  }, 'set_log_level')
];

// Custom logic tools (require specialized business logic)
const customToolResults = [
  createCustomTool('system_health', 'Get connection health and status information', {}, async (server, args) => {
    return await server.getConnectionHealth();
  }),
  
  createCustomTool('system_wait_operation', 'Wait for async operation completion', {
    operationId: z.string().describe('Operation ID to wait for'),
    timeoutMs: z.number().default(30000).describe('Timeout in milliseconds')
  }, async (server, args) => {
    return await server.waitForOperation(args);
  }),
  
  createCustomTool('system_relay_takeover', 'Request the current relay to shut down gracefully, allowing a new relay to take over. Use with caution.', {}, async (server, args) => {
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
  })
];

// Extract tools and handlers from factory results
const forwardingTools = extractToolsAndHandlers(forwardingToolResults);
const forwardingWithCommandTools = extractToolsAndHandlers(forwardingWithCommandResults);
const customTools = extractToolsAndHandlers(customToolResults);

// Combine all tools and handlers
const systemTools = [...forwardingTools.tools, ...forwardingWithCommandTools.tools, ...customTools.tools];
const systemHandlers = { ...forwardingTools.handlers, ...forwardingWithCommandTools.handlers, ...customTools.handlers };


module.exports = {
  systemTools,
  systemHandlers
};