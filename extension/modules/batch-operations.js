// Batch Operations for Chrome Extension
// Methods for batch messaging and response collection

export const batchOperationMethods = {
  async batchSendMessages(params) {
    const { messages, sequential = false } = params;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return { 
        success: false, 
        reason: 'Messages array is required and must not be empty' 
      };
    }
    
    const results = [];
    const startTime = Date.now();
    
    if (sequential) {
      // Send messages one by one, waiting for each to complete
      for (const msg of messages) {
        try {
          const sendResult = await this.sendMessageToClaudeTab({
            tabId: msg.tabId,
            message: msg.message
          });
          
          results.push({
            tabId: msg.tabId,
            success: sendResult.success,
            result: sendResult,
            timestamp: Date.now()
          });
          
          // Small delay between sequential messages
          if (messages.indexOf(msg) < messages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          results.push({
            tabId: msg.tabId,
            success: false,
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
    } else {
      // Send all messages in parallel
      const promises = messages.map(async (msg) => {
        try {
          const sendResult = await this.sendMessageToClaudeTab({
            tabId: msg.tabId,
            message: msg.message
          });
          
          return {
            tabId: msg.tabId,
            success: sendResult.success,
            result: sendResult,
            timestamp: Date.now()
          };
        } catch (error) {
          return {
            tabId: msg.tabId,
            success: false,
            error: error.message,
            timestamp: Date.now()
          };
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
  },

  async batchGetResponses(params) {
    const {
      tabIds,
      timeoutMs = 30000,
      waitForAll = true,
      pollIntervalMs = 1000
    } = params;
    
    const results = [];
    const startTime = Date.now();
    
    try {
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
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        results,
        summary: {
          total: tabIds.length,
          completed: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length + 1
        }
      };
    }
  },

  async getClaudeResponseStatus(params) {
    const { tabId } = params;
    
    try {
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
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tabId: tabId,
        status: 'error'
      };
    }
  }
};