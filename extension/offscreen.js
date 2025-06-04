/**
 * Offscreen document for maintaining persistent WebSocket connection
 * This runs in a separate context and can maintain connections for 12+ hours
 */

class RelayConnection {
  constructor() {
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.messageQueue = [];
    this.isConnected = false;
    this.reconnectTimer = null;
    
    // Start connection
    this.connect();
    
    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }
  
  connect() {
    try {
      this.ws = new WebSocket('ws://localhost:54321');
      
      this.ws.onopen = () => {
        console.log('[Offscreen] WebSocket connected to relay');
        this.isConnected = true;
        this.reconnectDelay = 1000; // Reset delay on successful connection
        
        // Identify ourselves to the relay
        this.ws.send(JSON.stringify({
          type: 'identify',
          clientType: 'chrome_extension',
          name: 'Claude Chrome MCP Extension',
          capabilities: ['tabs', 'debugger', 'claude_automation']
        }));
        
        // Send any queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          this.ws.send(JSON.stringify(message));
        }
        
        // Notify service worker of connection
        chrome.runtime.sendMessage({
          type: 'relay_connection_status',
          status: 'connected'
        });
      };
      
      this.ws.onclose = (event) => {
        console.log('[Offscreen] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;
        
        // Notify service worker
        chrome.runtime.sendMessage({
          type: 'relay_connection_status',
          status: 'disconnected',
          code: event.code,
          reason: event.reason
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
          
          // Forward to service worker
          chrome.runtime.sendMessage({
            type: 'relay_message',
            data: message
          });
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
      case 'send_to_relay':
        this.sendToRelay(message.data);
        sendResponse({ success: true });
        break;
        
      case 'get_connection_status':
        sendResponse({
          connected: this.isConnected,
          queueLength: this.messageQueue.length
        });
        break;
        
      case 'ping':
        sendResponse({ pong: true });
        break;
        
      default:
        console.log('[Offscreen] Unknown message type:', message.type);
    }
    
    return true; // Keep message channel open for async response
  }
  
  sendToRelay(data) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
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