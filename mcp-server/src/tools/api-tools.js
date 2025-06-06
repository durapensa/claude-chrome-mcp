// API Tools
// Claude.ai API operations via conversationId only - managing conversations, metadata, and URLs

const { z } = require('zod');

/**
 * API tool definitions
 */
const apiTools = [
  {
    name: 'api_list_conversations',
    description: 'Get list of recent Claude conversations from API with UUIDs and current tab IDs (if open). Returns up to 30 recent conversations.',
    zodSchema: {}
  },
  {
    name: 'api_search_conversations',
    description: 'Search and filter Claude conversations with advanced criteria (title search, date ranges, message counts, open status)',
    zodSchema: {
      titleSearch: z.string().optional().describe('Search text to match against conversation titles (supports partial matching)'),
      titleRegex: z.string().optional().describe('Regular expression pattern for title matching'),
      createdAfter: z.string().optional().describe('ISO date string - only return conversations created after this date'),
      createdBefore: z.string().optional().describe('ISO date string - only return conversations created before this date'),
      minMessages: z.number().optional().describe('Minimum number of messages in conversation'),
      maxMessages: z.number().optional().describe('Maximum number of messages in conversation'),
      openOnly: z.boolean().default(false).describe('Only return conversations currently open in tabs'),
      limit: z.number().default(30).describe('Maximum number of results to return (default: 30)')
    }
  },
  {
    name: 'api_get_conversation_metadata',
    description: 'Get metadata for a specific conversation including title, message count, creation date',
    zodSchema: {
      conversationId: z.string().describe('The UUID of the Claude conversation (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)')
    }
  },
  {
    name: 'api_get_conversation_url',
    description: 'Generate Claude.ai URL for a specific conversation ID. Enables api_get_conversation_url → tab_create workflow.',
    zodSchema: {
      conversationId: z.string().describe('The UUID of the Claude conversation (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)')
    }
  },
  {
    name: 'api_delete_conversations',
    description: 'Delete Claude conversations permanently - supports single or bulk deletion with progress tracking',
    zodSchema: {
      conversationIds: z.array(z.string()).describe('Array of conversation UUIDs to delete (single item for individual deletion)'),
      batchSize: z.number().default(5).describe('Number of deletions to process per batch (default: 5)'),
      delayMs: z.number().default(1000).describe('Delay between batches in milliseconds (default: 1000)')
    }
  }
];

/**
 * API tool handlers
 */
const apiHandlers = {
  'api_list_conversations': async (server, args) => {
    return await server.forwardToExtension('api_list_conversations', args);
  },

  'api_search_conversations': async (server, args) => {
    return await server.forwardToExtension('api_search_conversations', args);
  },

  'api_get_conversation_metadata': async (server, args) => {
    return await server.forwardToExtension('api_get_conversation_metadata', args);
  },

  'api_get_conversation_url': async (server, args) => {
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

  'api_delete_conversations': async (server, args) => {
    const { conversationIds, batchSize = 5, delayMs = 1000 } = args;
    
    // Create operation for async tracking
    const operationId = server.operationManager.createOperation('api_delete_conversations', {
      conversationIds,
      batchSize,
      delayMs,
      total: conversationIds.length
    });
    
    // Start deletion process in background
    setImmediate(async () => {
      try {
        server.operationManager.updateOperation(operationId, 'started', {
          message: `Starting deletion of ${conversationIds.length} conversation(s)`
        });
        
        // Always use bulk deletion format (extension handles single items in array)
        const result = await server.forwardToExtension('api_delete_conversations', {
          conversationIds: conversationIds,
          batchSize: batchSize,
          delayMs: delayMs
        });
        
        // Update operation with completion
        server.operationManager.updateOperation(operationId, 'completed', {
          message: 'Deletion completed',
          result: result
        });
        
      } catch (error) {
        server.operationManager.updateOperation(operationId, 'error', {
          message: 'Deletion failed',
          error: error.message
        });
      }
    });
    
    // Return immediately with operation ID
    return {
      success: true,
      operationId: operationId,
      message: `Queued deletion of ${conversationIds.length} conversation(s)`,
      status: 'async_queued',
      timestamp: Date.now()
    };
  }
};

module.exports = {
  apiTools,
  apiHandlers
};