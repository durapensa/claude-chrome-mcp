import WebSocket from 'ws';
import chalk from 'chalk';

export interface ClaudeTab {
  id: number;
  url: string;
  title: string;
  active: boolean;
  debuggerAttached: boolean;
}

export interface MessageResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class CCMClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();

  constructor(
    private serverUrl: string = 'ws://localhost:54322',
    private verbose: boolean = false
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.verbose) {
        console.log(chalk.gray(`Connecting to ${this.serverUrl}...`));
      }

      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        if (this.verbose) {
          console.log(chalk.green('Connected to MCP server'));
        }
        
        // Send client ready signal (but not extension_ready to avoid being identified as extension)
        this.ws!.send(JSON.stringify({ 
          type: 'client_ready', 
          clientType: 'cli',
          timestamp: Date.now() 
        }));
        
        resolve();
      });

      this.ws.on('error', (error) => {
        reject(new Error(`Connection failed: ${(error as Error).message}`));
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error(chalk.red('Failed to parse message:'), error);
        }
      });

      this.ws.on('close', () => {
        if (this.verbose) {
          console.log(chalk.yellow('Disconnected from MCP server'));
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  async disconnect(): Promise<void> {
    // Clear pending requests
    for (const [requestId, { reject, timeout }] of this.pendingRequests) {
      clearTimeout(timeout);
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(message: any): void {
    const { type, requestId, result, error } = message;

    if (this.verbose) {
      console.log(chalk.gray('Received message:'), JSON.stringify(message, null, 2));
    }

    if (type === 'response' && requestId && this.pendingRequests.has(requestId)) {
      const { resolve, timeout } = this.pendingRequests.get(requestId)!;
      clearTimeout(timeout);
      this.pendingRequests.delete(requestId);
      resolve(result);
    } else if (type === 'error' && requestId && this.pendingRequests.has(requestId)) {
      const { reject, timeout } = this.pendingRequests.get(requestId)!;
      clearTimeout(timeout);
      this.pendingRequests.delete(requestId);
      reject(new Error(error));
    }
  }

  private async sendRequest(type: string, params: any = {}, timeout: number = 10000): Promise<any> {
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }
    
    if (this.ws.readyState !== WebSocket.OPEN) {
      if (this.verbose) {
        console.log(chalk.gray(`WebSocket state: ${this.ws.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`));
      }
      throw new Error(`Not connected to server (state: ${this.ws.readyState})`);
    }

    const requestId = `req_${++this.requestId}`;
    
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${type}`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutHandle });

      const message = {
        type,
        requestId,
        timestamp: Date.now(),
        ...params
      };

      if (this.verbose) {
        console.log(chalk.gray('Sending:'), JSON.stringify(message, null, 2));
      }

      this.ws!.send(JSON.stringify(message));
    });
  }

  // Public API methods using Chrome extension protocol
  
  async getClaudeSessions(): Promise<ClaudeTab[]> {
    return await this.sendRequest('get_claude_tabs');
  }

  async spawnClaudeTab(url: string = 'https://claude.ai'): Promise<{ id: number; url: string; title: string }> {
    return await this.sendRequest('create_claude_tab', { url });
  }

  async attachDebugger(tabId: number): Promise<{ attached: boolean }> {
    return await this.sendRequest('attach_debugger', { tabId });
  }

  async detachDebugger(tabId: number): Promise<{ detached: boolean }> {
    return await this.sendRequest('detach_debugger', { tabId });
  }

  async executeScript(tabId: number, script: string): Promise<any> {
    const result = await this.sendRequest('debugger_command', {
      tabId,
      command: 'Runtime.evaluate',
      params: {
        expression: script,
        returnByValue: true,
        awaitPromise: true
      }
    });

    if (result.exceptionDetails) {
      throw new Error(`Script execution failed: ${result.exceptionDetails.text}`);
    }

    return result.result;
  }

  async sendMessage(tabId: number, message: string): Promise<MessageResponse> {
    // First ensure debugger is attached
    await this.attachDebugger(tabId);

    // Inject utilities and send message
    const injectScript = `
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
            const hasContent = document.querySelector('[data-testid="conversation"]') || 
                              document.querySelector('.conversation') || 
                              document.querySelector('.chat') ||
                              document.querySelector('main') ||
                              document.body.querySelector('[contenteditable="true"]'); // If we have contenteditable, likely ready
            return !!(input && hasContent && document.readyState === 'complete');
          }
        };
      }
      
      window.ClaudePageUtils.isPageReady();
    `;

    const readyResult = await this.executeScript(tabId, injectScript);
    if (!readyResult.value) {
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
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (input.contentEditable === 'true') {
          input.textContent = ${JSON.stringify(message)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Wait a moment for React to process the input
        setTimeout(() => {
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

  async getLatestResponse(tabId: number): Promise<any> {
    await this.attachDebugger(tabId);

    const script = `
      (function() {
        try {
          // Simple approach: get all conversation messages in order
          const allMessages = [];
          
          // Find conversation container
          const conversationContainer = document.querySelector('[data-testid="conversation"]') || 
                                       document.querySelector('.conversation') || 
                                       document.querySelector('main') || 
                                       document.body;
          
          if (!conversationContainer) {
            return { error: 'No conversation container found' };
          }
          
          // Get all message elements
          const messageElements = conversationContainer.querySelectorAll('[data-testid="user-message"], .font-claude-message, [data-message-author-role]');
          
          if (messageElements.length === 0) {
            return { error: 'No messages found' };
          }
          
          // Process messages in DOM order
          messageElements.forEach((el, index) => {
            const text = el.textContent || el.innerText;
            if (!text || text.trim().length === 0) return;
            
            // Determine message type
            const isUser = el.hasAttribute('data-testid') && el.getAttribute('data-testid') === 'user-message' ||
                          el.hasAttribute('data-message-author-role') && el.getAttribute('data-message-author-role') === 'user';
            const isAssistant = el.classList.contains('font-claude-message') ||
                               el.hasAttribute('data-message-author-role') && el.getAttribute('data-message-author-role') === 'assistant';
            
            allMessages.push({
              index,
              text: text.trim(),
              isUser: !!isUser,
              isAssistant: !!isAssistant || !isUser // Default to assistant if not clearly user
            });
          });
          
          if (allMessages.length === 0) {
            return { error: 'No valid messages found' };
          }
          
          // Get the last message
          const lastMessage = allMessages[allMessages.length - 1];
          
          return {
            text: lastMessage.text,
            isUser: lastMessage.isUser,
            isAssistant: lastMessage.isAssistant,
            timestamp: Date.now(),
            totalMessages: allMessages.length
          };
        } catch (error) {
          return { error: 'Error getting messages: ' + error.toString() };
        }
      })()
    `;

    const result = await this.executeScript(tabId, script);
    return result.value;
  }

  async getDOMElements(tabId: number, selector: string): Promise<any[]> {
    await this.attachDebugger(tabId);

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
}