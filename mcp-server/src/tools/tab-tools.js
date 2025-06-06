// Tab Tools
// Tab operations via tabId only - creating, messaging, and managing Claude.ai tabs

const { z } = require('zod');

/**
 * Tab tool definitions
 */
const tabTools = [
  {
    name: 'tab_create',
    description: 'Open a new Claude.ai tab with optional content script injection',
    zodSchema: {
      url: z.string().describe('URL to open').default('https://claude.ai'),
      injectContentScript: z.boolean().describe('Whether to inject content script for interaction').default(true),
      waitForLoad: z.boolean().describe('Wait for page to fully load').default(true)
    }
  },
  {
    name: 'tab_list',
    description: 'Get list of all currently open Claude.ai tabs with their IDs, status, and conversation IDs (if available).',
    zodSchema: {}
  },
  {
    name: 'tab_close',
    description: 'Close a specific Claude.ai tab by tab ID. SAFETY WARNING: Will close tab and lose any unsaved work. Use force=true only when necessary.',
    zodSchema: {
      tabId: z.number().describe('The Chrome tab ID to close'),
      force: z.boolean().default(false).describe('Force close even if there are unsaved changes')
    }
  },
  {
    name: 'tab_send_message',
    description: 'Send message to Claude tab with configurable async/sync behavior',
    zodSchema: {
      tabId: z.number().describe('Tab ID to send message to'),
      message: z.string().describe('Message to send to Claude'),
      waitForCompletion: z.boolean().describe('Whether to wait for response completion (false = async, true = sync)').default(false),
      waitForReady: z.boolean().describe('Whether to wait for Claude to be ready before sending').default(true),
      maxRetries: z.number().describe('Maximum number of retry attempts if sending fails').default(3),
      retryDelayMs: z.number().describe('Delay between retry attempts in milliseconds').default(1000)
    }
  },
  {
    name: 'tab_get_response',
    description: 'Get the latest response from Claude tab with auto-completion detection',
    zodSchema: {
      tabId: z.number().describe('Tab ID to get response from'),
      timeoutMs: z.number().default(30000).describe('Timeout in milliseconds')
    }
  },
  {
    name: 'tab_get_response_status',
    description: 'Get real-time status of Claude response generation including progress estimation',
    zodSchema: {
      tabId: z.number().describe('The tab ID to check response status for')
    }
  },
  {
    name: 'tab_forward_response',
    description: 'Forward Claude response from source tab to target tab',
    zodSchema: {
      sourceTabId: z.number().describe('Source tab ID to get response from'),
      targetTabId: z.number().describe('Target tab ID to send response to'),
      transformTemplate: z.string().optional().describe('Optional transformation template with  placeholder')
    }
  },
  {
    name: 'tab_extract_elements',
    description: 'Extract conversation elements including artifacts, code blocks, and tool usage',
    zodSchema: {
      tabId: z.number().describe('The tab ID of the Claude conversation'),
      batchSize: z.number().default(50).describe('Max elements to process per type (default: 50)'),
      maxElements: z.number().default(1000).describe('Max total elements to extract before stopping (default: 1000)')
    }
  },
  {
    name: 'tab_export_conversation',
    description: 'Export a full conversation transcript with metadata in markdown or JSON format',
    zodSchema: {
      tabId: z.number().describe('The tab ID of the Claude conversation to export'),
      format: z.enum(['markdown', 'json']).default('markdown').describe('Export format (markdown or json)')
    }
  },
  {
    name: 'tab_debug_page',
    description: 'Debug Claude page readiness and get page information',
    zodSchema: {
      tabId: z.number().describe('The tab ID of the Claude page to debug')
    }
  },
  {
    name: 'tab_batch_operations',
    description: 'Perform batch operations on multiple tabs: send messages and/or get responses. ASYNC-BY-DEFAULT: Optimal for parallel operations.',
    zodSchema: {
      operation: z.enum(['send_messages', 'get_responses', 'send_and_get']).describe('Type of batch operation to perform'),
      messages: z.array(z.object({
        tabId: z.number().describe('The tab ID to send the message to'),
        message: z.string().describe('The message to send')
      })).optional().describe('Array of message objects for send operations'),
      tabIds: z.array(z.number()).optional().describe('Array of tab IDs for get_responses operations'),
      sequential: z.boolean().default(false).describe('Whether to process sequentially (true) or in parallel (false)'),
      delayMs: z.number().default(1000).describe('Delay between sequential operations in milliseconds'),
      maxConcurrent: z.number().default(5).describe('Maximum concurrent operations for parallel mode'),
      timeoutMs: z.number().default(30000).describe('Maximum time to wait for operations in milliseconds'),
      waitForAll: z.boolean().default(true).describe('Whether to wait for all operations or return as they complete'),
      pollIntervalMs: z.number().default(1000).describe('How often to check for completion in milliseconds')
    }
  }
];

