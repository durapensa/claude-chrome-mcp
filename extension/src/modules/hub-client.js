// WebSocket Hub Client for Chrome Extension

import { 
  WEBSOCKET_PORT, 
  KEEPALIVE_INTERVAL, 
  RECONNECT_INTERVAL,
  MESSAGE_TYPES,
  OPERATION_TYPES,
  CLAUDE_AI_URL
} from './config.js';
import { MessageQueue } from './message-queue.js';
import { TabOperationLock } from './tab-operation-lock.js';
import { MCPClient } from './mcp-client.js';
import { ContentScriptManager } from './content-script-manager.js';
import { tabOperationMethods } from './tab-operations.js';
import { updateBadge } from '../utils/utils.js';

export class HubClient {
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
    this.contentScriptManager = new ContentScriptManager(); // Add content script manager
    
    // Client timeout tracking properties
    this.clientTimeouts = new Map(); // Track client heartbeat timeouts
    this.CLIENT_TIMEOUT_MS = 60000; // 1 minute timeout
    
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
        
        updateBadge('hub-connected');
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
        console.log('CCM Extension: Disconnected from MCP server hub - clearing all client state');
        this.hubConnection = null;
        this.clearAllClients();
        updateBadge('hub-disconnected');
        
        // Immediately try to reconnect if it was a clean shutdown (hub restarting)
        if (event.code === 1000 || event.code === 1001) {
          console.log('CCM Extension: Clean shutdown detected, attempting immediate reconnection');
          setTimeout(() => this.connectToHub(), 100);
        } else {
          // Schedule reconnection for unexpected disconnections
          this.scheduleReconnect();
        }
        
