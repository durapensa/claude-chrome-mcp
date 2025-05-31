// Content Script for claude.ai pages
// Handles session detection and page-level interactions

// Event-driven completion detection
class ConversationObserver {
  constructor() {
    this.activeOperations = new Map();
    this.observer = null;
    this.responseObserver = null;
    this.setupObservers();
  }

  trackOperation(operationId, type, params = {}) {
    const operation = {
      id: operationId,
      type,
      params,
      startTime: Date.now(),
      milestones: []
    };
    
    this.activeOperations.set(operationId, operation);
    console.log(`[ConversationObserver] Tracking operation ${operationId} (${type})`);
    
    // Send initial notification
    this.notifyMilestone(operationId, 'started', { type, params });
    
    return operation;
  }

  setupObservers() {
    // Observe DOM changes for conversation milestones
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });
    
    // Observe the conversation area for response changes
    this.startObserving();
    
    // Monitor for new send buttons and response areas
    this.setupPeriodicChecks();
  }

  startObserving() {
    const targetNode = document.body;
    if (targetNode) {
      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-testid', 'aria-busy']
      });
      console.log('[ConversationObserver] Started observing DOM changes');
    }
  }

  handleMutations(mutations) {
    for (const mutation of mutations) {
      // Check for message sending milestones
      this.checkMessageSendingMilestones(mutation);
      
      // Check for response generation milestones  
      this.checkResponseMilestones(mutation);
      
      // Check for conversation state changes
      this.checkConversationMilestones(mutation);
    }
  }

  checkMessageSendingMilestones(mutation) {
    // Detect message sent milestone
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for new user messages (updated for current Claude.ai DOM structure)
          const userMessage = node.querySelector && node.querySelector('.font-user-message');
          if (userMessage) {
            this.handleMessageSent();
          }
          
          // Look for disabled send button (indicating message was sent)
          const disabledSendButton = node.querySelector && node.querySelector('button[disabled][data-testid="send-button"]');
          if (disabledSendButton) {
            this.handleMessageSent();
          }
        }
      });
    }
    
    // Check for send button state changes
    if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
      const target = mutation.target;
      if (target.matches && target.matches('button[data-testid="send-button"]')) {
        if (target.disabled) {
          this.handleMessageSent();
        }
      }
    }
  }

  checkResponseMilestones(mutation) {
    // Detect response started milestone
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for new assistant messages or response containers (updated for current Claude.ai DOM structure)
          const assistantMessage = node.querySelector && node.querySelector('.font-claude-message');
          if (assistantMessage) {
            this.handleResponseStarted();
            
            // Start monitoring this specific response element for completion
            this.monitorResponseElement(assistantMessage);
          }
          
          // Look for streaming indicators
          const streamingIndicator = node.querySelector && node.querySelector('[aria-busy="true"]');
          if (streamingIndicator) {
            this.handleResponseStarted();
          }
        }
      });
    }
    
    // Check for text changes in Claude response elements (content being added/completed)
    if (mutation.type === 'childList' || mutation.type === 'characterData') {
      const target = mutation.target;
      
      // Check if this is within a Claude message
      const claudeMessage = target.closest && target.closest('.font-claude-message');
      if (claudeMessage) {
        // Response content is being updated - check if it's complete
        this.checkResponseContentCompletion(claudeMessage);
      }
    }
    
    // Check for aria-busy changes (response completion)
    if (mutation.type === 'attributes' && mutation.attributeName === 'aria-busy') {
      const target = mutation.target;
      if (target.getAttribute('aria-busy') === 'false') {
        this.handleResponseCompleted();
      }
    }
  }

  checkConversationMilestones(mutation) {
    // Detect stop button appearance/disappearance
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const stopButton = node.querySelector && node.querySelector('[data-testid="stop-button"]');
          if (stopButton) {
            this.handleResponseStarted();
          }
        }
      });
      
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const stopButton = node.querySelector && node.querySelector('[data-testid="stop-button"]');
          if (stopButton) {
            this.handleResponseCompleted();
          }
        }
      });
    }
  }

  handleMessageSent() {
    for (const [operationId, operation] of this.activeOperations) {
      if (operation.type === 'send_message' && !operation.milestones.find(m => m.milestone === 'message_sent')) {
        this.notifyMilestone(operationId, 'message_sent');
      }
    }
  }

  handleResponseStarted() {
    for (const [operationId, operation] of this.activeOperations) {
      if ((operation.type === 'send_message' || operation.type === 'get_response') && 
          !operation.milestones.find(m => m.milestone === 'response_started')) {
        this.notifyMilestone(operationId, 'response_started');
      }
    }
  }

  handleResponseCompleted() {
    for (const [operationId, operation] of this.activeOperations) {
      if ((operation.type === 'send_message' || operation.type === 'get_response') && 
          !operation.milestones.find(m => m.milestone === 'response_completed')) {
        this.notifyMilestone(operationId, 'response_completed');
        
        // Clean up completed operations after a short delay
        setTimeout(() => {
          this.activeOperations.delete(operationId);
        }, 5000);
      }
    }
  }

  monitorResponseElement(responseElement) {
    // Store reference to the response element for this set of operations
    for (const [operationId, operation] of this.activeOperations) {
      if ((operation.type === 'send_message' || operation.type === 'get_response') && 
          !operation.responseElement) {
        operation.responseElement = responseElement;
        operation.lastContentLength = 0;
        operation.lastContentUpdate = Date.now();
        console.log(`[ConversationObserver] Monitoring response element for operation ${operationId}`);
      }
    }
  }

  checkResponseContentCompletion(claudeMessage) {
    const content = claudeMessage.textContent || '';
    const contentLength = content.trim().length;
    const now = Date.now();
    
    // Check all operations monitoring this element
    for (const [operationId, operation] of this.activeOperations) {
      if (operation.responseElement === claudeMessage) {
        
        // Update content tracking
        if (contentLength > operation.lastContentLength) {
          operation.lastContentLength = contentLength;
          operation.lastContentUpdate = now;
          
          // If this is the first substantial content, mark response as started
          if (contentLength > 0 && !operation.milestones.find(m => m.milestone === 'response_started')) {
            this.notifyMilestone(operationId, 'response_started');
          }
        }
        
        // Check for completion indicators
        const timeSinceLastUpdate = now - operation.lastContentUpdate;
        const hasSubstantialContent = contentLength > 0;
        const noRecentUpdates = timeSinceLastUpdate > 2000; // 2 seconds without updates
        
        // Look for completion indicators in the DOM
        const hasStopButton = document.querySelector('[data-testid="stop-button"]');
        const isStreaming = claudeMessage.querySelector('[aria-busy="true"]');
        
        // Detect completion: has content, no streaming indicators, and no recent updates
        if (hasSubstantialContent && !hasStopButton && !isStreaming && noRecentUpdates &&
            !operation.milestones.find(m => m.milestone === 'response_completed')) {
          
          console.log(`[ConversationObserver] Response completion detected for ${operationId}: ${contentLength} chars, ${timeSinceLastUpdate}ms since update`);
          this.notifyMilestone(operationId, 'response_completed', {
            contentLength,
            timeSinceLastUpdate,
            content: content.substring(0, 100)
          });
          
          // Clean up completed operations
          setTimeout(() => {
            this.activeOperations.delete(operationId);
          }, 1000);
        }
      }
    }
  }

  setupPeriodicChecks() {
    // Periodic fallback checks for milestone detection
    setInterval(() => {
      this.checkActiveOperations();
    }, 1000);
  }

  checkActiveOperations() {
    const now = Date.now();
    
    for (const [operationId, operation] of this.activeOperations) {
      const elapsed = now - operation.startTime;
      
      // Timeout operations after 60 seconds
      if (elapsed > 60000) {
        this.notifyMilestone(operationId, 'timeout', { elapsed });
        this.activeOperations.delete(operationId);
        continue;
      }
      
      // Check for specific state indicators
      this.checkOperationState(operationId, operation);
    }
  }

  checkOperationState(operationId, operation) {
    // Check for send button state
    const sendButton = document.querySelector('button[data-testid="send-button"]');
    if (sendButton && operation.type === 'send_message') {
      if (sendButton.disabled && !operation.milestones.find(m => m.milestone === 'message_sent')) {
        this.notifyMilestone(operationId, 'message_sent');
      }
    }
    
    // Check for Claude response elements if not already monitoring one
    if (!operation.responseElement) {
      const claudeMessage = document.querySelector('.font-claude-message');
      if (claudeMessage && claudeMessage.textContent.trim().length > 0) {
        this.monitorResponseElement(claudeMessage);
      }
    }
    
    // If monitoring a response element, check its current state
    if (operation.responseElement) {
      this.checkResponseContentCompletion(operation.responseElement);
    }
    
    // Fallback: Check for stop button (indicates active response)
    const stopButton = document.querySelector('[data-testid="stop-button"]');
    if (stopButton && !operation.milestones.find(m => m.milestone === 'response_started')) {
      this.notifyMilestone(operationId, 'response_started');
    } else if (!stopButton && operation.milestones.find(m => m.milestone === 'response_started') && 
               !operation.milestones.find(m => m.milestone === 'response_completed') &&
               !operation.responseElement) { // Only use fallback if not monitoring response element
      this.notifyMilestone(operationId, 'response_completed');
    }
  }

  notifyMilestone(operationId, milestone, data = {}) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.milestones.push({
        milestone,
        timestamp: Date.now(),
        data
      });
      
      console.log(`[ConversationObserver] Milestone: ${operationId} - ${milestone}`);
      
      // Send to background script
      chrome.runtime.sendMessage({
        type: 'operation_milestone',
        operationId,
        milestone,
        timestamp: Date.now(),
        ...data
      }).catch(err => {
        console.warn('[ConversationObserver] Failed to send milestone:', err);
      });
    }
  }

  // Public API for scripts to register operations
  registerOperation(operationId, type, params = {}) {
    return this.trackOperation(operationId, type, params);
  }

  unregisterOperation(operationId) {
    this.activeOperations.delete(operationId);
  }

  getActiveOperations() {
    return Array.from(this.activeOperations.entries());
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.activeOperations.clear();
  }
}

