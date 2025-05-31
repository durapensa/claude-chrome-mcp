// Chrome Extension Background Service Worker
// Extension-as-Hub Architecture: Extension runs WebSocket server, MCP clients connect TO it

const WEBSOCKET_PORT = 54321;
const KEEPALIVE_INTERVAL = 20000;

// IMPORTANT: Register event listeners immediately for Manifest V3 service worker persistence
console.log('CCM: Registering critical event listeners at startup...');

// Content script auto-injection - register immediately
let contentScriptManager; // Will be initialized later

// DISABLED: Tab update listener for content script injection (causing race conditions)
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   console.log(`CCM: Tab ${tabId} updated (immediate):`, { status: changeInfo.status, url: tab.url });
//   if (changeInfo.status === 'complete' && tab.url && tab.url.includes('claude.ai')) {
//     console.log(`CCM: Triggering immediate injection for tab ${tabId} via onUpdated`);
//     if (contentScriptManager) {
//       contentScriptManager.injectContentScript(tabId);
//     } else {
//       console.warn('CCM: ContentScriptManager not yet initialized, retrying...');
//       setTimeout(() => {
//         if (contentScriptManager) {
//           contentScriptManager.injectContentScript(tabId);
//         }
//       }, 1000);
//     }
//   }
// });

// DISABLED: Navigation completion listener for content script injection (causing race conditions)
// chrome.webNavigation.onCompleted.addListener((details) => {
//   console.log(`CCM: Navigation completed (immediate) for tab ${details.tabId}:`, { frameId: details.frameId, url: details.url });
//   if (details.frameId === 0 && details.url.includes('claude.ai')) {
//     console.log(`CCM: Triggering immediate injection for tab ${details.tabId} via webNavigation`);
//     if (contentScriptManager) {
//       contentScriptManager.injectContentScript(details.tabId);
//     } else {
//       console.warn('CCM: ContentScriptManager not yet initialized, retrying...');
//       setTimeout(() => {
//         if (contentScriptManager) {
//           contentScriptManager.injectContentScript(details.tabId);
//         }
//       }, 1000);
//     }
//   }
// });

console.log('CCM: Critical event listeners registered successfully');

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('CCM Extension: Service worker started');
  // Set up alarm to keep service worker alive
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 }); // Every 15 seconds
});

// Handle installation/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('CCM Extension: Installed/Updated');
  // Set up alarm to keep service worker alive
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 }); // Every 15 seconds
});

// Ensure service worker stays active
self.addEventListener('activate', event => {
  console.log('CCM Extension: Service worker activated');
  // Set up alarm on activation as well
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
});

// Handle alarms to keep service worker alive and check connection
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('CCM Extension: Keep-alive alarm triggered');
    
    // Check WebSocket connection status
    if (!ccmHub.isConnected()) {
      console.log('CCM Extension: WebSocket not connected');
      // Don't attempt reconnection here - let the persistent reconnection handle it
      // This prevents multiple reconnection attempts from different mechanisms
    } else {
      console.log('CCM Extension: WebSocket connection is healthy');
    }
    
    // Store connection state for recovery
    chrome.storage.local.set({
      lastAliveTime: Date.now(),
      connectionState: ccmHub.hubConnection ? ccmHub.hubConnection.readyState : 'disconnected',
      connectedClients: ccmHub.connectedClients.size,
      reconnectAttempts: ccmHub.reconnectAttempts,
      hasPersistentReconnect: !!ccmHub.persistentReconnectInterval
    });
  }
});

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

class MessageQueue {
  constructor() {
    this.queues = new Map(); // tabId -> queue
    this.processing = new Map(); // tabId -> isProcessing
  }
  
  async enqueue(tabId, operation) {
    if (!this.queues.has(tabId)) {
      this.queues.set(tabId, []);
      this.processing.set(tabId, false);
    }
    
    return new Promise((resolve, reject) => {
      this.queues.get(tabId).push({ operation, resolve, reject });
      this.processQueue(tabId);
    });
  }
  
  async processQueue(tabId) {
    if (this.processing.get(tabId)) return;
    
    const queue = this.queues.get(tabId);
    if (!queue || queue.length === 0) return;
    
    this.processing.set(tabId, true);
    
    while (queue.length > 0) {
      const { operation, resolve, reject } = queue.shift();
      try {
        const result = await operation();
        resolve(result);
        // Add small delay between operations to prevent race conditions
        if (queue.length > 0) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (error) {
        console.error('Queue operation failed:', error);
        reject(error);
      }
    }
    
    this.processing.set(tabId, false);
  }
}

class TabOperationLock {
  constructor() {
    this.locks = new Map(); // tabId -> Set of operation types
  }
  
  async acquire(tabId, operationType) {
    if (!this.locks.has(tabId)) {
      this.locks.set(tabId, new Set());
    }
    
    const tabLocks = this.locks.get(tabId);
    
    // Wait if conflicting operation is in progress
    while (this.hasConflict(tabLocks, operationType)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    tabLocks.add(operationType);
  }
  
  release(tabId, operationType) {
    const tabLocks = this.locks.get(tabId);
    if (tabLocks) {
      tabLocks.delete(operationType);
    }
  }
  
  hasConflict(tabLocks, operationType) {
    // Define conflicting operations
    const conflicts = {
      'send_message': ['send_message', 'get_response'],
      'get_response': ['send_message'],
      'get_metadata': [],
      'extract_elements': []
    };
    
    const conflictingOps = conflicts[operationType] || [];
    return conflictingOps.some(op => tabLocks.has(op));
  }
}

class CCMExtensionHub {
  constructor() {
    this.connectedClients = new Map(); // clientId -> client info from hub
    this.debuggerSessions = new Map(); // tabId -> debugger info
    this.hubConnection = null; // WebSocket connection to hub
    this.serverPort = WEBSOCKET_PORT;
    this.requestCounter = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 5000; // Max 5 seconds for quick recovery
    this.baseReconnectDelay = 500; // Start with 500ms
    this.messageQueue = new MessageQueue(); // Add message queue
    this.operationLock = new TabOperationLock(); // Add operation lock
    
    // Enhanced reconnection settings
    this.lastConnectionAttempt = 0;
    this.resetAttemptsAfter = 300000; // Reset after 5 minutes
    this.persistentReconnectInterval = null;
    this.maxReconnectAttempts = -1; // Infinite attempts
    
    this.init();
  }

  async init() {
    console.log('CCM Extension: Initializing...');
    
    // Check for previous connection state
    const previousState = await chrome.storage.local.get(['lastAliveTime', 'connectionState']);
    if (previousState.lastAliveTime) {
      const timeSinceLastAlive = Date.now() - previousState.lastAliveTime;
      console.log(`CCM Extension: Service worker was last alive ${timeSinceLastAlive}ms ago`);
      console.log(`CCM Extension: Previous connection state: ${previousState.connectionState}`);
    }
    
    await this.connectToHub();
    this.setupEventListeners();
    this.startKeepalive();
    console.log('CCM Extension: Extension-as-Hub client initialized');
  }

  isConnected() {
    return this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN;
  }

