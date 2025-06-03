// HTTP Polling Hub Client for Chrome Extension
// Uses HTTP polling instead of WebSocket for Chrome Manifest V3 compatibility

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
import { tabOperationMethods } from './tab-operations.js';
import { updateBadge } from '../utils/utils.js';

export class HubClient {
  constructor() {
    this.connectedClients = new Map();
    this.debuggerSessions = new Map();
    this.requestCounter = 0;
    this.messageQueue = new MessageQueue();
    this.operationLock = new TabOperationLock();
    // ContentScriptManager will be passed in from background script
    this.contentScriptManager = null;
    
    // HTTP polling configuration
    this.hubUrl = `http://localhost:${WEBSOCKET_PORT}`;
    this.heartbeatInterval = null;
    this.pollingInterval = null;
    this.healthPollingInterval = null;
    this.isActive = false;
    
    // Adaptive polling configuration
    this.adaptivePolling = {
      commandInterval: 500,      // Start at 500ms (was 200ms)
      maxCommandInterval: 2000,  // Slow to 2s when idle
      healthInterval: 10000,     // Health polling every 10s (was 3s)
      heartbeatInterval: 15000,  // Heartbeat every 15s (was 5s)
      idleThreshold: 30000,      // 30s without activity = idle
      lastActivity: Date.now(),
      currentCommandInterval: 500
    };
    
    // Client timeout tracking properties
    this.clientTimeouts = new Map();
    this.CLIENT_TIMEOUT_MS = 60000;
    
    console.log('CCM Extension: HTTP HubClient created with adaptive polling');
  }

  async init() {
    console.log('CCM Extension: Initializing HubClient...');
    
    // Check for previous connection state
    const previousState = await chrome.storage.local.get(['lastAliveTime', 'connectionState']);
    if (previousState.lastAliveTime) {
      const timeSinceLastAlive = Date.now() - previousState.lastAliveTime;
      console.log(`CCM Extension: Service worker was last alive ${timeSinceLastAlive}ms ago`);
      console.log(`CCM Extension: Previous connection state: ${previousState.connectionState}`);
    }
    
    // Setup listeners but don't connect yet
    this.setupEventListeners();
    console.log('CCM Extension: HubClient initialized (ready to connect)');
  }

  isConnected() {
    return this.isActive && this.heartbeatInterval && this.pollingInterval;
  }

  async connectToHub() {
    if (this.isConnected()) {
      console.log('CCM Extension: Already connected via HTTP polling');
      return;
    }
    
    console.log('CCM Extension: Starting HTTP polling connection to hub...');
    
    try {
      // Test initial connection to hub
      const response = await fetch(`${this.hubUrl}/health`);
      if (!response.ok) {
        throw new Error(`Hub health check failed: ${response.status}`);
      }
      
      console.log('CCM Extension: Hub is healthy, starting polling...');
      
      // Start heartbeat to register with hub
      this.startHeartbeat();
      
      // Start command polling
      this.startPolling();
      
      this.isActive = true;
      this.messageQueue.setConnected(true);
      updateBadge('hub-connected');
      
      console.log('CCM Extension: HTTP polling connection established');
      
    } catch (error) {
      console.error('CCM Extension: Failed to connect to hub via HTTP:', error);
      updateBadge('hub-disconnected');
      
      // Retry connection after delay
      setTimeout(() => {
        this.connectToHub();
      }, 5000);
    }
  }

  startHeartbeat() {
    // Stop any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Send immediate heartbeat
    this.sendHeartbeat();
    
    // Set up regular heartbeat with adaptive interval (15s instead of 5s)
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.adaptivePolling.heartbeatInterval);
    
