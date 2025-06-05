// Tab Management Tools
// Tools for managing Claude.ai tabs, messaging, and batch operations

/**
 * Tab management tool definitions
 */
const tabManagementTools = [
  {
    name: 'get_claude_dot_ai_tabs',
    description: 'Get list of all currently open Claude.ai tabs with their IDs, status, and conversation IDs (if available).',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'close_claude_dot_ai_tab',
    description: 'Close a specific Claude.ai tab by tab ID. SAFETY WARNING: Will close tab and lose any unsaved work. Use force=true only when necessary.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The Chrome tab ID to close'
        },
        force: {
          type: 'boolean',
          description: 'Force close even if there are unsaved changes',
          default: false
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  },
  {
    name: 'open_claude_dot_ai_conversation_tab',
    description: 'Open a specific Claude conversation in a new tab using conversation ID. ASYNC-BY-DEFAULT: Use waitForLoad=false for immediate return.',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The Claude conversation ID (UUID format) to open. Example: "1c3bc7f5-24a2-4798-9c16-2530425da89b". Use get_claude_conversations to find existing conversation IDs.'
        },
        activate: {
          type: 'boolean', 
          description: 'Whether to activate the new tab',
          default: true
        },
        waitForLoad: {
          type: 'boolean',
          description: 'Whether to wait for the page to load completely',
          default: true
        },
        loadTimeoutMs: {
          type: 'number',
          description: 'Maximum time to wait for page load in milliseconds',
          default: 10000
        }
      },
      required: ['conversationId'],
      additionalProperties: false
    }
  },
  {
    name: 'send_message_to_claude_dot_ai_tab',
    description: 'Send a message to a specific Claude tab. ASYNC-BY-DEFAULT: Use send_message_async instead for async workflows. This tool waits for completion which may timeout.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID of the Claude session'
        },
        message: {
          type: 'string',
          description: 'The message to send'
        },
        waitForReady: {
          type: 'boolean',
          description: 'Whether to wait for Claude to be ready before sending (default: true)',
          default: true
        },
        maxRetries: {
          type: 'number',
          description: 'Maximum number of retry attempts if sending fails (default: 3)',
          default: 3
        },
        retryDelayMs: {
          type: 'number',
          description: 'Delay between retry attempts in milliseconds (default: 1000)',
          default: 1000
        }
      },
      required: ['tabId', 'message'],
      additionalProperties: false
    }
  },
  {
    name: 'batch_send_messages',
    description: 'Send messages to multiple Claude tabs simultaneously or sequentially. ASYNC-BY-DEFAULT: Optimal for parallel batch operations. Recommended workflow: use sequential=false for fastest execution, then use batch_get_responses or individual get_claude_dot_ai_response calls to retrieve completed responses.',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Array of message objects, each containing tabId and message',
          items: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'The tab ID to send the message to'
              },
              message: {
                type: 'string',
                description: 'The message to send'
              }
            },
            required: ['tabId', 'message']
          }
        },
        sequential: {
          type: 'boolean',
          description: 'Whether to send messages sequentially (true) or in parallel (false)',
          default: false
        },
        delayMs: {
          type: 'number',
          description: 'Delay between sequential sends in milliseconds (default: 1000)',
          default: 1000
        },
        maxConcurrent: {
          type: 'number',
          description: 'Maximum concurrent operations for parallel mode (default: 5)',
          default: 5
        }
      },
      required: ['messages'],
      additionalProperties: false
    }
  },
  {
    name: 'batch_get_responses',
    description: 'Get responses from multiple Claude tabs with polling and progress tracking. ASYNC-BY-DEFAULT: For completed responses only. Use after batch_send_messages or individual async operations complete. NOTE: Current implementation has readiness detection issues - recommend using individual get_claude_dot_ai_response calls until fixed.',
    inputSchema: {
      type: 'object',
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tab IDs to monitor'
        },
        timeoutMs: {
          type: 'number',
          description: 'Maximum time to wait for all responses in milliseconds',
          default: 30000
        },
        waitForAll: {
          type: 'boolean',
          description: 'Whether to wait for all responses or return as they complete',
          default: true
        },
        pollIntervalMs: {
          type: 'number',
          description: 'How often to check for response completion in milliseconds',
          default: 1000
        }
      },
      required: ['tabIds'],
      additionalProperties: false
    }
  },
  {
    name: 'get_claude_dot_ai_response_status',
    description: 'Get real-time status of Claude response generation including progress estimation',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID to check response status for'
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  }
];

/**
 * Tab management tool handlers
 */
const tabManagementHandlers = {
  'get_claude_dot_ai_tabs': async (server, args) => {
    return await server.forwardToExtension('get_claude_dot_ai_tabs', args);
  },

  'close_claude_dot_ai_tab': async (server, args) => {
    return await server.forwardToExtension('close_claude_dot_ai_tab', args);
  },

  'open_claude_dot_ai_conversation_tab': async (server, args) => {
    return await server.forwardToExtension('open_claude_dot_ai_conversation_tab', args);
  },

  'send_message_to_claude_dot_ai_tab': async (server, args) => {
    return await server.forwardToExtension('send_message_to_claude_dot_ai_tab', args);
  },

  'batch_send_messages': async (server, args) => {
    return await server.forwardToExtension('batch_send_messages', args);
  },

  'batch_get_responses': async (server, args) => {
    return await server.forwardToExtension('batch_get_responses', args);
  },

  'get_claude_dot_ai_response_status': async (server, args) => {
    return await server.forwardToExtension('get_claude_dot_ai_response_status', args);
  }
};

module.exports = { tabManagementTools, tabManagementHandlers };