  async connectToHub() {
    try {
      console.log('CCM Extension: Connecting to WebSocket Hub on port', WEBSOCKET_PORT);
      
      // Use 127.0.0.1 instead of localhost to avoid potential DNS issues
      const wsUrl = `ws://127.0.0.1:${WEBSOCKET_PORT}`;
      console.log('CCM Extension: Attempting connection to', wsUrl);
      
      this.hubConnection = new WebSocket(wsUrl);
      
      this.hubConnection.onopen = () => {
        console.log('CCM Extension: Connected to WebSocket Hub');
        
        // Reset reconnection attempts on successful connection
        this.reconnectAttempts = 0;
        this.lastConnectionAttempt = Date.now();
        
        // Clear persistent reconnection interval if active
        if (this.persistentReconnectInterval) {
          console.log('CCM Extension: Clearing persistent reconnection interval');
          clearInterval(this.persistentReconnectInterval);
          this.persistentReconnectInterval = null;
        }
        
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
      
      this.hubConnection.onclose = (event) => {
        console.log('CCM Extension: Disconnected from WebSocket Hub', event.code, event.reason);
        this.hubConnection = null;
        this.updateBadge('hub-disconnected');
        
        // Immediately try to reconnect if it was a clean shutdown (hub restarting)
        if (event.code === 1000 || event.code === 1001) {
          console.log('CCM Extension: Clean shutdown detected, attempting immediate reconnection');
          setTimeout(() => this.connectToHub(), 100);
        } else {
          // Try to reconnect with exponential backoff for other cases
          this.scheduleReconnect();
        }
      };
      
      this.hubConnection.onerror = (error) => {
        console.error('CCM Extension: Hub connection error:', error);
        console.error('Error details:', {
          readyState: this.hubConnection?.readyState,
          url: this.hubConnection?.url,
          error: error
        });
        this.updateBadge('hub-error');
      };
      
    } catch (error) {
      console.error('CCM Extension: Failed to connect to hub:', error);
      this.updateBadge('hub-error');
      // Retry connection with exponential backoff
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    // Reset attempts if enough time has passed
    if (Date.now() - this.lastConnectionAttempt > this.resetAttemptsAfter) {
      console.log('CCM Extension: Resetting reconnection attempts after timeout');
      this.reconnectAttempts = 0;
    }
    
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    const finalDelay = delay + jitter;
    
    this.reconnectAttempts++;
    this.lastConnectionAttempt = Date.now();
    
    console.log(`CCM Extension: Scheduling reconnection attempt ${this.reconnectAttempts} in ${Math.round(finalDelay)}ms`);
    
    setTimeout(() => {
      if (!this.hubConnection || this.hubConnection.readyState !== WebSocket.OPEN) {
        this.connectToHub();
      }
    }, finalDelay);
    
    // Set up persistent retry every 5 seconds if not already running
    // This ensures quick reconnection when hub becomes available
    if (!this.persistentReconnectInterval) {
      console.log('CCM Extension: Setting up persistent reconnection interval (5s)');
      this.persistentReconnectInterval = setInterval(() => {
        if (!this.hubConnection || this.hubConnection.readyState !== WebSocket.OPEN) {
          console.log('CCM Extension: Persistent reconnection attempt');
          this.connectToHub();
        } else {
          // Clear interval if connected
          console.log('CCM Extension: Connected, clearing persistent reconnection interval');
          clearInterval(this.persistentReconnectInterval);
          this.persistentReconnectInterval = null;
        }
      }, 5000); // Reduced from 30s to 5s for better UX
    }
  }

  handleHubMessage(message) {
    const { type } = message;
    this.lastHubMessage = Date.now();
    
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
        // Immediately attempt reconnection when hub announces shutdown
        this.scheduleReconnect();
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
        case 'get_claude_dot_ai_tabs':
          console.log('CCM Extension: Getting Claude tabs...');
          result = await this.getClaudeTabs();
          console.log('CCM Extension: Found', result.length, 'Claude tabs');
          break;
          
        case 'get_claude_conversations':
          console.log('CCM Extension: Getting Claude conversations...');
          result = await this.getClaudeConversations();
          console.log('CCM Extension: Found', result.length, 'conversations');
          break;
          
        case 'spawn_claude_dot_ai_tab':
          console.log('CCM Extension: Creating Claude tab with params:', message.params);
          result = await this.createClaudeTab(message.params?.url, {
            waitForLoad: message.params?.waitForLoad,
            injectContentScript: message.params?.injectContentScript,
            waitForReady: message.params?.waitForReady
          });
          console.log('CCM Extension: Created tab with async options:', result);
          break;
          
        case 'manual_inject_content_script':
          console.log('CCM Extension: Manual content script injection for tab:', message.params?.tabId);
          if (message.params?.tabId) {
            try {
              await contentScriptManager.injectContentScript(message.params.tabId);
              result = { success: true, message: 'Content script injected successfully' };
            } catch (error) {
              result = { success: false, error: error.message };
            }
          } else {
            result = { success: false, error: 'tabId parameter required' };
          }
          break;
          
        case 'send_message_to_claude_dot_ai_tab':
          result = await this.sendMessageToClaudeTab(message.params);
          break;
        
        case 'batch_send_messages':
          result = await this.batchSendMessages(message.params);
          break;
          
        case 'get_claude_dot_ai_response':
          result = await this.getClaudeResponse(message.params);
          break;
        
        case 'get_conversation_metadata':
          result = await this.getConversationMetadata(message.params);
          break;
        
        case 'export_conversation_transcript':
          result = await this.exportConversationTranscript(message.params);
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
          
        case 'debug_claude_dot_ai_page':
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
          
        case 'close_claude_dot_ai_tab':
          result = await this.closeClaudeTab(message.params);
          break;
          
        case 'open_claude_dot_ai_conversation_tab':
          result = await this.openClaudeConversationTab(message.params);
          break;
        
        case 'extract_conversation_elements':
          console.log('CCM Extension: Extracting conversation elements for tab:', message.params?.tabId);
          result = await this.extractConversationElements(message.params);
          console.log('CCM Extension: Extraction completed');
          break;
        
        case 'get_claude_dot_ai_response_status':
          result = await this.getClaudeResponseStatus(message.params);
          break;
        
        case 'batch_get_responses':
          result = await this.batchGetResponses(message.params);
          break;
          
        case 'get_connection_health':
          result = await this.getConnectionHealth();
          break;
          
        case 'send_content_script_message':
          result = await this.sendContentScriptMessage(message.params);
          break;
          
        case 'test_simple':
          console.log('CCM Extension: Test simple message received');
          result = { success: true, message: 'Test successful', timestamp: Date.now() };
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

  async createClaudeTab(url = 'https://claude.ai', options = {}) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url }, async (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        const tabInfo = {
          id: tab.id,
          url: tab.url,
          title: tab.title
        };
        
        // If waitForLoad option is enabled, wait for tab to load and inject content script
        if (options.waitForLoad || options.injectContentScript) {
          try {
            console.log(`CCM: Waiting for tab ${tab.id} to load...`);
            
            // Wait for tab to complete loading
            await this.waitForTabLoad(tab.id);
            
            // Inject content script if requested
            if (options.injectContentScript) {
              console.log(`CCM: Injecting content script into tab ${tab.id}...`);
              try {
                const injectionResult = await contentScriptManager.injectContentScript(tab.id);
                console.log(`CCM: Content script injection result:`, injectionResult);
                tabInfo.contentScriptInjected = injectionResult.success;
                tabInfo.injectionResult = injectionResult;
              } catch (injectionError) {
                console.error(`CCM: Content script injection failed:`, injectionError);
                tabInfo.contentScriptInjected = false;
                tabInfo.injectionError = injectionError.message;
              }
            }
            
            // Additional wait for page readiness if requested
            if (options.waitForReady) {
              console.log(`CCM: Waiting for page readiness in tab ${tab.id}...`);
              await this.waitForPageReady(tab.id);
              tabInfo.pageReady = true;
            }
            
            tabInfo.loadComplete = true;
          } catch (error) {
            console.error(`CCM: Error during tab preparation:`, error);
            tabInfo.error = error.message;
          }
        }
        
        resolve(tabInfo);
      });
    });
  }
  
