// Tab Operations Tools
// Tools for spawning, messaging, and managing Claude.ai tabs

/**
 * Tab operation tool definitions and handlers
 */
const tabOperationTools = [
  {
    name: 'spawn_claude_dot_ai_tab',
    description: 'Open a new Claude.ai tab with optional content script injection',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string', 
          description: 'URL to open',
          default: 'https://claude.ai'
        },
        injectContentScript: {
          type: 'boolean',
          description: 'Whether to inject content script for interaction',
          default: true
        },
        waitForLoad: {
          type: 'boolean',
          description: 'Wait for page to fully load',
          default: true
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'send_message_async',
    description: 'Send message asynchronously to Claude tab (returns immediately)',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID to send message to'
        },
        message: {
          type: 'string',
          description: 'Message to send to Claude'
        },
        waitForCompletion: {
          type: 'boolean',
          description: 'Whether to wait for response completion',
          default: false
        }
      },
      required: ['tabId', 'message'],
      additionalProperties: false
    }
  },
  {
    name: 'get_claude_dot_ai_response',
    description: 'Get the latest response from Claude tab with auto-completion detection',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID to get response from'
        },
        timeoutMs: {
          type: 'number',
          description: 'Timeout in milliseconds',
          default: 30000
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  },
  {
    name: 'forward_response_to_claude_dot_ai_tab',
    description: 'Forward Claude response from source tab to target tab',
    inputSchema: {
      type: 'object',
      properties: {
        sourceTabId: {
          type: 'number',
          description: 'Source tab ID to get response from'
        },
        targetTabId: {
          type: 'number',
          description: 'Target tab ID to send response to'
        },
        transformTemplate: {
          type: 'string',
          description: 'Optional transformation template with ${response} placeholder'
        }
      },
      required: ['sourceTabId', 'targetTabId'],
      additionalProperties: false
    }
  }
];

/**
 * Tab operation tool handlers
 */
const tabOperationHandlers = {
  'spawn_claude_dot_ai_tab': async (server, args) => {
    return await server.forwardToExtension('spawn_claude_dot_ai_tab', args);
  },

  'send_message_async': async (server, args) => {
    return await server.forwardToExtension('send_message_async', args);
  },

  'get_claude_dot_ai_response': async (server, args) => {
    return await server.forwardToExtension('get_claude_dot_ai_response', args);
  },

  'forward_response_to_claude_dot_ai_tab': async (server, args) => {
    return await server.forwardToExtension('forward_response_to_claude_dot_ai_tab', args);
  }
};

module.exports = {
  tabOperationTools,
  tabOperationHandlers
};