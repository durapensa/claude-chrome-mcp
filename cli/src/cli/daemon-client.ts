/**
 * Universal MCP CLI - Daemon Client
 * 
 * Client for communicating with the MCP daemon over Unix domain socket.
 */

import * as net from 'net';
import * as fs from 'fs';
import { DaemonRequest, DaemonResponse } from '../types/daemon';
import { 
  setupSocketErrorHandlers,
  safeJsonParse,
  RequestManager,
  withFileSystemError,
  withErrorHandling
} from '../utils/error-handler';

export class DaemonClient {
  private socket: net.Socket | null = null;
  private requestId = 0;
  private requestManager = new RequestManager<DaemonRequest, DaemonResponse>(5000);
  private progressCallbacks = new Map<string, (progress: { message: string; step: number; total: number }) => void>();

  constructor(private socketPath: string) {}

  /**
   * Connect to the daemon
   */
  async connect(): Promise<void> {
    if (this.socket) {
      return; // Already connected
    }

    // Check if daemon is running
    const safeExists = withFileSystemError(fs.existsSync, 'Check daemon socket', this.socketPath);
    if (!safeExists(this.socketPath)) {
      throw new Error('Daemon is not running. Socket file not found.');
    }

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);

      let buffer = '';
      
      // Set up comprehensive socket error handling
      setupSocketErrorHandlers(
        this.socket,
        {
          onError: (error) => {
            reject(new Error(`Failed to connect to daemon: ${error.message}`));
          },
          onClose: () => {
            this.socket = null;
            // Use RequestManager for consistent cleanup
            this.requestManager.cleanup(new Error('Connection to daemon lost'));
            // Clear progress callbacks
            this.progressCallbacks.clear();
          },
          onData: (data) => {
            buffer += data.toString();
            
            // Process complete JSON responses
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.trim()) {
                const response = safeJsonParse<DaemonResponse>(line, 'Daemon response');
                if (response) {
                  this.handleResponse(response);
                }
              }
            }
          }
        },
        'Daemon client socket'
      );

      this.socket.on('connect', () => {
        resolve();
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
    this.progressCallbacks.clear();
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
      // Use RequestManager for consistent timeout handling
      this.requestManager.registerRequest(
        requestId,
        resolve,
        reject,
        `Daemon ${request.type}`,
        timeout
      );

      try {
        const message = JSON.stringify(fullRequest) + '\n';
        if (this.socket) {
          this.socket.write(message);
        } else {
          this.requestManager.rejectRequest(requestId, new Error('Socket disconnected while sending'));
        }
      } catch (error) {
        this.requestManager.rejectRequest(requestId, new Error(`Failed to send request: ${(error as Error).message}`));
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
      // Store progress callback for this request
      if (onProgress) {
        this.progressCallbacks.set(requestId, onProgress);
      }

      // Standard resolver that handles final responses only
      const resolver = (response: DaemonResponse) => {
        if (response.status === 'success') {
          this.progressCallbacks.delete(requestId);
          resolve(response.data);
        } else if (response.status === 'error') {
          this.progressCallbacks.delete(requestId);
          reject(new Error(response.error || 'Unknown error'));
        }
        // Progress responses are handled in handleResponse before calling resolver
      };

      this.requestManager.registerRequest(
        requestId,
        resolver,
        reject,
        `Daemon ${request.type} with progress`,
        timeout
      );

      const message = JSON.stringify(fullRequest) + '\n';
      this.socket!.write(message);
    });
  }

  /**
   * Handle response from daemon
   */
  private handleResponse(response: DaemonResponse): void {
    // Handle progress responses without consuming the request
    if (response.status === 'progress' && response.progress) {
      const progressCallback = this.progressCallbacks.get(response.request_id);
      if (progressCallback) {
        progressCallback(response.progress);
      }
      // Don't call resolveRequest for progress - keep waiting for final response
      return;
    }

    // Handle final responses (success/error)
    this.requestManager.resolveRequest(response.request_id, response);
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
    const safeExists = withFileSystemError(fs.existsSync, 'Check daemon running', socketPath);
    return safeExists(socketPath);
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
    const safeExists = withFileSystemError(fs.existsSync, 'Check daemon script exists');
    let daemonScript = path.resolve(__dirname, '../daemon/daemon.js');
    
    if (!safeExists(daemonScript)) {
      // Try development path (when running with ts-node)
      daemonScript = path.resolve(__dirname, '../../dist/daemon/daemon.js');
    }
    
    if (!safeExists(daemonScript)) {
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