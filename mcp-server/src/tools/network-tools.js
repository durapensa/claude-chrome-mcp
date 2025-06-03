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
  async 'start_network_inspection'(server, args) {
    return await server.forwardToExtension('start_network_inspection', args);
  },

  async 'stop_network_inspection'(server, args) {
    return await server.forwardToExtension('stop_network_inspection', args);
  },

  async 'get_captured_requests'(server, args) {
    return await server.forwardToExtension('get_captured_requests', args);
  }
};

module.exports = { networkTools, networkHandlers };