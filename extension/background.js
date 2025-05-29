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
        case 'get_claude_tabs':
          console.log('CCM Extension: Getting Claude tabs...');
          result = await this.getClaudeTabs();
          console.log('CCM Extension: Found', result.length, 'Claude tabs');
          break;
          
        case 'get_claude_conversations':
          console.log('CCM Extension: Getting Claude conversations...');
          result = await this.getClaudeConversations();
          console.log('CCM Extension: Found', result.length, 'conversations');
          break;
          
        case 'spawn_claude_tab':
          console.log('CCM Extension: Creating Claude tab with URL:', message.params?.url);
          result = await this.createClaudeTab(message.params?.url);
          console.log('CCM Extension: Created tab:', result);
          break;
          
        case 'send_message_to_claude_tab':
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
          
        case 'start_network_inspection':
          result = await this.startNetworkInspection(message.params?.tabId);
          break;
          
        case 'stop_network_inspection':
          result = await this.stopNetworkInspection(message.params?.tabId);
          break;
          
        case 'get_captured_requests':
          result = await this.getCapturedRequests(message.params?.tabId);
          break;
          
        case 'close_claude_tab':
          result = await this.closeClaudeTab(message.params);
          break;
          
        case 'open_claude_conversation_tab':
          result = await this.openClaudeConversationTab(message.params);
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
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        // Handle case where tabs is undefined or null
        if (!tabs) {
          resolve([]);
          return;
        }

        const claudeTabs = tabs.map(tab => {
          // Extract conversation ID from URL if present
          let conversationId = null;
          const chatMatch = tab.url.match(/\/chat\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
          if (chatMatch) {
            conversationId = chatMatch[1];
          }

          return {
            id: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active,
            debuggerAttached: this.debuggerSessions.has(tab.id),
            conversationId: conversationId
          };
        });
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

  async getClaudeConversations() {
    try {
      // First get current Claude tabs to match with conversations
      const claudeTabs = await this.getClaudeTabs();
      const tabsByConversationId = new Map();
      
      claudeTabs.forEach(tab => {
        if (tab.conversationId) {
          tabsByConversationId.set(tab.conversationId, tab.id);
        }
      });

      // Find a Claude tab to execute the API call from
      let claudeTab = claudeTabs.find(tab => tab.url.includes('claude.ai'));
      
      if (!claudeTab) {
        // Create a temporary Claude tab for the API call
        claudeTab = await this.createClaudeTab();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page load
      }

      // Attach debugger to execute script
      await this.ensureDebuggerAttached(claudeTab.id);

      // Execute script to fetch conversations from Claude API
      const conversationsScript = `
        (async function() {
          try {
            // Extract organization ID from cookies
            const cookies = document.cookie;
            const orgMatch = cookies.match(/lastActiveOrg=([^;]+)/);
            if (!orgMatch) {
              throw new Error('Organization ID not found in cookies');
            }
            const orgId = orgMatch[1];
            
            const response = await fetch('/api/organizations/' + orgId + '/chat_conversations?offset=0&limit=30', {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error('Failed to fetch conversations: ' + response.status);
            }
            
            const data = await response.json();
            return data;
          } catch (error) {
            return { error: error.toString() };
          }
        })()
      `;

      const result = await this.executeScript({ 
        tabId: claudeTab.id, 
        script: conversationsScript 
      });

      const apiData = result.result?.value;
      
      if (apiData?.error) {
        throw new Error('API Error: ' + apiData.error);
      }

      if (!apiData || !Array.isArray(apiData)) {
        throw new Error('Invalid API response format');
      }

      // Transform the conversations to include tab IDs
      const conversations = apiData.map(conv => ({
        id: conv.uuid,
        title: conv.name || 'Untitled Conversation',
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        message_count: conv.chat_messages?.length || 0,
        tabId: tabsByConversationId.get(conv.uuid) || null,
        isOpen: tabsByConversationId.has(conv.uuid)
      }));

      return conversations;

    } catch (error) {
      console.error('CCM Extension: Error fetching conversations:', error);
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }
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
        returnByValue: true,
        awaitPromise: true
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
    const { tabId, conversationId } = params;
    
    // Ensure debugger is attached
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
      (async function() {
        try {
          // Get conversation ID from URL if not provided
          let convId = '${conversationId || ''}';
          if (!convId) {
            const urlMatch = window.location.href.match(/\\/chat\\/([a-f0-9-]{36})/);
            if (urlMatch) {
              convId = urlMatch[1];
            } else {
              return { success: false, reason: 'Could not determine conversation ID from URL' };
            }
          }
          
          // Extract organization ID from page context or use default pattern
          let orgId = null;
          try {
            // Try to get org ID from any API calls or page data
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || '';
              const orgMatch = content.match(/organizations\\/([a-f0-9-]{36})/);
              if (orgMatch) {
                orgId = orgMatch[1];
                break;
              }
            }
            
            // Fallback: try to extract from current fetch requests if available
            if (!orgId) {
              // This is a common org ID pattern we observed - use as fallback
              orgId = '1ada8651-e431-4f80-b5da-344eb1d3d5fa';
            }
          } catch (e) {
            orgId = '1ada8651-e431-4f80-b5da-344eb1d3d5fa'; // Fallback
          }
          
          // Get required headers from page context
          const headers = {
            'Content-Type': 'application/json',
            'anthropic-client-platform': 'web_claude_ai',
            'anthropic-client-sha': 'unknown',
            'anthropic-client-version': 'unknown'
          };
          
          // Try to get session-specific headers from meta tags or localStorage
          try {
            const metaAnonymousId = document.querySelector('meta[name="anthropic-anonymous-id"]');
            if (metaAnonymousId) {
              headers['anthropic-anonymous-id'] = metaAnonymousId.content;
            }
            
            const metaDeviceId = document.querySelector('meta[name="anthropic-device-id"]');
            if (metaDeviceId) {
              headers['anthropic-device-id'] = metaDeviceId.content;
            }
          } catch (e) {
            // Headers will be missing but might still work
          }
          
          // Construct the delete URL
          const deleteUrl = \`https://claude.ai/api/organizations/\${orgId}/chat_conversations/\${convId}\`;
          
          console.log('Calling DELETE API:', deleteUrl);
          
          // Make the DELETE request
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: headers,
            body: JSON.stringify({ uuid: convId }),
            credentials: 'include'
          });
          
          if (response.ok) {
            // Wait a moment then redirect to new conversation page
            await new Promise(r => setTimeout(r, 500));
            window.location.href = 'https://claude.ai/new';
            
            return { 
              success: true, 
              method: 'direct_api',
              conversationId: convId,
              organizationId: orgId,
              status: response.status,
              deletedAt: Date.now()
            };
          } else {
            const errorText = await response.text();
            return { 
              success: false, 
              reason: 'API call failed',
              status: response.status,
              error: errorText
            };
          }
          
        } catch (error) {
          return { 
            success: false, 
            method: 'direct_api_failed',
            reason: 'Network or API error',
            error: error.toString()
          };
        }
      })()
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

  async startNetworkInspection(tabId) {
    if (!this.debuggerSessions.has(tabId)) {
      await this.attachDebugger(tabId);
    }

    // Store captured requests for this tab
    if (!this.capturedRequests) {
      this.capturedRequests = new Map();
    }
    this.capturedRequests.set(tabId, []);

    // Set up network event listeners
    const onNetworkEvent = (source, method, params) => {
      if (source.tabId === tabId) {
        const requests = this.capturedRequests.get(tabId) || [];
        
        if (method === 'Network.requestWillBeSent') {
          requests.push({
            type: 'request',
            requestId: params.requestId,
            url: params.request.url,
            method: params.request.method,
            headers: params.request.headers,
            postData: params.request.postData,
            timestamp: params.timestamp
          });
          console.log(`Captured request: ${params.request.method} ${params.request.url}`);
        } else if (method === 'Network.responseReceived') {
          requests.push({
            type: 'response',
            requestId: params.requestId,
            url: params.response.url,
            status: params.response.status,
            headers: params.response.headers,
            timestamp: params.timestamp
          });
          console.log(`Captured response: ${params.response.status} ${params.response.url}`);
        }
        
        this.capturedRequests.set(tabId, requests);
      }
    };

    chrome.debugger.onEvent.addListener(onNetworkEvent);

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ success: true, message: 'Network inspection started with event capture' });
        }
      });
    });
  }

  async stopNetworkInspection(tabId) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Network.disable', {}, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ success: true, message: 'Network inspection stopped' });
        }
      });
    });
  }

  async getCapturedRequests(tabId) {
    const requests = this.capturedRequests?.get(tabId) || [];
    
    // Filter for likely delete-related requests
    const deleteRelated = requests.filter(req => {
      if (req.type !== 'request') return false;
      const url = req.url.toLowerCase();
      const method = req.method?.toUpperCase();
      
      return (method === 'DELETE' || 
              method === 'POST' || 
              method === 'PUT') &&
             (url.includes('delete') || 
              url.includes('remove') || 
              url.includes('conversation') ||
              url.includes('chat'));
    });
    
    return {
      success: true,
      totalRequests: requests.length,
      deleteRelatedRequests: deleteRelated,
      allRequests: requests.slice(0, 20) // Limit to avoid too much data
    };
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

  /**
   * Close a specific Claude.ai tab by tab ID
   */
  async closeClaudeTab(params) {
    const { tabId, force = false } = params;
    
    if (!tabId || typeof tabId !== 'number') {
      throw new Error('tabId is required and must be a number');
    }

    try {
      // First, get tab information
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });

      // Verify it's a Claude.ai tab
      if (!tab.url.includes('claude.ai')) {
        return {
          success: false,
          reason: 'Tab is not a Claude.ai tab',
          tabId: tabId,
          tabUrl: tab.url
        };
      }

      // Extract conversation ID from URL if possible
      const conversationIdMatch = tab.url.match(/\/chat\/([a-f0-9-]{36})/);
      const conversationId = conversationIdMatch ? conversationIdMatch[1] : null;

      // If not forcing closure, check for unsaved content
      if (!force) {
        try {
          // Ensure debugger is attached
          await this.ensureDebuggerAttached(tabId);
          
          // Check for unsaved content
          const hasUnsavedScript = `
            (function() {
              const textarea = document.querySelector('div[contenteditable="true"]');
              const hasText = textarea && textarea.textContent && textarea.textContent.trim().length > 0;
              return {
                hasUnsavedContent: hasText,
                textLength: hasText ? textarea.textContent.trim().length : 0
              };
            })()
          `;
          
          const result = await this.executeScript({ tabId, script: hasUnsavedScript });
          const checkResult = result.result?.value;
          
          if (checkResult && checkResult.hasUnsavedContent) {
            return {
              success: false,
              reason: 'unsaved_content',
              tabId: tabId,
              conversationId: conversationId,
              tabUrl: tab.url,
              textLength: checkResult.textLength,
              message: 'Tab has unsaved content. Use force=true to close anyway.'
            };
          }
        } catch (error) {
          // If we can't check for unsaved content, proceed with warning
          console.warn('Could not check for unsaved content:', error.message);
        }
      }

      // Close the tab
      await new Promise((resolve, reject) => {
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });

      // Clean up debugger session if exists
      if (this.debuggerSessions.has(tabId)) {
        this.debuggerSessions.delete(tabId);
      }

      // Clean up captured requests if exists
      if (this.capturedRequests && this.capturedRequests.has(tabId)) {
        this.capturedRequests.delete(tabId);
      }

      console.log(`CCM Extension: Closed Claude tab ${tabId}`);
      
      return {
        success: true,
        tabId: tabId,
        conversationId: conversationId,
        tabUrl: tab.url,
        tabTitle: tab.title,
        closedAt: Date.now(),
        wasForced: force
      };

    } catch (error) {
      console.error(`CCM Extension: Error closing tab ${tabId}:`, error);
      throw new Error(`Failed to close tab: ${error.message}`);
    }
  }

  /**
   * Open a specific Claude conversation in a new tab using conversation ID
   */
  async openClaudeConversationTab(params) {
    const { 
      conversationId, 
      activate = true, 
      waitForLoad = true, 
      loadTimeoutMs = 10000 
    } = params;
    
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId is required and must be a string');
    }

    // Validate conversation ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      throw new Error('conversationId must be a valid UUID format');
    }

    try {
      // Check if conversation is already open in an existing tab
      const existingTabs = await new Promise((resolve) => {
        chrome.tabs.query({ url: `https://claude.ai/chat/${conversationId}` }, resolve);
      });

      if (existingTabs.length > 0) {
        const existingTab = existingTabs[0];
        
        // Activate the existing tab if requested
        if (activate) {
          await new Promise((resolve, reject) => {
            chrome.tabs.update(existingTab.id, { active: true }, (tab) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(tab);
              }
            });
          });
        }

        return {
          success: true,
          tabId: existingTab.id,
          conversationId: conversationId,
          url: existingTab.url,
          title: existingTab.title,
          wasExisting: true,
          activated: activate,
          createdAt: Date.now()
        };
      }

      // Create new tab with conversation URL
      const conversationUrl = `https://claude.ai/chat/${conversationId}`;
      const newTab = await new Promise((resolve, reject) => {
        chrome.tabs.create({ 
          url: conversationUrl, 
          active: activate 
        }, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });

      console.log(`CCM Extension: Created new tab ${newTab.id} for conversation ${conversationId}`);

      let loadVerified = false;
      let loadTimeMs = 0;
      let conversationTitle = null;
      let hasMessages = false;

      // Wait for page to load if requested
      if (waitForLoad) {
        const loadStartTime = Date.now();
        
        try {
          // Wait for tab to finish loading
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Load timeout after ${loadTimeoutMs}ms`));
            }, loadTimeoutMs);

            const checkLoading = () => {
              chrome.tabs.get(newTab.id, (tab) => {
                if (chrome.runtime.lastError) {
                  clearTimeout(timeout);
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }

                if (tab.status === 'complete') {
                  clearTimeout(timeout);
                  resolve();
                } else {
                  setTimeout(checkLoading, 500);
                }
              });
            };

            checkLoading();
          });

          loadTimeMs = Date.now() - loadStartTime;

          // Verify conversation loaded correctly
          await this.ensureDebuggerAttached(newTab.id);
          
          const verifyScript = `
            (function() {
              try {
                // Check if we're on the right conversation page
                const isCorrectConversation = window.location.href.includes('${conversationId}');
                
                // Check if conversation content is loaded
                const hasConversationContainer = !!document.querySelector('[data-testid="conversation"]') || 
                                                !!document.querySelector('.conversation') ||
                                                !!document.querySelector('main');
                
                // Try to get conversation title
                const titleElement = document.querySelector('title') || 
                                   document.querySelector('h1') ||
                                   document.querySelector('[data-testid="conversation-title"]');
                const title = titleElement ? titleElement.textContent : null;
                
                // Check if there are messages
                const messageElements = document.querySelectorAll('[data-testid="user-message"], .font-claude-message, [data-message-author-role]');
                
                return {
                  isCorrectConversation,
                  hasConversationContainer,
                  conversationTitle: title,
                  hasMessages: messageElements.length > 0,
                  messageCount: messageElements.length,
                  url: window.location.href
                };
              } catch (error) {
                return {
                  error: error.toString(),
                  url: window.location.href
                };
              }
            })()
          `;
          
          const verifyResult = await this.executeScript({ tabId: newTab.id, script: verifyScript });
          const verification = verifyResult.result?.value;
          
          if (verification && !verification.error) {
            loadVerified = verification.isCorrectConversation && verification.hasConversationContainer;
            conversationTitle = verification.conversationTitle;
            hasMessages = verification.hasMessages;
          }
          
        } catch (loadError) {
          console.warn(`CCM Extension: Load verification failed for conversation ${conversationId}:`, loadError.message);
          // Non-fatal error - tab was created successfully
        }
      }

      return {
        success: true,
        tabId: newTab.id,
        conversationId: conversationId,
        url: conversationUrl,
        title: newTab.title,
        wasExisting: false,
        activated: activate,
        createdAt: Date.now(),
        loadVerified: loadVerified,
        loadTimeMs: loadTimeMs,
        conversationTitle: conversationTitle,
        hasMessages: hasMessages
      };

    } catch (error) {
      console.error(`CCM Extension: Error opening conversation ${conversationId}:`, error);
      throw new Error(`Failed to open conversation: ${error.message}`);
    }
  }
}

// Initialize Extension Hub
const ccmHub = new CCMExtensionHub();