// Chrome Extension Background Service Worker
// Extension-as-Hub Architecture: Extension runs WebSocket server, MCP clients connect TO it

const WEBSOCKET_PORT = 54321;
const KEEPALIVE_INTERVAL = 20000;

class MCPClient {
  constructor(ws, clientInfo) {
    this.id = clientInfo.id || `client-${Date.now()}`;
    this.name = clientInfo.name || 'Unknown Client';
    this.type = clientInfo.type || 'mcp';
    this.capabilities = clientInfo.capabilities || [];
    this.websocket = ws;
    this.connected = true;
    this.connectedAt = Date.now();
    this.lastActivity = Date.now();
    this.requestCount = 0;
  }

  send(message) {
    if (this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
      this.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      capabilities: this.capabilities,
      connected: this.connected,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      requestCount: this.requestCount,
      websocketState: this.websocket.readyState
    };
  }
}

class CCMExtensionHub {
  constructor() {
    this.connectedClients = new Map(); // clientId -> client info from hub
    this.debuggerSessions = new Map(); // tabId -> debugger info
    this.hubConnection = null; // WebSocket connection to hub
    this.serverPort = WEBSOCKET_PORT;
    this.requestCounter = 0;
    
    this.init();
  }

  async init() {
    await this.connectToHub();
    this.setupEventListeners();
    this.startKeepalive();
    console.log('CCM Extension: Extension-as-Hub client initialized');
  }

