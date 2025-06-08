// Chrome Tab Operations for ExtensionRelayClient

import { generateOperationId, isClaudeAiUrl } from '../utils/utils.js';
import { OPERATION_TIMEOUT, COMPLETION_TIMEOUT } from './config.js';
import { 
  withErrorHandling, 
  withLockManagement, 
  withChromeAPIErrorHandling, 
  validateParams 
} from '../utils/error-handler.js';

// Tab operation methods to be mixed into ExtensionRelayClient
export const tabOperations = {
  async createTab(params = {}) {
    console.log('CCM Extension: Spawning new Claude.ai tab', params);
    
    // Extract core logic for error handling
    const coreSpawnLogic = async () => {
      // Create new tab
      const tab = await chrome.tabs.create({
        url: params.url || 'https://claude.ai/new',
        active: params.active !== false
      });
      
      console.log(`CCM Extension: Created tab ${tab.id}`);
      
      // Wait for tab to load if requested
      if (params.waitForLoad) {
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      }
      
      // Inject content script if requested
      if (params.injectContentScript && this.extensionScriptManager) {
        console.log(`CCM Extension: Injecting content script into spawned tab ${tab.id}`);
        
        // Wait for the URL to actually be set (not just status complete)
        await new Promise((resolve) => {
          const checkUrl = async () => {
            const currentTab = await chrome.tabs.get(tab.id);
            if (currentTab.url && currentTab.url.includes('claude.ai')) {
              resolve();
            } else {
              setTimeout(checkUrl, 100);
            }
          };
          checkUrl();
        });
        
        const injectionResult = await this.extensionScriptManager.injectContentScript(tab.id);
        console.log(`CCM Extension: Injection result:`, injectionResult);
        
        return {
          success: true,
          tabId: tab.id,
          tab: tab,
          injectionResult: injectionResult
        };
      }
      
      return {
        success: true,
        tabId: tab.id,
        tab: tab
      };
    };

    // Use error handler utility
    const wrappedSpawn = withErrorHandling(
      coreSpawnLogic, 
      'CCM Extension: Failed to spawn Claude tab'
    );

    return await wrappedSpawn();
  },

  async closeClaudeTab(params) {
    console.log('CCM Extension: closeClaudeTab called with params:', params);
    console.log('CCM Extension: params type:', typeof params);
    console.log('CCM Extension: params keys:', Object.keys(params || {}));
    console.log('CCM Extension: tabId value:', params?.tabId);
    
    // Validate parameters
    const validationError = validateParams(params, ['tabId']);
    if (validationError) {
      return validationError;
    }
    
    const { tabId } = params;
    
    // Extract core logic for error handling
    const coreCloseLogic = async () => {
      // Use centralized cleanup method with proper dependency ordering
      if (typeof this.cleanupTabResources === 'function') {
        const result = await this.cleanupTabResources(tabId, { 
          closeTab: true, // Include tab closure in centralized cleanup
          reason: 'closeClaudeTab_command' 
        });
        
        if (result.success) {
          console.log(`CCM Extension: Successfully closed tab ${tabId} with proper cleanup`, { 
            steps: result.steps 
          });
          return { success: true, cleanupSteps: result.steps };
        } else {
          console.error(`CCM Extension: Tab cleanup had errors for tab ${tabId}`, { 
            steps: result.steps, 
            errors: result.errors 
          });
          return { 
            success: result.errors.length === 0, 
            error: result.errors.length > 0 ? `Cleanup errors: ${result.errors.map(e => e.error).join(', ')}` : undefined,
            cleanupSteps: result.steps,
            cleanupErrors: result.errors
          };
        }
      } else {
        // Fallback to old method if centralized cleanup not available
        console.warn(`CCM Extension: Using fallback cleanup for tab ${tabId}`);
        
        await chrome.tabs.remove(tabId);
        console.log(`CCM Extension: Closed tab ${tabId}`);
        
        // Clean up any associated data
        this.operationLock.releaseLock(tabId);
        if (this.extensionScriptManager) {
          this.extensionScriptManager.removeTab(tabId);
        }
        
        // Clean up debugger session if exists
        if (this.debuggerSessions && this.debuggerSessions.has(tabId)) {
          await this.detachDebugger(tabId);
        }
        
        return { success: true };
      }
    };

    // Use error handler utility
    const wrappedClose = withErrorHandling(
      coreCloseLogic, 
      `CCM Extension: Failed to close tab ${tabId}`
    );

    return await wrappedClose();
  },

  async getClaudeTabs() {
    // Extract core logic for error handling
    const coreGetTabsLogic = async () => {
      const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      
      const tabInfo = tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.active,
        status: tab.status,
        hasContentScript: this.extensionScriptManager ? 
          this.extensionScriptManager.injectedTabs.has(tab.id) : false
      }));
      
      return {
        success: true,
        tabs: tabInfo,
        count: tabInfo.length
      };
    };

    // Use error handler utility
    const wrappedGetTabs = withErrorHandling(
      coreGetTabsLogic, 
      'CCM Extension: Failed to get Claude tabs'
    );

    return await wrappedGetTabs();
  },

  async focusClaudeTab(params) {
    // Validate parameters
    const validationError = validateParams(params, ['tabId']);
    if (validationError) {
      return validationError;
    }
    
    const { tabId } = params;
    
    // Extract core logic for error handling
    const coreFocusLogic = async () => {
      // Update tab to make it active
      await chrome.tabs.update(tabId, { active: true });
      
      // Get the tab to find its window
      const tab = await chrome.tabs.get(tabId);
      
      // Focus the window
      await chrome.windows.update(tab.windowId, { focused: true });
      
      console.log(`CCM Extension: Focused tab ${tabId}`);
      return { success: true };
    };

    // Use error handler utility
    const wrappedFocus = withErrorHandling(
      coreFocusLogic, 
      `CCM Extension: Failed to focus tab ${tabId}`
    );

    return await wrappedFocus();
  },

  async extractConversationElements(params) {
    // Validate parameters
    const validationError = validateParams(params, ['tabId']);
    if (validationError) {
      return validationError;
    }
    
    const { tabId } = params;
    
    // Extract core logic for error handling
    const coreExtractLogic = async () => {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function() {
          // Extract conversation elements from the page
          const elements = {
            messages: [],
            inputField: null,
            submitButton: null,
            conversationId: null
          };
          
          // Extract messages
          const messageElements = document.querySelectorAll('[data-testid^="message-"]');
          messageElements.forEach(el => {
            const role = el.getAttribute('data-testid')?.includes('user') ? 'user' : 'assistant';
            const content = el.textContent || '';
            elements.messages.push({ role, content });
          });
          
          // Find input field
          const inputField = document.querySelector('div[contenteditable="true"]');
          if (inputField) {
            elements.inputField = {
              found: true,
              placeholder: inputField.getAttribute('data-placeholder') || 'Type a message',
              value: inputField.textContent || ''
            };
          }
          
          // Find submit button
          const submitButton = document.querySelector('button[aria-label*="Send"], button:has(svg[stroke])');
          if (submitButton) {
            elements.submitButton = {
              found: true,
              disabled: submitButton.disabled,
              ariaLabel: submitButton.getAttribute('aria-label')
            };
          }
          
          // Try to extract conversation ID from URL
          const urlMatch = window.location.href.match(/\/chat\/([a-f0-9-]+)/);
          if (urlMatch) {
            elements.conversationId = urlMatch[1];
          }
          
          return elements;
        }
      });
      
      return {
        success: true,
        elements: results[0].result
      };
    };

    // Use error handler utility
    const wrappedExtract = withErrorHandling(
      coreExtractLogic, 
      `CCM Extension: Failed to extract elements from tab ${tabId}`
    );

    return await wrappedExtract();
  },

  async sendTabMessage(params) {
    console.log(`CCM Extension: sendTabMessage received params:`, params);
    const { tabId, message, waitForReady = true, operationId: serverOperationId } = params;
    console.log(`CCM Extension: extracted serverOperationId:`, serverOperationId);
    
    // Validate parameters
    const validationError = validateParams(params, ['tabId', 'message']);
    if (validationError) {
      return validationError;
    }
    
    // Define Chrome API error mappings for sendMessage call
    const chromeAPIErrorMappings = {
      'Receiving end does not exist': {
        error: 'Content script not available in target tab. Tab may not have content script injected or may be on a non-Claude.ai page.',
        errorType: 'content_script_missing',
        additionalFields: { tabId }
      }
    };
    
    // Extract core message sending logic
    const coreMessageSendLogic = async () => {
      // OPERATION ID UNIFICATION: Use server operation ID if provided, otherwise generate one
      const operationId = serverOperationId || generateOperationId();
      console.log(`CCM Extension: Using operation ID: ${operationId} (from server: ${!!serverOperationId})`);
      
      // Register operation in content script with Chrome API error handling
      const wrappedSendMessage = withChromeAPIErrorHandling(
        async () => {
          await chrome.tabs.sendMessage(tabId, {
            type: 'register_operation',
            operationId: operationId,
            operationType: 'send_message',
            params: { message, tabId }
          });
        },
        `CCM Extension: Failed to register operation for tab ${tabId}`,
        chromeAPIErrorMappings,
        { tabId, errorType: 'communication_error' }
      );
      
      const sendMessageResult = await wrappedSendMessage();
      if (!sendMessageResult.success) {
        return sendMessageResult;
      }
      
      // Execute message sending
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function(message, waitForReady) {
          return new Promise((resolve) => {
            const sendMessage = () => {
              const inputField = document.querySelector('div[contenteditable="true"]');
              const submitButton = document.querySelector('button[aria-label*="Send"], button:has(svg[stroke])');
              
              if (!inputField || !submitButton) {
                resolve({ success: false, error: 'Could not find input elements' });
                return;
              }
              
              // Set the message in contenteditable div
              inputField.focus();
              inputField.textContent = message;
              
              // Dispatch input event to trigger React updates
              inputField.dispatchEvent(new Event('input', { bubbles: true }));
              
              // Also dispatch a more complete set of events that Claude.ai might expect
              const inputEvent = new InputEvent('beforeinput', {
                data: message,
                inputType: 'insertText',
                bubbles: true,
                cancelable: true
              });
              inputField.dispatchEvent(inputEvent);
              
              // Click submit after a brief delay
              setTimeout(() => {
                submitButton.click();
                resolve({ success: true, timestamp: Date.now() });
              }, 200);
            };
            
            if (waitForReady) {
              // Wait for page to be ready
              if (document.readyState === 'complete') {
                sendMessage();
              } else {
                window.addEventListener('load', sendMessage);
              }
            } else {
              sendMessage();
            }
          });
        },
        args: [message, waitForReady]
      });
      
      const result = results[0].result;
      if (result.success) {
        // Update operation status to waiting_response
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: function(opId) {
            if (window.conversationObserver) {
              const operation = window.conversationObserver.operationRegistry.get(opId);
              if (operation) {
                operation.status = 'waiting_response';
                operation.lastUpdate = Date.now();
                console.log(`CCM: Operation ${opId} status updated to waiting_response`);
              }
            }
          },
          args: [operationId]
        });
        
        return {
          success: true,
          operationId: operationId,
          timestamp: result.timestamp
        };
      } else {
        return result;
      }
    };

    // Use lock management wrapper
    const wrappedWithLock = withLockManagement(
      coreMessageSendLogic,
      `CCM Extension: Failed to send message to tab ${tabId}`,
      (lockKey) => this.operationLock.acquireLock(lockKey, 'send_message'),
      (lockKey) => this.operationLock.releaseLock(lockKey),
      () => tabId
    );

    return await wrappedWithLock();
  },

  async getClaudeResponse(params) {
    // Validate parameters
    const validationError = validateParams(params, ['tabId']);
    if (validationError) {
      return validationError;
    }
    
    const { tabId, operationId, timeoutMs = 30000 } = params;
    
    // Extract core logic for error handling
    const coreGetResponseLogic = async () => {
      const startTime = Date.now();
      const checkInterval = 500;
      
      while (Date.now() - startTime < timeoutMs) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: function(opId) {
            if (!window.conversationObserver) {
              return { status: 'no_observer' };
            }
            
            // If no operationId provided, get the last observed response
            if (!opId) {
              const lastResponse = window.conversationObserver.lastObservedResponse;
              if (lastResponse) {
                return {
                  status: 'completed',
                  response: lastResponse.response,
                  operationId: lastResponse.operationId,
                  timestamp: lastResponse.timestamp
                };
              }
              return { status: 'no_response' };
            }
            
            // Get specific operation
            const operation = window.conversationObserver.operationRegistry.get(opId);
            if (!operation) {
              return { status: 'operation_not_found' };
            }
            
            return {
              status: operation.status,
              response: operation.response,
              operationId: opId,
              duration: operation.completedAt ? 
                operation.completedAt - operation.registeredAt : null
            };
          },
          args: [operationId || null]
        });
        
        const result = results[0].result;
        
        if (result.status === 'completed') {
          return {
            success: true,
            ...result
          };
        }
        
        if (result.status === 'no_observer' || result.status === 'operation_not_found') {
          return {
            success: false,
            error: result.status,
            description: result.status === 'no_observer' ? 
              'Content script not properly initialized' :
              'Operation not found in registry'
          };
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
      
      // Timeout reached
      return {
        success: false,
        error: 'timeout',
        description: `Response not received within ${timeoutMs}ms`
      };
    };

    // Use error handler utility
    const wrappedGetResponse = withErrorHandling(
      coreGetResponseLogic, 
      `CCM Extension: Failed to get response from tab ${tabId}`
    );

    return await wrappedGetResponse();
  }
};