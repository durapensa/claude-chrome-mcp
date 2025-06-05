// Network Tools
// Tools for network request monitoring and inspection

/**
 * Network tool definitions
 */
const networkTools = [
  {
    name: 'start_network_inspection',
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
    name: 'stop_network_inspection',
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
    name: 'get_captured_requests',
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
 * Network tool handlers
 */
const networkHandlers = {
  'start_network_inspection': async (server, args) => {
    return await server.forwardToExtension('start_network_inspection', args);
  },

  'stop_network_inspection': async (server, args) => {
    return await server.forwardToExtension('stop_network_inspection', args);
  },

  'get_captured_requests': async (server, args) => {
    return await server.forwardToExtension('get_captured_requests', args);
  }
};

module.exports = { networkTools, networkHandlers };