    console.log(`CCM Extension: Heartbeat started (${this.adaptivePolling.heartbeatInterval}ms interval)`);
  }

  async sendHeartbeat() {
    try {
      const response = await fetch(`${this.hubUrl}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extensionId: chrome.runtime.id,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Heartbeat failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`CCM Extension: Heartbeat sent, ${result.queuedCommands} commands queued`);
      
    } catch (error) {
      console.error('CCM Extension: Heartbeat failed:', error);
      // Don't stop on heartbeat failure - let polling handle reconnection
    }
  }

  startPolling() {
    // Stop any existing polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    if (this.healthPollingInterval) {
      clearInterval(this.healthPollingInterval);
    }
    
    // Start adaptive command polling
    this.scheduleNextCommandPoll();
    
    // Set up health polling with new interval (10s instead of 3s)
    this.healthPollingInterval = setInterval(() => {
      this.pollHealthStatus();
    }, this.adaptivePolling.healthInterval);
    
    console.log(`CCM Extension: Adaptive polling started - commands: ${this.adaptivePolling.commandInterval}ms, health: ${this.adaptivePolling.healthInterval}ms`);
  }

  scheduleNextCommandPoll() {
    // Calculate current interval based on activity
    const currentInterval = this.calculateCurrentInterval();
    
    this.pollingInterval = setTimeout(() => {
      this.pollForCommands().then(() => {
        // Schedule next poll
        if (this.isActive) {
          this.scheduleNextCommandPoll();
        }
      });
    }, currentInterval);
  }

  calculateCurrentInterval() {
    const timeSinceActivity = Date.now() - this.adaptivePolling.lastActivity;
    
    if (timeSinceActivity > this.adaptivePolling.idleThreshold) {
      // Gradually increase interval when idle
      const slowFactor = Math.min(timeSinceActivity / this.adaptivePolling.idleThreshold, 4);
      this.adaptivePolling.currentCommandInterval = Math.min(
        this.adaptivePolling.commandInterval * slowFactor,
        this.adaptivePolling.maxCommandInterval
      );
    } else {
      // Reset to fast interval when active
      this.adaptivePolling.currentCommandInterval = this.adaptivePolling.commandInterval;
    }
    
    return this.adaptivePolling.currentCommandInterval;
  }

  recordActivity() {
    this.adaptivePolling.lastActivity = Date.now();
    // Reset to fast polling on activity
    this.adaptivePolling.currentCommandInterval = this.adaptivePolling.commandInterval;
  }

  async pollForCommands() {
    try {
      const response = await fetch(`${this.hubUrl}/poll-commands`);
      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.commands && result.commands.length > 0) {
        console.log(`CCM Extension: Received ${result.commands.length} commands from hub`);
        
        // Record activity to speed up polling
        this.recordActivity();
        
        for (const command of result.commands) {
          await this.executeCommand(command);
        }
      }
      
    } catch (error) {
      console.error('CCM Extension: Command polling failed:', error);
      // Handle reconnection on polling failure
      this.handleConnectionError();
    }
  }

  async pollHealthStatus() {
    try {
      const response = await fetch(`${this.hubUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health poll failed: ${response.status}`);
      }
      
      const healthData = await response.json();
      
      // Update connected clients from WebSocket hub
      this.connectedClients.clear();
      if (healthData.connectedClients && Array.isArray(healthData.connectedClients)) {
        for (const client of healthData.connectedClients) {
          this.connectedClients.set(client.id, {
            ...client,
            connectedAt: client.connectedAt || Date.now()
          });
        }
        
        console.log(`CCM Extension: Health poll - ${healthData.connectedClients.length} WebSocket clients connected`);
        
        // Update badge based on client count
        if (this.connectedClients.size > 0) {
          updateBadge('mcp-connected');
        } else {
          updateBadge('hub-connected');
        }
      }
      
    } catch (error) {
      console.error('CCM Extension: Health polling failed:', error);
      // Don't disconnect on health polling failure - commands are more critical
    }
  }

  async executeCommand(command) {
    console.log(`CCM Extension: Executing command: ${command.type}`);
    
    try {
      // Route to appropriate handler based on command type
      let result;
      
      switch (command.type) {
        case 'spawn_claude_dot_ai_tab':
          result = await this.spawnClaudeTab(command);
          break;
        case 'send_message_async':
          result = await this.sendMessageAsync(command);
          break;
        case 'get_claude_dot_ai_response':
          result = await this.getClaudeResponse(command);
          break;
        case 'start_network_inspection':
          result = await this.startNetworkInspection(command);
          break;
        case 'stop_network_inspection':
          result = await this.stopNetworkInspection(command);
          break;
        case 'get_captured_requests':
          result = await this.getCapturedRequests(command);
          break;
        case 'forward_response_to_claude_dot_ai_tab':
          result = await this.forwardResponseToClaudeTab(command);
          break;
        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
      
      // Send result back to hub
      await this.sendCommandResponse(command.requestId, result);
      
    } catch (error) {
      console.error(`CCM Extension: Command execution failed:`, error);
      await this.sendCommandResponse(command.requestId, null, error.message);
    }
  }

  async sendCommandResponse(requestId, result, error = null) {
    try {
      const response = await fetch(`${this.hubUrl}/command-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: requestId,
          result: result,
          error: error,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Response send failed: ${response.status}`);
      }
      
      console.log(`CCM Extension: Sent response for command ${requestId}`);
      
    } catch (sendError) {
      console.error('CCM Extension: Failed to send command response:', sendError);
    }
  }

  handleConnectionError() {
    if (this.isActive) {
      console.log('CCM Extension: Connection error, attempting reconnection...');
      this.disconnect();
      
      // Retry connection after delay
      setTimeout(() => {
        this.connectToHub();
      }, 2000);
    }
  }

  disconnect() {
    console.log('CCM Extension: Disconnecting adaptive HTTP polling...');
    
    this.isActive = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Clear command polling timeout (now using setTimeout instead of setInterval)
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    if (this.healthPollingInterval) {
      clearInterval(this.healthPollingInterval);
      this.healthPollingInterval = null;
    }
    
    this.messageQueue.setConnected(false);
    updateBadge('hub-disconnected');
    
    console.log('CCM Extension: Adaptive HTTP polling disconnected');
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

  // HTTP polling doesn't need complex WebSocket message handling
  // Commands are executed directly via polling
  
  // State management for HTTP polling - includes WebSocket clients
  getCurrentState() {
    return {
      hubConnected: this.isActive,
      connectedClients: Array.from(this.connectedClients.values()),
      extensionConnected: this.isActive,
      timestamp: Date.now()
    };
  }

  setupEventListeners() {
    // Chrome runtime message listener will be set up in background.js
    console.log('CCM Extension: Event listeners setup complete');
  }

  // Handle MCP tool requests
  async handleMCPToolRequest(tool, params) {
    console.log(`CCM Extension: Handling MCP tool request: ${tool}`, params);
    
    // Record activity for any MCP tool request
    this.recordActivity();
    
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
      'start_network_inspection': () => this.startNetworkInspection(params),
      'stop_network_inspection': () => this.stopNetworkInspection(params),
      'get_captured_requests': () => this.getCapturedRequests(params),
      'forward_response_to_claude_dot_ai_tab': () => this.forwardResponseToClaudeTab(params),
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
        contentScriptTabs: this.contentScriptManager ? Array.from(this.contentScriptManager.injectedTabs) : []
      }
    };
  }

  // Async message sending
  async sendMessageAsync(params) {
    const { tabId, message } = params;
    
    if (!tabId || !message) {
      return { success: false, error: 'Missing required parameters' };
    }
    
    // Record activity for user-initiated actions
    this.recordActivity();
    
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

  // Network inspection methods
  async startNetworkInspection(params) {
    const { tabId } = params;
    
    if (!tabId) {
      return { success: false, error: 'Missing required parameter: tabId' };
    }

    if (!this.debuggerSessions) {
      this.debuggerSessions = new Map();
    }

    if (!this.debuggerSessions.has(tabId)) {
      await this.attachDebugger(tabId);
    }

    // Store captured requests for this tab
    if (!this.capturedRequests) {
      this.capturedRequests = new Map();
    }
    this.capturedRequests.set(tabId, []);

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

  async stopNetworkInspection(params) {
    const { tabId } = params;
    
    if (!tabId) {
      return { success: false, error: 'Missing required parameter: tabId' };
    }

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

  async getCapturedRequests(params) {
    const { tabId } = params;
    
    if (!tabId) {
      return { success: false, error: 'Missing required parameter: tabId' };
    }

    const requests = this.capturedRequests?.get(tabId) || [];
    
    return {
      success: true,
      requests: requests,
      count: requests.length
    };
  }

  async forwardResponseToClaudeTab(params) {
    const { sourceTabId, targetTabId, transformTemplate } = params;
    
    if (!sourceTabId || !targetTabId) {
      return { success: false, error: 'Missing required parameters: sourceTabId, targetTabId' };
    }

    // Get response from source tab
    const sourceResponse = await this.getClaudeResponse({ tabId: sourceTabId });
    
    if (!sourceResponse.success) {
      return { success: false, error: 'Failed to get response from source tab' };
    }

    // Transform response if template provided
    let messageToSend = sourceResponse.response;
    if (transformTemplate) {
      messageToSend = transformTemplate.replace('${response}', sourceResponse.response);
    }

    // Send to target tab
    const sendResult = await this.sendMessageAsync({ tabId: targetTabId, message: messageToSend });
    
    return {
      success: sendResult.success,
      sourceResponse: sourceResponse.response,
      transformedMessage: messageToSend,
      sendResult: sendResult
    };
  }

  async attachDebugger(tabId) {
    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.debuggerSessions.set(tabId, true);
          resolve();
        }
      });
    });
  }
}

// Mix in tab operation methods
Object.assign(HubClient.prototype, tabOperationMethods);