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
        attributeFilter: ['disabled', 'aria-busy']
      });
      console.log('[ConversationObserver] Fast observer started');
    }
  }

  handleFastMutation(mutation) {
    // Fast detection for message sent
    if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
      const target = mutation.target;
      if (target.matches && target.matches('button[data-testid="send-button"]') && target.disabled) {
        this.handleMessageSent();
      }
    }
    
    // Fast detection for response completion
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for assistant responses
          const assistantMessage = node.querySelector && node.querySelector('.font-claude-message');
          if (assistantMessage) {
            setTimeout(() => this.checkResponseCompletion(), 100);
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
    // Simple completion check
    const sendButton = document.querySelector('button[data-testid="send-button"]');
    const isResponseComplete = sendButton && !sendButton.disabled;
    
    if (isResponseComplete) {
      const lastResponse = this.getLastResponse();
      if (lastResponse && lastResponse.text) {
        for (const [operationId, operation] of this.activeOperations.entries()) {
          if (operation.type === 'get_response') {
            this.notifyMilestone(operationId, 'response_completed', { response: lastResponse });
            this.activeOperations.delete(operationId);
            console.log(`[ConversationObserver] Response completed for operation ${operationId}`);
          }
        }
      }
    }
  }

  getLastResponse() {
    const messages = Array.from(document.querySelectorAll('.font-claude-message'));
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage) {
      return {
        text: lastMessage.textContent.trim(),
        isAssistant: true,
        isComplete: true,
        isUser: false,
        success: true,
        timestamp: Date.now(),
        totalMessages: messages.length
      };
    }
    return null;
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