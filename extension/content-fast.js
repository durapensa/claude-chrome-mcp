// Fast Content Script for claude.ai pages
// Optimized for speed and reliability

console.log('CCM: Fast content script loading...', window.location.href);

// Streamlined ConversationObserver for speed
class ConversationObserver {
  constructor() {
    this.activeOperations = new Map();
    this.observer = null;
    console.log('[ConversationObserver] Fast observer initialized');
    this.setupFastObserver();
    this.setupNetworkInterception();
  }

  registerOperation(operationId, type, params = {}) {
    console.log(`[ConversationObserver] Registering operation ${operationId} (${type})`);
    const operation = {
      id: operationId,
      type,
      params,
      startTime: Date.now()
    };
    
    this.activeOperations.set(operationId, operation);
    this.notifyMilestone(operationId, 'started', { type, params });
    return operation;
  }

  setupFastObserver() {
    // Single observer for all DOM changes
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        this.handleFastMutation(mutation);
      }
    });
    
    // Start observing immediately
    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
        attributeFilter: ['disabled', 'aria-busy']
      });
      console.log('[ConversationObserver] Fast observer started');
    }
  }

  handleFastMutation(mutation) {
    // Fast detection for message sent - look for any button with send-like styling getting disabled
    if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
      const target = mutation.target;
      if (target.tagName === 'BUTTON' && 
          (target.className.includes('bg-accent-main') || target.className.includes('accent')) && 
          target.disabled) {
        this.handleMessageSent();
      }
    }
    
    // Fast detection for response completion - look for new assistant messages with aggressive logging
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Log all significant DOM additions for debugging
          if (node.tagName && (node.textContent?.length > 10 || node.querySelector)) {
            console.log(`[ConversationObserver] DOM added: ${node.tagName}, classes: ${node.className}, has data-message: ${!!node.matches?.('[data-message-author-role]')}`);
          }
          
          // Check if this node or any descendant is an assistant message
          const isAssistantMessage = node.matches && node.matches('[data-message-author-role="assistant"]');
          const hasAssistantMessage = node.querySelector && node.querySelector('[data-message-author-role="assistant"]');
          
          // Also check for any message-related attributes
          const hasMessageRole = node.matches && node.matches('[data-message-author-role]');
          const hasAnyMessage = node.querySelector && node.querySelector('[data-message-author-role]');
          
          if (isAssistantMessage || hasAssistantMessage || hasMessageRole || hasAnyMessage) {
            console.log('[ConversationObserver] Message-related DOM change detected:', {
              isAssistant: isAssistantMessage,
              hasAssistant: hasAssistantMessage,
              hasMessage: hasMessageRole,
              hasAnyMessage: hasAnyMessage
            });
            // Check completion multiple times with different delays
            setTimeout(() => this.checkResponseCompletion(), 500);
            setTimeout(() => this.checkResponseCompletion(), 1500);
            setTimeout(() => this.checkResponseCompletion(), 3000);
          }
        }
      });
    }
  }

  handleMessageSent() {
    for (const [operationId, operation] of this.activeOperations.entries()) {
      if (operation.type === 'send_message') {
        this.notifyMilestone(operationId, 'message_sent', {});
        console.log(`[ConversationObserver] Message sent for operation ${operationId}`);
      }
    }
  }

  checkResponseCompletion() {
    // Don't rely on send button state - check for actual response content
    const lastResponse = this.getLastResponse();
    
    if (lastResponse && lastResponse.text && lastResponse.text.length > 0) {
      // Check if we have any active operations waiting for completion
      for (const [operationId, operation] of this.activeOperations.entries()) {
        // Handle both send_message and get_response completion
        if (operation.type === 'get_response' || operation.type === 'send_message') {
          // Avoid duplicate notifications by checking if this response is new
          if (!operation.lastResponseText || operation.lastResponseText !== lastResponse.text) {
            operation.lastResponseText = lastResponse.text;
            this.notifyMilestone(operationId, 'response_completed', { response: lastResponse });
            this.activeOperations.delete(operationId);
            console.log(`[ConversationObserver] Response completed for operation ${operationId} (${operation.type})`);
          }
        }
      }
    }
  }

  getLastResponse() {
    // Use the reliable assistant message selector
    const assistantMessages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    
    if (lastAssistantMessage && lastAssistantMessage.textContent?.trim()) {
      const text = lastAssistantMessage.textContent.trim();
      return {
        text: text,
        isAssistant: true,
        isComplete: true,
        isUser: false,
        success: true,
        timestamp: Date.now(),
        totalMessages: document.querySelectorAll('[data-message-author-role]').length
      };
    }
    return null;
  }

  setupNetworkInterception() {
    // Better approach: Monitor fetch requests without consuming the stream
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0];
      
      // Check if this is a Claude API request
      if (typeof url === 'string' && (url.includes('conversation') || url.includes('message') || url.includes('claude.ai'))) {
        console.log('[ConversationObserver] Claude API request detected:', url);
        
        // Call original fetch
        const response = await originalFetch.apply(window, args);
        
        // Monitor the response without consuming it
        if (response.body && response.headers.get('content-type')?.includes('stream')) {
          // For streaming responses, monitor completion via response state
          this.monitorStreamResponse(response, url);
        } else if (response.ok) {
          // For regular responses, completion is immediate
          console.log('[ConversationObserver] Non-stream response completed');
          setTimeout(() => this.checkResponseCompletion(), 200);
        }
        
        return response;
      }
      
      // For non-Claude requests, pass through normally
      return originalFetch.apply(window, args);
    };
    
    // Also monitor XMLHttpRequest for completeness
    const originalXHR = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function(...args) {
      const xhr = this;
      const originalURL = xhr.url || this.responseURL;
      
      if (originalURL && (originalURL.includes('conversation') || originalURL.includes('message') || originalURL.includes('claude.ai'))) {
        console.log('[ConversationObserver] XHR Claude API request detected:', originalURL);
        
        xhr.addEventListener('loadend', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log('[ConversationObserver] XHR request completed');
            setTimeout(() => window.conversationObserver?.checkResponseCompletion(), 200);
          }
        });
      }
      
      return originalXHR.apply(this, args);
    };
    
    console.log('[ConversationObserver] Network interception setup complete');
  }
  
  monitorStreamResponse(response, url) {
    // Monitor stream completion using the response object's state
    console.log('[ConversationObserver] Monitoring stream response for:', url);
    
    // Use the response's body stream state to detect completion
    if (response.body && response.body.locked === false) {
      // Set up periodic checks for stream completion
      const checkCompletion = () => {
        // In streaming responses, completion typically shows up in DOM updates
        // So we trigger our DOM-based completion check
        this.checkResponseCompletion();
        
        // Also check for stream state changes
        if (response.body.locked) {
          console.log('[ConversationObserver] Stream appears to be consumed/locked');
          setTimeout(() => this.checkResponseCompletion(), 1000);
        }
      };
      
      // Check completion at intervals
      setTimeout(checkCompletion, 1000);
      setTimeout(checkCompletion, 3000);
      setTimeout(checkCompletion, 5000);
    }
  }

  notifyMilestone(operationId, milestone, data = {}) {
    console.log(`[ConversationObserver] Milestone: ${operationId} -> ${milestone}`, data);
    
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'operation_milestone',
          operationId,
          milestone,
          timestamp: Date.now(),
          data
        });
        console.log('[ConversationObserver] Fast milestone notification sent');
      } catch (error) {
        console.error('[ConversationObserver] Failed to send milestone:', error);
      }
    }
  }
}

// Initialize immediately
window.conversationObserver = new ConversationObserver();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ContentScript] Received message:', message);
  
  if (message.type === 'register_operation') {
    const { operationId, operationType, params } = message;
    console.log(`[ContentScript] Registering operation ${operationId} (${operationType})`);
    
    if (window.conversationObserver) {
      const operation = window.conversationObserver.registerOperation(operationId, operationType, params);
      sendResponse({ success: true, operation });
    } else {
      console.error('[ContentScript] ConversationObserver not available');
      sendResponse({ success: false, error: 'ConversationObserver not available' });
    }
    return true; // Keep sendResponse active for async response
  }
  
  return false; // Don't handle other message types
});

console.log('CCM: Fast ConversationObserver initialized and ready');