        // Update message queue connection status
        this.messageQueue.setConnected(false);
      };
      
      this.hubConnection.onerror = (error) => {
        console.error('CCM Extension: WebSocket error:', error);
        // Don't set to null here, let onclose handle cleanup
      };
      
    } catch (error) {
      console.error('CCM Extension: Failed to connect to hub:', error);
      this.hubConnection = null;
      this.scheduleReconnect();
      
      // Update message queue connection status
      this.messageQueue.setConnected(false);
    }
  }

  clearAllClients() {
    // Clear all client timeouts
    for (const [clientId, timeoutId] of this.clientTimeouts) {
      clearTimeout(timeoutId);
    }
    this.clientTimeouts.clear();
    
    // Clear connected clients map
    const previousCount = this.connectedClients.size;
    this.connectedClients.clear();
    
    console.log(`CCM Extension: Cleared ${previousCount} stale client connections`);
  }

  scheduleReconnect() {
    // Check if too much time has passed and reset attempts
    const timeSinceLastAttempt = Date.now() - this.lastConnectionAttempt;
    if (timeSinceLastAttempt > this.resetAttemptsAfter) {
      console.log('CCM Extension: Resetting reconnection attempts after timeout');
      this.reconnectAttempts = 0;
    }
    
    this.reconnectAttempts++;
    
    // Calculate delay with exponential backoff
    const backoffDelay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    console.log(`CCM Extension: Scheduling reconnection attempt ${this.reconnectAttempts} in ${backoffDelay}ms`);
    
    setTimeout(() => {
      this.connectToHub();
    }, backoffDelay);
    
    // Set up persistent reconnection interval if not already active
    if (!this.persistentReconnectInterval) {
      console.log('CCM Extension: Setting up persistent reconnection interval');
      this.persistentReconnectInterval = setInterval(() => {
        if (!this.isConnected()) {
          console.log('CCM Extension: Persistent reconnection check - attempting to reconnect');
          this.connectToHub();
        }
      }, 30000); // Check every 30 seconds
    }
  }

  startKeepalive() {
    // Regular keepalive interval
    setInterval(() => {
      if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
        this.hubConnection.send(JSON.stringify({ 
          type: MESSAGE_TYPES.PING, 
          timestamp: Date.now() 
        }));
      }
    }, KEEPALIVE_INTERVAL);
  }


  handleHubMessage(message) {
    console.log('CCM Extension: Received hub message:', message.type);
    
    switch (message.type) {
      case MESSAGE_TYPES.CLIENT_CONNECTED:
        this.handleClientConnected(message);
        break;
      
      case MESSAGE_TYPES.CLIENT_DISCONNECTED:
        this.handleClientDisconnected(message);
        break;
      
      case MESSAGE_TYPES.CLIENT_LIST_UPDATE:
        this.handleClientListUpdate(message);
        break;
      
      case MESSAGE_TYPES.PONG:
        // Hub is alive, no action needed
        break;
      
      case MESSAGE_TYPES.HUB_HEALTH:
        console.log('CCM Extension: Hub health:', message.data);
        break;
      
      case MESSAGE_TYPES.OPERATION_UPDATE:
        this.handleOperationUpdate(message);
        break;
      
      default:
        // Forward to MCP clients
        this.forwardToMCPClients(message);
    }
    
    // Update extension state to show we're connected
    updateBadge('mcp-connected');
  }

  handleClientConnected(message) {
    const { clientId, clientInfo } = message;
    console.log(`CCM Extension: Client connected: ${clientId}`, clientInfo);
    
    this.connectedClients.set(clientId, {
      ...clientInfo,
      connectedAt: Date.now()
    });
    
    // Set up client timeout monitoring
    this.setupClientTimeout(clientId);
    
    // Notify all tabs about the new connection
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'MCP_CLIENT_CONNECTED',
          clientId: clientId,
          clientInfo: clientInfo
        }).catch(() => {
          // Tab might not have content script
        });
      });
    });
  }

  handleClientDisconnected(message) {
    const { clientId } = message;
    console.log(`CCM Extension: Client disconnected: ${clientId}`);
    
    // Clear client timeout
    const timeoutId = this.clientTimeouts.get(clientId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.clientTimeouts.delete(clientId);
    }
    
    this.connectedClients.delete(clientId);
    
    // Update badge based on remaining connections
    if (this.connectedClients.size === 0 && this.isConnected()) {
      updateBadge('hub-connected');
    }
  }

  handleClientListUpdate(message) {
    const { clients } = message;
    console.log(`CCM Extension: Received client list update with ${Object.keys(clients).length} clients`);
    
    // Clear existing clients and timeouts
    this.clearAllClients();
    
    // Update with new client list
    for (const [clientId, clientInfo] of Object.entries(clients)) {
      this.connectedClients.set(clientId, {
        ...clientInfo,
        connectedAt: clientInfo.connectedAt || Date.now()
      });
      
      // Set up timeout monitoring for each client
      this.setupClientTimeout(clientId);
    }
    
    // Update badge based on client count
    if (this.connectedClients.size > 0) {
      updateBadge('mcp-connected');
    } else if (this.isConnected()) {
      updateBadge('hub-connected');
    }
  }

  setupClientTimeout(clientId) {
    // Clear any existing timeout
    const existingTimeout = this.clientTimeouts.get(clientId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new timeout
    const timeoutId = setTimeout(() => {
      console.warn(`CCM Extension: Client ${clientId} timed out - removing`);
      this.connectedClients.delete(clientId);
      this.clientTimeouts.delete(clientId);
      
      // Update badge
      if (this.connectedClients.size === 0 && this.isConnected()) {
        updateBadge('hub-connected');
      }
    }, this.CLIENT_TIMEOUT_MS);
    
    this.clientTimeouts.set(clientId, timeoutId);
  }

  handleOperationUpdate(message) {
    const { operationId, status, data } = message;
    console.log(`CCM Extension: Operation update for ${operationId}: ${status}`);
    
    // Forward to relevant tabs or handle internally
    if (data && data.tabId) {
      chrome.tabs.sendMessage(data.tabId, {
        type: 'OPERATION_UPDATE',
        operationId,
        status,
        data
      }).catch(() => {
        console.warn(`CCM Extension: Failed to send operation update to tab ${data.tabId}`);
      });
    }
  }

  forwardToMCPClients(message) {
    // Forward message to all connected MCP clients via hub
    if (this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN) {
      this.hubConnection.send(JSON.stringify({
        type: 'broadcast_to_mcp_clients',
        message: message,
        excludeExtension: true
      }));
    }
  }

  setupEventListeners() {
    // Chrome runtime message listener will be set up in background.js
    console.log('CCM Extension: Event listeners setup complete');
  }

  // Handle MCP tool requests
  async handleMCPToolRequest(tool, params) {
    console.log(`CCM Extension: Handling MCP tool request: ${tool}`, params);
    
    // Map tool names to methods
    const toolHandlers = {
      'spawn_claude_dot_ai_tab': () => this.spawnClaudeTab(params),
      'close_claude_dot_ai_tab': () => this.closeClaudeTab(params),
      'get_claude_dot_ai_tabs': () => this.getClaudeTabs(params),
      'focus_claude_dot_ai_tab': () => this.focusClaudeTab(params),
      'send_message_to_claude_dot_ai_tab': () => this.sendMessageToClaudeTab(params),
      'send_message_async': () => this.sendMessageAsync(params),
      'get_claude_dot_ai_response': () => this.getClaudeResponse(params),
      'get_connection_health': () => this.getConnectionHealth(params),
      'extract_conversation_elements': () => this.extractConversationElements(params),
      // Add more tool mappings as needed
    };
    
    const handler = toolHandlers[tool];
    if (handler) {
      return await handler();
    } else {
      throw new Error(`Unknown tool: ${tool}`);
    }
  }

  // Connection health check
  async getConnectionHealth() {
    return {
      success: true,
      health: {
        hubConnected: this.isConnected(),
        connectedClients: Array.from(this.connectedClients.entries()).map(([id, info]) => ({
          id,
          ...info
        })),
        operationLocks: this.operationLock.getAllLocks(),
        messageQueueSize: this.messageQueue.size(),
        contentScriptTabs: Array.from(this.contentScriptManager.injectedTabs)
      }
    };
  }

  // Async message sending
  async sendMessageAsync(params) {
    const { tabId, message } = params;
    
    if (!tabId || !message) {
      return { success: false, error: 'Missing required parameters' };
    }
    
    try {
      // Use the synchronous send but don't wait for response
      const result = await this.sendMessageToClaudeTab({
        tabId,
        message,
        waitForReady: true
      });
      
      if (result.success) {
        return {
          success: true,
          operationId: result.operationId,
          message: 'Message sent asynchronously'
        };
      } else {
        return result;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Mix in tab operation methods
Object.assign(HubClient.prototype, tabOperationMethods);