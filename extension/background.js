// Chrome Extension Background Service Worker
// Handles WebSocket connection to MCP server and debugger management

const WEBSOCKET_PORT = 54321;
const MCP_SERVER_URL = `ws://localhost:${WEBSOCKET_PORT}`;
const KEEPALIVE_INTERVAL = 20000;

class CCMExtension {
  constructor() {
    this.websocket = null;
    this.connectedTabs = new Map();
    this.debuggerSessions = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimer = null;
    this.connectionState = 'disconnected'; // disconnected, connecting, connected
    this.lastError = null;
    this.hasShownNotification = false;
    
    this.init();
  }

  init() {
    this.connectToMCPServer();
    this.setupEventListeners();
    this.startKeepalive();
  }

  connectToMCPServer() {
    if (this.connectionState === 'connecting') {
      return; // Already trying to connect
    }

    this.connectionState = 'connecting';
    console.log('CCM: Attempting to connect to MCP server...');

    try {
      // Close existing connection if any
      if (this.websocket) {
        this.websocket.close();
      }

      this.websocket = new WebSocket(MCP_SERVER_URL);
      
      this.websocket.onopen = () => {
        console.log('CCM: Connected to MCP server');
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        
        // Clear any pending reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        
        this.sendMessage({ type: 'extension_ready', timestamp: Date.now() });
        this.updateBadge('connected');
      };

      this.websocket.onmessage = (event) => {
        try {
          this.handleMCPMessage(JSON.parse(event.data));
        } catch (error) {
          console.error('CCM: Error parsing message:', error);
        }
      };

      this.websocket.onclose = (event) => {
        console.log('CCM: Disconnected from MCP server', event.code, event.reason);
        this.connectionState = 'disconnected';
        this.updateBadge('disconnected');
        
        // Only attempt reconnect if it wasn't a clean close
        if (event.code !== 1000) {
          this.scheduleReconnect();
        }
      };

      this.websocket.onerror = (error) => {
        console.error('CCM: WebSocket error:', error);
        this.connectionState = 'disconnected';
        this.lastError = 'Connection failed';
        this.updateBadge('error');
      };

      // Set a connection timeout
      setTimeout(() => {
        if (this.connectionState === 'connecting' && this.websocket.readyState !== WebSocket.OPEN) {
          console.log('CCM: Connection timeout - MCP server likely not running');
          this.lastError = 'MCP server not running';
          this.websocket.close();
          this.scheduleReconnect();
        }
      }, 5000);

    } catch (error) {
      console.error('CCM: Failed to create WebSocket:', error);
      this.connectionState = 'disconnected';
      this.lastError = 'Connection failed';
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    // Clear any existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.log(`CCM: Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connectToMCPServer();
      }, delay);
      
      this.updateBadge('reconnecting');
    } else {
      console.log('CCM: Max reconnect attempts exceeded');
      this.updateBadge('failed');
      this.showServerNotRunningNotification();
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

  sendMessage(message) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  async handleMCPMessage(message) {
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

      this.sendMessage({
        type: 'response',
        requestId,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.sendMessage({
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
        sendResponse({
          connectionState: this.connectionState,
          lastError: this.lastError,
          reconnectAttempts: this.reconnectAttempts,
          maxReconnectAttempts: this.maxReconnectAttempts,
          hasWebSocket: !!this.websocket,
          websocketState: this.websocket ? this.websocket.readyState : null,
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
    this.sendMessage({
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
      if (this.connectionState === 'connected') {
        const sent = this.sendMessage({ type: 'keepalive', timestamp: Date.now() });
        if (!sent) {
          console.log('CCM: Keepalive failed, connection may be dead');
          this.connectionState = 'disconnected';
          this.scheduleReconnect();
        }
      }
    }, KEEPALIVE_INTERVAL);
  }

  // Method to manually retry connection (can be called from popup)
  retryConnection() {
    console.log('CCM: Manual retry connection requested');
    this.reconnectAttempts = 0; // Reset attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectToMCPServer();
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