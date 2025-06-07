/**
 * Universal MCP CLI - Daemon Client
 * 
 * Client for communicating with the MCP daemon over Unix domain socket.
 */

import * as net from 'net';
import * as fs from 'fs';
import { DaemonRequest, DaemonResponse } from '../types/daemon';

export class DaemonClient {
  private socket: net.Socket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string, {
    resolve: (response: DaemonResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(private socketPath: string) {}

  /**
   * Connect to the daemon
   */
  async connect(): Promise<void> {
    if (this.socket) {
      return; // Already connected
    }

    // Check if daemon is running
    if (!fs.existsSync(this.socketPath)) {
      throw new Error('Daemon is not running. Socket file not found.');
    }

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);

      let buffer = '';
      this.socket.on('data', (data) => {
        buffer += data.toString();
        
        // Process complete JSON responses
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: DaemonResponse = JSON.parse(line);
              this.handleResponse(response);
            } catch (error) {
              console.error('Invalid JSON from daemon:', line);
            }
          }
        }
      });

      this.socket.on('connect', () => {
        resolve();
      });

      this.socket.on('error', (error) => {
        reject(new Error(`Failed to connect to daemon: ${error.message}`));
      });

      this.socket.on('close', () => {
        this.socket = null;
        // Reject all pending requests
        for (const [requestId, { reject, timeout }] of this.pendingRequests) {
          clearTimeout(timeout);
          reject(new Error('Connection to daemon lost'));
        }
        this.pendingRequests.clear();
      });
    });
  }

  /**
   * Disconnect from the daemon
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * Send request to daemon and wait for response
   */
  async sendRequest(request: Omit<DaemonRequest, 'request_id'>, timeout: number = 5000): Promise<DaemonResponse> {
    if (!this.socket) {
      throw new Error('Not connected to daemon');
    }

    const requestId = `req_${++this.requestId}`;
    const fullRequest: DaemonRequest = {
      ...request,
      request_id: requestId
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms: ${request.type}`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutHandle });

      try {
        const message = JSON.stringify(fullRequest) + '\n';
        if (this.socket) {
          this.socket.write(message);
        } else {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(requestId);
          reject(new Error('Socket disconnected while sending'));
        }
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(requestId);
        reject(new Error(`Failed to send request: ${(error as Error).message}`));
      }
    });
  }

  /**
   * Send request with progress tracking
   */
  async sendRequestWithProgress(
    request: Omit<DaemonRequest, 'request_id'>,
    onProgress?: (progress: { message: string; step: number; total: number }) => void,
    timeout: number = 30000
  ): Promise<any> {
    if (!this.socket) {
      throw new Error('Not connected to daemon');
    }

    const requestId = `req_${++this.requestId}`;
    const fullRequest: DaemonRequest = {
      ...request,
      request_id: requestId
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${request.type}`));
      }, timeout);

      const handler = {
        resolve: (response: DaemonResponse) => {
          if (response.status === 'success') {
            clearTimeout(timeoutHandle);
            this.pendingRequests.delete(requestId);
            resolve(response.data);
          } else if (response.status === 'progress' && onProgress && response.progress) {
            onProgress(response.progress);
          } else if (response.status === 'error') {
            clearTimeout(timeoutHandle);
            this.pendingRequests.delete(requestId);
            reject(new Error(response.error || 'Unknown error'));
          }
        },
        reject,
        timeout: timeoutHandle
      };

      this.pendingRequests.set(requestId, handler);

      const message = JSON.stringify(fullRequest) + '\n';
      this.socket!.write(message);
    });
  }

  /**
   * Handle response from daemon
   */
  private handleResponse(response: DaemonResponse): void {
    const pending = this.pendingRequests.get(response.request_id);
    if (pending) {
      pending.resolve(response);
    }
  }

  /**
   * Call a tool
   */
  async callTool(
    toolName: string, 
    args: Record<string, any> = {},
    serverId?: string,
    onProgress?: (progress: { message: string; step: number; total: number }) => void
  ): Promise<any> {
    return this.sendRequestWithProgress({
      type: 'tool_call',
      server_id: serverId,
      tool_name: toolName,
      args
    }, onProgress);
  }

  /**
   * List available tools
   */
  async listTools(serverId?: string): Promise<any> {
    const response = await this.sendRequest({
      type: 'list_tools',
      server_id: serverId
    });
    
    if (response.status === 'success') {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to list tools');
    }
  }

  /**
   * Get server status
   */
  async getServerStatus(serverId?: string): Promise<any> {
    const response = await this.sendRequest({
      type: 'server_status',
      server_id: serverId
    });
    
    if (response.status === 'success') {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to get server status');
    }
  }

  /**
   * Get daemon status
   */
  async getDaemonStatus(): Promise<any> {
    const response = await this.sendRequest({
      type: 'daemon_status'
    });
    
    if (response.status === 'success') {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to get daemon status');
    }
  }

  /**
   * Start a server
   */
  async startServer(serverId: string): Promise<any> {
    return this.sendRequestWithProgress({
      type: 'start_server',
      server_id: serverId
    });
  }

  /**
   * Stop a server
   */
  async stopServer(serverId: string): Promise<any> {
    const response = await this.sendRequest({
      type: 'stop_server',
      server_id: serverId
    });
    
    if (response.status === 'success') {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to stop server');
    }
  }

  /**
   * Shutdown the daemon
   */
  async shutdown(): Promise<void> {
    const response = await this.sendRequest({
      type: 'shutdown'
    });
    
    if (response.status !== 'success') {
      throw new Error(response.error || 'Failed to shutdown daemon');
    }
  }

  /**
   * Check if daemon is running
   */
  static isDaemonRunning(socketPath: string): boolean {
    return fs.existsSync(socketPath);
  }

  /**
   * Auto-start daemon if not running
   */
  static async ensureDaemonRunning(socketPath: string, configPath?: string): Promise<void> {
    if (DaemonClient.isDaemonRunning(socketPath)) {
      return;
    }

    console.log('Starting MCP daemon...');

    try {
      await DaemonClient.spawnDetachedDaemon(configPath);
      
      // Wait for daemon to start and create socket
      let attempts = 0;
      const maxAttempts = 20; // 10 seconds max
      
      while (attempts < maxAttempts && !DaemonClient.isDaemonRunning(socketPath)) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      if (!DaemonClient.isDaemonRunning(socketPath)) {
        throw new Error('Daemon started but socket not found after 10 seconds');
      }
    } catch (error) {
      throw new Error(`Failed to start daemon: ${(error as Error).message}`);
    }
  }

  /**
   * Spawn daemon as detached background process
   */
  static async spawnDetachedDaemon(configPath?: string): Promise<void> {
    const { spawn } = await import('child_process');
    const path = await import('path');
    const fs = await import('fs');
    
    // Path to the daemon script - try compiled version first, then source
    let daemonScript = path.resolve(__dirname, '../daemon/daemon.js');
    
    if (!fs.existsSync(daemonScript)) {
      // Try development path (when running with ts-node)
      daemonScript = path.resolve(__dirname, '../../dist/daemon/daemon.js');
    }
    
    if (!fs.existsSync(daemonScript)) {
      throw new Error(`Daemon script not found. Tried: ${path.resolve(__dirname, '../daemon/daemon.js')} and ${path.resolve(__dirname, '../../dist/daemon/daemon.js')}`);
    }
    
    // Spawn detached daemon process
    const args = configPath ? [daemonScript, configPath] : [daemonScript];
    
    console.log(`Spawning daemon: node ${args.join(' ')}`);
    
    const daemonProcess = spawn('node', args, {
      detached: true,    // Run in background  
      stdio: ['ignore', 'ignore', 'ignore'], // Don't inherit stdio - completely detached
      cwd: process.cwd()
    });

    // Unref so parent process can exit
    daemonProcess.unref();
    
    // Check if the process started successfully
    await new Promise((resolve, reject) => {
      daemonProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn daemon: ${error.message}`));
      });
      
      // If no error after 500ms, assume it started successfully
      setTimeout(() => {
        resolve(undefined);
      }, 500);
    });
  }
}