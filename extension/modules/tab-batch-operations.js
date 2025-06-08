// Batch Operations for Chrome Extension
// Methods for batch messaging and response collection

import { 
  withErrorHandling, 
  validateParams 
} from '../utils/error-handler.js';

export const tabBatchOperations = {
  async batchSendMessages(params) {
    // Validate parameters with custom array validator
    const validationError = validateParams(
      params, 
      ['messages'],
      {
        messages: (value) => {
          if (!Array.isArray(value)) {
            return 'Messages must be an array';
          }
          if (value.length === 0) {
            return 'Messages array is required and must not be empty';
          }
          return true;
        }
      }
    );
    
    if (validationError) {
      return { 
        success: false, 
        reason: validationError.error 
      };
    }

    const { messages, sequential = false } = params;
    
    // Extract core logic for error handling
    const coreBatchSendLogic = async () => {
      const results = [];
      const startTime = Date.now();
      
      if (sequential) {
        // Send messages one by one, waiting for each to complete
        for (const msg of messages) {
          const wrappedSendMessage = withErrorHandling(
            async () => {
              const sendResult = await this.sendTabMessage({
                tabId: msg.tabId,
                message: msg.message
              });
              
              return {
                tabId: msg.tabId,
                success: sendResult.success,
                result: sendResult,
                timestamp: Date.now()
              };
            },
            `CCM Extension: Failed to send message to tab ${msg.tabId}`
          );
          
          const messageResult = await wrappedSendMessage();
          
          // Handle error case by converting to expected format
          if (!messageResult.success) {
            results.push({
              tabId: msg.tabId,
              success: false,
              error: messageResult.error,
              timestamp: Date.now()
            });
          } else {
            results.push(messageResult);
          }
          
          // Small delay between sequential messages
          if (messages.indexOf(msg) < messages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } else {
        // Send all messages in parallel
        const promises = messages.map(async (msg) => {
          const wrappedSendMessage = withErrorHandling(
            async () => {
              const sendResult = await this.sendTabMessage({
                tabId: msg.tabId,
                message: msg.message
              });
              
              return {
                tabId: msg.tabId,
                success: sendResult.success,
                result: sendResult,
                timestamp: Date.now()
              };
            },
            `CCM Extension: Failed to send message to tab ${msg.tabId}`
          );
          
          const messageResult = await wrappedSendMessage();
          
          // Handle error case by converting to expected format
          if (!messageResult.success) {
            return {
              tabId: msg.tabId,
              success: false,
              error: messageResult.error,
              timestamp: Date.now()
            };
          } else {
            return messageResult;
          }
        });
        
        const parallelResults = await Promise.allSettled(promises);
        parallelResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              tabId: messages[index].tabId,
              success: false,
              error: result.reason,
              timestamp: Date.now()
            });
          }
        });
      }
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      
      return {
        success: failureCount === 0,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount,
          sequential: sequential,
          durationMs: Date.now() - startTime
        },
        results: results
      };
    };

    // This method already handles its own errors and returns proper format
    return await coreBatchSendLogic();
  },

  async batchGetResponses(params) {
    // Validate parameters
    const validationError = validateParams(params, ['tabIds']);
    if (validationError) {
      return validationError;
    }

    const {
      tabIds,
      timeoutMs = 30000,
      waitForAll = true,
      pollIntervalMs = 1000
    } = params;
    
    // Extract core logic for error handling
    const coreBatchGetLogic = async () => {
      const results = [];
      const startTime = Date.now();
      if (waitForAll) {
        // Wait for all responses to complete
        const promises = tabIds.map(async (tabId) => {
          const startTabTime = Date.now();
          
          // Poll for completion
          while (Date.now() - startTime < timeoutMs) {
            const status = await this.getClaudeResponseStatus({ tabId });
            
            if (status.status === 'complete' || status.status === 'error') {
              const response = await this.getClaudeResponse({ 
                tabId, 
                waitForCompletion: false,
                timeoutMs: 5000
              });
              
              return {
                tabId,
                response,
                status: status.status,
                completedAt: Date.now(),
                duration: Date.now() - startTabTime,
                success: status.status === 'complete'
              };
            }
            
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          }
          
          // Timeout reached
          return {
            tabId,
            response: null,
            status: 'timeout',
            completedAt: Date.now(),
            duration: Date.now() - startTabTime,
            success: false,
            error: 'Response timeout'
          };
        });
        
        const allResults = await Promise.all(promises);
        results.push(...allResults);
        
      } else {
        // Return responses as they complete
        const pendingTabs = [...tabIds];
        
        while (pendingTabs.length > 0 && Date.now() - startTime < timeoutMs) {
          for (let i = pendingTabs.length - 1; i >= 0; i--) {
            const tabId = pendingTabs[i];
            const status = await this.getClaudeResponseStatus({ tabId });
            
            if (status.status === 'complete' || status.status === 'error') {
              const response = await this.getClaudeResponse({ 
                tabId, 
                waitForCompletion: false,
                timeoutMs: 5000 
              });
              
              results.push({
                tabId,
                response,
                status: status.status,
                completedAt: Date.now(),
                duration: Date.now() - startTime,
                success: status.status === 'complete'
              });
              
              pendingTabs.splice(i, 1);
            }
          }
          
          if (pendingTabs.length > 0) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          }
        }
        
        // Add timeout results for remaining tabs
        pendingTabs.forEach(tabId => {
          results.push({
            tabId,
            response: null,
            status: 'timeout',
            completedAt: Date.now(),
            duration: timeoutMs,
            success: false,
            error: 'Response timeout'
          });
        });
      }
      
      const summary = {
        total: tabIds.length,
        completed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        timedOut: results.filter(r => r.status === 'timeout').length,
        totalTime: Date.now() - startTime,
        averageResponseTime: results
          .filter(r => r.success)
          .reduce((sum, r) => sum + r.duration, 0) / Math.max(results.filter(r => r.success).length, 1)
      };
      
      return {
        success: true,
        results,
        summary,
        waitForAll,
        requestedTabs: tabIds.length
      };
    };

    // Use error handler utility with custom error format
    const wrappedBatchGet = withErrorHandling(
      coreBatchGetLogic,
      'CCM Extension: Error getting batch responses'
    );

    const result = await wrappedBatchGet();
    
    // If error, format as expected custom response  
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        results: [],
        summary: {
          total: tabIds.length,
          completed: 0,
          failed: tabIds.length
        }
      };
    }
    
    return result;
  },

  async getClaudeResponseStatus(params) {
    // Validate parameters
    const validationError = validateParams(params, ['tabId']);
    if (validationError) {
      return validationError;
    }

    const { tabId } = params;
    
    // Extract core logic for error handling
    const coreStatusLogic = async () => {
      await this.ensureDebuggerAttached(tabId);
      
      const script = `
        (function() {
          // Look for Claude's response generation indicators
          const typingIndicator = document.querySelector('[data-testid*="typing"], .typing, [class*="generating"]');
          const responseContainer = document.querySelector('[data-testid*="response"], [class*="response"]');
          const sendButton = document.querySelector('button[data-testid*="send"], button[type="submit"]');
          const errorElements = document.querySelectorAll('[class*="error"], [data-testid*="error"]');
          
          // Check for stop button (indicates active generation)
          const stopButton = document.querySelector('button[aria-label*="Stop"], button[title*="Stop"]');
          const hasStopButton = stopButton && stopButton.offsetParent !== null;
          
          // Estimate progress based on UI elements
          let status = 'unknown';
          let progress = null;
          
          if (hasStopButton) {
            status = 'generating';
            // Try to estimate progress from content length
            const allMessages = document.querySelectorAll('.font-claude-message');
            const lastMessage = allMessages[allMessages.length - 1];
            const responseText = lastMessage?.textContent || '';
            
            // Store response start time if not already stored
            if (!window.responseStartTime) {
              window.responseStartTime = Date.now();
            }
            
            progress = {
              estimatedCompletion: Math.min(responseText.length / 2000, 0.95), // Rough estimate
              tokensGenerated: Math.floor(responseText.length / 4), // ~4 chars per token
              timeElapsed: (Date.now() - window.responseStartTime) / 1000,
              responseLength: responseText.length
            };
          } else if (typingIndicator && typingIndicator.style.display !== 'none') {
            status = 'generating';
            if (!window.responseStartTime) {
              window.responseStartTime = Date.now();
            }
          } else if (errorElements.length > 0) {
            status = 'error';
            window.responseStartTime = null;
          } else if (sendButton && !sendButton.disabled) {
            status = 'complete';
            window.responseStartTime = null;
          } else if (sendButton && sendButton.disabled) {
            status = 'waiting_input';
            window.responseStartTime = null;
          }
          
          // Check for active tool usage
          const toolStates = {
            webSearchActive: !!document.querySelector('[data-testid*="search"][class*="active"]'),
            replActive: !!document.querySelector('[data-testid*="repl"][class*="active"]'),
            artifactsActive: !!document.querySelector('[data-testid*="artifact"][class*="generating"]')
          };
          
          // Get last message length for tracking
          const allMessages = document.querySelectorAll('.font-claude-message');
          const lastMessage = allMessages[allMessages.length - 1];
          const responseLength = lastMessage?.textContent?.length || 0;
          
          return {
            status,
            progress,
            isStreaming: status === 'generating',
            lastUpdate: Date.now(),
            tools: toolStates,
            responseLength: responseLength,
            hasErrors: errorElements.length > 0,
            errorMessages: Array.from(errorElements).map(el => el.textContent.trim()),
            hasStopButton: hasStopButton
          };
        })()
      `;
      
      const result = await this.executeScript({ tabId, script });
      
      return {
        success: true,
        ...result.result?.value,
        tabId: tabId
      };
    };

    // Use error handler utility with custom error format
    const wrappedStatus = withErrorHandling(
      coreStatusLogic,
      `CCM Extension: Error getting response status for tab ${tabId}`
    );

    const result = await wrappedStatus();
    
    // If error, format as expected custom response
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        tabId: tabId,
        status: 'error'
      };
    }
    
    return result;
  },

  // NEW REORGANIZED TOOL METHODS

  /**
   * Handle tab batch operations - consolidated routing for tab_batch_operations
   * Supports send_messages, get_responses, and send_and_get operations
   */
  async handleTabBatchOperations(params) {
    // Validate required operation parameter
    const validationError = validateParams(params, ['operation']);
    if (validationError) {
      throw new Error(validationError.error);
    }

    const { operation, messages, tabIds, ...batchParams } = params;
    
    switch (operation) {
      case 'send_messages':
        // Validate messages parameter
        const messagesValidation = validateParams(
          { messages }, 
          ['messages'],
          {
            messages: (value) => {
              if (!Array.isArray(value)) {
                return 'messages parameter required for send_messages operation and must be an array';
              }
              return true;
            }
          }
        );
        if (messagesValidation) {
          throw new Error(messagesValidation.error);
        }
        
        return await this.batchSendMessages({
          messages: messages,
          sequential: batchParams.sequential,
          delayMs: batchParams.delayMs,
          maxConcurrent: batchParams.maxConcurrent
        });
        
      case 'get_responses':
        // Validate tabIds parameter
        const tabIdsValidation = validateParams(
          { tabIds }, 
          ['tabIds'],
          {
            tabIds: (value) => {
              if (!Array.isArray(value)) {
                return 'tabIds parameter required for get_responses operation and must be an array';
              }
              return true;
            }
          }
        );
        if (tabIdsValidation) {
          throw new Error(tabIdsValidation.error);
        }
        
        return await this.batchGetResponses({
          tabIds: tabIds,
          timeoutMs: batchParams.timeoutMs,
          waitForAll: batchParams.waitForAll,
          pollIntervalMs: batchParams.pollIntervalMs
        });
        
      case 'send_and_get':
        // Validate messages parameter
        const sendAndGetValidation = validateParams(
          { messages }, 
          ['messages'],
          {
            messages: (value) => {
              if (!Array.isArray(value)) {
                return 'messages parameter required for send_and_get operation and must be an array';
              }
              return true;
            }
          }
        );
        if (sendAndGetValidation) {
          throw new Error(sendAndGetValidation.error);
        }
        
        // First send messages
        const sendResult = await this.batchSendMessages({
          messages: messages,
          sequential: batchParams.sequential,
          delayMs: batchParams.delayMs,
          maxConcurrent: batchParams.maxConcurrent
        });
        
        if (sendResult.success) {
          // Extract tabIds from messages for getting responses
          const responseTabIds = messages.map(msg => msg.tabId);
          const getResult = await this.batchGetResponses({
            tabIds: responseTabIds,
            timeoutMs: batchParams.timeoutMs,
            waitForAll: batchParams.waitForAll,
            pollIntervalMs: batchParams.pollIntervalMs
          });
          return { sendResult, getResult };
        }
        return sendResult;
        
      default:
        throw new Error(`Unknown batch operation: ${operation}`);
    }
  }
};