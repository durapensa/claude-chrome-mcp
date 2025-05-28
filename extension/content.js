// Content Script for claude.ai pages
// Handles session detection and page-level interactions

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
  
  // Make utilities available globally for debugging
  window.ClaudePageUtils = ClaudePageUtils;
  window.claudeSession = claudeSession;
}