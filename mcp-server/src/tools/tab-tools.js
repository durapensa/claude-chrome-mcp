// Tab Tools
// Tab operations via tabId only - creating, messaging, and managing Claude.ai tabs

/**
 * Tab tool definitions
 */
const tabTools = [
  {
    name: 'tab_create',
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
    name: 'tab_list',
    description: 'Get list of all currently open Claude.ai tabs with their IDs, status, and conversation IDs (if available).',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'tab_close',
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
    name: 'tab_send_message',
    description: 'Send message to Claude tab with configurable async/sync behavior',
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
          description: 'Whether to wait for response completion (false = async, true = sync)',
          default: false
        },
        waitForReady: {
          type: 'boolean',
          description: 'Whether to wait for Claude to be ready before sending',
          default: true
        },
        maxRetries: {
          type: 'number',
          description: 'Maximum number of retry attempts if sending fails',
          default: 3
        },
        retryDelayMs: {
          type: 'number',
          description: 'Delay between retry attempts in milliseconds',
          default: 1000
        }
      },
      required: ['tabId', 'message'],
      additionalProperties: false
    }
  },
  {
    name: 'tab_get_response',
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
    name: 'tab_get_response_status',
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
  },
  {
    name: 'tab_forward_response',
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
  },
  {
    name: 'tab_extract_elements',
    description: 'Extract conversation elements including artifacts, code blocks, and tool usage',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID of the Claude conversation'
        },
        batchSize: {
          type: 'number',
          description: 'Max elements to process per type (default: 50)',
          default: 50
        },
        maxElements: {
          type: 'number',
          description: 'Max total elements to extract before stopping (default: 1000)',
          default: 1000
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  },
  {
    name: 'tab_export_conversation',
    description: 'Export a full conversation transcript with metadata in markdown or JSON format',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The tab ID of the Claude conversation to export'
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Export format (markdown or json)',
          default: 'markdown'
        }
      },
      required: ['tabId'],
      additionalProperties: false
    }
  },
  {
    name: 'tab_debug_page',
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
  },
  {
    name: 'tab_batch_operations',
    description: 'Perform batch operations on multiple tabs: send messages and/or get responses. ASYNC-BY-DEFAULT: Optimal for parallel operations.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['send_messages', 'get_responses', 'send_and_get'],
          description: 'Type of batch operation to perform'
        },
        messages: {
          type: 'array',
          description: 'Array of message objects for send operations',
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
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tab IDs for get_responses operations'
        },
        sequential: {
          type: 'boolean',
          description: 'Whether to process sequentially (true) or in parallel (false)',
          default: false
        },
        delayMs: {
          type: 'number',
          description: 'Delay between sequential operations in milliseconds',
          default: 1000
        },
        maxConcurrent: {
          type: 'number',
          description: 'Maximum concurrent operations for parallel mode',
          default: 5
        },
        timeoutMs: {
          type: 'number',
          description: 'Maximum time to wait for operations in milliseconds',
          default: 30000
        },
        waitForAll: {
          type: 'boolean',
          description: 'Whether to wait for all operations or return as they complete',
          default: true
        },
        pollIntervalMs: {
          type: 'number',
          description: 'How often to check for completion in milliseconds',
          default: 1000
        }
      },
      required: ['operation'],
      additionalProperties: false
    }
  }
];

/**
 * Tab tool handlers
 */
const tabHandlers = {
  'tab_create': async (server, args) => {
    return await server.forwardToExtension('spawn_claude_dot_ai_tab', args);
  },

  'tab_list': async (server, args) => {
    return await server.forwardToExtension('get_claude_dot_ai_tabs', args);
  },

  'tab_close': async (server, args) => {
    return await server.forwardToExtension('close_claude_dot_ai_tab', args);
  },

  'tab_send_message': async (server, args) => {
    // Route to appropriate underlying tool based on waitForCompletion
    if (args.waitForCompletion) {
      // Use sync version with retry logic
      return await server.forwardToExtension('send_message_to_claude_dot_ai_tab', args);
    } else {
      // Use async version
      return await server.forwardToExtension('send_message_async', args);
    }
  },

  'tab_get_response': async (server, args) => {
    return await server.forwardToExtension('get_claude_dot_ai_response', args);
  },

  'tab_get_response_status': async (server, args) => {
    return await server.forwardToExtension('get_claude_dot_ai_response_status', args);
  },

  'tab_forward_response': async (server, args) => {
    return await server.forwardToExtension('forward_response_to_claude_dot_ai_tab', args);
  },

  'tab_extract_elements': async (server, args) => {
    return await server.forwardToExtension('extract_conversation_elements', args);
  },

  'tab_export_conversation': async (server, args) => {
    return await server.forwardToExtension('export_conversation_transcript', args);
  },

  'tab_debug_page': async (server, args) => {
    return await server.forwardToExtension('debug_claude_dot_ai_page', args);
  },

  'tab_batch_operations': async (server, args) => {
    // Route to appropriate batch operations based on operation type
    switch (args.operation) {
      case 'send_messages':
        return await server.forwardToExtension('batch_send_messages', {
          messages: args.messages,
          sequential: args.sequential,
          delayMs: args.delayMs,
          maxConcurrent: args.maxConcurrent
        });
      case 'get_responses':
        return await server.forwardToExtension('batch_get_responses', {
          tabIds: args.tabIds,
          timeoutMs: args.timeoutMs,
          waitForAll: args.waitForAll,
          pollIntervalMs: args.pollIntervalMs
        });
      case 'send_and_get':
        // First send messages, then get responses
        const sendResult = await server.forwardToExtension('batch_send_messages', {
          messages: args.messages,
          sequential: args.sequential,
          delayMs: args.delayMs,
          maxConcurrent: args.maxConcurrent
        });
        
        if (sendResult.success) {
          // Extract tabIds from messages for getting responses
          const tabIds = args.messages.map(msg => msg.tabId);
          const getResult = await server.forwardToExtension('batch_get_responses', {
            tabIds: tabIds,
            timeoutMs: args.timeoutMs,
            waitForAll: args.waitForAll,
            pollIntervalMs: args.pollIntervalMs
          });
          return { sendResult, getResult };
        }
        return sendResult;
      default:
        throw new Error(`Unknown batch operation: ${args.operation}`);
    }
  }
};

module.exports = {
  tabTools,
  tabHandlers
};