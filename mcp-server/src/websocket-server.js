const WebSocket = require('ws');
const EventEmitter = require('events');

class WebSocketServer extends EventEmitter {
  constructor(port = 54321) {
    super();
    this.port = port;
    this.wss = null;
    this.extensionConnection = null;
    this.clients = new Set(); // Track all connected clients
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', (ws) => {
          console.error('CCM: Client connected');
          this.clients.add(ws);

          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString());
              this.handleClientMessage(ws, message);
            } catch (error) {
              console.error('CCM: Error parsing client message:', error);
            }
          });

          ws.on('close', () => {
            console.error('CCM: Client disconnected');
            this.clients.delete(ws);
            if (ws === this.extensionConnection) {
              this.extensionConnection = null;
            }
          });

          ws.on('error', (error) => {
            console.error('CCM: Client connection error:', error);
          });

          // Send ready signal
          ws.send(JSON.stringify({ type: 'server_ready', timestamp: Date.now() }));
        });

        this.wss.on('listening', () => {
          console.error(`CCM: WebSocket server listening on port ${this.port}`);
          resolve();
        });

        this.wss.on('error', (error) => {
          console.error('CCM: WebSocket server error:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  handleClientMessage(ws, message) {
    const { type, requestId } = message;

    // Handle client identification
    if (type === 'extension_ready') {
      console.error('CCM: Extension is ready');
      this.extensionConnection = ws;
      this.emit('extension_ready');
      return;
    }

    // Handle CLI or extension commands that need to be forwarded to extension
    if (['get_claude_tabs', 'create_claude_tab', 'attach_debugger', 'detach_debugger', 'debugger_command'].includes(type)) {
      this.forwardToExtension(ws, message);
      return;
    }

    // Handle extension responses and other messages
    this.handleExtensionMessage(message);
  }

  async forwardToExtension(clientWs, message) {
    if (!this.extensionConnection || this.extensionConnection.readyState !== WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'error',
        requestId: message.requestId,
        error: 'Extension not connected',
        timestamp: Date.now()
      }));
      return;
    }

    // Store the client for this request so we can route the response back
    this.pendingRequests.set(message.requestId, { 
      clientWs,
      originalMessage: message
    });

    // Forward to extension
    this.extensionConnection.send(JSON.stringify(message));
  }

  handleExtensionMessage(message) {
    const { type, requestId } = message;

    switch (type) {
      case 'extension_ready':
        console.error('CCM: Extension is ready');
        this.emit('extension_ready');
        break;

      case 'response':
        if (requestId && this.pendingRequests.has(requestId)) {
          const pending = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          
          // If it's a CLI request, send response back to CLI client
          if (pending.clientWs) {
            pending.clientWs.send(JSON.stringify(message));
          } else if (pending.resolve) {
            // Original MCP request handling
            pending.resolve(message.result);
          }
        }
        break;

      case 'error':
        if (requestId && this.pendingRequests.has(requestId)) {
          const pending = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          
          // If it's a CLI request, send error back to CLI client
          if (pending.clientWs) {
            pending.clientWs.send(JSON.stringify(message));
          } else if (pending.reject) {
            // Original MCP request handling
            pending.reject(new Error(message.error));
          }
        }
        break;

      case 'tab_update':
        this.emit('tab_update', message.tab);
        break;

      case 'session_detected':
        this.emit('session_detected', message.sessionInfo);
        break;

      case 'debugger_event':
        this.emit('debugger_event', message);
        break;

      case 'debugger_detached':
        this.emit('debugger_detached', message);
        break;

      case 'keepalive':
        // Respond to keepalive
        this.sendToExtension({ type: 'keepalive_ack', timestamp: Date.now() });
        break;

      default:
        console.error('CCM: Unknown message type from extension:', type);
    }
  }

  sendToExtension(message) {
    if (this.extensionConnection && this.extensionConnection.readyState === WebSocket.OPEN) {
      try {
        this.extensionConnection.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('CCM: Error sending message to extension:', error);
        return false;
      }
    }
    return false;
  }

  async sendRequest(type, params = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.extensionConnection || this.extensionConnection.readyState !== WebSocket.OPEN) {
        reject(new Error('Extension not connected'));
        return;
      }

      const requestId = `req_${++this.requestId}`;
      
      // Store the request
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout: ${type}`));
        }
      }, timeout);

      // Clear timeout when request completes
      const originalResolve = resolve;
      const originalReject = reject;
      
      const wrappedResolve = (result) => {
        clearTimeout(timeoutId);
        originalResolve(result);
      };
      
      const wrappedReject = (error) => {
        clearTimeout(timeoutId);
        originalReject(error);
      };

      this.pendingRequests.set(requestId, { 
        resolve: wrappedResolve, 
        reject: wrappedReject 
      });

      // Send the request
      const message = {
        type,
        requestId,
        timestamp: Date.now(),
        ...params
      };

      if (!this.sendToExtension(message)) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(new Error('Failed to send request to extension'));
      }
    });
  }

  isConnected() {
    return this.extensionConnection && this.extensionConnection.readyState === WebSocket.OPEN;
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.extensionConnection = null;
    this.clients.clear();
    this.pendingRequests.clear();
  }
}

module.exports = WebSocketServer;