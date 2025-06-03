// Conversation Tools
// Tools for extracting, searching, and managing Claude conversation content

/**
 * Conversation tool definitions
 */
const conversationTools = [
  {
    name: 'extract_conversation_elements',
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
    name: 'export_conversation_transcript',
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
    name: 'get_claude_conversations',
    description: 'Get list of recent Claude conversations from API with UUIDs and current tab IDs (if open). Returns up to 30 recent conversations.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'search_claude_conversations',
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
    name: 'get_conversation_metadata',
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
    name: 'delete_claude_conversation',
    description: 'Delete a Claude conversation permanently',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The UUID of the Claude conversation to delete (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)'
        }
      },
      required: ['conversationId'],
      additionalProperties: false
    }
  },
  {
    name: 'bulk_delete_conversations',
    description: 'Delete multiple Claude conversations in bulk with progress tracking',
    inputSchema: {
      type: 'object',
      properties: {
        conversationIds: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of conversation UUIDs to delete'
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
 * Conversation tool handlers
 */
const conversationHandlers = {
  async 'extract_conversation_elements'(server, args) {
    return await server.forwardToExtension('extract_conversation_elements', args);
  },

  async 'export_conversation_transcript'(server, args) {
    return await server.forwardToExtension('export_conversation_transcript', args);
  },

  async 'get_claude_conversations'(server, args) {
    return await server.forwardToExtension('get_claude_conversations', args);
  },

  async 'search_claude_conversations'(server, args) {
    return await server.forwardToExtension('search_claude_conversations', args);
  },

  async 'get_conversation_metadata'(server, args) {
    return await server.forwardToExtension('get_conversation_metadata', args);
  },

  async 'delete_claude_conversation'(server, args) {
    return await server.forwardToExtension('delete_claude_conversation', args);
  },

  async 'bulk_delete_conversations'(server, args) {
    return await server.forwardToExtension('bulk_delete_conversations', args);
  }
};

module.exports = { conversationTools, conversationHandlers };