// Global conversation observer instance
let conversationObserver;

class ClaudeSessionDetector {
  constructor() {
    this.sessionInfo = null;
    this.observer = null;
    this.init();
  }

  init() {
    this.detectSession();
    this.setupSessionMonitoring();
    this.notifyExtension();
  }

  detectSession() {
    // Try multiple methods to extract session information
    const sessionData = {
      url: window.location.href,
      timestamp: Date.now(),
      conversationId: this.extractConversationId(),
      userId: this.extractUserId(),
      sessionToken: this.extractSessionToken(),
      organizationId: this.extractOrganizationId()
    };

    this.sessionInfo = sessionData;
    return sessionData;
  }

  extractConversationId() {
    // Method 1: From URL path
    const urlMatch = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
    if (urlMatch) return urlMatch[1];

    // Method 2: From page data
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        if (script.textContent && script.textContent.includes('conversationId')) {
          const match = script.textContent.match(/"conversationId":"([a-f0-9-]+)"/);
          if (match) return match[1];
        }
      }
    } catch (e) {
      console.debug('CCM: Error extracting conversation ID from scripts:', e);
    }

    // Method 3: From localStorage
    try {
      const stored = localStorage.getItem('claude_conversation_id');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.debug('CCM: Error extracting conversation ID from localStorage:', e);
    }

    return null;
  }

  extractUserId() {
    try {
      // Check localStorage for user data
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('user')) {
          const value = localStorage.getItem(key);
          try {
            const parsed = JSON.parse(value);
            if (parsed.id || parsed.userId) {
              return parsed.id || parsed.userId;
            }
          } catch (e) {
            // Not JSON, skip
          }
        }
      }
    } catch (e) {
      console.debug('CCM: Error extracting user ID:', e);
    }
    return null;
  }

  extractSessionToken() {
    try {
      // Look for auth tokens in common storage locations
      const authKey = Object.keys(localStorage).find(key => 
        key.includes('auth') || key.includes('token') || key.includes('session')
      );
      if (authKey) {
        const value = localStorage.getItem(authKey);
        if (value && !value.includes('undefined')) {
          return value.substring(0, 50); // Truncate for safety
        }
      }
    } catch (e) {
      console.debug('CCM: Error extracting session token:', e);
    }
    return null;
  }

  extractOrganizationId() {
    try {
      const orgMatch = window.location.pathname.match(/\/o\/([a-f0-9-]+)/);
      if (orgMatch) return orgMatch[1];
    } catch (e) {
      console.debug('CCM: Error extracting organization ID:', e);
    }
    return null;
  }

  setupSessionMonitoring() {
    // Monitor URL changes for SPA navigation
    let currentUrl = window.location.href;
    const checkUrlChange = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        this.detectSession();
        this.notifyExtension();
      }
    };

    // Check for URL changes every 1 second
    setInterval(checkUrlChange, 1000);

    // Monitor DOM changes that might indicate new conversation
    this.observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some(mutation => {
        return mutation.addedNodes.length > 0 || 
               (mutation.target.textContent && 
                mutation.target.textContent.includes('conversation'));
      });

      if (hasRelevantChanges) {
        setTimeout(() => {
          this.detectSession();
          this.notifyExtension();
        }, 500); // Small delay to let DOM settle
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  notifyExtension() {
    // Send session info to background script
    chrome.runtime.sendMessage({
      type: 'session_detected',
      sessionInfo: this.sessionInfo,
      tabId: chrome.runtime.id,
      timestamp: Date.now()
    }).catch(error => {
      console.debug('CCM: Error sending session info:', error);
    });
  }

  // Public methods for external access
  getCurrentSession() {
    return this.sessionInfo;
  }

  refreshSession() {
    this.detectSession();
    this.notifyExtension();
    return this.sessionInfo;
  }
}

