// Background script hub reconnection fix
// Add these methods to the ExtensionAsHubClient class

// Add to the setupEventListeners method:
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
    }
    return true;
  });

  // ... rest of existing event listeners ...
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
      message: error.message,
      connected: false,
      error: error.toString()
    };
  }
}

// Enhanced connectToHub with better error handling
async connectToHub() {
  try {
    console.log('CCM Extension: Connecting to WebSocket Hub on port', WEBSOCKET_PORT);
    
    // Check if we're already trying to connect
    if (this.hubConnection && this.hubConnection.readyState === WebSocket.CONNECTING) {
      console.log('CCM Extension: Connection already in progress');
      return;
    }
    
    // Close any existing connection
    if (this.hubConnection) {
      try {
        this.hubConnection.close();
      } catch (e) {
        // Ignore close errors
      }
      this.hubConnection = null;
    }
    
    // Track connection attempt
    this.lastConnectionAttempt = Date.now();
    
    // Use 127.0.0.1 instead of localhost to avoid potential DNS issues
    const wsUrl = `ws://127.0.0.1:${WEBSOCKET_PORT}`;
    console.log('CCM Extension: Attempting connection to', wsUrl);
    
    // Create connection with timeout
    const connectionPromise = new Promise((resolve, reject) => {
      this.hubConnection = new WebSocket(wsUrl);
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000); // 5 second timeout
      
      this.hubConnection.onopen = () => {
        clearTimeout(timeout);
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
        
        // Update connection state
        chrome.storage.local.set({
          connectionState: 'connected',
          lastConnectedTime: Date.now()
        });
        
        resolve();
      };
      
      this.hubConnection.onerror = (error) => {
        clearTimeout(timeout);
        console.error('CCM Extension: WebSocket error', error);
        reject(error);
      };
    });
    
    await connectionPromise;
    
    // Set up other event handlers after successful connection
    this.setupHubEventHandlers();
    
  } catch (error) {
    console.error('CCM Extension: Failed to connect to hub:', error);
    this.hubConnection = null;
    
    // Update connection state
    chrome.storage.local.set({
      connectionState: 'disconnected',
      lastDisconnectedTime: Date.now(),
      lastError: error.toString()
    });
    
    // Schedule reconnection
    this.scheduleReconnect();
    
    throw error;
  }
}

// Add method to check and fix stale connection state
async checkConnectionHealth() {
  if (!this.hubConnection) {
    return false;
  }
  
  // Check WebSocket state
  if (this.hubConnection.readyState !== WebSocket.OPEN) {
    console.log('CCM: WebSocket in invalid state:', this.hubConnection.readyState);
    this.hubConnection = null;
    return false;
  }
  
  // Try to send a ping to verify connection is actually alive
  try {
    this.hubConnection.send(JSON.stringify({
      type: 'ping',
      timestamp: Date.now()
    }));
    return true;
  } catch (error) {
    console.error('CCM: Failed to send ping:', error);
    this.hubConnection = null;
    return false;
  }
}

// Enhanced keepalive with connection health check
startKeepalive() {
  // Create alarm for periodic keepalive
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 }); // Every 15 seconds
  
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'keepAlive') {
      // First check if connection is healthy
      const isHealthy = await this.checkConnectionHealth();
      
      if (!isHealthy) {
        console.log('CCM: Connection unhealthy during keepalive, attempting reconnection');
        await this.handleForcedReconnection();
      } else if (this.isConnected()) {
        // Send keepalive
        try {
          this.hubConnection.send(JSON.stringify({
            type: 'keepalive',
            timestamp: Date.now()
          }));
          
          // Update last activity
          this.updateLastAliveTime();
        } catch (error) {
          console.error('CCM: Keepalive failed:', error);
          // Connection might be stale, force reconnection
          this.hubConnection = null;
          await this.handleForcedReconnection();
        }
      }
    }
  });
}