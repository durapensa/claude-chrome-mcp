// Chrome Extension Background Service Worker
// Handles WebSocket connections to multiple MCP servers and debugger management

const KEEPALIVE_INTERVAL = 20000;

// Multiple server configuration
const MCP_SERVERS = [
  { id: 'claude-desktop', port: 54321, name: 'Claude Desktop', priority: 1 },
  { id: 'claude-code', port: 54322, name: 'Claude Code', priority: 2 }
];

class CCMExtension {
  constructor() {
    this.connections = new Map(); // serverId -> connection info
    this.connectedTabs = new Map();
    this.debuggerSessions = new Map();
    this.globalConnectionState = 'disconnected'; // overall state
    this.hasShownNotification = false;
    
    this.init();
  }

  init() {
    this.connectToAllServers();
    this.setupEventListeners();
    this.startKeepalive();
  }

  connectToAllServers() {
    console.log('CCM: Connecting to all MCP servers...');
    MCP_SERVERS.forEach(server => {
      this.connectToServer(server);
    });
  }

  connectToServer(serverConfig) {
    const serverId = serverConfig.id;
    const existing = this.connections.get(serverId);
    
    if (existing && existing.state === 'connecting') {
      return; // Already trying to connect
    }

    // Initialize or update connection info
    const connectionInfo = {
      config: serverConfig,
      websocket: null,
      state: 'connecting',
      reconnectAttempts: existing?.reconnectAttempts || 0,
      reconnectTimer: null,
      lastError: null
    };
    
    this.connections.set(serverId, connectionInfo);
    
    console.log(`CCM: Attempting to connect to ${serverConfig.name} (${serverConfig.port})...`);

    try {
      // Close existing connection if any
      if (existing?.websocket) {
        existing.websocket.close();
      }

      const serverUrl = `ws://localhost:${serverConfig.port}`;
      connectionInfo.websocket = new WebSocket(serverUrl);
      
      connectionInfo.websocket.onopen = () => {
        console.log(`CCM: Connected to ${serverConfig.name}`);
        connectionInfo.state = 'connected';
        connectionInfo.reconnectAttempts = 0;
        
        // Clear any pending reconnect timer
        if (connectionInfo.reconnectTimer) {
          clearTimeout(connectionInfo.reconnectTimer);
          connectionInfo.reconnectTimer = null;
        }
        
        this.sendMessageToServer(serverId, { 
          type: 'extension_ready', 
          extensionId: chrome.runtime.id,
          timestamp: Date.now() 
        });
        this.updateGlobalState();
      };

      connectionInfo.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleServerMessage(serverId, message);
        } catch (error) {
          console.error(`CCM: Error parsing message from ${serverConfig.name}:`, error);
        }
      };

      connectionInfo.websocket.onclose = (event) => {
        console.log(`CCM: Disconnected from ${serverConfig.name}`, event.code, event.reason);
        connectionInfo.state = 'disconnected';
        this.updateGlobalState();
        
        // Only attempt reconnect if it wasn't a clean close
        if (event.code !== 1000) {
          this.scheduleServerReconnect(serverId);
        }
      };

      connectionInfo.websocket.onerror = (error) => {
        console.error(`CCM: WebSocket error for ${serverConfig.name}:`, error);
        connectionInfo.state = 'disconnected';
        connectionInfo.lastError = 'Connection failed';
        this.updateGlobalState();
      };

