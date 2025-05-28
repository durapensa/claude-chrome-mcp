class ChromeBridge {
  constructor(websocketServer) {
    this.ws = websocketServer;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.ws.on('tab_update', (tab) => {
      console.error(`CCM: Tab updated - ${tab.id}: ${tab.title}`);
    });

    this.ws.on('session_detected', (sessionInfo) => {
      console.error(`CCM: Session detected - ${sessionInfo.conversationId || 'new session'}`);
    });

    this.ws.on('debugger_event', (event) => {
      console.error(`CCM: Debugger event - ${event.method} on tab ${event.tabId}`);
    });
  }

  async createClaudeTab(url = 'https://claude.ai') {
    return await this.ws.sendRequest('create_claude_tab', { url });
  }

  async getClaudeTabs() {
    return await this.ws.sendRequest('get_claude_tabs');
  }

  async attachDebugger(tabId) {
    return await this.ws.sendRequest('attach_debugger', { tabId });
  }

  async detachDebugger(tabId) {
    return await this.ws.sendRequest('detach_debugger', { tabId });
  }

  async executeDebuggerCommand(tabId, method, params = {}) {
    return await this.ws.sendRequest('debugger_command', {
      tabId,
      command: method,
      params
    });
  }

  async executeScript(tabId, script) {
    const result = await this.executeDebuggerCommand(tabId, 'Runtime.evaluate', {
      expression: script,
      returnByValue: true,
      awaitPromise: true
    });
    
    if (result.exceptionDetails) {
      throw new Error(`Script execution failed: ${result.exceptionDetails.text}`);
    }
    
    return result.result;
  }

  async getDOMElements(tabId, selector) {
    const script = `
      Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(el => ({
        tagName: el.tagName,
        textContent: el.textContent?.substring(0, 200),
        id: el.id,
        className: el.className,
        attributes: Array.from(el.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {}),
        boundingRect: el.getBoundingClientRect()
      }))
    `;
    
    const result = await this.executeScript(tabId, script);
    return result.value || [];
  }

  async sendMessageToTab(tabId, message) {
    // Inject page utilities directly since debugger context is separate from content script
    const injectUtilities = `
      if (!window.ClaudePageUtils) {
        window.ClaudePageUtils = {
          getMessageInput() {
            const selectors = [
              'textarea[placeholder*="message"]',
              'textarea[placeholder*="Message"]', 
              'textarea[data-testid*="input"]',
              '.message-input textarea',
              'div[contenteditable="true"]',
              '[contenteditable="true"]'
            ];
            
            for (const selector of selectors) {
              const element = document.querySelector(selector);
              if (element && (element.offsetParent !== null || element.offsetWidth > 0 || element.offsetHeight > 0)) {
                return element;
              }
            }
            return null;
          },
          
          isPageReady() {
            const input = this.getMessageInput();
            const hasContent = document.querySelector('main, .conversation, .chat, [data-testid*="conversation"]');
            return !!(input && hasContent && document.readyState === 'complete');
          }
        };
      }
      
      // Return page ready status
      window.ClaudePageUtils.isPageReady();
    `;

    const readyCheck = await this.executeScript(tabId, injectUtilities);
    if (!readyCheck.value) {
      throw new Error('Claude page not ready for interaction');
    }

    // Send the message
    const sendScript = `
      (function() {
        const input = window.ClaudePageUtils.getMessageInput();
        if (!input) return { success: false, error: 'No input field found' };
        
        // Set the message
        if (input.tagName === 'TEXTAREA') {
          input.value = ${JSON.stringify(message)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          // Also trigger change for React components
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (input.contentEditable === 'true') {
          input.textContent = ${JSON.stringify(message)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Wait a moment for React to process the input
        setTimeout(() => {
          // Find and click send button
          const sendSelectors = [
            'button[data-testid*="send"]',
            'button[aria-label*="send"]', 
            'button[aria-label*="Send"]',
            'button[type="submit"]',
            'button:has(svg)',
            '.send-button',
            '[data-testid*="submit"]'
          ];
          
          let sendButton = null;
          for (const selector of sendSelectors) {
            sendButton = document.querySelector(selector);
            if (sendButton && !sendButton.disabled && sendButton.offsetParent !== null) {
              break;
            }
          }
          
          if (sendButton && !sendButton.disabled) {
            sendButton.click();
          } else {
            // Try pressing Enter if no send button found
            const enterEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true
            });
            input.dispatchEvent(enterEvent);
          }
        }, 100);
        
        return { success: true, message: 'Message sent' };
      })()
    `;

    const result = await this.executeScript(tabId, sendScript);
    return result.value;
  }

  async getLatestResponse(tabId) {
    const script = `
      (function() {
        try {
          // Use the actual selectors we found in the DOM
          const messages = [];
          
          // Get user messages
          const userMessages = document.querySelectorAll('[data-testid="user-message"]');
          userMessages.forEach((el, index) => {
            const text = el.textContent || el.innerText;
            if (text && text.trim().length > 0) {
              messages.push({
                index: index * 2, // Even indices for user messages
                text: text.trim(),
                isUser: true,
                isAssistant: false,
                element: el
              });
            }
          });
          
          // Get Claude messages (look for font-claude-message class)
          const claudeMessages = document.querySelectorAll('.font-claude-message');
          claudeMessages.forEach((el, index) => {
            const text = el.textContent || el.innerText;
            if (text && text.trim().length > 0) {
              messages.push({
                index: (index * 2) + 1, // Odd indices for Claude messages
                text: text.trim(),
                isUser: false,
                isAssistant: true,
                element: el
              });
            }
          });
          
          // Sort by DOM position to get correct order
          messages.sort((a, b) => {
            const aPos = a.element.compareDocumentPosition(b.element);
            if (aPos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (aPos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
          });
          
          if (messages.length === 0) {
            return { error: 'No messages found' };
          }
          
          const lastMessage = messages[messages.length - 1];
          
          return {
            text: lastMessage.text,
            isUser: lastMessage.isUser,
            isAssistant: lastMessage.isAssistant,
            timestamp: Date.now(),
            totalMessages: messages.length
          };
        } catch (error) {
          return { error: 'Error getting messages: ' + error.message };
        }
      })()
    `;

    const result = await this.executeScript(tabId, script);
    return result.value;
  }

  async getPageInfo(tabId) {
    const script = `
      ({
        url: window.location.href,
        title: document.title,
        sessionInfo: window.claudeSession ? window.claudeSession.getCurrentSession() : null,
        isReady: window.ClaudePageUtils ? window.ClaudePageUtils.isPageReady() : false,
        messageCount: window.ClaudePageUtils ? window.ClaudePageUtils.getConversationMessages().length : 0
      })
    `;

    const result = await this.executeScript(tabId, script);
    return result.value;
  }

  async waitForResponse(tabId, timeout = 30000) {
    const startTime = Date.now();
    let lastMessageCount = 0;

    // Get initial message count
    try {
      const initialInfo = await this.getPageInfo(tabId);
      lastMessageCount = initialInfo.messageCount || 0;
    } catch (error) {
      throw new Error(`Failed to get initial page info: ${error.message}`);
    }

    // Poll for new messages
    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const info = await this.getPageInfo(tabId);
        if (info.messageCount > lastMessageCount) {
          // New message detected, get the latest response
          return await this.getLatestResponse(tabId);
        }
      } catch (error) {
        console.warn('CCM: Error checking for new messages:', error.message);
      }
    }

    throw new Error('Timeout waiting for Claude response');
  }

  async debugClaudePage(tabId) {
    const script = `
      (function() {
        // Inject utilities first if they don't exist
        if (!window.ClaudePageUtils) {
          window.ClaudePageUtils = {
            getMessageInput() {
              const selectors = [
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="Message"]', 
                'textarea[data-testid*="input"]',
                '.message-input textarea',
                'div[contenteditable="true"]',
                '[contenteditable="true"]'
              ];
              
              for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && (element.offsetParent !== null || element.offsetWidth > 0 || element.offsetHeight > 0)) {
                  return element;
                }
              }
              return null;
            },
            
            isPageReady() {
              const input = this.getMessageInput();
              const hasContent = document.querySelector('main, .conversation, .chat, [data-testid*="conversation"]');
              return !!(input && hasContent && document.readyState === 'complete');
            }
          };
        }

        const debug = {
          url: window.location.href,
          hasClaudePageUtils: !!window.ClaudePageUtils,
          hasClaudeSession: !!window.claudeSession,
          pageReady: window.ClaudePageUtils.isPageReady(),
          messageInput: !!window.ClaudePageUtils.getMessageInput(),
          hasContent: !!(document.querySelector('main, .conversation, .chat, [data-testid*="conversation"]')),
          domReady: document.readyState,
          elements: {
            textarea: !!document.querySelector('textarea[placeholder*="message"]'),
            contentEditable: !!document.querySelector('div[contenteditable="true"]'),
            main: !!document.querySelector('main'),
            conversation: !!document.querySelector('.conversation'),
            chat: !!document.querySelector('.chat'),
            anyTextarea: !!document.querySelector('textarea'),
            anyContentEditable: !!document.querySelector('[contenteditable="true"]')
          }
        };

        // Get more detailed element info
        const inputElement = window.ClaudePageUtils.getMessageInput();
        if (inputElement) {
          debug.inputElementInfo = {
            tagName: inputElement.tagName,
            placeholder: inputElement.placeholder,
            className: inputElement.className,
            id: inputElement.id,
            visible: inputElement.offsetParent !== null,
            width: inputElement.offsetWidth,
            height: inputElement.offsetHeight
          };
        }

        return debug;
      })()
    `;

    const result = await this.executeScript(tabId, script);
    return result.value;
  }
}

module.exports = ChromeBridge;