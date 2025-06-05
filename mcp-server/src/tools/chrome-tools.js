// Chrome Tools
// Browser control tools for extension management, debugging, and DOM operations

/**
 * Chrome tool definitions
 */
const chromeTools = [
  {
    name: 'chrome_reload_extension',
    description: 'Reload the Chrome extension to apply code changes',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'chrome_debug_attach',
    description: 'Attach Chrome debugger to a tab for advanced operations',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID to attach debugger to'
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  },
  {
    name: 'chrome_execute_script',
    description: 'Execute JavaScript in a specific tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID to execute script in'
        },
        script: {
          type: 'string',
          description: 'The JavaScript code to execute'
        }
      },
      required: ['tabId', 'script'],
      additionalProperties: false
    }
  },
  {
    name: 'chrome_get_dom_elements',
    description: 'Query DOM elements in a specific tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID to query elements in'
        },
        selector: {
          type: 'string',
          description: 'CSS selector to find elements'
        }
      },
      required: ['tabId', 'selector'],
      additionalProperties: false
    }
  },
  {
    name: 'chrome_start_network_monitoring',
    description: 'Start network request monitoring on a tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID to monitor network requests'
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  },
  {
    name: 'chrome_stop_network_monitoring',
    description: 'Stop network request monitoring on a tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID to stop monitoring'
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  },
  {
    name: 'chrome_get_network_requests',
    description: 'Get captured network requests from monitoring',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID to get captured requests for'
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  }
];

/**
 * Chrome tool handlers
 */
const chromeHandlers = {
  async 'chrome_reload_extension'(server, args) {
    return await server.forwardToExtension('reload_extension', args);
  },

  async 'chrome_debug_attach'(server, args) {
    return await server.forwardToExtension('debug_attach', args);
  },

  async 'chrome_execute_script'(server, args) {
    return await server.forwardToExtension('execute_script', args);
  },

  async 'chrome_get_dom_elements'(server, args) {
    return await server.forwardToExtension('get_dom_elements', args);
  },

  async 'chrome_start_network_monitoring'(server, args) {
    return await server.forwardToExtension('start_network_inspection', args);
  },

  async 'chrome_stop_network_monitoring'(server, args) {
    return await server.forwardToExtension('stop_network_inspection', args);
  },

  async 'chrome_get_network_requests'(server, args) {
    return await server.forwardToExtension('get_captured_requests', args);
  }
};

module.exports = {
  chromeTools,
  chromeHandlers
};