// Utility functions for potential future use
const ClaudePageUtils = {
  // Get current conversation messages
  getConversationMessages() {
    const messages = [];
    const messageElements = document.querySelectorAll('[data-testid*="message"], .conversation-turn, .message');
    
    messageElements.forEach((el, index) => {
      const text = el.textContent || el.innerText;
      if (text && text.trim().length > 0) {
        messages.push({
          index,
          text: text.trim(),
          element: el,
          isUser: el.classList.contains('user') || el.querySelector('.user'),
          isAssistant: el.classList.contains('assistant') || el.querySelector('.assistant')
        });
      }
    });
    
    return messages;
  },

  // Get input field for sending messages
  getMessageInput() {
    const selectors = [
      'textarea[placeholder*="message"]',
      'textarea[data-testid*="input"]',
      '.message-input textarea',
      'div[contenteditable="true"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  },

  // Check if page is ready for interaction
  isPageReady() {
    const input = this.getMessageInput();
    // Check for any content that indicates Claude is loaded
    const hasContent = document.querySelector('main, .conversation, .chat, [data-testid*="message"], .font-user-message, .font-claude-message, div[role="presentation"]');
    const hasClaudeUI = document.querySelector('h1, h2, nav, header') || document.title.includes('Claude');
    return !!(input && (hasContent || hasClaudeUI));
  }
};

// Initialize session detector
let claudeSession;
if (window.location.hostname === 'claude.ai') {
  claudeSession = new ClaudeSessionDetector();
  
  // Initialize conversation observer for event-driven completion detection
  conversationObserver = new ConversationObserver();
  
  // Make utilities available globally for debugging
  window.ClaudePageUtils = ClaudePageUtils;
  window.claudeSession = claudeSession;
  window.conversationObserver = conversationObserver;
}