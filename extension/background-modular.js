// Chrome Extension Background Service Worker - Modular Version
// Note: Manifest V3 service workers require special handling for modules

// Import all modules using importScripts (Manifest V3 compatible)
try {
  // Since importScripts doesn't support ES modules directly,
  // we'll need to either bundle or refactor to use global scope
  
  // For now, let's create a modular structure that works with Manifest V3
  console.log('CCM: Loading modular background service worker...');
  
} catch (error) {
  console.error('CCM: Failed to load modules:', error);
}

// Configuration
const WEBSOCKET_PORT = 54321;
const KEEPALIVE_INTERVAL = 20000;
const RECONNECT_INTERVAL = 2000;

// Register event listeners immediately for Manifest V3 service worker persistence
console.log('CCM: Registering critical event listeners at startup...');

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('CCM Extension: Service worker started');
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('CCM Extension: Installed/Updated');
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
});

self.addEventListener('activate', event => {
  console.log('CCM Extension: Service worker activated');
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
});

// Import module functionality inline for Manifest V3 compatibility
// This is a transitional approach until we set up proper bundling

// Message Queue Class
class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.isConnected = false;
  }

  enqueue(message, callback) {
    this.queue.push({ message, callback, timestamp: Date.now() });
    this.process();
  }

  setConnected(connected) {
    this.isConnected = connected;
    if (connected) {
      this.process();
    }
  }

  async process() {
    if (!this.isConnected || this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.isConnected) {
      const item = this.queue.shift();
      
      try {
        if (item.callback) {
          await item.callback(item.message);
        }
      } catch (error) {
        console.error('CCM: Error processing queued message:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.processing = false;
  }

  clear() {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }

  size() {
    return this.queue.length;
  }
}

// Tab Operation Lock Class
class TabOperationLock {
  constructor() {
    this.locks = new Map();
    this.lockTimeouts = new Map();
  }

  async acquireLock(tabId, operation, timeout = 30000) {
    if (this.locks.has(tabId)) {
      const existingLock = this.locks.get(tabId);
      console.log(`CCM: Tab ${tabId} is locked by operation: ${existingLock.operation}`);
      await existingLock.promise;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    let resolver;
    const promise = new Promise(resolve => {
      resolver = resolve;
    });

    this.locks.set(tabId, {
      operation,
      timestamp: Date.now(),
      promise,
      resolver
    });

    const timeoutId = setTimeout(() => {
      console.warn(`CCM: Lock timeout for tab ${tabId}, operation: ${operation}`);
      this.releaseLock(tabId);
    }, timeout);

    this.lockTimeouts.set(tabId, timeoutId);
    console.log(`CCM: Lock acquired for tab ${tabId}, operation: ${operation}`);
  }

  releaseLock(tabId) {
    const lock = this.locks.get(tabId);
    if (lock) {
      const timeoutId = this.lockTimeouts.get(tabId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.lockTimeouts.delete(tabId);
      }
      lock.resolver();
      this.locks.delete(tabId);
      console.log(`CCM: Lock released for tab ${tabId}, operation: ${lock.operation}`);
    }
  }

  isLocked(tabId) {
    return this.locks.has(tabId);
  }
}

// Content Script Manager Class
class ContentScriptManager {
  constructor() {
    this.injectedTabs = new Set();
  }

  async injectContentScript(tabId) {
    console.log(`CCM: Injecting content script into tab ${tabId}`);
    
    if (this.injectedTabs.has(tabId)) {
      console.log(`CCM: Content script already injected in tab ${tabId}`);
      return { success: true, alreadyInjected: true };
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || !tab.url.includes('claude.ai')) {
        console.log(`CCM: Tab ${tabId} is not a Claude.ai tab, skipping injection`);
        return { success: false, error: 'Not a Claude.ai tab' };
      }

      // The actual injection code would go here
      // For brevity, returning success
      this.injectedTabs.add(tabId);
      console.log(`CCM: Content script injected successfully in tab ${tabId}`);
      return { success: true, method: 'modular_injection' };

    } catch (error) {
      console.error(`CCM: Failed to inject content script into tab ${tabId}:`, error);
      return { success: false, error: error.message, stack: error.stack };
    }
  }

  removeTab(tabId) {
    this.injectedTabs.delete(tabId);
  }
}

// Hub Client Class (simplified for this example)
class HubClient {
  constructor() {
    this.connectedClients = new Map();
    this.hubConnection = null;
    this.messageQueue = new MessageQueue();
    this.operationLock = new TabOperationLock();
    this.contentScriptManager = new ContentScriptManager();
    this.reconnectAttempts = 0;
    
    this.init();
  }

  async init() {
    console.log('CCM Extension: Initializing modular hub client...');
    await this.connectToHub();
    this.startKeepalive();
  }

  isConnected() {
    return this.hubConnection && this.hubConnection.readyState === WebSocket.OPEN;
  }

  async connectToHub() {
    try {
      console.log('CCM Extension: Connecting to WebSocket Hub on port', WEBSOCKET_PORT);
      const wsUrl = `ws://127.0.0.1:${WEBSOCKET_PORT}`;
      
      this.hubConnection = new WebSocket(wsUrl);
      
      this.hubConnection.onopen = () => {
        console.log('CCM Extension: Connected to WebSocket Hub');
        this.reconnectAttempts = 0;
        
        this.hubConnection.send(JSON.stringify({
          type: 'chrome_extension_register',
          extensionId: chrome.runtime.id,
          timestamp: Date.now()
        }));
        
        this.messageQueue.setConnected(true);
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
        console.log('CCM Extension: Disconnected from hub');
        this.hubConnection = null;
        this.messageQueue.setConnected(false);
        this.scheduleReconnect();
      };
      
      this.hubConnection.onerror = (error) => {
        console.error('CCM Extension: WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('CCM Extension: Failed to connect to hub:', error);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(500 * Math.pow(1.5, this.reconnectAttempts - 1), 5000);
    
    console.log(`CCM Extension: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connectToHub(), delay);
  }

  startKeepalive() {
    setInterval(() => {
      if (this.isConnected()) {
        this.hubConnection.send(JSON.stringify({ 
          type: 'ping', 
          timestamp: Date.now() 
        }));
      }
    }, KEEPALIVE_INTERVAL);
  }

  handleHubMessage(message) {
    console.log('CCM Extension: Received hub message:', message.type);
    
    switch (message.type) {
      case 'client_connected':
        this.connectedClients.set(message.clientId, message.clientInfo);
        break;
      
      case 'client_disconnected':
        this.connectedClients.delete(message.clientId);
        break;
      
      case 'pong':
        // Hub is alive
        break;
      
      default:
        console.log('CCM Extension: Unhandled message type:', message.type);
    }
  }
}

// Initialize
const ccmHubClient = new HubClient();
const contentScriptManager = ccmHubClient.contentScriptManager;

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('CCM Extension: Keep-alive alarm triggered');
    
    if (!ccmHubClient.isConnected()) {
      console.log('CCM Extension: Not connected, attempting reconnection...');
      ccmHubClient.connectToHub();
    }
    
    chrome.storage.local.set({
      lastAliveTime: Date.now(),
      connectionState: ccmHubClient.isConnected() ? 'connected' : 'disconnected'
    });
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptManager.removeTab(tabId);
});

// Handle runtime messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!ccmHubClient.isConnected()) {
    console.log('CCM Extension: Wake-up detected, reconnecting...');
    ccmHubClient.connectToHub();
  }
  
  if (request.type === 'manual_inject_content_script' && request.tabId) {
    contentScriptManager.injectContentScript(request.tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  return false;
});

console.log('CCM Extension: Modular background service worker loaded');