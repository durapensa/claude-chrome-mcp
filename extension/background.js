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
    this.maxReconnectAttempts = 5;
    
    this.init();
  }

  init() {
    this.connectToMCPServer();
    this.setupEventListeners();
    this.startKeepalive();
  }

  connectToMCPServer() {
    try {
      this.websocket = new WebSocket(MCP_SERVER_URL);
      
      this.websocket.onopen = () => {
        console.log('CCM: Connected to MCP server');
        this.reconnectAttempts = 0;
        this.sendMessage({ type: 'extension_ready', timestamp: Date.now() });
      };

      this.websocket.onmessage = (event) => {
        this.handleMCPMessage(JSON.parse(event.data));
      };

      this.websocket.onclose = () => {
        console.log('CCM: Disconnected from MCP server');
        this.scheduleReconnect();
      };

      this.websocket.onerror = (error) => {
        console.error('CCM: WebSocket error:', error);
      };
    } catch (error) {
      console.error('CCM: Failed to connect to MCP server:', error);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connectToMCPServer(), delay);
    }
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
      this.sendMessage({ type: 'keepalive', timestamp: Date.now() });
    }, KEEPALIVE_INTERVAL);
  }
}

// Initialize extension
const ccmExtension = new CCMExtension();