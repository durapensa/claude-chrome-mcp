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
}

// Initialize Extension Hub
const ccmHub = new CCMExtensionHub();