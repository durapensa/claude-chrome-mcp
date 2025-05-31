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
    // Intercept fetch for streaming response completion
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch.apply(window, args);
      const url = args[0];
      
      if (typeof url === 'string' && (url.includes('conversation') || url.includes('message'))) {
        console.log('[ConversationObserver] Claude API request detected:', url);
        
        // Clone response to read without consuming
        const clonedResponse = response.clone();
        
        if (response.body) {
          const reader = response.body.getReader();
          this.monitorStreamCompletion(reader);
        }
      }
      
      return response;
    };
    
    console.log('[ConversationObserver] Network interception setup complete');
  }
  
  async monitorStreamCompletion(reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[ConversationObserver] Stream completed - checking for response completion');
          setTimeout(() => this.checkResponseCompletion(), 500);
          break;
        }
      }
    } catch (error) {
      console.log('[ConversationObserver] Stream monitoring error:', error);
    }
  }

  notifyMilestone(operationId, milestone, data = {}) {
    console.log(`[ConversationObserver] Milestone: ${operationId} -> ${milestone}`, data);
    
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'milestone_notification',
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