      // Set a connection timeout
      setTimeout(() => {
        if (connectionInfo.state === 'connecting' && connectionInfo.websocket.readyState !== WebSocket.OPEN) {
          console.log(`CCM: Connection timeout for ${serverConfig.name} - server likely not running`);
          connectionInfo.lastError = 'Server not running';
          connectionInfo.websocket.close();
          this.scheduleServerReconnect(serverId);
        }
      }, 5000);

    } catch (error) {
      console.error(`CCM: Failed to create WebSocket for ${serverConfig.name}:`, error);
      connectionInfo.state = 'disconnected';
      connectionInfo.lastError = 'Connection failed';
      this.scheduleServerReconnect(serverId);
    }
  }

  scheduleServerReconnect(serverId) {
    const connectionInfo = this.connections.get(serverId);
    if (!connectionInfo) return;

    const maxReconnectAttempts = 10;
    
    // Clear any existing timer
    if (connectionInfo.reconnectTimer) {
      clearTimeout(connectionInfo.reconnectTimer);
    }

    if (connectionInfo.reconnectAttempts < maxReconnectAttempts) {
      connectionInfo.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, connectionInfo.reconnectAttempts), 30000);
      
      console.log(`CCM: Scheduling reconnect attempt for ${connectionInfo.config.name} ${connectionInfo.reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms`);
      
      connectionInfo.reconnectTimer = setTimeout(() => {
        this.connectToServer(connectionInfo.config);
      }, delay);
      
      this.updateGlobalState();
    } else {
      console.log(`CCM: Max reconnect attempts exceeded for ${connectionInfo.config.name}`);
      connectionInfo.state = 'failed';
      this.updateGlobalState();
      this.showServerNotRunningNotification();
    }
  }

  updateGlobalState() {
    const states = Array.from(this.connections.values()).map(conn => conn.state);
    
    if (states.includes('connected')) {
      this.globalConnectionState = 'connected';
      this.updateBadge('connected');
    } else if (states.includes('connecting')) {
      this.globalConnectionState = 'connecting';
      this.updateBadge('reconnecting');
    } else if (states.every(state => state === 'failed')) {
      this.globalConnectionState = 'failed';
      this.updateBadge('failed');
    } else {
      this.globalConnectionState = 'disconnected';
      this.updateBadge('disconnected');
    }
  }

  updateBadge(status) {
    const badgeConfig = {
      connected: { text: '●', color: '#28a745' },
      disconnected: { text: '○', color: '#dc3545' },
      reconnecting: { text: '◐', color: '#ffc107' },
      error: { text: '×', color: '#dc3545' },
      failed: { text: '!', color: '#dc3545' }
    };

    const config = badgeConfig[status] || badgeConfig.disconnected;
    
    chrome.action.setBadgeText({ text: config.text });
    chrome.action.setBadgeBackgroundColor({ color: config.color });
  }

  sendMessageToServer(serverId, message) {
    const connectionInfo = this.connections.get(serverId);
    if (connectionInfo?.websocket && connectionInfo.websocket.readyState === WebSocket.OPEN) {
      connectionInfo.websocket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  broadcastToAllServers(message) {
    let sentCount = 0;
    this.connections.forEach((connectionInfo, serverId) => {
      if (this.sendMessageToServer(serverId, message)) {
        sentCount++;
      }
    });
    return sentCount;
  }

  async handleServerMessage(serverId, message) {
    const { type, tabId, command, params, requestId } = message;

    try {
      let result;
      
      switch (type) {
        case 'debugger_command':
          result = await this.executeDebuggerCommand(tabId, command, params);
          break;
        case 'attach_debugger':
          result = await this.attachDebugger(tabId);
          break;
        case 'detach_debugger':
          result = await this.detachDebugger(tabId);
          break;
        case 'get_claude_tabs':
          result = await this.getClaudeTabs();
          break;
        case 'create_claude_tab':
          result = await this.createClaudeTab(params?.url);
          break;
        default:
          throw new Error(`Unknown message type: ${type}`);
      }

      this.sendMessageToServer(serverId, {
        type: 'response',
        requestId,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.sendMessageToServer(serverId, {
        type: 'error',
        requestId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async executeDebuggerCommand(tabId, method, params) {
    if (!this.debuggerSessions.has(tabId)) {
      await this.attachDebugger(tabId);
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
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

  async detachDebugger(tabId) {
    if (!this.debuggerSessions.has(tabId)) {
      return { not_attached: true };
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.debuggerSessions.delete(tabId);
          resolve({ detached: true });
        }
      });
    });
  }

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

  setupEventListeners() {
    // Tab events
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tab.url && tab.url.includes('claude.ai')) {
        this.notifyTabUpdate(tab);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.debuggerSessions.has(tabId)) {
        this.debuggerSessions.delete(tabId);
      }
      this.connectedTabs.delete(tabId);
    });

    // Debugger events
    chrome.debugger.onEvent.addListener((source, method, params) => {
      this.sendMessage({
        type: 'debugger_event',
        tabId: source.tabId,
        method,
        params,
        timestamp: Date.now()
      });
    });

    chrome.debugger.onDetach.addListener((source, reason) => {
      this.debuggerSessions.delete(source.tabId);
      this.sendMessage({
        type: 'debugger_detached',
        tabId: source.tabId,
        reason,
        timestamp: Date.now()
      });
    });

    // Handle notification clicks
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      if (notificationId === 'ccm-server-not-running') {
        if (buttonIndex === 0) {
          // Open extension popup
          chrome.action.openPopup();
        }
        chrome.notifications.clear(notificationId);
      }
    });

    chrome.notifications.onClicked.addListener((notificationId) => {
      if (notificationId === 'ccm-server-not-running') {
        chrome.action.openPopup();
        chrome.notifications.clear(notificationId);
      }
    });

    // Handle messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'getStatus') {
        const serverStatus = Array.from(this.connections.entries()).map(([serverId, connectionInfo]) => ({
          id: serverId,
          name: connectionInfo.config.name,
          port: connectionInfo.config.port,
          state: connectionInfo.state,
          reconnectAttempts: connectionInfo.reconnectAttempts,
          lastError: connectionInfo.lastError,
          hasWebSocket: !!connectionInfo.websocket,
          websocketState: connectionInfo.websocket ? connectionInfo.websocket.readyState : null
        }));

        sendResponse({
          globalConnectionState: this.globalConnectionState,
          servers: serverStatus,
          debuggerSessions: Array.from(this.debuggerSessions.keys())
        });
      } else if (request.type === 'retryConnection') {
        this.retryConnection();
        sendResponse({ success: true });
      }
      return true; // Keep message channel open for async response
    });
  }

  notifyTabUpdate(tab) {
    this.broadcastToAllServers({
      type: 'tab_update',
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        status: tab.status
      },
      timestamp: Date.now()
    });
  }

  startKeepalive() {
    setInterval(() => {
      if (this.globalConnectionState === 'connected') {
        const sentCount = this.broadcastToAllServers({ type: 'keepalive', timestamp: Date.now() });
        if (sentCount === 0) {
          console.log('CCM: All keepalives failed, connections may be dead');
          this.connectToAllServers();
        }
      }
    }, KEEPALIVE_INTERVAL);
  }

  // Method to manually retry connections (can be called from popup)
  retryConnection() {
    console.log('CCM: Manual retry connections requested');
    // Reset all connection attempts
    this.connections.forEach((connectionInfo) => {
      connectionInfo.reconnectAttempts = 0;
      if (connectionInfo.reconnectTimer) {
        clearTimeout(connectionInfo.reconnectTimer);
        connectionInfo.reconnectTimer = null;
      }
    });
    this.connectToAllServers();
  }

  showServerNotRunningNotification() {
    // Only show notification once per session to avoid spam
    if (this.hasShownNotification) return;
    
    chrome.notifications.create('ccm-server-not-running', {
      type: 'basic',
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNGRjQ0MDAiLz4KPHN2ZyB4PSIxMiIgeT0iMTIiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj4KPHN0cm9rZSBkPSJNMTIgOXY0TTEyIDE3aDAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPgo8L3N2Zz4K',
      title: 'Claude Chrome MCP',
      message: 'MCP server not running. Please start Claude Desktop with the CCM server configured.',
      buttons: [
        { title: 'Open Extension' },
        { title: 'Dismiss' }
      ]
    });
    
    this.hasShownNotification = true;
  }
}

// Initialize extension
const ccmExtension = new CCMExtension();