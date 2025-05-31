// Optimized Content Script for claude.ai pages
// Network-level completion detection only

console.log('CCM: Network detection content script loading...');

class NetworkBasedConversationObserver {
  constructor() {
    this.activeOperations = new Map();
    console.log('[NetworkObserver] Initialized');
    this.setupNetworkInterception();
  }

  registerOperation(operationId, type, params = {}) {
    const operation = {
      id: operationId,
      type,
      params,
      startTime: Date.now()
    };
    
    this.activeOperations.set(operationId, operation);
    this.notifyMilestone(operationId, 'started', { type, params });
    console.log(`[NetworkObserver] Registered operation ${operationId} (${type})`);
    return operation;
  }

  setupNetworkInterception() {
    // Intercept fetch requests to detect Claude API completion
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0];
      
      // Only monitor Claude API requests
      if (typeof url === 'string' && (url.includes('conversation') || url.includes('message') || url.includes('claude.ai/api'))) {
        console.log('[NetworkObserver] Claude API request detected:', url);
        
        const response = await originalFetch.apply(window, args);
        
        // For POST requests (likely message sending), detect completion
        if (args[1]?.method === 'POST') {
          this.handleMessageSent();
        }
        
        // Monitor response completion
        if (response.ok) {
          // For streaming responses, monitor completion
          if (response.headers.get('content-type')?.includes('stream')) {
            this.monitorStreamResponse(response);
          } else {
            // Non-streaming response completed immediately
            setTimeout(() => this.checkResponseCompletion(), 300);
          }
        }
        
        return response;
      }
      
      return originalFetch.apply(window, args);
    };
    
    console.log('[NetworkObserver] Network interception active');
  }

  monitorStreamResponse(response) {
    // Monitor stream completion through periodic DOM checks
    // This is more reliable than trying to read the stream directly
    const checkTimes = [1000, 2000, 4000, 6000]; // Progressive delays
    
    checkTimes.forEach(delay => {
      setTimeout(() => this.checkResponseCompletion(), delay);
    });
  }

  handleMessageSent() {
    for (const [operationId, operation] of this.activeOperations) {
      if (operation.type === 'send_message') {
        this.notifyMilestone(operationId, 'message_sent');
      }
    }
  }

  checkResponseCompletion() {
    const lastResponse = this.getLastResponse();
    
    if (lastResponse && lastResponse.text && lastResponse.text.length > 0) {
      for (const [operationId, operation] of this.activeOperations) {
        if (operation.type === 'send_message' || operation.type === 'get_response') {
          // Avoid duplicate notifications
          if (!operation.lastResponseText || operation.lastResponseText !== lastResponse.text) {
            operation.lastResponseText = lastResponse.text;
            this.notifyMilestone(operationId, 'response_completed', { response: lastResponse });
            this.activeOperations.delete(operationId);
            console.log(`[NetworkObserver] Response completed for ${operationId}`);
          }
        }
      }
    }
  }

  getLastResponse() {
    // Get the most recent assistant message
    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    
    if (lastMessage && lastMessage.textContent?.trim()) {
      return {
        text: lastMessage.textContent.trim(),
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

  notifyMilestone(operationId, milestone, data = {}) {
    console.log(`[NetworkObserver] ${operationId} -> ${milestone}`);
    
    try {
      chrome.runtime.sendMessage({
        type: 'operation_milestone',
        operationId,
        milestone,
        timestamp: Date.now(),
        data
      });
    } catch (error) {
      console.error('[NetworkObserver] Failed to send milestone:', error);
    }
  }
}

// Initialize network observer
window.conversationObserver = new NetworkBasedConversationObserver();

// Listen for operation registration from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'register_operation') {
    const { operationId, operationType, params } = message;
    
    if (window.conversationObserver) {
      const operation = window.conversationObserver.registerOperation(operationId, operationType, params);
      sendResponse({ success: true, operation });
    } else {
      sendResponse({ success: false, error: 'Observer not available' });
    }
    return true;
  }
  
  return false;
});

console.log('CCM: Network-based observer ready');