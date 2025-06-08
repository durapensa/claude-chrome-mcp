// Content Script Manager for injecting scripts into Claude.ai tabs

import { CLAUDE_AI_URL } from './config.js';
import { withErrorHandling } from '../utils/error-handler.js';

export class ContentScriptManager {
  constructor() {
    this.injectedTabs = new Set();
    this.injectionTimestamps = new Map(); // Track when injection happened
  }

  async injectContentScript(tabId) {
    console.log(`CCM: Injecting content script into tab ${tabId}`);
    
    if (this.injectedTabs.has(tabId)) {
      console.log(`CCM: Content script already injected in tab ${tabId}`);
      return { success: true, alreadyInjected: true };
    }

    // Extract core injection logic to a separate method for error handling
    const coreInjection = async () => {
      // Get tab info to verify it's a Claude.ai tab
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || !tab.url.includes('claude.ai')) {
        console.log(`CCM: Tab ${tabId} is not a Claude.ai tab, skipping injection`);
        return { success: false, error: 'Not a Claude.ai tab' };
      }

      // Execute conversation observer in MAIN world
      const [mainWorldResult] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: this.getMainWorldScript(),
        world: 'MAIN'
      });

      // Execute communication bridge in ISOLATED world
      const [isolatedWorldResult] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: this.getIsolatedWorldScript(),
        world: 'ISOLATED'
      });

      // Add cross-world communication to MAIN world observer
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: this.getCrossWorldCommunicationScript(),
        world: 'MAIN'
      });

      const result = [mainWorldResult, isolatedWorldResult];
      
      console.log(`CCM: Script execution result for tab ${tabId}:`, result);
      
      this.injectedTabs.add(tabId);
      this.injectionTimestamps.set(tabId, Date.now());
      console.log(`CCM: Content script injected successfully in tab ${tabId}`);
      return { success: true, method: 'inline_isolated_injection', result };
    };

    // Use error handler utility with consistent logging and error format
    const wrappedInjection = withErrorHandling(
      coreInjection, 
      `CCM: Failed to inject content script into tab ${tabId}`
    );

    return await wrappedInjection();
  }

  removeTab(tabId) {
    this.injectedTabs.delete(tabId);
    this.injectionTimestamps.delete(tabId);
  }

  // Check if enough time has passed since injection to consider navigation legitimate
  shouldClearOnNavigation(tabId) {
    const injectionTime = this.injectionTimestamps.get(tabId);
    if (!injectionTime) return true; // No injection record, safe to clear
    
    const timeSinceInjection = Date.now() - injectionTime;
    return timeSinceInjection > 5000; // Wait 5 seconds after injection before clearing on navigation
  }

  getMainWorldScript() {
    // Return the function that will be executed in MAIN world
    return () => {
      if (window.conversationObserver) {
        console.log('CCM: Conversation observer already exists');
        return 'Observer already exists';
      }

      window.conversationObserver = {
        operationRegistry: new Map(),
        lastObservedResponse: null,
        isConnected: true,

        registerOperation(operationId, operationType, params) {
          const operation = {
            id: operationId,
            type: operationType,
            params: params || {},
            status: 'registered',
            registeredAt: Date.now(),
            lastUpdate: Date.now(),
            networkResponses: []
          };
          
          this.operationRegistry.set(operationId, operation);
          
          if (operationType === 'send_message') {
            operation.messageSent = params.message;
            operation.status = 'sending';
          }
          
          return operation;
        },

        updateOperation(operationId, updates) {
          const operation = this.operationRegistry.get(operationId);
          if (operation) {
            Object.assign(operation, updates);
            operation.lastUpdate = Date.now();
          }
          return operation;
        }
      };

      // Network interceptor setup
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const [url, options] = args;
        
        try {
          const response = await originalFetch.apply(this, args);
          
          if (typeof url === 'string' && url.includes('/api/organizations/') && url.includes('/chat_conversations/')) {
            const clonedResponse = response.clone();
            
            clonedResponse.text().then(responseText => {
              try {
                const responseData = JSON.parse(responseText);
                
                if (url.endsWith('/completion')) {
                  window.conversationObserver.handleNetworkResponse('stream_complete', {
                    url,
                    data: responseData,
                    timestamp: Date.now()
                  });
                }
              } catch (e) {
                console.error('CCM: Error parsing response:', e);
              }
            }).catch(err => {
              console.error('CCM: Error reading response:', err);
            });
          }
          
          return response;
        } catch (error) {
          console.error('CCM: Fetch error:', error);
          throw error;
        }
      };

      window.conversationObserver.handleNetworkResponse = function(type, data) {
        for (const [operationId, operation] of this.operationRegistry) {
          if (operation.status === 'waiting_response' || operation.status === 'receiving') {
            operation.networkResponses.push({ type, data, timestamp: Date.now() });
            
            if (type === 'stream_complete') {
              operation.status = 'completed';
              operation.completedAt = Date.now();
              operation.response = data.data;
              this.lastObservedResponse = { operationId, response: data.data, timestamp: Date.now() };
            }
          }
        }
      };

      // Observer for individual message content changes
      const observeMessageContent = (messageElement, operationId) => {
        let lastContent = '';
        let noChangeCount = 0;
        let checkCount = 0;
        
        const getFullContent = (element) => {
          // Simply get all text content from the message element
          // This will include all nested p, pre, code, etc.
          return element.textContent?.trim() || '';
        };
        
        const checkCompletion = () => {
          const currentContent = getFullContent(messageElement);
          checkCount++;
          
          if (currentContent === lastContent && currentContent.length > 0) {
            noChangeCount++;
            // Wait for more consecutive no-changes and ensure we've checked at least 5 times
            if (noChangeCount >= 5 && checkCount >= 5) {
              const operation = window.conversationObserver.operationRegistry.get(operationId);
              if (operation && operation.status === 'receiving') {
                operation.status = 'completed';
                operation.completedAt = Date.now();
                operation.response = { text: currentContent };
                window.conversationObserver.lastObservedResponse = {
                  operationId,
                  response: { text: currentContent },
                  timestamp: Date.now()
                };
                console.log(`CCM: Operation ${operationId} completed with ${currentContent.length} chars`);
                return true;
              }
            }
          } else if (currentContent !== lastContent) {
            noChangeCount = 0;
            lastContent = currentContent;
            console.log(`CCM: Content still changing for ${operationId}, length: ${currentContent.length}`);
          }
          return false;
        };
        
        const contentObserver = new MutationObserver(() => {
          if (checkCompletion()) {
            contentObserver.disconnect();
          }
        });
        
        contentObserver.observe(messageElement, {
          childList: true,
          subtree: true,
          characterData: true,
          characterDataOldValue: true
        });
        
        // Check periodically as well
        const checkInterval = setInterval(() => {
          if (checkCompletion()) {
            contentObserver.disconnect();
            clearInterval(checkInterval);
          }
        }, 200); // Check more frequently
        
        // Clear interval after 30 seconds to prevent memory leak
        setTimeout(() => {
          clearInterval(checkInterval);
          contentObserver.disconnect();
        }, 30000);
      };

      // DOM Observer for message detection
      const messageObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check for Claude messages using new selectors
                const isClaudeMessage = node.classList?.contains('font-claude-message') ||
                                       node.querySelector?.('.font-claude-message');
                
                if (isClaudeMessage) {
                  console.log('CCM: Claude message detected');
                  
                  // Find the actual message content
                  let messageElement = node.classList?.contains('font-claude-message') ? node : node.querySelector('.font-claude-message');
                  if (!messageElement) return;
                  
                  // Update operations with streaming status
                  for (const [operationId, operation] of window.conversationObserver.operationRegistry) {
                    if (operation.status === 'sending' || operation.status === 'waiting_response') {
                      operation.status = 'receiving';
                      operation.messageElement = messageElement;
                      console.log(`CCM: Operation ${operationId} now receiving stream`);
                      
                      // Start observing this specific message for content changes
                      observeMessageContent(messageElement, operationId);
                    }
                  }
                }
              }
            });
          }
        }
      });

      // Start observing once DOM is ready
      if (document.body) {
        messageObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
        console.log('CCM: DOM observer started');
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          messageObserver.observe(document.body, {
            childList: true,
            subtree: true
          });
          console.log('CCM: DOM observer started after DOMContentLoaded');
        });
      }

      console.log('CCM: Conversation observer ready in MAIN world');
      return 'Observer initialized in MAIN world';
    };
  }

  getIsolatedWorldScript() {
    // Return the function that will be executed in ISOLATED world
    return () => {
      if (window.ccmBridge) {
        console.log('CCM: Communication bridge already exists');
        return 'Bridge already exists';
      }

      window.ccmBridge = {
        sendToBackground(message) {
          return chrome.runtime.sendMessage(message);
        }
      };

      // Listen for messages from background
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'register_operation') {
          const { operationId, operationType, params } = message;
          
          // Send CustomEvent to MAIN world observer
          const registerEvent = new CustomEvent('ccm_register_operation', {
            detail: {
              operationId,
              operationType, 
              params
            }
          });
          document.dispatchEvent(registerEvent);
          
          sendResponse({ success: true, bridge: 'isolated_world' });
          return true;
        }
        
        return false;
      });

      console.log('CCM: Communication bridge ready in ISOLATED world');
      return 'Bridge initialized in ISOLATED world';
    };
  }

  getCrossWorldCommunicationScript() {
    // Return the function that sets up cross-world communication
    // This function will be stringified and executed in the content script context
    return function() {
      // Listen for registration CustomEvents from ISOLATED world
      document.addEventListener('ccm_register_operation', (event) => {
        const { operationId, operationType, params } = event.detail;
        
        if (window.conversationObserver) {
          const operation = window.conversationObserver.registerOperation(operationId, operationType, params);
          console.log(`[Observer] Registered operation from CustomEvent bridge: ${operationId}`);
        }
      });
      
      return 'Cross-world communication setup complete';
    };
  }
}