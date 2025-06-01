/**
 * Universal MCP CLI - Server Manager
 * 
 * Manages the lifecycle of MCP servers: starting, stopping, monitoring.
 */

import { StdioMCPConnection } from './mcp-connection';
import { MCPServer, ServerStatus } from '../types/daemon';
import { ServerConfig } from '../types/config';

export class ServerManager {
  private servers = new Map<string, MCPServer>();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Add a server configuration
   */
  addServer(id: string, config: ServerConfig): void {
    if (this.servers.has(id)) {
      throw new Error(`Server '${id}' already exists`);
    }

    const server: MCPServer = {
      id,
      config,
      status: 'stopped',
      process: null,
      connection: null,
      tools: [],
      lastUsed: new Date(),
      startTime: undefined,
      error: undefined
    };

    this.servers.set(id, server);
  }

  /**
   * Start a specific server
   */
  async startServer(id: string): Promise<MCPServer> {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server '${id}' not found`);
    }

    if (server.status === 'ready') {
      return server;
    }

    if (server.status === 'starting') {
      // Wait for the server to finish starting
      return this.waitForServerReady(id);
    }

    console.log(`Starting server: ${id}`);
    server.status = 'starting';
    server.error = undefined;
    server.startTime = new Date();

    try {
      // Create new connection
      const connection = new StdioMCPConnection(id, server.config);
      
      // Connect to the server with timeout
      await Promise.race([
        connection.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Server startup timeout (30s)')), 30000)
        )
      ]);

      // Get available tools
      const tools = await connection.listTools();

      // Update server state
      server.connection = connection;
      server.status = 'ready';
      server.tools = tools.map(tool => ({
        name: tool.name,
        server_id: id,
        schema: tool.inputSchema,
        canonical: false, // Will be set by namespace resolver
        description: tool.description
      }));

      console.log(`Server ${id} started successfully with ${tools.length} tools`);
      return server;

    } catch (error) {
      server.status = 'error';
      server.error = (error as Error).message;
      console.error(`Failed to start server ${id}:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Stop a specific server
   */
  async stopServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server '${id}' not found`);
    }

    if (server.status === 'stopped') {
      return;
    }

    console.log(`Stopping server: ${id}`);

    try {
      if (server.connection) {
        await server.connection.close();
      }
    } catch (error) {
      console.error(`Error stopping server ${id}:`, (error as Error).message);
    }

    server.status = 'stopped';
    server.connection = null;
    server.tools = [];
    server.process = null;
    server.error = undefined;
  }

  /**
   * Get server by ID
   */
  getServer(id: string): MCPServer | undefined {
    return this.servers.get(id);
  }

  /**
   * Get all servers
   */
  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get servers by status
   */
  getServersByStatus(status: ServerStatus): MCPServer[] {
    return Array.from(this.servers.values()).filter(server => server.status === status);
  }

  /**
   * Update server last used timestamp
   */
  updateServerUsage(id: string): void {
    const server = this.servers.get(id);
    if (server) {
      server.lastUsed = new Date();
    }
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server '${serverId}' not found`);
    }

    // Ensure server is running
    if (server.status !== 'ready') {
      await this.startServer(serverId);
    }

    if (!server.connection) {
      throw new Error(`Server '${serverId}' has no active connection`);
    }

    // Update usage timestamp
    this.updateServerUsage(serverId);

    // Call the tool
    try {
      const result = await server.connection.callTool(toolName, args);
      return result;
    } catch (error) {
      console.error(`Tool call failed on server ${serverId}:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Wait for a server to become ready
   */
  private async waitForServerReady(id: string, timeout: number = 30000): Promise<MCPServer> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const server = this.servers.get(id);
      if (!server) {
        throw new Error(`Server '${id}' not found`);
      }

      if (server.status === 'ready') {
        return server;
      }

      if (server.status === 'error') {
        throw new Error(`Server '${id}' failed to start: ${server.error}`);
      }

      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for server '${id}' to start`);
  }

  /**
   * Start health monitoring for idle timeout
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.checkIdleServers();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check for idle servers and stop them if needed
   */
  private checkIdleServers(): void {
    const now = new Date();
    
    for (const server of this.servers.values()) {
      if (server.status !== 'ready' || !server.config.idle_timeout) {
        continue;
      }

      // Parse idle timeout
      const timeoutMs = this.parseTimeout(server.config.idle_timeout);
      const idleTime = now.getTime() - server.lastUsed.getTime();

      if (idleTime > timeoutMs) {
        console.log(`Server ${server.id} idle for ${Math.round(idleTime / 1000)}s, stopping`);
        this.stopServer(server.id).catch(error => {
          console.error(`Failed to stop idle server ${server.id}:`, (error as Error).message);
        });
      }
    }
  }

  /**
   * Parse timeout string to milliseconds
   */
  private parseTimeout(timeout: string): number {
    const match = timeout.match(/^(\d+)([smh]?)$/);
    if (!match) {
      return 600000; // Default 10 minutes
    }

    const value = parseInt(match[1]);
    const unit = match[2] || 's';

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 3600 * 1000;
      default: return value * 1000;
    }
  }

  /**
   * Perform health check on a server
   */
  async healthCheck(id: string): Promise<boolean> {
    const server = this.servers.get(id);
    if (!server || server.status !== 'ready' || !server.connection) {
      return false;
    }

    try {
      if (server.config.health_check) {
        // Use configured health check tool
        await server.connection.callTool(server.config.health_check, {});
      } else {
        // Default health check - list tools
        await server.connection.listTools();
      }
      return true;
    } catch (error) {
      console.error(`Health check failed for server ${id}:`, (error as Error).message);
      server.status = 'error';
      server.error = (error as Error).message;
      return false;
    }
  }

  /**
   * Shutdown all servers and cleanup
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down all servers...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all servers
    const stopPromises = Array.from(this.servers.keys()).map(id => 
      this.stopServer(id).catch(error => 
        console.error(`Error stopping server ${id}:`, (error as Error).message)
      )
    );

    await Promise.all(stopPromises);
    this.servers.clear();
  }

  /**
   * Get server statistics
   */
  getStats() {
    const servers = Array.from(this.servers.values());
    const totalTools = servers.reduce((sum, server) => sum + server.tools.length, 0);

    return {
      total_servers: servers.length,
      running_servers: servers.filter(s => s.status === 'ready').length,
      starting_servers: servers.filter(s => s.status === 'starting').length,
      error_servers: servers.filter(s => s.status === 'error').length,
      total_tools: totalTools,
      uptime_seconds: Math.round((Date.now() - (this.healthCheckInterval ? Date.now() : 0)) / 1000)
    };
  }
}