  async connectToHub() {
    try {
      console.log('CCM Extension: Connecting to WebSocket Hub on port', WEBSOCKET_PORT);
      
      this.hubConnection = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}`);
      
      this.hubConnection.onopen = () => {
        console.log('CCM Extension: Connected to WebSocket Hub');
        
        // Register as Chrome extension
        this.hubConnection.send(JSON.stringify({
          type: 'chrome_extension_register',
          extensionId: chrome.runtime.id,
          timestamp: Date.now()
        }));
        
        this.updateBadge('hub-connected');
      };
      
      this.hubConnection.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleHubMessage(message);
        } catch (error) {
          console.error('CCM Extension: Error parsing hub message:', error);
        }
      };
      
      this.hubConnection.onclose = () => {
        console.log('CCM Extension: Disconnected from WebSocket Hub');
        this.hubConnection = null;
        this.updateBadge('hub-disconnected');
        
        // Try to reconnect after delay
        setTimeout(() => this.connectToHub(), 5000);
      };
      
      this.hubConnection.onerror = (error) => {
        console.error('CCM Extension: Hub connection error:', error);
        this.updateBadge('hub-error');
      };
      
    } catch (error) {
      console.error('CCM Extension: Failed to connect to hub:', error);
      this.updateBadge('hub-error');
      // Retry connection
      setTimeout(() => this.connectToHub(), 5000);
    }
  }

  handleHubMessage(message) {
    const { type } = message;
    
    switch (type) {
      case 'registration_confirmed':
        console.log('CCM Extension: Registration confirmed by hub');
        this.updateBadge('connected');
        break;
        
      case 'client_list_update':
        this.updateClientList(message.clients);
        break;
        
      case 'hub_shutdown':
        console.log('CCM Extension: Hub is shutting down');
        this.updateBadge('hub-disconnected');
        break;
        
      case 'server_ready':
        console.log('CCM Extension: Hub server is ready');
        this.updateBadge('hub-connected');
        break;
        
      case 'keepalive':
        // Respond to hub keepalive
        if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
          this.hubConnection.send(JSON.stringify({
            type: 'keepalive_response',
            timestamp: Date.now()
          }));
        }
        break;
        
      default:
        // Handle MCP client requests or unknown messages
        if (message.sourceClientId) {
          this.handleMCPClientRequest(message);
        } else {
          console.log('CCM Extension: Unknown message type:', type, message);
        }
    }
  }
  
  updateClientList(clients) {
    this.connectedClients.clear();
    clients.forEach(client => {
      this.connectedClients.set(client.id, client);
    });
    
    console.log(`CCM Extension: Updated client list, ${clients.length} clients connected`);
    this.updateGlobalState();
  }

  async handleMCPClientRequest(message) {
    const { type, requestId, sourceClientId, sourceClientName } = message;
    
    console.log(`CCM Extension: Handling ${type} from ${sourceClientName} (requestId: ${requestId})`);

    try {
      let result;
      
      switch (type) {
        case 'get_claude_sessions':
          console.log('CCM Extension: Getting Claude sessions...');
          result = await this.getClaudeTabs();
          console.log('CCM Extension: Found', result.length, 'Claude tabs');
          break;
          
        case 'spawn_claude_tab':
          console.log('CCM Extension: Creating Claude tab with URL:', message.params?.url);
          result = await this.createClaudeTab(message.params?.url);
          console.log('CCM Extension: Created tab:', result);
          break;
          
        case 'send_message_to_claude':
          result = await this.sendMessageToClaudeTab(message.params);
          break;
          
        case 'get_claude_response':
          result = await this.getClaudeResponse(message.params);
          break;
          
        case 'debug_attach':
          result = await this.attachDebugger(message.params?.tabId);
          break;
          
        case 'execute_script':
          result = await this.executeScript(message.params);
          break;
          
        case 'get_dom_elements':
          result = await this.getDomElements(message.params);
          break;
          
        case 'debug_claude_page':
          result = await this.debugClaudePage(message.params?.tabId);
          break;
          
        case 'delete_claude_conversation':
          result = await this.deleteClaudeConversation(message.params);
          break;
          
        case 'reload_extension':
          result = await this.reloadExtension();
          break;
          
        default:
          throw new Error(`Unknown message type: ${type}`);
      }

      // Send response back through hub
      if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
        console.log(`CCM Extension: Sending response for ${type} (requestId: ${requestId})`);
        this.hubConnection.send(JSON.stringify({
          type: 'response',
          requestId,
          targetClientId: sourceClientId,
          result,
          timestamp: Date.now()
        }));
      } else {
        console.error('CCM Extension: Hub not connected, cannot send response');
      }
      
    } catch (error) {
      console.error(`CCM Extension: Error handling ${type} from ${sourceClientName}:`, error);
      
      // Send error back through hub
      if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
        this.hubConnection.send(JSON.stringify({
          type: 'error',
          requestId,
          targetClientId: sourceClientId,
          error: error.message,
          timestamp: Date.now()
        }));
      }
    }
  }

  // Chrome automation methods (same as before, but cleaner)
  async getClaudeTabs() {
    return new Promise((resolve) => {
      chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
        const claudeTabs = tabs.map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
          debuggerAttached: this.debuggerSessions.has(tab.id)
        }));
        resolve(claudeTabs);
      });
    });
  }

  async createClaudeTab(url = 'https://claude.ai') {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url }, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({
            id: tab.id,
            url: tab.url,
            title: tab.title
          });
        }
      });
    });
  }

  async attachDebugger(tabId) {
    if (this.debuggerSessions.has(tabId)) {
      return { already_attached: true };
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.debuggerSessions.set(tabId, { attached: Date.now() });
          resolve({ attached: true });
        }
      });
    });
  }

  async executeScript(params) {
    const { tabId, script } = params;
    
    if (!this.debuggerSessions.has(tabId)) {
      await this.attachDebugger(tabId);
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: script,
        returnByValue: true
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  async getDomElements(params) {
    const { tabId, selector } = params;
    const script = `
      Array.from(document.querySelectorAll('${selector}')).map(el => ({
        tagName: el.tagName,
        textContent: el.textContent?.substring(0, 200),
        className: el.className,
        id: el.id
      }))
    `;
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || [];
  }

  async sendMessageToClaudeTab(params) {
    const { tabId, message } = params;
    const script = `
      (function() {
        const textarea = document.querySelector('div[contenteditable="true"]');
        if (textarea) {
          textarea.focus();
          textarea.textContent = '${message.replace(/'/g, "\\'")}';
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          
          setTimeout(() => {
            const sendButton = document.querySelector('button[aria-label*="Send"], button:has(svg[stroke])');
            if (sendButton && !sendButton.disabled) {
              sendButton.click();
              return { success: true, sent: true };
            }
            return { success: false, reason: 'Send button not found or disabled' };
          }, 100);
          
          return { success: true, messageSent: true };
        }
        return { success: false, reason: 'Message input not found' };
      })()
    `;
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || { success: false, reason: 'Script execution failed' };
  }

  async getClaudeResponse(params) {
    const { tabId } = params;
    const script = `
      (function() {
        try {
          // Get all conversation messages in order
          const allMessages = [];
          
          // Find conversation container
          const conversationContainer = document.querySelector('[data-testid="conversation"]') || 
                                       document.querySelector('.conversation') || 
                                       document.querySelector('main') || 
                                       document.body;
          
          if (!conversationContainer) {
            return { success: false, reason: 'No conversation container found' };
          }
          
          // Get all message elements with better selectors
          const messageElements = conversationContainer.querySelectorAll('[data-testid="user-message"], .font-claude-message, [data-message-author-role], [data-testid*="message"]');
          
          if (messageElements.length === 0) {
            return { success: false, reason: 'No messages found' };
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
            return { success: false, reason: 'No valid messages found' };
          }
          
          // Get the last message
          const lastMessage = allMessages[allMessages.length - 1];
          
          return {
            success: true,
            text: lastMessage.text,
            isUser: lastMessage.isUser,
            isAssistant: lastMessage.isAssistant,
            timestamp: Date.now(),
            totalMessages: allMessages.length
          };
        } catch (error) {
          return { success: false, reason: 'Error getting messages: ' + error.toString() };
        }
      })()
    `;
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || { success: false, reason: 'Script execution failed' };
  }

  async debugClaudePage(tabId) {
    const script = `
      (function() {
        const input = document.querySelector('div[contenteditable="true"]');
        const sendButton = document.querySelector('button[aria-label*="Send"], button:has(svg[stroke])');
        
        return {
          pageReady: !!input,
          inputAvailable: !!input && !input.disabled,
          sendButtonAvailable: !!sendButton && !sendButton.disabled,
          url: window.location.href,
          title: document.title
        };
      })()
    `;
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || { pageReady: false };
  }

  async deleteClaudeConversation(params) {
    const { tabId } = params;
    
    // Ensure debugger is attached with retry logic
    try {
      await this.ensureDebuggerAttached(tabId);
    } catch (error) {
      return { 
        success: false, 
        reason: 'Failed to attach debugger',
        error: error.message 
      };
    }

    const script = `
      new Promise(async (resolve) => {
        try {
          // Find the conversation title dropdown using the robust data-testid selector
          const chatMenuTrigger = document.querySelector('[data-testid="chat-menu-trigger"]');
          
          if (!chatMenuTrigger) {
            resolve({ success: false, reason: 'Chat menu trigger not found' });
            return;
          }
          
          const conversationTitle = chatMenuTrigger.textContent?.trim();
          console.log('Opening menu for conversation:', conversationTitle);
          
          // Click the chat menu trigger to open dropdown
          chatMenuTrigger.click();
          
          // Wait for menu to appear and find delete option
          await new Promise(r => setTimeout(r, 300));
          
          const deleteButton = document.querySelector('[data-testid="delete-chat-trigger"]');
          
          if (!deleteButton) {
            resolve({ success: false, reason: 'Delete button not found in menu' });
            return;
          }
          
          console.log('Clicking delete button');
          deleteButton.click();
          
          // Wait for potential confirmation dialog and handle it
          await new Promise(r => setTimeout(r, 500));
          
          const confirmButtons = document.querySelectorAll('button');
          const confirmDelete = Array.from(confirmButtons).find(btn => {
            const text = btn.textContent?.toLowerCase() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            return text.includes('delete') || text.includes('confirm') || 
                   ariaLabel.includes('delete') || ariaLabel.includes('confirm');
          });
          
          if (confirmDelete) {
            console.log('Confirming deletion');
            confirmDelete.click();
          }
          
          // Wait a moment and check if we were redirected
          await new Promise(r => setTimeout(r, 1000));
          
          const newUrl = window.location.href;
          const wasRedirected = newUrl.includes('/new') || !newUrl.includes('/chat/');
          
          resolve({ 
            success: true, 
            conversationTitle: conversationTitle,
            wasRedirected: wasRedirected,
            newUrl: newUrl,
            deletedAt: Date.now()
          });
          
        } catch (error) {
          resolve({ 
            success: false, 
            error: error.toString()
          });
        }
      })
    `;
    
    try {
      const result = await this.executeScriptWithRetry(tabId, script);
      return result.result?.value || { success: false, reason: 'Script execution failed' };
    } catch (error) {
      return { 
        success: false, 
        reason: 'Script execution error',
        error: error.message 
      };
    }
  }

  async ensureDebuggerAttached(tabId) {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // Check if debugger is already attached
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => t.id === tabId);
        
        if (!tab) {
          throw new Error(`Tab ${tabId} not found`);
        }
        
        // First test if debugger is already working
        try {
          await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
              expression: 'true',
              returnByValue: true
            }, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(result);
            });
          });
          console.log(`Debugger already working on tab ${tabId}`);
          this.debuggerSessions.set(tabId, { attached: Date.now() });
          return; // Success - debugger is already functional
        } catch (testError) {
          // Debugger not working, try to attach
        }
        
        // Try to attach debugger
        await new Promise((resolve, reject) => {
          chrome.debugger.attach({ tabId }, '1.0', () => {
            if (chrome.runtime.lastError) {
              // Already attached is not an error if it's working
              if (chrome.runtime.lastError.message?.includes('already attached')) {
                resolve();
                return;
              }
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          });
        });
        
        // Test debugger connection with a simple command
        await new Promise((resolve, reject) => {
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
            expression: 'true',
            returnByValue: true
          }, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(result);
          });
        });
        
        console.log(`Debugger successfully attached to tab ${tabId}`);
        this.debuggerSessions.set(tabId, { attached: Date.now() });
        return; // Success
        
      } catch (error) {
        retries++;
        console.log(`Debugger attach attempt ${retries}/${maxRetries} failed:`, error.message);
        
        if (retries >= maxRetries) {
          throw new Error(`Failed to attach debugger after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Detach and wait before retry
        try {
          await new Promise(resolve => {
            chrome.debugger.detach({ tabId }, () => {
              // Ignore errors on detach
              resolve();
            });
          });
        } catch (detachError) {
          // Ignore detach errors
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  async executeScriptWithRetry(tabId, script, maxRetries = 2) {
    let lastError;
    
    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        const result = await this.executeScript({ tabId, script });
        return result;
        
      } catch (error) {
        lastError = error;
        console.log(`Script execution attempt ${retry + 1}/${maxRetries + 1} failed:`, error.message);
        
        if (retry < maxRetries) {
          // Try to reattach debugger before retry
          try {
            await this.ensureDebuggerAttached(tabId);
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (reattachError) {
            console.log('Failed to reattach debugger:', reattachError.message);
          }
        }
      }
    }
    
    throw lastError;
  }

  updateGlobalState() {
    const connectedCount = this.connectedClients.size;
    
    if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
      if (connectedCount > 0) {
        this.updateBadge('connected', connectedCount.toString());
      } else {
        this.updateBadge('ready');
      }
    } else {
      this.updateBadge('hub-disconnected');
    }
  }

  updateBadge(status, text = '') {
    const badgeConfig = {
      'hub-connected': { text: '●', color: '#28a745' },
      'connected': { text: text || '●', color: '#28a745' },
      'ready': { text: '○', color: '#28a745' },
      'hub-disconnected': { text: '○', color: '#ffc107' },
      'hub-error': { text: '×', color: '#dc3545' }
    };

    const config = badgeConfig[status] || badgeConfig.waiting;
    
    chrome.action.setBadgeText({ text: config.text });
    chrome.action.setBadgeBackgroundColor({ color: config.color });
  }

  setupEventListeners() {
    // Handle messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'getHubStatus') {
        const clientStatus = Array.from(this.connectedClients.values());
        
        sendResponse({
          serverPort: this.serverPort,
          hubConnected: this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN,
          connectedClients: clientStatus,
          debuggerSessions: Array.from(this.debuggerSessions.keys()),
          uptime: Date.now() - (this.startTime || Date.now())
        });
      }
      return true;
    });

    // Tab cleanup
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.debuggerSessions.has(tabId)) {
        this.debuggerSessions.delete(tabId);
      }
    });

    // Debugger cleanup
    chrome.debugger.onDetach.addListener((source, reason) => {
      this.debuggerSessions.delete(source.tabId);
    });
  }

  startKeepalive() {
    setInterval(() => {
      // Send keepalive to hub
      if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
        this.hubConnection.send(JSON.stringify({ 
          type: 'keepalive', 
          timestamp: Date.now() 
        }));
      } else {
        // Try to reconnect to hub
        this.connectToHub();
      }
    }, KEEPALIVE_INTERVAL);
  }

  async reloadExtension() {
    try {
      // Send notification to any connected clients before reload
      if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
        this.hubConnection.send(JSON.stringify({
          type: 'extension_reloading',
          timestamp: Date.now()
        }));
      }

      // Small delay to allow message to be sent
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reload the extension
      chrome.runtime.reload();
      
      return { success: true, message: 'Extension reloaded successfully' };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        message: 'Failed to reload extension'
      };
    }
  }
}

// Initialize Extension Hub
const ccmHub = new CCMExtensionHub();