/**
 * Tab tool handlers
 */
const tabHandlers = {
  'tab_create': async (server, args) => {
    return await server.forwardToExtension('tab_create', args);
  },

  'tab_list': async (server, args) => {
    return await server.forwardToExtension('tab_list', args);
  },

  'tab_close': async (server, args) => {
    return await server.forwardToExtension('tab_close', args);
  },

  'tab_send_message': async (server, args) => {
    // OPERATION ID UNIFICATION FIX: Create MCP server operation first
    const operationId = server.operationManager.createOperation('tab_send_message', {
      tabId: args.tabId,
      message: args.message,
      waitForCompletion: args.waitForCompletion
    });
    
    // Add server operation ID to args for extension to use
    const argsWithOpId = {
      ...args,
      operationId: operationId
    };
    
    server.operationManager.updateOperation(operationId, 'started', { 
      phase: 'forwarding_to_extension'
    });
    
    try {
      // Forward to unified tab_send_message command (routes internally based on waitForCompletion)
      const result = await server.forwardToExtension('tab_send_message', argsWithOpId);
      
      // Parse MCP-wrapped response from forwardToExtension
      let actualResult;
      try {
        if (result && result.content && result.content[0] && result.content[0].text) {
          actualResult = JSON.parse(result.content[0].text);
        } else {
          actualResult = result;
        }
      } catch (parseError) {
        actualResult = result;
      }
      
      // Update operation based on parsed result
      if (actualResult && actualResult.success) {
        server.operationManager.updateOperation(operationId, 'completed', { 
          phase: 'extension_completed',
          result: actualResult
        });
      } else {
        server.operationManager.updateOperation(operationId, 'error', { 
          phase: 'extension_failed',
          error: actualResult?.error || 'Unknown error'
        });
      }
      
      return result;
    } catch (error) {
      server.operationManager.updateOperation(operationId, 'error', { 
        phase: 'forwarding_failed',
        error: error.message
      });
      throw error;
    }
  },

  'tab_get_response': async (server, args) => {
    return await server.forwardToExtension('tab_get_response', args);
  },

  'tab_get_response_status': async (server, args) => {
    return await server.forwardToExtension('tab_get_response_status', args);
  },

  'tab_forward_response': async (server, args) => {
    return await server.forwardToExtension('tab_forward_response', args);
  },

  'tab_extract_elements': async (server, args) => {
    return await server.forwardToExtension('tab_extract_elements', args);
  },

  'tab_export_conversation': async (server, args) => {
    return await server.forwardToExtension('tab_export_conversation', args);
  },

  'tab_debug_page': async (server, args) => {
    return await server.forwardToExtension('tab_debug_page', args);
  },

  'tab_batch_operations': async (server, args) => {
    // Route to appropriate batch operations based on operation type
    switch (args.operation) {
      case 'send_messages':
        return await server.forwardToExtension('tab_batch_operations', {
          messages: args.messages,
          sequential: args.sequential,
          delayMs: args.delayMs,
          maxConcurrent: args.maxConcurrent
        });
      case 'get_responses':
        return await server.forwardToExtension('tab_batch_operations', {
          tabIds: args.tabIds,
          timeoutMs: args.timeoutMs,
          waitForAll: args.waitForAll,
          pollIntervalMs: args.pollIntervalMs
        });
      case 'send_and_get':
        // First send messages, then get responses
        const sendResult = await server.forwardToExtension('tab_batch_operations', {
          messages: args.messages,
          sequential: args.sequential,
          delayMs: args.delayMs,
          maxConcurrent: args.maxConcurrent
        });
        
        if (sendResult.success) {
          // Extract tabIds from messages for getting responses
          const tabIds = args.messages.map(msg => msg.tabId);
          const getResult = await server.forwardToExtension('tab_batch_operations', {
            tabIds: tabIds,
            timeoutMs: args.timeoutMs,
            waitForAll: args.waitForAll,
            pollIntervalMs: args.pollIntervalMs
          });
          
          return {
            success: getResult.success,
            sendResult: sendResult,
            getResult: getResult
          };
        } else {
          return sendResult;
        }
      default:
        throw new Error();
    }
  }
};

module.exports = { tabTools, tabHandlers };