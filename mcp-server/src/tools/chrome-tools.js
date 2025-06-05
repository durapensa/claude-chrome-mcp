// Chrome Tools
// Browser control tools for extension management, debugging, and DOM operations

const { z } = require('zod');

/**
 * Chrome tool definitions
 */
const chromeTools = [
  {
    name: 'chrome_reload_extension',
    description: 'Reload the Chrome extension to apply code changes',
    zodSchema: {}
  },
  {
    name: 'chrome_debug_attach',
    description: 'Attach Chrome debugger to a tab for advanced operations',
    zodSchema: {
      tabId: z.number().describe('The tab ID to attach debugger to')
    }
  },
  {
    name: 'chrome_debug_detach',
    description: 'Detach Chrome debugger from a tab',
    zodSchema: {
      tabId: z.number().describe('The tab ID to detach debugger from')
    }
  },
  {
    name: 'chrome_debug_status',
    description: 'Get debugger attachment status for tabs',
    zodSchema: {
      tabId: z.number().optional().describe('Specific tab ID to check (optional - if not provided, returns all debugger sessions)')
    }
  },
  {
    name: 'chrome_execute_script',
    description: 'Execute JavaScript in a specific tab',
    zodSchema: {
      tabId: z.number().describe('The tab ID to execute script in'),
      script: z.string().describe('The JavaScript code to execute')
    }
  },
  {
    name: 'chrome_get_dom_elements',
    description: 'Query DOM elements in a specific tab',
    zodSchema: {
      tabId: z.number().describe('The tab ID to query elements in'),
      selector: z.string().describe('CSS selector to find elements')
    }
  },
  {
    name: 'chrome_start_network_monitoring',
    description: 'Start network request monitoring on a tab',
    zodSchema: {
      tabId: z.number().describe('The tab ID to monitor network requests')
    }
  },
  {
    name: 'chrome_stop_network_monitoring',
    description: 'Stop network request monitoring on a tab',
    zodSchema: {
      tabId: z.number().describe('The tab ID to stop monitoring')
    }
  },
  {
    name: 'chrome_get_network_requests',
    description: 'Get captured network requests from monitoring',
    zodSchema: {
      tabId: z.number().describe('The tab ID to get captured requests for')
    }
  }
];

/**
 * Chrome tool handlers
 */
const chromeHandlers = {
  'chrome_reload_extension': async (server, args) => {
    return await server.forwardToExtension('reload_extension', args);
  },

  'chrome_debug_attach': async (server, args) => {
    return await server.forwardToExtension('debug_attach', args);
  },

  'chrome_debug_detach': async (server, args) => {
    return await server.forwardToExtension('debug_detach', args);
  },

  'chrome_debug_status': async (server, args) => {
    return await server.forwardToExtension('debug_status', args);
  },

  'chrome_execute_script': async (server, args) => {
    return await server.forwardToExtension('execute_script', args);
  },

  'chrome_get_dom_elements': async (server, args) => {
    return await server.forwardToExtension('get_dom_elements', args);
  },

  'chrome_start_network_monitoring': async (server, args) => {
    return await server.forwardToExtension('start_network_inspection', args);
  },

  'chrome_stop_network_monitoring': async (server, args) => {
    return await server.forwardToExtension('stop_network_inspection', args);
  },

  'chrome_get_network_requests': async (server, args) => {
    return await server.forwardToExtension('get_captured_requests', args);
  }
};

module.exports = {
  chromeTools,
  chromeHandlers
};