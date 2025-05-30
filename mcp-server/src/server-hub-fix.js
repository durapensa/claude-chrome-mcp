/**
 * Hub startup fix for MCP server
 * 
 * This patch ensures the WebSocket hub starts properly
 */

// Add better error handling and logging to AutoHubClient

class AutoHubClientFixed extends AutoHubClient {
  async connect() {
    if (this.connectionState === 'connecting') {
      console.error('CCM: Connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    
    // Force hub creation in Claude Code environment
    const forceHubCreation = process.env.CCM_FORCE_HUB_CREATION === '1' || 
                            process.env.ANTHROPIC_ENVIRONMENT === 'claude_code';
    
    if (!forceHubCreation) {
      try {
        // Try existing hub first with shorter timeout
        console.error('CCM: Checking for existing hub...');
        await this.connectToExistingHub(2000);
        this.onConnectionSuccess();
        console.error(`CCM: Connected to existing hub as ${this.clientInfo.name}`);
        return;
      } catch (error) {
        console.error('CCM: No existing hub found:', error.message);
      }
    } else {
      console.error('CCM: Forced hub creation mode - skipping existing hub check');
    }

    try {
      console.error('CCM: Starting new WebSocket hub...');
      await this.startHubAndConnect();
      this.onConnectionSuccess();
      console.error(`CCM: Successfully started hub and connected as ${this.clientInfo.name}`);
    } catch (error) {
      this.connectionState = 'disconnected';
      console.error('CCM: Failed to start hub:', error);
      
      // More detailed error reporting
      if (error.code === 'EADDRINUSE') {
        console.error('CCM: Port 54321 is already in use');
        console.error('CCM: Run "lsof -i :54321" to check what\'s using it');
      } else if (error.code === 'EACCES') {
        console.error('CCM: Permission denied to bind to port 54321');
      }
      
      throw error;
    }
  }
  
  async startHubAndConnect() {
    console.error('CCM: Creating WebSocketHub instance...');
    
    // Start embedded hub with error handling
    this.ownedHub = new WebSocketHub();
    
    try {
      console.error('CCM: Starting WebSocketHub on port 54321...');
      await this.ownedHub.start();
      console.error('CCM: WebSocketHub started successfully');
      this.isHubOwner = true;
    } catch (hubError) {
      console.error('CCM: WebSocketHub failed to start:', hubError);
      this.ownedHub = null;
      throw hubError;
    }

    // Wait for hub to be ready
    console.error('CCM: Waiting for hub to be ready...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Connect to our own hub
    console.error('CCM: Connecting to own hub...');
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout connecting to own hub'));
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        console.error('CCM: Connected to own hub successfully');
        this.ws = ws;
        this.setupWebSocketHandlers(resolve, reject);
        this.registerWithHub();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.error('CCM: Error connecting to own hub:', error);
        reject(error);
      });
    });
  }
}

// Enhanced WebSocketHub with better error reporting
class WebSocketHubEnhanced extends WebSocketHub {
  async startServer() {
    return new Promise((resolve, reject) => {
      console.error('WebSocketHub: Creating server on port', HUB_PORT);
      
      this.server = new WebSocket.Server({ 
        port: HUB_PORT,
        clientTracking: true
      });

      this.server.on('listening', () => {
        console.error('WebSocketHub: Server listening on port', HUB_PORT);
        
        // Verify we can actually connect
        const testWs = new WebSocket(`ws://localhost:${HUB_PORT}`);
        testWs.on('open', () => {
          console.error('WebSocketHub: Test connection successful');
          testWs.close();
          resolve();
        });
        testWs.on('error', (err) => {
          console.error('WebSocketHub: Test connection failed:', err);
          this.server.close();
          reject(new Error('Hub started but cannot accept connections'));
        });
      });

      this.server.on('error', (error) => {
        console.error('WebSocketHub: Server error:', error);
        
        if (error.code === 'EADDRINUSE') {
          // Check what's using the port
          const { exec } = require('child_process');
          exec(`lsof -i :${HUB_PORT} | grep LISTEN`, (err, stdout) => {
            if (stdout) {
              console.error('WebSocketHub: Port already in use by:', stdout);
            }
          });
        }
        
        reject(error);
      });

      this.server.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        console.error('WebSocketHub: New connection from', clientIp);
        this.handleConnection(ws, req);
      });
    });
  }
}

module.exports = { AutoHubClientFixed, WebSocketHubEnhanced };