  async waitForTabLoad(tabId, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkLoad = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (tab.status === 'complete') {
            resolve(tab);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error(`Tab load timeout after ${timeout}ms`));
          } else {
            setTimeout(checkLoad, 500);
          }
        });
      };
      
      checkLoad();
    });
  }
  
  async waitForPageReady(tabId, timeout = 10000) {
    try {
      // Wait for page to be ready for interaction
      await this.ensureDebuggerAttached(tabId);
      
      const result = await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: `
            (function() {
              // Check if page is ready for interaction
              const hasInput = !!document.querySelector('textarea, input[type="text"], div[contenteditable="true"]');
              const hasContent = !!document.querySelector('main, .conversation, .chat, [data-testid*="message"]');
              const hasClaudeUI = !!document.querySelector('h1, h2, nav, header') || document.title.includes('Claude');
              
              return {
                ready: hasInput && (hasContent || hasClaudeUI),
                hasInput,
                hasContent,
                hasClaudeUI,
                title: document.title,
                readyState: document.readyState
              };
            })()
          `,
          returnByValue: true
        }, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
      
      if (result?.result?.value?.ready) {
        return result.result.value;
      } else {
        throw new Error('Page not ready for interaction');
      }
    } catch (error) {
      console.warn(`CCM: Page readiness check failed for tab ${tabId}:`, error);
      throw error;
    }
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

      // Execute script to fetch conversations from Claude API with timeout handling
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

  async waitForClaudeReady(tabId, maxWaitMs = 30000) {
    // Wait for Claude to be ready to receive a new message
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check if there's an active stop button (indicates streaming)
        const checkScript = `
          (function() {
            const stopButton = document.querySelector('button[aria-label*="Stop"]');
            const hasStopButton = stopButton && stopButton.offsetParent !== null;
            
            // Also check if input is available and editable
            const inputField = document.querySelector('[contenteditable="true"]');
            const inputAvailable = inputField && inputField.getAttribute('contenteditable') === 'true';
            
            return {
              isStreaming: hasStopButton,
              inputReady: inputAvailable
            };
          })()
        `;
        
        const result = await this.executeScript({ tabId, script: checkScript });
        const status = result.result?.value || {};
        
        if (!status.isStreaming && status.inputReady) {
          // Claude is ready
          return true;
        }
        
        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error('Error checking Claude ready state:', error);
        return false;
      }
    }
    
    return false; // Timeout
  }

  async sendMessageToClaudeTab(params) {
    const { tabId, message, waitForReady = true, maxRetries = 3 } = params;
    
    // Use message queue to prevent concurrent sends to same tab
    return this.messageQueue.enqueue(tabId, async () => {
      // Acquire lock for send_message operation
      await this.operationLock.acquire(tabId, 'send_message');
      
      try {
        return await this._sendMessageToClaudeTabInternal(params);
      } finally {
        // Always release lock
        this.operationLock.release(tabId, 'send_message');
      }
    });
  }
  
  async _sendMessageToClaudeTabInternal(params) {
    const { tabId, message, waitForReady = true, maxRetries = 3 } = params;
    
    // Retry logic with exponential backoff
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Wait for Claude to be ready if requested
        if (waitForReady) {
          const isReady = await this.waitForClaudeReady(tabId);
          if (!isReady) {
            lastError = 'Claude is not ready to receive messages (timeout or still streaming)';
            if (attempt < maxRetries - 1) {
              console.log(`CCM Extension: Retry ${attempt + 1}/${maxRetries} after waitForReady failed`);
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
              continue;
            }
            return { success: false, reason: lastError, retriesAttempted: attempt };
          }
        }
        
        // If we get here, proceed with sending the message
        break;
      } catch (error) {
        lastError = error.message;
        if (attempt < maxRetries - 1) {
          console.log(`CCM Extension: Retry ${attempt + 1}/${maxRetries} after error:`, error.message);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    // Properly escape the message for JavaScript string literal
    const escapedMessage = message
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/'/g, "\\'")    // Escape single quotes
      .replace(/"/g, '\\"')    // Escape double quotes
      .replace(/\n/g, '\\n')   // Escape newlines
      .replace(/\r/g, '\\r')   // Escape carriage returns
      .replace(/\t/g, '\\t');  // Escape tabs
    
    const script = `
      (function() {
        const textarea = document.querySelector('div[contenteditable="true"]');
        if (textarea) {
          textarea.focus();
          textarea.textContent = '${escapedMessage}';
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          
          // Wait a bit for the UI to update, then click send
          return new Promise((resolve) => {
            setTimeout(() => {
              const sendButton = document.querySelector('button[aria-label*="Send"], button:has(svg[stroke])');
              if (sendButton && !sendButton.disabled) {
                sendButton.click();
                resolve({ success: true, messageSent: true });
              } else {
                resolve({ success: false, reason: 'Send button not found or disabled' });
              }
            }, 200); // Increased delay for UI to update
          });
        }
        return { success: false, reason: 'Message input not found' };
      })()
    `;
    
    // Try sending the message with retry logic
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.executeScript({ tabId, script });
        const sendResult = result.result?.value || { success: false, reason: 'Script execution failed' };
        
        if (sendResult.success) {
          // Success! Add retry info if there were retries
          if (attempt > 0) {
            sendResult.retriesNeeded = attempt;
          }
          return sendResult;
        }
        
        // Failed, check if we should retry
        lastError = sendResult.reason || 'Unknown error';
        if (attempt < maxRetries - 1 && lastError !== 'Message input not found') {
          console.log(`CCM Extension: Retry ${attempt + 1}/${maxRetries} after send failed:`, lastError);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      } catch (error) {
        lastError = error.message;
        if (attempt < maxRetries - 1) {
          console.log(`CCM Extension: Retry ${attempt + 1}/${maxRetries} after execution error:`, error.message);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    // All retries failed
    return { 
      success: false, 
      reason: lastError || 'Failed after all retries',
      retriesAttempted: maxRetries
    };
  }

  async batchSendMessages(params) {
    const { messages, sequential = false } = params;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return { 
        success: false, 
        reason: 'Messages array is required and must not be empty' 
      };
    }
    
    const results = [];
    const startTime = Date.now();
    
    if (sequential) {
      // Send messages one by one, waiting for each to complete
      for (const msg of messages) {
        try {
          const sendResult = await this.sendMessageToClaudeTab({
            tabId: msg.tabId,
            message: msg.message,
            waitForReady: true  // Always wait for ready in sequential mode
          });
          
          results.push({
            tabId: msg.tabId,
            success: sendResult.success,
            result: sendResult,
            timestamp: Date.now()
          });
          
          // No longer need artificial delay - waitForReady handles it
        } catch (error) {
          results.push({
            tabId: msg.tabId,
            success: false,
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
    } else {
      // Send all messages in parallel
      const promises = messages.map(async (msg) => {
        try {
          const sendResult = await this.sendMessageToClaudeTab({
            tabId: msg.tabId,
            message: msg.message
          });
          
          return {
            tabId: msg.tabId,
            success: sendResult.success,
            result: sendResult,
            timestamp: Date.now()
          };
        } catch (error) {
          return {
            tabId: msg.tabId,
            success: false,
            error: error.message,
            timestamp: Date.now()
          };
        }
      });
      
      const parallelResults = await Promise.allSettled(promises);
      parallelResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            tabId: messages[index].tabId,
            success: false,
            error: result.reason,
            timestamp: Date.now()
          });
        }
      });
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    return {
      success: failureCount === 0,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        sequential: sequential,
        durationMs: Date.now() - startTime
      },
      results: results
    };
  }

  async getClaudeResponse(params) {
    const { 
      tabId, 
      waitForCompletion = true, 
      timeoutMs = 10000, // Lower default with guidance
      includeMetadata = false 
    } = params;
    
    // Acquire lock for get_response operation
    await this.operationLock.acquire(tabId, 'get_response');
    
    try {
      return await this._getClaudeResponseInternal(params);
    } finally {
      // Always release lock
      this.operationLock.release(tabId, 'get_response');
    }
  }
  
  async _getClaudeResponseInternal(params) {
    const { 
      tabId, 
      waitForCompletion = true, 
      timeoutMs = 10000,
      includeMetadata = false 
    } = params;
    
    // Helper function to get response immediately
    const getResponseImmediate = async () => {
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
            // First try to get user and assistant messages specifically
            const userMessages = conversationContainer.querySelectorAll('[data-testid="user-message"]');
            const assistantMessages = conversationContainer.querySelectorAll('.font-claude-message:not([data-testid="user-message"])');
            
            // Combine and sort by DOM position
            const messageElements = [...userMessages, ...assistantMessages].sort((a, b) => {
              const position = a.compareDocumentPosition(b);
              if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
              if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
              return 0;
            });
            
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
            
            // Check for completion indicators
            let isComplete = false;
            let completionIndicators = [];
            
            // Check if last message is from assistant
            if (lastMessage.isAssistant) {
              // Method 1: Check for stop button (indicates still generating)
              const stopButton = document.querySelector('button[aria-label*="Stop"], button[title*="Stop"]');
              const hasStopButton = stopButton && stopButton.offsetParent !== null;
              
              if (hasStopButton) {
                completionIndicators.push('stop_button_visible');
              } else {
                // Method 2: Check for dropdown button with retry option
                const assistantMessages = document.querySelectorAll('.font-claude-message');
                const lastAssistantEl = assistantMessages[assistantMessages.length - 1];
                
                if (lastAssistantEl) {
                  const parent = lastAssistantEl.closest('.bg-bg-000');
                  const dropdownButtons = parent ? parent.querySelectorAll('button[aria-expanded]') : [];
                  
                  if (dropdownButtons.length > 0) {
                    isComplete = true;
                    completionIndicators.push('dropdown_button_present');
                  }
                }
                
                // Method 3: Check for no loading/streaming indicators
                const streamingIndicators = document.querySelectorAll('[data-state="streaming"], [class*="animate-pulse"], .loading');
                if (streamingIndicators.length === 0 && !hasStopButton) {
                  isComplete = true;
                  completionIndicators.push('no_streaming_indicators');
                }
              }
            } else {
              // If last message is from user, consider it complete
              isComplete = true;
              completionIndicators.push('last_message_is_user');
            }
            
            const response = {
              success: true,
              text: lastMessage.text,
              isUser: lastMessage.isUser,
              isAssistant: lastMessage.isAssistant,
              timestamp: Date.now(),
              totalMessages: allMessages.length,
              isComplete: isComplete
            };
            
            // Add metadata if requested
            if (${includeMetadata}) {
              response.metadata = {
                completionIndicators: completionIndicators,
                messageLength: lastMessage.text.length,
                hasStopButton: completionIndicators.includes('stop_button_visible'),
                hasDropdownButton: completionIndicators.includes('dropdown_button_present')
              };
            }
            
            return response;
          } catch (error) {
            return { success: false, reason: 'Error getting messages: ' + error.toString() };
          }
        })()
      `;
      
      const result = await this.executeScript({ tabId, script });
      return result.result?.value || { success: false, reason: 'Script execution failed' };
    };
    
    // If not waiting for completion, return immediately
    if (!waitForCompletion) {
      return await getResponseImmediate();
    }
    
    // Wait for completion with polling
    const startTime = Date.now();
    let lastResponse = null;
    let lastTextLength = 0;
    let stableCount = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      const response = await getResponseImmediate();
      
      if (!response.success) {
        return response;
      }
      
      // Check if response is complete
      if (response.isComplete) {
        // Additional stability check: ensure text hasn't changed
        if (lastResponse && lastResponse.text === response.text) {
          stableCount++;
          if (stableCount >= 2) { // Text stable for 2 checks
            return response;
          }
        } else {
          stableCount = 0;
        }
      }
      
      lastResponse = response;
      lastTextLength = response.text.length;
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    // Timeout reached
    if (lastResponse) {
      lastResponse.timedOut = true;
      if (includeMetadata) {
        lastResponse.metadata = lastResponse.metadata || {};
        lastResponse.metadata.timeoutMs = timeoutMs;
        lastResponse.metadata.elapsedMs = Date.now() - startTime;
      }
      return lastResponse;
    }
    
    return { 
      success: false, 
      reason: 'Response timeout', 
      timedOut: true,
      timeoutMs: timeoutMs
    };
  }

  async getConversationMetadata(params) {
    const { tabId, includeMessages = false } = params;
    
    const script = `
      (function() {
        try {
          const metadata = {
            url: window.location.href,
            title: document.title,
            conversationId: null,
            messageCount: 0,
            messages: [],
            lastActivity: null,
            hasArtifacts: false,
            artifactCount: 0,
            features: {
              hasCodeBlocks: false,
              hasImages: false,
              hasTables: false,
              hasLists: false
            }
          };
          
          // Extract conversation ID from URL
          const urlMatch = window.location.pathname.match(/\\/chat\\/([a-f0-9-]+)/);
          if (urlMatch) {
            metadata.conversationId = urlMatch[1];
          }
          
          // Count messages
          const userMessages = document.querySelectorAll('[data-testid="user-message"]');
          const assistantMessages = document.querySelectorAll('.font-claude-message:not([data-testid="user-message"])');
          metadata.messageCount = userMessages.length + assistantMessages.length;
          
          // Check for artifacts
          const artifacts = document.querySelectorAll('[data-testid*="artifact"], .artifact-container, [class*="artifact"]');
          metadata.hasArtifacts = artifacts.length > 0;
          metadata.artifactCount = artifacts.length;
          
          // Analyze content features
          const allContent = document.querySelector('main')?.textContent || '';
          metadata.features.hasCodeBlocks = !!document.querySelector('pre, code, .code-block');
          metadata.features.hasImages = !!document.querySelector('img, [data-testid*="image"]');
          metadata.features.hasTables = !!document.querySelector('table');
          metadata.features.hasLists = !!document.querySelector('ul, ol');
          
          // Get all messages for token counting
          const allMessages = [...userMessages, ...assistantMessages].sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            return 0;
          });
          
          // Get token count estimation (rough estimate: ~4 chars per token)
          const totalChars = Array.from(allMessages).reduce((sum, el) => sum + (el.textContent?.length || 0), 0);
          metadata.estimatedTokens = Math.round(totalChars / 4);
          
          // Get messages if requested
          if (${includeMessages}) {
            metadata.messages = allMessages.map((el, index) => {
              const isUser = el.getAttribute('data-testid') === 'user-message';
              const text = el.textContent || '';
              
              // Check if this message has special content
              const hasCode = !!el.querySelector('pre, code');
              const hasArtifact = !!el.closest('[class*="artifact"]');
              
              return {
                index,
                type: isUser ? 'user' : 'assistant',
                textLength: text.length,
                textPreview: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
                hasCode,
                hasArtifact,
                timestamp: null // Would need to extract from DOM if available
              };
            });
            
            // Last activity approximation
            if (metadata.messages.length > 0) {
              metadata.lastActivity = Date.now(); // Approximate
            }
          }
          
          // Check conversation state
          const inputField = document.querySelector('div[contenteditable="true"]');
          metadata.isActive = !!inputField && !inputField.disabled;
          
          return metadata;
        } catch (error) {
          return { success: false, reason: 'Error getting metadata: ' + error.toString() };
        }
      })()
    `;
    
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || { success: false, reason: 'Script execution failed' };
  }

  async exportConversationTranscript(params) {
    const { tabId, format = 'markdown' } = params;
    
    try {
      // First extract conversation elements using our new tool
      const elements = await this.extractConversationElements({ tabId });
      
      await this.ensureDebuggerAttached(tabId);
      
      // Simpler script focused on message extraction
      const messageScript = `
        (function() {
          const messages = [];
          const metadata = {
            url: window.location.href,
            title: document.title,
            exportedAt: new Date().toISOString(),
            conversationId: null
          };
          
          // Extract conversation ID
          const urlMatch = window.location.pathname.match(/\\/chat\\/([a-f0-9-]+)/);
          if (urlMatch) {
            metadata.conversationId = urlMatch[1];
          }
          
          // Multiple strategies to find messages
          const messageSelectors = [
            '[data-testid="user-message"]',
            '.font-claude-message',
            '[data-message-role]',
            '.prose'
          ];
          
          // Collect all potential message elements
          const messageElements = new Set();
          messageSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => messageElements.add(el));
          });
          
          // Convert to array and sort by DOM position
          const sortedMessages = Array.from(messageElements).sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            return 0;
          });
          
          // Process messages
          sortedMessages.forEach((el, index) => {
            const text = el.textContent || el.innerText || '';
            if (!text.trim()) return;
            
            // Determine role
            const isUser = el.getAttribute('data-testid') === 'user-message' ||
                          el.getAttribute('data-message-role') === 'user' ||
                          el.className.includes('user');
            
            messages.push({
              index,
              role: isUser ? 'user' : 'assistant',
              content: text.trim(),
              length: text.length
            });
          });
          
          return {
            metadata,
            messages,
            messageCount: messages.length
          };
        })()
      `;
      
      const messageResult = await this.executeScript({ tabId, script: messageScript });
      const messageData = messageResult.result?.value || { messages: [], metadata: {} };
      
      // Calculate statistics
      const statistics = {
        totalMessages: messageData.messages.length,
        userMessages: messageData.messages.filter(m => m.role === 'user').length,
        assistantMessages: messageData.messages.filter(m => m.role === 'assistant').length,
        totalCharacters: messageData.messages.reduce((sum, m) => sum + m.length, 0),
        estimatedTokens: Math.round(messageData.messages.reduce((sum, m) => sum + m.length, 0) / 4),
        artifactCount: elements.success ? elements.data.artifacts.length : 0,
        codeBlockCount: elements.success ? elements.data.codeBlocks.length : 0
      };
      
      // Format output
      if (format === 'markdown') {
        let markdown = `# ${messageData.metadata.title}\n\n`;
        markdown += `**Exported:** ${messageData.metadata.exportedAt}\n`;
        markdown += `**URL:** ${messageData.metadata.url}\n`;
        if (messageData.metadata.conversationId) {
          markdown += `**Conversation ID:** ${messageData.metadata.conversationId}\n`;
        }
        markdown += `**Messages:** ${statistics.totalMessages} (${statistics.userMessages} user, ${statistics.assistantMessages} assistant)\n`;
        markdown += `**Estimated Tokens:** ${statistics.estimatedTokens}\n`;
        if (statistics.artifactCount > 0) {
          markdown += `**Artifacts:** ${statistics.artifactCount}\n`;
        }
        if (statistics.codeBlockCount > 0) {
          markdown += `**Code Blocks:** ${statistics.codeBlockCount}\n`;
        }
        markdown += `\n---\n\n`;
        
        // Add messages
        messageData.messages.forEach(msg => {
          markdown += `## ${msg.role === 'user' ? 'Human' : 'Assistant'}\n\n`;
          markdown += `${msg.content}\n\n`;
          markdown += `---\n\n`;
        });
        
        // Add artifacts section if present
        if (elements.success && elements.data.artifacts.length > 0) {
          markdown += `## Artifacts (${elements.data.artifacts.length})\n\n`;
          elements.data.artifacts.forEach((artifact, idx) => {
            markdown += `### Artifact ${idx + 1}: ${artifact.title}\n`;
            markdown += `**Type:** ${artifact.type}\n`;
            markdown += `**Element:** ${artifact.elementType}\n\n`;
            markdown += '```\n' + artifact.content.substring(0, 500) + '\n```\n\n';
          });
        }
        
        // Add code blocks section if present
        if (elements.success && elements.data.codeBlocks.length > 0) {
          markdown += `## Code Blocks (${elements.data.codeBlocks.length})\n\n`;
          elements.data.codeBlocks.forEach((block, idx) => {
            markdown += `### Code Block ${idx + 1}\n`;
            markdown += `\`\`\`${block.language}\n`;
            markdown += block.content + '\n';
            markdown += '```\n\n';
          });
        }
        
        return {
          success: true,
          format: 'markdown',
          content: markdown,
          metadata: messageData.metadata,
          statistics: statistics
        };
        
      } else {
        // JSON format
        return {
          success: true,
          format: 'json',
          content: {
            metadata: messageData.metadata,
            messages: messageData.messages,
            artifacts: elements.success ? elements.data.artifacts : [],
            codeBlocks: elements.success ? elements.data.codeBlocks : [],
            statistics: statistics
          },
          metadata: messageData.metadata,
          statistics: statistics
        };
      }
      
    } catch (error) {
      return { 
        success: false, 
        reason: 'Error exporting transcript', 
        error: error.message 
      };
    }
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
          uptime: Date.now() - (this.startTime || Date.now()),
          lastConnectionAttempt: this.lastConnectionAttempt,
          reconnectAttempts: this.reconnectAttempts
        });
      } else if (request.type === 'forceHubReconnection') {
        // Handle forced reconnection request from popup
        console.log('CCM: Popup requested hub reconnection');
        
        this.handleForcedReconnection().then(result => {
          sendResponse(result);
        });
        
        return true; // Keep message channel open for async response
      } else if (request.type === 'operation_milestone') {
        // Handle operation milestone from content script
        this.handleOperationMilestone(request, sender);
        return false; // Synchronous response
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
        const now = Date.now();
        this.lastKeepalive = now;
        this.hubConnection.send(JSON.stringify({ 
          type: 'keepalive', 
          timestamp: now 
        }));
      } else {
        // Try to reconnect to hub
        this.connectToHub();
      }
    }, KEEPALIVE_INTERVAL);
  }

  // Add new method for forced reconnection
  async handleForcedReconnection() {
    console.log('CCM: Handling forced reconnection request');
    
    // If already connected, just return status
    if (this.isConnected()) {
      console.log('CCM: Hub already connected');
      return {
        success: true,
        message: 'Already connected',
        connected: true
      };
    }
    
    // Clear any existing reconnection timers
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Reset reconnection state for immediate attempt
    this.reconnectAttempts = 0;
    this.lastReconnectAttempt = 0;
    
    // Try to connect immediately
    try {
      await this.connectToHub();
      
      // Wait a bit to ensure connection is established
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (this.isConnected()) {
        return {
          success: true,
          message: 'Reconnected successfully',
          connected: true
        };
      } else {
        return {
          success: false,
          message: 'Connection attempt failed',
          connected: false
        };
      }
    } catch (error) {
      console.error('CCM: Forced reconnection failed:', error);
      return {
        success: false,
        message: 'Connection error: ' + error.message,
        connected: false
      };
    }
  }

  handleOperationMilestone(request, sender) {
    // Forward operation milestone to MCP server
    const { operationId, milestone, timestamp, ...data } = request;
    
    console.log(`[CCM] Operation milestone: ${operationId} - ${milestone}`);
    
    // Forward to all connected MCP clients
    const message = {
      type: 'operation_milestone',
      operationId,
      milestone,
      timestamp,
      tabId: sender.tab?.id,
      ...data
    };
    
    for (const [clientId, client] of this.connectedClients) {
      try {
        if (client.websocket && client.websocket.readyState === WebSocket.OPEN) {
          client.websocket.send(JSON.stringify(message));
          console.log(`[CCM] Forwarded milestone to client ${clientId}`);
        }
      } catch (error) {
        console.warn(`[CCM] Failed to forward milestone to client ${clientId}:`, error);
      }
    }
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

  /**
   * Extract conversation elements including artifacts, code blocks, and tool usage
   */
  async extractConversationElements(params) {
    const { tabId, batchSize = 50, maxElements = 1000 } = params;
    console.log('CCM Extension: extractConversationElements called for tab:', tabId);
    
    try {
      // Skip debugger attachment if already attached
      if (!this.debuggerSessions.has(tabId)) {
        console.log('CCM Extension: Attaching debugger...');
        await this.ensureDebuggerAttached(tabId);
        console.log('CCM Extension: Debugger attached');
      }
      
      const script = `
        (function() {
          const artifacts = [];
          const codeBlocks = [];
          const toolUsage = [];
          const maxElements = ${maxElements};
          const batchSize = ${batchSize};
          
          // Use Sets for efficient duplicate detection
          const seenArtifactIds = new Set();
          const seenCodeHashes = new Set();
          
          // Simple hash function for duplicate detection
          function simpleHash(str) {
            let hash = 0;
            for (let i = 0; i < Math.min(str.length, 100); i++) {
              hash = ((hash << 5) - hash) + str.charCodeAt(i);
              hash = hash & hash;
            }
            return hash.toString(36);
          }
          
          // Track total elements processed
          let totalProcessed = 0;
          
          // Extract artifacts with optimized selector strategy
          // Only use most specific selectors to avoid overlap
          const artifactSelectors = [
            '[data-testid*="artifact"]',
            '.artifact',
            'iframe[title*="artifact"]:not([data-testid*="artifact"])'
          ];
          
          // Use a single combined selector for better performance
          try {
            const allArtifacts = document.querySelectorAll(artifactSelectors.join(','));
            
            // Process artifacts with early exit and optimizations
            for (let i = 0; i < Math.min(allArtifacts.length, batchSize); i++) {
              if (totalProcessed >= maxElements) break;
              
              const element = allArtifacts[i];
              
              // Skip interactive elements that are likely UI controls (buttons, etc.)
              if (element.tagName === 'BUTTON' || element.role === 'button') continue;
              
              // Create unique identifier
              const elementId = element.id || simpleHash(element.outerHTML);
              if (seenArtifactIds.has(elementId)) continue;
              seenArtifactIds.add(elementId);
              
              let content = '';
              let type = 'unknown';
              
              if (element.tagName === 'IFRAME') {
                // Don't try to access cross-origin content - just get attributes
                type = 'iframe';
                content = \`src: \${element.src || 'none'}, title: \${element.title || 'none'}\`;
              } else {
                // Get text content for non-iframes (much faster than outerHTML)
                content = element.textContent || '';
                type = element.dataset.type || 'element';
              }
              
              // Skip empty or very small content artifacts (likely UI elements)
              if (!content || content.trim().length < 20) continue;
              
              totalProcessed++;
              
              artifacts.push({
                id: element.id || 'artifact_' + i,
                type: type,
                title: element.title || element.getAttribute('aria-label') || 'Untitled',
                content: content.substring(0, 500), // Small limit
                elementType: element.tagName.toLowerCase(),
                // Only essential attributes
                attributes: {
                  id: element.id || '',
                  class: element.className || '',
                  'data-testid': element.dataset?.testid || ''
                }
              });
            }
          } catch (e) {
            console.error('Error extracting artifacts:', e);
          }
          
          // Extract code blocks - use very specific selector
          try {
            const codeElements = document.querySelectorAll('pre > code');
            
            for (let i = 0; i < Math.min(codeElements.length, batchSize); i++) {
              if (totalProcessed >= maxElements) break;
              
              const element = codeElements[i];
              const content = element.textContent;
              
              // Skip empty content
              if (!content || content.trim().length < 10) continue;
              
              // Use hash for duplicate detection
              const contentHash = simpleHash(content);
              if (seenCodeHashes.has(contentHash)) continue;
              seenCodeHashes.add(contentHash);
              totalProcessed++;
              
              codeBlocks.push({
                id: 'code_' + i,
                language: element.className.match(/language-(\\w+)/)?.[1] || 
                         element.dataset?.language || 'text',
                content: content.substring(0, 1000), // Limit content
                lineCount: content.split('\\n').length
              });
            }
          } catch (e) {
            console.error('Error extracting code blocks:', e);
          }
          
          // Extract tool usage - very limited search
          try {
            const toolElements = document.querySelectorAll('[data-testid*="tool-use"]');
            
            for (let i = 0; i < Math.min(toolElements.length, batchSize); i++) {
              if (totalProcessed >= maxElements) break;
              
              const element = toolElements[i];
              const content = element.textContent?.trim();
              
              if (content && content.length > 20) {
                totalProcessed++;
                toolUsage.push({
                  id: 'tool_' + i,
                  type: element.dataset.testid || 'unknown',
                  content: content.substring(0, 200)
                });
              }
            }
          } catch (e) {
            console.error('Error extracting tools:', e);
          }
          
          return {
            artifacts,
            codeBlocks,
            toolUsage,
            extractedAt: new Date().toISOString(),
            totalElements: artifacts.length + codeBlocks.length + toolUsage.length,
            truncated: totalProcessed >= maxElements,
            maxElementsReached: totalProcessed >= maxElements ? maxElements : null
          };
        })()
      `;
      
      console.log('CCM Extension: Executing extraction script...');
      const result = await this.executeScript({ tabId, script });
      console.log('CCM Extension: Script execution completed, result:', result ? 'received' : 'null');
      
      return {
        success: true,
        data: result.result?.value || { artifacts: [], codeBlocks: [], toolUsage: [] },
        tabId: tabId
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tabId: tabId
      };
    }
  }

  /**
   * Get Claude response generation status
   */
  async getClaudeResponseStatus(params) {
    const { tabId } = params;
    
    try {
      await this.ensureDebuggerAttached(tabId);
      
      const script = `
        (function() {
          // Look for Claude's response generation indicators
          const typingIndicator = document.querySelector('[data-testid*="typing"], .typing, [class*="generating"]');
          const responseContainer = document.querySelector('[data-testid*="response"], [class*="response"]');
          const sendButton = document.querySelector('button[data-testid*="send"], button[type="submit"]');
          const errorElements = document.querySelectorAll('[class*="error"], [data-testid*="error"]');
          
          // Check for stop button (indicates active generation)
          const stopButton = document.querySelector('button[aria-label*="Stop"], button[title*="Stop"]');
          const hasStopButton = stopButton && stopButton.offsetParent !== null;
          
          // Estimate progress based on UI elements
          let status = 'unknown';
          let progress = null;
          
          if (hasStopButton) {
            status = 'generating';
            // Try to estimate progress from content length
            const allMessages = document.querySelectorAll('.font-claude-message');
            const lastMessage = allMessages[allMessages.length - 1];
            const responseText = lastMessage?.textContent || '';
            
            // Store response start time if not already stored
            if (!window.responseStartTime) {
              window.responseStartTime = Date.now();
            }
            
            progress = {
              estimatedCompletion: Math.min(responseText.length / 2000, 0.95), // Rough estimate
              tokensGenerated: Math.floor(responseText.length / 4), // ~4 chars per token
              timeElapsed: (Date.now() - window.responseStartTime) / 1000,
              responseLength: responseText.length
            };
          } else if (typingIndicator && typingIndicator.style.display !== 'none') {
            status = 'generating';
            if (!window.responseStartTime) {
              window.responseStartTime = Date.now();
            }
          } else if (errorElements.length > 0) {
            status = 'error';
            window.responseStartTime = null;
          } else if (sendButton && !sendButton.disabled) {
            status = 'complete';
            window.responseStartTime = null;
          } else if (sendButton && sendButton.disabled) {
            status = 'waiting_input';
            window.responseStartTime = null;
          }
          
          // Check for active tool usage
          const toolStates = {
            webSearchActive: !!document.querySelector('[data-testid*="search"][class*="active"]'),
            replActive: !!document.querySelector('[data-testid*="repl"][class*="active"]'),
            artifactsActive: !!document.querySelector('[data-testid*="artifact"][class*="generating"]')
          };
          
          // Get last message length for tracking
          const allMessages = document.querySelectorAll('.font-claude-message');
          const lastMessage = allMessages[allMessages.length - 1];
          const responseLength = lastMessage?.textContent?.length || 0;
          
          return {
            status,
            progress,
            isStreaming: status === 'generating',
            lastUpdate: Date.now(),
            tools: toolStates,
            responseLength: responseLength,
            hasErrors: errorElements.length > 0,
            errorMessages: Array.from(errorElements).map(el => el.textContent.trim()),
            hasStopButton: hasStopButton
          };
        })()
      `;
      
      const result = await this.executeScript({ tabId, script });
      
      return {
        success: true,
        ...result.result?.value,
        tabId: tabId
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tabId: tabId,
        status: 'error'
      };
    }
  }

  /**
   * Get responses from multiple tabs with polling
   */
  async batchGetResponses(params) {
    const {
      tabIds,
      timeoutMs = 30000,
      waitForAll = true,
      pollIntervalMs = 1000
    } = params;
    
    const results = [];
    const startTime = Date.now();
    
    try {
      if (waitForAll) {
        // Wait for all responses to complete
        const promises = tabIds.map(async (tabId) => {
          const startTabTime = Date.now();
          
          // Poll for completion
          while (Date.now() - startTime < timeoutMs) {
            const status = await this.getClaudeResponseStatus({ tabId });
            
            if (status.status === 'complete' || status.status === 'error') {
              const response = await this.getClaudeResponse({ 
                tabId, 
                waitForCompletion: false,
                timeoutMs: 5000
              });
              
              return {
                tabId,
                response,
                status: status.status,
                completedAt: Date.now(),
                duration: Date.now() - startTabTime,
                success: status.status === 'complete'
              };
            }
            
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          }
          
          // Timeout reached
          return {
            tabId,
            response: null,
            status: 'timeout',
            completedAt: Date.now(),
            duration: Date.now() - startTabTime,
            success: false,
            error: 'Response timeout'
          };
        });
        
        const allResults = await Promise.all(promises);
        results.push(...allResults);
        
      } else {
        // Return responses as they complete
        const pendingTabs = [...tabIds];
        
        while (pendingTabs.length > 0 && Date.now() - startTime < timeoutMs) {
          for (let i = pendingTabs.length - 1; i >= 0; i--) {
            const tabId = pendingTabs[i];
            const status = await this.getClaudeResponseStatus({ tabId });
            
            if (status.status === 'complete' || status.status === 'error') {
              const response = await this.getClaudeResponse({ 
                tabId, 
                waitForCompletion: false,
                timeoutMs: 5000 
              });
              
              results.push({
                tabId,
                response,
                status: status.status,
                completedAt: Date.now(),
                duration: Date.now() - startTime,
                success: status.status === 'complete'
              });
              
              pendingTabs.splice(i, 1);
            }
          }
          
          if (pendingTabs.length > 0) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          }
        }
        
        // Add timeout results for remaining tabs
        pendingTabs.forEach(tabId => {
          results.push({
            tabId,
            response: null,
            status: 'timeout',
            completedAt: Date.now(),
            duration: timeoutMs,
            success: false,
            error: 'Response timeout'
          });
        });
      }
      
      const summary = {
        total: tabIds.length,
        completed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        timedOut: results.filter(r => r.status === 'timeout').length,
        totalTime: Date.now() - startTime,
        averageResponseTime: results
          .filter(r => r.success)
          .reduce((sum, r) => sum + r.duration, 0) / Math.max(results.filter(r => r.success).length, 1)
      };
      
      return {
        success: true,
        results,
        summary,
        waitForAll,
        requestedTabs: tabIds.length
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        results,
        summary: {
          total: tabIds.length,
          completed: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length + 1
        }
      };
    }
  }

  async sendContentScriptMessage(params) {
    const { tabId, message } = params;
    
    try {
      console.log(`CCM: Sending message to content script in tab ${tabId}:`, message);
      
      // Send message to content script using tabs.sendMessage
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      console.log(`CCM: Content script response from tab ${tabId}:`, response);
      return { success: true, response };
      
    } catch (error) {
      console.error(`CCM: Failed to send message to content script in tab ${tabId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async getConnectionHealth() {
    const health = {
      timestamp: Date.now(),
      hub: {
        connected: this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN,
        readyState: this.hubConnection ? this.hubConnection.readyState : null,
        url: this.hubConnection ? this.hubConnection.url : null,
        reconnectAttempts: this.reconnectAttempts || 0
      },
      clients: {
        total: this.connectedClients.size,
        list: Array.from(this.connectedClients.values()).map(client => ({
          id: client.id,
          name: client.name,
          type: client.type,
          connectedAt: client.connectedAt,
          lastActivity: client.lastActivity
        }))
      },
      debugger: {
        sessionsActive: this.debuggerSessions.size,
        attachedTabs: Array.from(this.debuggerSessions.keys())
      },
      chrome: {
        runtime: {
          id: chrome.runtime.id,
          manifestVersion: chrome.runtime.getManifest().version
        }
      },
      alarms: []
    };

    // Get Chrome alarms status
    try {
      const alarms = await chrome.alarms.getAll();
      health.alarms = alarms.map(alarm => ({
        name: alarm.name,
        scheduledTime: alarm.scheduledTime,
        periodInMinutes: alarm.periodInMinutes
      }));
    } catch (error) {
      health.alarms = [{ error: error.message }];
    }

    // Check recent activity
    const now = Date.now();
    health.activity = {
      lastKeepalive: this.lastKeepalive || null,
      timeSinceLastKeepalive: this.lastKeepalive ? now - this.lastKeepalive : null,
      lastHubMessage: this.lastHubMessage || null,
      timeSinceLastHubMessage: this.lastHubMessage ? now - this.lastHubMessage : null
    };

    // Overall health status
    health.status = health.hub.connected ? 'healthy' : 'unhealthy';
    health.issues = [];
    
    if (!health.hub.connected) {
      health.issues.push('WebSocket hub not connected');
    }
    
    if (health.alarms.length === 0) {
      health.issues.push('No Chrome alarms active');
    }
    
    if (health.activity.timeSinceLastKeepalive > 30000) {
      health.issues.push('Keepalive not sent recently');
    }

    return {
      success: true,
      health
    };
  }
}

// Content Script Auto-Injection Manager
class ContentScriptManager {
  constructor() {
    this.injectedTabs = new Set();
    console.log('CCM: ContentScriptManager initialized - event listeners now registered at top level');
  }

  async injectContentScript(tabId) {
    try {
      if (this.injectedTabs.has(tabId)) {
        console.log(`CCM: Content script already injected in tab ${tabId}`);
        return { success: true, alreadyInjected: true };
      }

      // Use inline script injection with proper content script setup
      console.log(`CCM: Injecting network-based content script for tab ${tabId}`);
      
      // First inject the observer in MAIN world (for page access)
      const mainWorldResult = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          console.log('CCM: Network detection content script loading in MAIN world...');

          class NetworkBasedConversationObserver {
            constructor() {
              this.activeOperations = new Map();
              console.log('[NetworkObserver] Initialized in MAIN world');
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
              // Get all message elements (including ones without specific testids)
              const allMessages = document.querySelectorAll('div[class*="message"]');
              
              if (allMessages.length >= 2) {
                // The last message should be the assistant response
                const lastMessage = allMessages[allMessages.length - 1];
                const secondToLast = allMessages[allMessages.length - 2];
                
                // Check if the last message is different from the user message
                const userText = secondToLast.textContent?.trim() || '';
                const assistantText = lastMessage.textContent?.trim() || '';
                
                // If we have an assistant response that's different from user input
                if (assistantText && assistantText !== userText && !lastMessage.getAttribute('data-testid')?.includes('user')) {
                  return {
                    text: assistantText,
                    isAssistant: true,
                    isComplete: true,
                    isUser: false,
                    success: true,
                    timestamp: Date.now(),
                    totalMessages: allMessages.length
                  };
                }
              }
              return null;
            }

            notifyMilestone(operationId, milestone, data = {}) {
              console.log(`[NetworkObserver] ${operationId} -> ${milestone}`);
              
              // Send CustomEvent to ISOLATED world for chrome.runtime access (more reliable than postMessage)
              const customEvent = new CustomEvent('ccm_milestone_bridge', {
                detail: {
                  operationId,
                  milestone,
                  timestamp: Date.now(),
                  data
                }
              });
              document.dispatchEvent(customEvent);
              console.log(`[NetworkObserver] Dispatched CustomEvent: ${operationId} -> ${milestone}`);
            }
          }

          // Initialize network observer in MAIN world
          window.conversationObserver = new NetworkBasedConversationObserver();
          console.log('CCM: Network-based observer ready in MAIN world');
          
          return 'Observer initialized in MAIN world';
        },
        world: 'MAIN'
      });
      
      // Then inject the communication bridge in ISOLATED world (for chrome.runtime)
      const isolatedWorldResult = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          console.log('CCM: Communication bridge loading in ISOLATED world...');
          
          // Listen for CustomEvent from MAIN world (more reliable than postMessage)
          document.addEventListener('ccm_milestone_bridge', (event) => {
            const { operationId, milestone, timestamp, data } = event.detail;
            
            try {
              if (chrome && chrome.runtime) {
                chrome.runtime.sendMessage({
                  type: 'operation_milestone',
                  operationId,
                  milestone,
                  timestamp,
                  data
                });
                console.log(`[Bridge] Sent milestone via CustomEvent: ${operationId} -> ${milestone}`);
              } else {
                console.warn('[Bridge] chrome.runtime not available in ISOLATED world');
              }
            } catch (error) {
              console.error('[Bridge] Failed to send milestone via CustomEvent:', error);
            }
          });
          
          // Listen for operation registration from background script
          if (chrome && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
              if (message.type === 'register_operation') {
                const { operationId, operationType, params } = message;
                
                // Send CustomEvent to MAIN world observer
                const registerEvent = new CustomEvent('ccm_register_operation', {
                  detail: {
                    operationId,
                    operationType, 
                    params
                  }
                });
                document.dispatchEvent(registerEvent);
                
                sendResponse({ success: true, bridge: 'isolated_world' });
                return true;
              }
              
              return false;
            });
          }
          
          console.log('CCM: Communication bridge ready in ISOLATED world');
          return 'Bridge initialized in ISOLATED world';
        },
        world: 'ISOLATED'
      });
      
      // Add cross-world communication to MAIN world observer
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          // Listen for registration CustomEvents from ISOLATED world
          document.addEventListener('ccm_register_operation', (event) => {
            const { operationId, operationType, params } = event.detail;
            
            if (window.conversationObserver) {
              const operation = window.conversationObserver.registerOperation(operationId, operationType, params);
              console.log(`[Observer] Registered operation from CustomEvent bridge: ${operationId}`);
            }
          });
          
          return 'Cross-world communication setup complete';
        },
        world: 'MAIN'
      });
      
      const result = [mainWorldResult, isolatedWorldResult];
      
      console.log(`CCM: Script execution result for tab ${tabId}:`, result);
      
      this.injectedTabs.add(tabId);
      console.log(`CCM: Content script injected successfully in tab ${tabId}`);
      return { success: true, method: 'inline_isolated_injection', result };

    } catch (error) {
      console.error(`CCM: Failed to inject content script into tab ${tabId}:`, error);
      console.error(`CCM: Error details:`, error.stack);
      return { success: false, error: error.message, stack: error.stack };
    }
  }


  // Clean up when tabs are closed
  removeTab(tabId) {
    this.injectedTabs.delete(tabId);
  }
}

// Initialize Extension Hub
const ccmHub = new CCMExtensionHub();

// Initialize Content Script Manager
contentScriptManager = new ContentScriptManager();
console.log('CCM: ContentScriptManager initialized and assigned to global variable');

// Event listeners now registered at top of file for immediate availability

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptManager.removeTab(tabId);
});

// Ensure connection is established when service worker wakes up
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle wake-up by ensuring WebSocket is connected
  if (!ccmHub.hubConnection || ccmHub.hubConnection.readyState !== WebSocket.OPEN) {
    console.log('CCM Extension: WebSocket not connected, attempting reconnection...');
    ccmHub.connectToHub();
  }
  
  // Handle manual injection requests and test ContentScriptManager
  if (request.type === 'manual_inject_content_script' && request.tabId) {
    console.log(`CCM: Manual injection requested for tab ${request.tabId}`);
    contentScriptManager.injectContentScript(request.tabId)
      .then(() => {
        console.log(`CCM: Manual injection completed for tab ${request.tabId}`);
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error(`CCM: Manual injection failed for tab ${request.tabId}:`, error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  }
  
  // Test ContentScriptManager directly
  if (request.type === 'test_csm' && request.tabId) {
    console.log(`CCM: Testing ContentScriptManager injection for tab ${request.tabId}`);
    // Force injection regardless of existing state
    contentScriptManager.injectedTabs.delete(request.tabId);
    contentScriptManager.injectContentScript(request.tabId)
      .then(() => {
        sendResponse({ success: true, message: 'ContentScriptManager injection completed' });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  return false; // Let the existing handler process the message
});