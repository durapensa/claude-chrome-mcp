// API Tools
// Claude.ai API operations via conversationId only - managing conversations, metadata, and URLs

const { z } = require('zod');
const { createForwardingTool, createCustomTool, extractToolsAndHandlers } = require('../utils/tool-factory');

/**
 * Create tools using factory patterns to reduce code duplication
 */

// Simple forwarding tools (no special logic needed) 
const forwardingToolResults = [
  createForwardingTool('api_list_conversations', 'Get list of recent Claude conversations from API with UUIDs and current tab IDs (if open). Returns up to 30 recent conversations.', {}),
  createForwardingTool('api_search_conversations', 'Search and filter Claude conversations with advanced criteria (title search, date ranges, message counts, open status)', {
    titleSearch: z.string().optional().describe('Search text to match against conversation titles (supports partial matching)'),
    titleRegex: z.string().optional().describe('Regular expression pattern for title matching'),
    createdAfter: z.string().optional().describe('ISO date string - only return conversations created after this date'),
    createdBefore: z.string().optional().describe('ISO date string - only return conversations created before this date'),
    minMessages: z.number().optional().describe('Minimum number of messages in conversation'),
    maxMessages: z.number().optional().describe('Maximum number of messages in conversation'),
    openOnly: z.boolean().default(false).describe('Only return conversations currently open in tabs'),
    limit: z.number().default(30).describe('Maximum number of results to return (default: 30)')
  }),
  createForwardingTool('api_get_conversation_metadata', 'Get metadata for a specific conversation including title, message count, creation date', {
    conversationId: z.string().describe('The UUID of the Claude conversation (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)')
  })
];

// Custom logic tools (require specialized business logic)
const customToolResults = [
  createCustomTool('api_get_conversation_url', 'Generate Claude.ai URL for a specific conversation ID. Enables api_get_conversation_url → tab_create workflow.', {
    conversationId: z.string().describe('The UUID of the Claude conversation (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)')
  }, async (server, args) => {
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
  }),

  createCustomTool('api_delete_conversations', 'Delete Claude conversations permanently - supports single or bulk deletion with progress tracking', {
    conversationIds: z.array(z.string()).describe('Array of conversation UUIDs to delete (single item for individual deletion)'),
    batchSize: z.number().default(5).describe('Number of deletions to process per batch (default: 5)'),
    delayMs: z.number().default(1000).describe('Delay between batches in milliseconds (default: 1000)')
  }, async (server, args) => {
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
  })
];

// Extract tools and handlers from factory results
const forwardingTools = extractToolsAndHandlers(forwardingToolResults);
const customTools = extractToolsAndHandlers(customToolResults);

// Combine all tools and handlers
const apiTools = [...forwardingTools.tools, ...customTools.tools];
const apiHandlers = { ...forwardingTools.handlers, ...customTools.handlers };

module.exports = {
  apiTools,
  apiHandlers
};