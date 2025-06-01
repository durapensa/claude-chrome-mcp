/**
 * Universal MCP CLI - Main Daemon
 * 
 * The core daemon process that manages MCP servers and handles CLI requests.
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { ServerManager } from './server-manager';
import { ToolRegistry } from './tool-registry';
import { ConfigLoader } from '../config/config-loader';
import { MCPCliConfig, ServerConfig, DaemonConfig, DefaultsConfig } from '../types/config';
import { DaemonRequest, DaemonResponse } from '../types/daemon';

export class MCPDaemon {
  private server: net.Server | null = null;
  private serverManager: ServerManager;
  private toolRegistry: ToolRegistry;
  private config: MCPCliConfig;
  private servers: Record<string, ServerConfig>;
  private daemon: Required<DaemonConfig>;
  private defaults: Required<DefaultsConfig>;
  private socketPath: string;
  private isShuttingDown = false;
  private clients = new Set<net.Socket>();

  constructor(
    config: MCPCliConfig,
    servers: Record<string, ServerConfig>,
    daemon: Required<DaemonConfig>,
    defaults: Required<DefaultsConfig>
  ) {
    this.config = config;
    this.servers = servers;
    this.daemon = daemon;
    this.defaults = defaults;
    this.socketPath = daemon.socket;
    this.serverManager = new ServerManager();
    this.toolRegistry = new ToolRegistry();
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    console.log('Starting MCP daemon...');
    console.log(`Socket path: ${this.socketPath}`);

    // Ensure socket directory exists
    const socketDir = path.dirname(this.socketPath);
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true });
    }

    // Remove existing socket file
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    // Create Unix domain socket server
    this.server = net.createServer((socket) => {
      this.handleClientConnection(socket);
    });

    // Start listening
    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        console.log(`MCP daemon listening on ${this.socketPath}`);
        
        // Set socket permissions to be accessible by user
        try {
          fs.chmodSync(this.socketPath, 0o600);
        } catch (error) {
          console.warn('Failed to set socket permissions:', error);
        }

        // Initialize configured servers
        this.initializeServers()
          .then(() => resolve())
          .catch(reject);
      });

      this.server!.on('error', (error) => {
        console.error('Daemon server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Initialize configured servers
   */
  private async initializeServers(): Promise<void> {
    console.log('Initializing configured servers...');

    // Add all configured servers to the manager (but don't start them)
    for (const [serverId, config] of Object.entries(this.servers)) {
      this.serverManager.addServer(serverId, config);
      console.log(`Registered server: ${serverId} (auto_start: ${config.auto_start})`);
    }

    // Auto-start servers in the background (non-blocking)
    this.autoStartServers();
  }

  /**
   * Auto-start servers in background (non-blocking)
   */
  private autoStartServers(): void {
    // Don't await - let this run in background
    (async () => {
      for (const [serverId, config] of Object.entries(this.servers)) {
        if (config.auto_start) {
          try {
            console.log(`Auto-starting server: ${serverId}`);
            const server = await this.serverManager.startServer(serverId);
            this.toolRegistry.registerServerTools(server);
            console.log(`Server ${serverId} started successfully`);
          } catch (error) {
            console.error(`Failed to auto-start server ${serverId}:`, (error as Error).message);
          }
        }
      }
    })();
  }

  /**
   * Handle new client connection
   */
  private handleClientConnection(socket: net.Socket): void {
    this.clients.add(socket);
    console.log(`Client connected (${this.clients.size} total)`);

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete JSON requests
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const request: DaemonRequest = JSON.parse(line);
            this.handleRequest(socket, request).catch(error => {
              console.error('Error handling request:', error);
              this.sendResponse(socket, {
                request_id: request.request_id,
                status: 'error',
                error: (error as Error).message
              });
            });
          } catch (error) {
            console.error('Invalid JSON from client:', line);
          }
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      console.log(`Client disconnected (${this.clients.size} remaining)`);
    });

    socket.on('error', (error) => {
      console.error('Client socket error:', error);
      this.clients.delete(socket);
    });
  }

  /**
   * Handle incoming request from client
   */
  private async handleRequest(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { type, request_id } = request;

    console.log(`Handling request: ${type} (id: ${request_id})`);

    try {
      switch (type) {
        case 'tool_call':
          await this.handleToolCall(socket, request);
          break;

        case 'list_tools':
          await this.handleListTools(socket, request);
          break;

        case 'server_status':
          await this.handleServerStatus(socket, request);
          break;

        case 'start_server':
          await this.handleStartServer(socket, request);
          break;

        case 'stop_server':
          await this.handleStopServer(socket, request);
          break;

        case 'shutdown':
          await this.handleShutdown(socket, request);
          break;

        default:
          this.sendResponse(socket, {
            request_id,
            status: 'error',
            error: `Unknown request type: ${type}`
          });
      }
    } catch (error) {
      this.sendResponse(socket, {
        request_id,
        status: 'error',
        error: (error as Error).message
      });
    }
  }

  /**
   * Handle tool call request
   */
  private async handleToolCall(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { server_id, tool_name, args, request_id } = request;
    
    if (!tool_name) {
      throw new Error('Tool name is required');
    }

    // Resolve the tool
    const tool = this.toolRegistry.resolveTool(tool_name, server_id);
    if (!tool) {
      const available = server_id 
        ? `Server '${server_id}' does not have tool '${tool_name}'`
        : `Tool '${tool_name}' not found`;
      throw new Error(available);
    }

    // Ensure the target server is running
    const targetServerId = tool.server_id;
    const server = this.serverManager.getServer(targetServerId);
    if (!server) {
      throw new Error(`Server '${targetServerId}' not found`);
    }

    if (server.status !== 'ready') {
      // Send progress update
      this.sendResponse(socket, {
        request_id,
        status: 'progress',
        progress: {
          message: `Starting server ${targetServerId}...`,
          step: 1,
          total: 2
        }
      });

      await this.serverManager.startServer(targetServerId);
      this.toolRegistry.registerServerTools(server);
    }

    // Call the tool
    this.sendResponse(socket, {
      request_id,
      status: 'progress',
      progress: {
        message: `Calling tool ${tool_name}...`,
        step: 2,
        total: 2
      }
    });

    const result = await this.serverManager.callTool(targetServerId, tool_name, args || {});
    
    this.sendResponse(socket, {
      request_id,
      status: 'success',
      data: result
    });
  }

  /**
   * Handle list tools request
   */
  private async handleListTools(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { server_id, request_id } = request;

    let tools;
    if (server_id) {
      tools = this.toolRegistry.getServerTools(server_id);
    } else {
      tools = this.toolRegistry.getAllTools();
    }

    this.sendResponse(socket, {
      request_id,
      status: 'success',
      data: {
        tools,
        collisions: Object.fromEntries(this.toolRegistry.getCollisions()),
        stats: this.toolRegistry.getStats()
      }
    });
  }

  /**
   * Handle server status request
   */
  private async handleServerStatus(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { server_id, request_id } = request;

    let data;
    if (server_id) {
      const server = this.serverManager.getServer(server_id);
      data = server ? [server] : [];
    } else {
      data = this.serverManager.getAllServers();
    }

    this.sendResponse(socket, {
      request_id,
      status: 'success',
      data: {
        servers: data,
        stats: this.serverManager.getStats()
      }
    });
  }

  /**
   * Handle start server request
   */
  private async handleStartServer(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { server_id, request_id } = request;
    
    if (!server_id) {
      throw new Error('Server ID is required');
    }

    this.sendResponse(socket, {
      request_id,
      status: 'progress',
      progress: {
        message: `Starting server ${server_id}...`,
        step: 1,
        total: 1
      }
    });

    const server = await this.serverManager.startServer(server_id);
    this.toolRegistry.registerServerTools(server);

    this.sendResponse(socket, {
      request_id,
      status: 'success',
      data: server
    });
  }

  /**
   * Handle stop server request
   */
  private async handleStopServer(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { server_id, request_id } = request;
    
    if (!server_id) {
      throw new Error('Server ID is required');
    }

    await this.serverManager.stopServer(server_id);
    this.toolRegistry.unregisterServerTools(server_id);

    this.sendResponse(socket, {
      request_id,
      status: 'success',
      data: { message: `Server ${server_id} stopped` }
    });
  }

  /**
   * Handle shutdown request
   */
  private async handleShutdown(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { request_id } = request;

    this.sendResponse(socket, {
      request_id,
      status: 'success',
      data: { message: 'Daemon shutting down...' }
    });

    // Close client connection
    socket.end();

    // Initiate shutdown
    this.shutdown().catch(error => {
      console.error('Error during shutdown:', error);
    });
  }

  /**
   * Send response to client
   */
  private sendResponse(socket: net.Socket, response: DaemonResponse): void {
    try {
      console.log(`Sending response: ${response.status} (id: ${response.request_id})`);
      const message = JSON.stringify(response) + '\n';
      socket.write(message);
    } catch (error) {
      console.error('Error sending response:', error);
    }
  }

  /**
   * Shutdown the daemon
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log('Shutting down MCP daemon...');

    // Close all client connections
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    // Stop all servers
    await this.serverManager.shutdown();

    // Close the server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          resolve();
        });
      });
    }

    // Remove socket file
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    console.log('MCP daemon shut down successfully');
  }
}

/**
 * Start the daemon from configuration
 */
export async function startDaemon(configPath?: string): Promise<MCPDaemon> {
  const { config, servers, daemon: daemonConfig, defaults } = await ConfigLoader.load(configPath);
  const daemon = new MCPDaemon(config, servers, daemonConfig, defaults);
  await daemon.start();
  return daemon;
}

// CLI entry point for daemon
if (require.main === module) {
  const configPath = process.argv[2];
  
  startDaemon(configPath)
    .then((daemon) => {
      console.log('MCP daemon started successfully');
      
      // Handle shutdown signals
      process.on('SIGINT', () => {
        console.log('\nReceived SIGINT, shutting down...');
        daemon.shutdown().then(() => process.exit(0));
      });
      
      process.on('SIGTERM', () => {
        console.log('Received SIGTERM, shutting down...');
        daemon.shutdown().then(() => process.exit(0));
      });
    })
    .catch((error) => {
      console.error('Failed to start daemon:', error);
      process.exit(1);
    });
}