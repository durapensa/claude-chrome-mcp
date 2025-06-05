// API Tools
// Claude.ai API operations via conversationId only - managing conversations, metadata, and URLs

/**
 * API tool definitions
 */
const apiTools = [
  {
    name: 'api_list_conversations',
    description: 'Get list of recent Claude conversations from API with UUIDs and current tab IDs (if open). Returns up to 30 recent conversations.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'api_search_conversations',
    description: 'Search and filter Claude conversations with advanced criteria (title search, date ranges, message counts, open status)',
    inputSchema: {
      type: 'object',
      properties: {
        titleSearch: {
          type: 'string',
          description: 'Search text to match against conversation titles (supports partial matching)'
        },
        titleRegex: {
          type: 'string', 
          description: 'Regular expression pattern for title matching'
        },
        createdAfter: {
          type: 'string',
          description: 'ISO date string - only return conversations created after this date'
        },
        createdBefore: {
          type: 'string', 
          description: 'ISO date string - only return conversations created before this date'
        },
        minMessages: {
          type: 'number',
          description: 'Minimum number of messages in conversation'
        },
        maxMessages: {
          type: 'number', 
          description: 'Maximum number of messages in conversation'
        },
        openOnly: {
          type: 'boolean',
          description: 'Only return conversations currently open in tabs',
          default: false
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 30)',
          default: 30
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'api_get_conversation_metadata',
    description: 'Get metadata for a specific conversation including title, message count, creation date',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The UUID of the Claude conversation (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)'
        }
      },
      required: ['conversationId'],
      additionalProperties: false
    }
  },
  {
    name: 'api_get_conversation_url',
    description: 'Generate Claude.ai URL for a specific conversation ID. Enables api_get_conversation_url → tab_create workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The UUID of the Claude conversation (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)'
        }
      },
      required: ['conversationId'],
      additionalProperties: false
    }
  },
  {
    name: 'api_delete_conversations',
    description: 'Delete Claude conversations permanently - supports single or bulk deletion with progress tracking',
    inputSchema: {
      type: 'object',
      properties: {
        conversationIds: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of conversation UUIDs to delete (single item for individual deletion)'
        },
        batchSize: {
          type: 'number',
          description: 'Number of deletions to process per batch (default: 5)',
          default: 5
        },
        delayMs: {
          type: 'number',
          description: 'Delay between batches in milliseconds (default: 1000)',
          default: 1000
        }
      },
      required: ['conversationIds'],
      additionalProperties: false
    }
  }
];

/**
 * API tool handlers
 */
const apiHandlers = {
  async 'api_list_conversations'(server, args) {
    return await server.forwardToExtension('get_claude_conversations', args);
  },

  async 'api_search_conversations'(server, args) {
    return await server.forwardToExtension('search_claude_conversations', args);
  },

  async 'api_get_conversation_metadata'(server, args) {
    return await server.forwardToExtension('get_conversation_metadata', args);
  },

  async 'api_get_conversation_url'(server, args) {
    // Pure URL generation without tab creation
    const { conversationId } = args;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      throw new Error('conversationId must be a valid UUID format');
    }

    // Return the conversation URL
    return {
      success: true,
      conversationId: conversationId,
      url: `https://claude.ai/chat/${conversationId}`
    };
  },

  async 'api_delete_conversations'(server, args) {
    const { conversationIds } = args;
    
    // Handle single vs bulk deletion
    if (conversationIds.length === 1) {
      // Route to single deletion for efficiency
      return await server.forwardToExtension('delete_claude_conversation', {
        conversationId: conversationIds[0]
      });
    } else {
      // Route to bulk deletion
      return await server.forwardToExtension('bulk_delete_conversations', {
        conversationIds: conversationIds,
        batchSize: args.batchSize,
        delayMs: args.delayMs
      });
    }
  }
};

module.exports = {
  apiTools,
  apiHandlers
};