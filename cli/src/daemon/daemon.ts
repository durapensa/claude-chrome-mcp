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
import { createLogger, getLogFileStats } from '../utils/logger';
import { 
  formatDaemonError, 
  withErrorResponse, 
  setupSocketErrorHandlers,
  withFileSystemError,
  safeJsonParse 
} from '../utils/error-handler';
import * as winston from 'winston';

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
  private logger: winston.Logger;

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
    
    // Initialize logger with PID substitution
    const logFile = daemon.logFile.replace(/\$\{PID\}/g, process.pid.toString());
    this.logger = createLogger({
      logFile,
      logLevel: daemon.logLevel,
      componentName: 'mcp-daemon'
    });
    
    // Log startup information
    this.logger.info(`MCP Daemon starting (PID: ${process.pid})`, {
      logFile,
      socketPath: daemon.socket,
      logLevel: daemon.logLevel
    });
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    console.log('Starting MCP daemon...');
    console.log(`Socket path: ${this.socketPath}`);

    // Ensure socket directory exists
    const socketDir = path.dirname(this.socketPath);
    const safeExists = withFileSystemError(fs.existsSync, 'Check socket directory exists', socketDir);
    const safeMkdir = withFileSystemError(fs.mkdirSync, 'Create socket directory', socketDir);
    
    if (!safeExists(socketDir)) {
      safeMkdir(socketDir, { recursive: true });
    }

    // Remove existing socket file
    const safeSocketExists = withFileSystemError(fs.existsSync, 'Check socket file exists', this.socketPath);
    const safeUnlink = withFileSystemError(fs.unlinkSync, 'Remove existing socket file', this.socketPath);
    
    if (safeSocketExists(this.socketPath)) {
      safeUnlink(this.socketPath);
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
        const safeChmod = withFileSystemError(fs.chmodSync, 'Set socket permissions', this.socketPath);
        try {
          safeChmod(this.socketPath, 0o600);
        } catch (error) {
          console.warn('Failed to set socket permissions:', (error as Error).message);
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
          const wrappedAutoStart = withErrorResponse(
            async () => {
              console.log(`Auto-starting server: ${serverId}`);
              const server = await this.serverManager.startServer(serverId);
              this.toolRegistry.registerServerTools(server);
              console.log(`Server ${serverId} started successfully`);
              return { success: true };
            },
            `Failed to auto-start server ${serverId}`,
            (error) => ({ success: false, error: error.message })
          );
          
          await wrappedAutoStart();
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

    // Set up socket error handlers
    setupSocketErrorHandlers(
      socket,
      {
        onError: () => {
          this.clients.delete(socket);
        },
        onClose: () => {
          this.clients.delete(socket);
          console.log(`Client disconnected (${this.clients.size} remaining)`);
        },
        onData: (data) => {
          buffer += data.toString();
          
          // Process complete JSON requests
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim()) {
              const request = safeJsonParse<DaemonRequest>(line, 'Parse client request');
              if (request) {
                this.handleRequest(socket, request).catch(error => {
                  console.error('Error handling request:', error);
                  this.sendResponse(socket, formatDaemonError(
                    request.request_id,
                    error as Error,
                    'Request handling'
                  ));
                });
              }
            }
          }
        }
      },
      'Client socket'
    );
  }

  /**
   * Handle incoming request from client
   */
  private async handleRequest(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { type, request_id } = request;

    (this.logger as any).logRequest('info', `Handling request: ${type}`, request_id);
    console.log(`Handling request: ${type} (id: ${request_id})`);

    const wrappedHandler = withErrorResponse(
      async () => {
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
            
          case 'daemon_status':
            await this.handleDaemonStatus(socket, request);
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
            throw new Error(`Unknown request type: ${type}`);
        }
      },
      `Handle ${type} request`,
      (error) => formatDaemonError(request_id, error, `Handle ${type} request`)
    );

    const result = await wrappedHandler();
    if (result && 'status' in result && result.status === 'error') {
      this.sendResponse(socket, result);
    }
  }

  /**
   * Handle tool call request
   */
  private async handleToolCall(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { server_id, tool_name, args, request_id } = request;
    
    this.logger.info(`handleToolCall started`, { tool_name, server_id, request_id });
    
    if (!tool_name) {
      this.logger.error(`Tool name missing in request`, { request_id });
      throw new Error('Tool name is required');
    }

    this.logger.info(`Attempting to resolve tool`, { tool_name, server_id });
    
    // Resolve the tool
    const tool = this.toolRegistry.resolveTool(tool_name, server_id);
    this.logger.info(`Tool resolution result`, { tool_name, found: !!tool });
    
    if (!tool) {
      const available = server_id 
        ? `Server '${server_id}' does not have tool '${tool_name}'`
        : `Tool '${tool_name}' not found`;
      this.logger.error(`Tool resolution failed`, { tool_name, server_id, error: available });
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
   * Handle daemon status request
   */
  private async handleDaemonStatus(socket: net.Socket, request: DaemonRequest): Promise<void> {
    const { request_id } = request;
    
    // Get log file stats (substitute PID in path)
    const logFile = this.daemon.logFile.replace(/\$\{PID\}/g, process.pid.toString());
    const logStats = getLogFileStats(logFile);
    
    // Get current process info
    const processInfo = {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    };
    
    // Get daemon configuration
    const daemonInfo = {
      socketPath: this.socketPath,
      logFile,
      logLevel: this.daemon.logLevel,
      idleTimeout: this.daemon.idleTimeout,
      logStats
    };
    
    this.sendResponse(socket, {
      request_id,
      status: 'success',
      data: {
        daemon: daemonInfo,
        process: processInfo,
        servers: this.serverManager.getStats(),
        tools: this.toolRegistry.getStats(),
        clients: this.clients.size
      }
    });
  }

  /**
   * Send response to client
   */
  private sendResponse(socket: net.Socket, response: DaemonResponse): void {
    try {
      this.logger.info(`Sending response`, { status: response.status, request_id: response.request_id });
      const message = JSON.stringify(response) + '\n';
      
      // Check if socket is writable
      if (socket.destroyed || !socket.writable) {
        this.logger.error(`Cannot send response: socket not writable`, { request_id: response.request_id });
        return;
      }
      
      // socket.write returns false if backpressure is applied
      const success = socket.write(message);
      if (!success) {
        this.logger.warn(`Response backpressure applied`, { request_id: response.request_id });
      }
      
      this.logger.info(`Response sent successfully`, { request_id: response.request_id });
    } catch (error) {
      this.logger.error(`Failed to send response`, { request_id: response.request_id, error: (error as Error).message });
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
    const safeExists = withFileSystemError(fs.existsSync, 'Check socket exists for cleanup', this.socketPath);
    const safeUnlink = withFileSystemError(fs.unlinkSync, 'Remove socket file on shutdown', this.socketPath);
    
    if (safeExists(this.socketPath)) {
      safeUnlink(this.socketPath);
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