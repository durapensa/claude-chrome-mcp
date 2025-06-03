#!/usr/bin/env node

/**
 * Chrome Native Messaging Bridge for Claude Chrome MCP
 * 
 * This script acts as a bridge between the Chrome extension and the WebSocket hub.
 * It implements Chrome's native messaging protocol while connecting to the existing
 * WebSocket hub architecture.
 */

const WebSocket = require('ws');
const fs = require('fs');

const HUB_PORT = 54321;
const HUB_URL = `ws://localhost:${HUB_PORT}`;

class ChromeNativeBridge {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.messageQueue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    // Set up error handling - don't exit on errors, log them
    process.on('uncaughtException', (error) => {
      this.logError('Uncaught exception:', error);
      // Don't exit - Chrome manages the process lifecycle
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logError('Unhandled rejection:', reason);
      // Don't exit - Chrome manages the process lifecycle
    });
    
    // Handle Chrome closing the connection
    process.stdin.on('end', () => {
      this.logError('Chrome extension disconnected');
      this.cleanup();
      process.exit(0);
    });
    
    process.stdin.on('error', (error) => {
      this.logError('stdin error:', error);
      this.cleanup();
      process.exit(1);
    });
  }
  
  logError(message, error = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] Claude Native Bridge: ${message}`;
    
    if (error) {
      fs.appendFileSync('/tmp/claude-native-bridge.log', `${logMessage} ${error.message || error}\n`);
    } else {
      fs.appendFileSync('/tmp/claude-native-bridge.log', `${logMessage}\n`);
    }
    
    // Also log to stderr for immediate debugging
    console.error(logMessage);
  }
  
  async start() {
    this.logError('Starting native bridge...');
    
    // Set up Chrome native messaging
    this.setupNativeMessaging();
    
    // Connect to WebSocket hub
    await this.connectToHub();
    
    this.logError('Native bridge started successfully');
  }
  
  setupNativeMessaging() {
    let messageLength = 0;
    let messageBuffer = Buffer.alloc(0);
    let expectingLength = true;
    
    process.stdin.on('readable', () => {
      let chunk;
      while (null !== (chunk = process.stdin.read())) {
        this.logError(`Received chunk: ${chunk.length} bytes`);
        messageBuffer = Buffer.concat([messageBuffer, chunk]);
        
        while (true) {
          if (expectingLength) {
            if (messageBuffer.length >= 4) {
              // Read message length (4 bytes, little-endian)
              messageLength = messageBuffer.readUInt32LE(0);
              messageBuffer = messageBuffer.slice(4);
              expectingLength = false;
              
              if (messageLength > 1024 * 1024) { // 1MB limit
                this.logError(`Message too large: ${messageLength} bytes. Resetting buffer.`);
                // Reset buffer state to handle protocol errors gracefully
                messageBuffer = Buffer.alloc(0);
                expectingLength = true;
                messageLength = 0;
                break;
              }
            } else {
              break;
            }
          } else {
            if (messageBuffer.length >= messageLength) {
              // Read complete message
              const messageData = messageBuffer.slice(0, messageLength);
              messageBuffer = messageBuffer.slice(messageLength);
              expectingLength = true;
              
              try {
                const message = JSON.parse(messageData.toString('utf8'));
                this.logError(`Received Chrome message: ${JSON.stringify(message)}`);
                this.handleChromeMessage(message);
              } catch (error) {
                this.logError(`Failed to parse Chrome message (${messageLength} bytes): ${error.message}`);
                this.logError(`Raw data: ${messageData.slice(0, 100).toString('hex')}`);
              }
            } else {
              break;
            }
          }
        }
      }
    });
  }
  
  sendToChrome(message) {
    try {
      const messageStr = JSON.stringify(message);
      const messageBuffer = Buffer.from(messageStr, 'utf8');
      const lengthBuffer = Buffer.allocUnsafe(4);
      lengthBuffer.writeUInt32LE(messageBuffer.length, 0);
      
      process.stdout.write(lengthBuffer);
      process.stdout.write(messageBuffer);
    } catch (error) {
      this.logError('Failed to send message to Chrome:', error);
    }
  }
  
  async connectToHub() {
    return new Promise((resolve, reject) => {
      this.logError(`Connecting to WebSocket hub at ${HUB_URL}...`);
      
      this.ws = new WebSocket(HUB_URL);
      
      const timeout = setTimeout(() => {
        this.ws.close();
        reject(new Error('Connection timeout'));
      }, 5000);
      
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.logError('Connected to WebSocket hub');
        
        // Register as Chrome extension bridge
        this.ws.send(JSON.stringify({
          type: 'chrome_extension_register',
          extensionId: 'native-bridge',
          bridge: true,
          timestamp: Date.now()
        }));
        
        // Process queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          this.ws.send(JSON.stringify(message));
        }
        
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleHubMessage(message);
        } catch (error) {
          this.logError('Failed to parse hub message:', error);
        }
      });
      
      this.ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        this.connected = false;
        this.logError(`WebSocket closed: ${code} ${reason}`);
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * this.reconnectAttempts, 5000);
          this.logError(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(() => {
            this.connectToHub().catch((error) => {
              this.logError('Reconnection failed:', error);
            });
          }, delay);
        } else {
          this.logError('Max reconnection attempts reached - staying alive for Chrome');
          // Don't exit - let Chrome manage the process
        }
      });
      
      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        this.logError('WebSocket error:', error);
        reject(error);
      });
    });
  }
  
  handleChromeMessage(message) {
    this.logError('Received message from Chrome:', JSON.stringify(message));
    
    // Forward message to WebSocket hub
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      // Add bridge metadata
      const forwardMessage = {
        ...message,
        bridgeSource: 'chrome_extension',
        bridgeTimestamp: Date.now()
      };
      
      this.ws.send(JSON.stringify(forwardMessage));
    } else {
      // Queue message if not connected
      this.messageQueue.push(message);
      this.logError('Queued message - not connected to hub');
    }
  }
  
  handleHubMessage(message) {
    this.logError('Received message from hub:', JSON.stringify(message));
    
    // Forward message to Chrome extension
    this.sendToChrome(message);
  }
  
  cleanup() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Start the bridge
const bridge = new ChromeNativeBridge();
bridge.start().catch((error) => {
  bridge.logError('Failed to start bridge:', error);
  // Don't exit - log error and stay alive for Chrome debugging
});