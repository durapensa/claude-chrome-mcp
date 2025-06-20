/**
 * Offscreen document for maintaining persistent WebSocket connection
 * This runs in a separate context and can maintain connections for 12+ hours
 */

// Default configuration values
const WEBSOCKET_PORT = 54321;
const RECONNECT_INTERVAL = 2000;
const COMPONENT_NAME = 'extension';

// Version will be set when we receive config from background
let VERSION = '0.0.0';

class RelayConnection {
  constructor() {
    this.ws = null;
    this.reconnectDelay = RECONNECT_INTERVAL;
    this.maxReconnectDelay = 30000;
    this.messageQueue = [];
    this.isConnected = false;
    this.reconnectTimer = null;
    this.versionReceived = false;
    
    // Passive health monitoring
    this.connectionHealth = {
      connectedAt: null,
      lastActivityAt: null,
      messagesReceived: 0,
      messagesSent: 0,
      reconnectCount: 0
    };
    
    // Request config from background script
    this.requestConfig();
    
    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }
  
  async requestConfig() {
    try {
      // Request version from background script
      chrome.runtime.sendMessage({ type: 'offscreen_get_config' });
    } catch (error) {
      console.error('[Offscreen] Failed to request config:', error);
      // Start connection anyway with default version
      this.connect();
    }
  }
  
  connect() {
    try {
      this.ws = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}`); // WebSocket relay port
      
      this.ws.onopen = () => {
        console.log('[Offscreen] WebSocket connected to relay');
        this.isConnected = true;
        this.reconnectDelay = RECONNECT_INTERVAL; // Reset delay on successful connection
        
        // Track connection health
        this.connectionHealth.connectedAt = Date.now();
        this.connectionHealth.lastActivityAt = Date.now();
        
        // Identify ourselves to the relay
        this.ws.send(JSON.stringify({
          type: 'identify',
          clientType: 'extension',
          name: 'Extension',
          capabilities: ['tabs', 'debugger', 'claude_automation'],
          version: VERSION,
          component: COMPONENT_NAME
        }));
        
        // Send any queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          this.ws.send(JSON.stringify(message));
        }
        
        // Notify service worker of connection
        chrome.runtime.sendMessage({
          type: 'relay_connection_status',
          status: 'connected',
          health: this.getHealthMetrics()
        });
      };
      
      this.ws.onclose = (event) => {
        console.log('[Offscreen] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;
        
        // Track disconnection
        this.connectionHealth.reconnectCount++;
        
        // Notify service worker
        chrome.runtime.sendMessage({
          type: 'relay_connection_status',
          status: 'disconnected',
          code: event.code,
          reason: event.reason,
          health: this.getHealthMetrics()
        });
        
        // Schedule reconnection
        this.scheduleReconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('[Offscreen] WebSocket error:', error);
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[Offscreen] Received from relay:', message.type);
          
          // Track activity
          this.connectionHealth.lastActivityAt = Date.now();
          this.connectionHealth.messagesReceived++;
          
          // Forward to service worker - pass through the message type directly
          chrome.runtime.sendMessage(message);
        } catch (error) {
          console.error('[Offscreen] Error parsing message:', error);
        }
      };
    } catch (error) {
      console.error('[Offscreen] Connection error:', error);
      this.scheduleReconnect();
    }
  }
  
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    console.log(`[Offscreen] Reconnecting in ${this.reconnectDelay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    
    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
  
  handleMessage(message, sender, sendResponse) {
    if (sender.id !== chrome.runtime.id) {
      return; // Ignore messages from other extensions
    }
    
    switch (message.type) {
      case 'offscreen_config':
        // Receive config from background script
        if (message.version) {
          VERSION = message.version;
          this.versionReceived = true;
          console.log('[Offscreen] Received config, version:', VERSION);
        }
        // Start connection if not already started
        if (!this.ws && !this.reconnectTimer) {
          this.connect();
        }
        break;
        
      case 'send_to_relay':
        this.sendToRelay(message.data);
        sendResponse({ success: true });
        return false; // Synchronous response
        
      case 'get_connection_status':
        sendResponse({
          connected: this.isConnected,
          queueLength: this.messageQueue.length,
          health: this.getHealthMetrics()
        });
        return false; // Synchronous response
        
      case 'ping':
        sendResponse({ pong: true });
        return false; // Synchronous response
        
      default:
        console.log('[Offscreen] Unknown message type:', message.type);
        return false; // No response needed
    }
    
    // Only return true for cases that need async response
  }
  
  sendToRelay(data) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      // Track activity
      this.connectionHealth.lastActivityAt = Date.now();
      this.connectionHealth.messagesSent++;
    } else {
      // Queue message for when connection is restored
      console.log('[Offscreen] Queueing message, not connected');
      this.messageQueue.push(data);
      
      // Try to reconnect if not already attempting
      if (!this.reconnectTimer) {
        this.scheduleReconnect();
      }
    }
  }
  
  getHealthMetrics() {
    const now = Date.now();
    return {
      connected: this.isConnected,
      connectedAt: this.connectionHealth.connectedAt,
      lastActivityAt: this.connectionHealth.lastActivityAt,
      connectionDuration: this.connectionHealth.connectedAt ? now - this.connectionHealth.connectedAt : 0,
      idleTime: this.connectionHealth.lastActivityAt ? now - this.connectionHealth.lastActivityAt : null,
      messagesReceived: this.connectionHealth.messagesReceived,
      messagesSent: this.connectionHealth.messagesSent,
      reconnectCount: this.connectionHealth.reconnectCount,
      queueLength: this.messageQueue.length
    };
  }
  
}

// Initialize relay connection
console.log('[Offscreen] Initializing relay connection...');
const relayConnection = new RelayConnection();

// Send initial status
chrome.runtime.sendMessage({ 
  type: 'offscreen_status',
  status: 'initialized',
  timestamp: Date.now()
}).catch(err => console.error('[Offscreen] Failed to send init status:', err));

// Keep service worker alive by responding to periodic pings
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'offscreen_heartbeat' })
    .catch(() => {
      // Service worker might be inactive, that's ok
    });
}, 30000); // Every 30 seconds