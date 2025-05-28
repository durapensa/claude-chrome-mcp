#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const WebSocket = require('ws');
const EventEmitter = require('events');

class WebSocketClient extends EventEmitter {
  constructor(url = 'ws://localhost:54322') {
    super();
    this.url = url;
    this.ws = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.error('Claude Code MCP: Connecting to WebSocket server at', this.url);
      
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.error('Claude Code MCP: Connected to WebSocket server');
        this.connected = true;
        this.reconnectAttempts = 0;
        
        // Send client ready signal
        this.ws.send(JSON.stringify({ 
          type: 'client_ready', 
          clientType: 'claude-code-mcp',
          timestamp: Date.now() 
        }));
        
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error('Claude Code MCP: WebSocket error:', error);
        this.connected = false;
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Claude Code MCP: Error parsing message:', error);
        }
      });

      this.ws.on('close', () => {
        console.error('Claude Code MCP: WebSocket connection closed');
        this.connected = false;
        this.handleReconnect();
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.connected) {
          this.ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.error(`Claude Code MCP: Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Claude Code MCP: Reconnection failed:', error.message);
        });
      }, 2000 * this.reconnectAttempts);
    } else {
      console.error('Claude Code MCP: Max reconnection attempts reached');
    }
  }

  handleMessage(message) {
    const { type, requestId, result, error } = message;

    if (type === 'server_ready') {
      console.error('Claude Code MCP: Server ready signal received');
      return;
    }

    if (type === 'response' && requestId && this.pendingRequests.has(requestId)) {
      const { resolve } = this.pendingRequests.get(requestId);
      this.pendingRequests.delete(requestId);
      resolve(result);
    } else if (type === 'error' && requestId && this.pendingRequests.has(requestId)) {
      const { reject } = this.pendingRequests.get(requestId);
      this.pendingRequests.delete(requestId);
      reject(new Error(error));
    }
  }

  async sendRequest(type, params = {}, timeout = 10000) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const requestId = `ccm_req_${++this.requestId}`;
    
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${type}`));
      }, timeout);

      this.pendingRequests.set(requestId, { 
        resolve: (result) => {
          clearTimeout(timeoutHandle);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        }
      });

      const message = {
        type,
        requestId,
        timestamp: Date.now(),
        ...params
      };

      this.ws.send(JSON.stringify(message));
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.connected = false;
    
    // Clear pending requests
    for (const [requestId, { reject }] of this.pendingRequests) {
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }
}

class ClaudeCodeMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'claude-chrome-mcp-code',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.wsClient = new WebSocketClient();
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools - same 8 tools as Claude Desktop version
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'spawn_claude_tab',
            description: 'Create a new Claude.ai tab',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'Optional URL to navigate to (defaults to claude.ai)',
                  default: 'https://claude.ai'
                }
              },
            },
          },
          {
            name: 'get_claude_sessions',
            description: 'List all active Claude.ai tabs and sessions',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'send_message_to_claude',
            description: 'Send a message to a specific Claude session',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID of the Claude session'
                },
                message: {
                  type: 'string',
                  description: 'Message to send'
                }
              },
              required: ['tabId', 'message'],
            },
          },
          {
            name: 'get_claude_response',
            description: 'Get the latest response from a Claude session',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID of the Claude session'
                }
              },
              required: ['tabId'],
            },
          },
          {
            name: 'debug_attach',
            description: 'Attach Chrome debugger to a tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to attach debugger to'
                }
              },
              required: ['tabId'],
            },
          },
          {
            name: 'execute_script',
            description: 'Execute JavaScript in a tab',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to execute script in'
                },
                script: {
                  type: 'string',
                  description: 'JavaScript code to execute'
                }
              },
              required: ['tabId', 'script'],
            },
          },
          {
            name: 'get_dom_elements',
            description: 'Get DOM elements matching a selector',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to query'
                },
                selector: {
                  type: 'string',
                  description: 'CSS selector to match elements'
                }
              },
              required: ['tabId', 'selector'],
            },
          },
          {
            name: 'debug_claude_page',
            description: 'Debug Claude page readiness and available utilities',
            inputSchema: {
              type: 'object',
              properties: {
                tabId: {
                  type: 'number',
                  description: 'Tab ID to debug'
                }
              },
              required: ['tabId'],
            },
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'spawn_claude_tab':
            result = await this.wsClient.sendRequest('create_claude_tab', { url: args.url });
            break;

          case 'get_claude_sessions':
            result = await this.wsClient.sendRequest('get_claude_tabs');
            break;

          case 'send_message_to_claude':
            // First attach debugger, then send message via script execution
            await this.wsClient.sendRequest('attach_debugger', { tabId: args.tabId });
            
            // Use the same message sending logic as the CLI client
            const sendScript = `
              (function() {
                // Inject utilities if not present
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
                                        document.body.querySelector('[contenteditable="true"]');
                      return !!(input && hasContent && document.readyState === 'complete');
                    }
                  };
                }
                
                if (!window.ClaudePageUtils.isPageReady()) {
                  return { success: false, error: 'Claude page not ready for interaction' };
                }
                
                const input = window.ClaudePageUtils.getMessageInput();
                if (!input) return { success: false, error: 'No input field found' };
                
                // Set the message
                if (input.tagName === 'TEXTAREA') {
                  input.value = ${JSON.stringify(args.message)};
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (input.contentEditable === 'true') {
                  input.textContent = ${JSON.stringify(args.message)};
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
            
            result = await this.wsClient.sendRequest('debugger_command', {
              tabId: args.tabId,
              command: 'Runtime.evaluate',
              params: {
                expression: sendScript,
                returnByValue: true,
                awaitPromise: true
              }
            });
            
            if (result.exceptionDetails) {
              throw new Error(`Message sending failed: ${result.exceptionDetails.text}`);
            }
            
            result = result.result.value;
            break;

          case 'get_claude_response':
            await this.wsClient.sendRequest('attach_debugger', { tabId: args.tabId });
            
            const responseScript = `
              (function() {
                try {
                  const allMessages = [];
                  
                  const conversationContainer = document.querySelector('[data-testid="conversation"]') || 
                                               document.querySelector('.conversation') || 
                                               document.querySelector('main') || 
                                               document.body;
                  
                  if (!conversationContainer) {
                    return { error: 'No conversation container found' };
                  }
                  
                  const messageElements = conversationContainer.querySelectorAll('[data-testid="user-message"], .font-claude-message, [data-message-author-role]');
                  
                  if (messageElements.length === 0) {
                    return { error: 'No messages found' };
                  }
                  
                  messageElements.forEach((el, index) => {
                    const text = el.textContent || el.innerText;
                    if (!text || text.trim().length === 0) return;
                    
                    const isUser = el.hasAttribute('data-testid') && el.getAttribute('data-testid') === 'user-message' ||
                                  el.hasAttribute('data-message-author-role') && el.getAttribute('data-message-author-role') === 'user';
                    const isAssistant = el.classList.contains('font-claude-message') ||
                                       el.hasAttribute('data-message-author-role') && el.getAttribute('data-message-author-role') === 'assistant';
                    
                    allMessages.push({
                      index,
                      text: text.trim(),
                      isUser: !!isUser,
                      isAssistant: !!isAssistant || !isUser
                    });
                  });
                  
                  if (allMessages.length === 0) {
                    return { error: 'No valid messages found' };
                  }
                  
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
            
            result = await this.wsClient.sendRequest('debugger_command', {
              tabId: args.tabId,
              command: 'Runtime.evaluate',
              params: {
                expression: responseScript,
                returnByValue: true,
                awaitPromise: true
              }
            });
            
            if (result.exceptionDetails) {
              throw new Error(`Response retrieval failed: ${result.exceptionDetails.text}`);
            }
            
            result = result.result.value;
            break;

          case 'debug_attach':
            result = await this.wsClient.sendRequest('attach_debugger', { tabId: args.tabId });
            break;

          case 'execute_script':
            await this.wsClient.sendRequest('attach_debugger', { tabId: args.tabId });
            
            result = await this.wsClient.sendRequest('debugger_command', {
              tabId: args.tabId,
              command: 'Runtime.evaluate',
              params: {
                expression: args.script,
                returnByValue: true,
                awaitPromise: true
              }
            });
            
            if (result.exceptionDetails) {
              throw new Error(`Script execution failed: ${result.exceptionDetails.text}`);
            }
            
            result = result.result;
            break;

          case 'get_dom_elements':
            await this.wsClient.sendRequest('attach_debugger', { tabId: args.tabId });
            
            const elementsScript = `
              Array.from(document.querySelectorAll(${JSON.stringify(args.selector)})).map(el => ({
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
            
            result = await this.wsClient.sendRequest('debugger_command', {
              tabId: args.tabId,
              command: 'Runtime.evaluate',
              params: {
                expression: elementsScript,
                returnByValue: true,
                awaitPromise: true
              }
            });
            
            if (result.exceptionDetails) {
              throw new Error(`DOM query failed: ${result.exceptionDetails.text}`);
            }
            
            result = result.result.value || [];
            break;

          case 'debug_claude_page':
            await this.wsClient.sendRequest('attach_debugger', { tabId: args.tabId });
            
            const debugScript = `
              (function() {
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
            
            result = await this.wsClient.sendRequest('debugger_command', {
              tabId: args.tabId,
              command: 'Runtime.evaluate',
              params: {
                expression: debugScript,
                returnByValue: true,
                awaitPromise: true
              }
            });
            
            if (result.exceptionDetails) {
              throw new Error(`Debug page failed: ${result.exceptionDetails.text}`);
            }
            
            result = result.result.value;
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('Claude Code MCP: Tool error:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start() {
    try {
      // Connect to WebSocket server first
      await this.wsClient.connect();
      console.error('Claude Code MCP: Connected to Chrome extension bridge');

      // Start MCP server for Claude Code communication
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Claude Code MCP: MCP server started for Claude Code');
    } catch (error) {
      console.error('Claude Code MCP: Failed to start:', error);
      throw error;
    }
  }

  async stop() {
    console.error('Claude Code MCP: Shutting down server...');
    
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    
    if (this.server) {
      await this.server.close();
    }
    
    console.error('Claude Code MCP: Server shutdown complete');
  }
}

// Start the server
const server = new ClaudeCodeMCPServer();

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  console.error(`Claude Code MCP: Received ${signal}, shutting down gracefully...`);
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Claude Code MCP: Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Handle stdin close (when Claude Code disconnects)
process.stdin.on('close', () => gracefulShutdown('stdin close'));
process.stdin.on('end', () => gracefulShutdown('stdin end'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Claude Code MCP: Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Claude Code MCP: Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

server.start().catch((error) => {
  console.error('Claude Code MCP: Failed to start server:', error);
  process.exit(1);
});

module.exports = ClaudeCodeMCPServer;