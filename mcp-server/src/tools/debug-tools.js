// Debug Tools
// Tools for debugging, script execution, and DOM manipulation

/**
 * Debug tool definitions
 */
const debugTools = [
  {
    name: 'debug_attach',
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
    name: 'execute_script',
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
    name: 'get_dom_elements',
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
    name: 'debug_claude_dot_ai_page',
    description: 'Debug Claude page readiness and get page information',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID of the Claude page to debug'
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  }
];

/**
 * Debug tool handlers
 */
const debugHandlers = {
  async 'debug_attach'(server, args) {
    return await server.forwardToExtension('debug_attach', args);
  },

  async 'execute_script'(server, args) {
    return await server.forwardToExtension('execute_script', args);
  },

  async 'get_dom_elements'(server, args) {
    return await server.forwardToExtension('get_dom_elements', args);
  },

  async 'debug_claude_dot_ai_page'(server, args) {
    return await server.forwardToExtension('debug_claude_dot_ai_page', args);
  }
};

module.exports = { debugTools, debugHandlers };