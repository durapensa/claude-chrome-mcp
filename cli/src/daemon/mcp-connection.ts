/**
 * Universal MCP CLI - MCP Connection
 * 
 * Handles stdio communication with MCP servers using the MCP protocol.
 */

import { ChildProcess, spawn } from 'child_process';
import { MCPRequest, MCPResponse, MCPTool, MCPToolCallResponse, MCPConnection } from '../types/mcp';
import { ServerConfig } from '../types/config';
import { CLI_CONFIG } from '../config/defaults';
import { 
  setupProcessErrorHandlers,
  withTimeoutWrapper,
  safeJsonParse,
  parseJsonWithContext,
  RequestManager
} from '../utils/error-handler';

export class StdioMCPConnection implements MCPConnection {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private requestManager = new RequestManager<MCPRequest, MCPResponse>(30000);
  private isInitialized = false;
  private tools: MCPTool[] = [];

  constructor(
    private serverId: string,
    private config: ServerConfig
  ) {}

  /**
   * Start the MCP server process and initialize the connection
   */
  async connect(): Promise<void> {
    if (this.process) {
      throw new Error(`Server ${this.serverId} is already running`);
    }

    return new Promise((resolve, reject) => {
      // Spawn the MCP server process
      console.log(`Starting MCP server ${this.serverId}: ${this.config.command.join(' ')}`);
      this.process = spawn(this.config.command[0], this.config.command.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.config.cwd,
        env: {
          ...process.env,
          ...this.config.env,
          // Let claude-chrome-mcp connect to existing extension hub
          CCM_CLIENT_TYPE: 'mcp-cli',
          CCM_CLIENT_NAME: 'MCP CLI'
        }
      });

      if (!this.process || !this.process.stdout || !this.process.stdin) {
        reject(new Error(`Failed to spawn server ${this.serverId}`));
        return;
      }

      console.log(`Server ${this.serverId} process started with PID: ${this.process.pid}`);

      // Set up JSON-RPC communication
      let buffer = '';
      this.process.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();
        
        // Process complete JSON-RPC messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line
        
        for (const line of lines) {
          if (line.trim()) {
            console.log(`Server ${this.serverId} stdout:`, line.trim());
            const message = safeJsonParse(line, `Server ${this.serverId} JSON parse`);
            if (message) {
              this.handleMessage(message);
            }
          }
        }
      });

      // Set up comprehensive process error handlers
      setupProcessErrorHandlers(
        this.process,
        {
          onError: (error) => {
            reject(new Error(`Server ${this.serverId} process error: ${error.message}`));
          },
          onExit: (code, signal) => {
            console.log(`Server ${this.serverId} exited with code ${code}, signal ${signal}`);
            this.cleanup();
          },
          onStderr: (data) => {
            const message = data.toString().trim();
            if (message) {
              console.error(`Server ${this.serverId} stderr:`, message);
            }
          }
        },
        `Server ${this.serverId}`
      );

      // Initialize immediately - MCP server should respond when ready
      this.initialize()
        .then(() => {
          resolve(); // isInitialized is set inside initialize()
        })
        .catch(reject);
    });
  }


  /**
   * Initialize MCP session with handshake
   */
  private async initialize(): Promise<void> {
    console.log(`Initializing MCP session for server ${this.serverId}...`);
    
    // Send initialize request
    const initResponse = await this.sendRequest({
      jsonrpc: '2.0',
      id: `init_${++this.requestId}`,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: 'mcp-cli',
          version: CLI_CONFIG.VERSION
        }
      }
    });

    if (initResponse.error) {
      console.error(`Server ${this.serverId} initialization failed:`, initResponse.error);
      throw new Error(`Initialization failed: ${initResponse.error.message}`);
    }

    console.log(`Server ${this.serverId} initialized successfully:`, initResponse.result?.serverInfo);

    // Mark as initialized before discovering tools
    this.isInitialized = true;

    // Discover available tools
    console.log(`Discovering tools for server ${this.serverId}...`);
    this.tools = await this.listTools();
    console.log(`Server ${this.serverId} discovered ${this.tools.length} tools`);
  }

  /**
   * Send MCP request and wait for response
   */
  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    if (!this.process || !this.process.stdin) {
      throw new Error(`Server ${this.serverId} is not running`);
    }

    return new Promise((resolve, reject) => {
      const requestId = request.id.toString();
      console.log(`Server ${this.serverId}: Creating request ${requestId} for ${request.method}`);
      
      // Use RequestManager for consistent timeout handling
      this.requestManager.registerRequest(
        requestId,
        resolve,
        reject,
        `Server ${this.serverId} ${request.method}`,
        30000
      );
      
      console.log(`Server ${this.serverId}: Added request ${requestId} to pending queue (${this.requestManager.getPendingCount()} total)`);

      // Send the request
      const message = JSON.stringify(request) + '\n';
      console.log(`Sending to server ${this.serverId}:`, JSON.stringify(request));
      this.process!.stdin!.write(message);
    });
  }

  /**
   * Handle incoming messages from the MCP server
   */
  private handleMessage(message: any): void {
    console.log(`Server ${this.serverId}: Handling message:`, JSON.stringify(message));
    
    if (message.id && this.requestManager.resolveRequest(message.id.toString(), message)) {
      // This is a response to our request - RequestManager handled it
      console.log(`Server ${this.serverId}: Resolved request ${message.id}, ${this.requestManager.getPendingCount()} requests remaining`);
    } else if (message.method) {
      // This is a notification or request from the server
      console.log(`Server ${this.serverId} notification:`, message.method);
    } else {
      console.warn(`Server ${this.serverId}: Unhandled message:`, message);
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    console.log(`Server ${this.serverId}: Starting listTools() - initialized: ${this.isInitialized}, cached tools: ${this.tools.length}`);
    
    if (this.tools.length > 0) {
      console.log(`Server ${this.serverId}: Returning cached tools (${this.tools.length})`);
      return this.tools;
    }

    console.log(`Server ${this.serverId}: Sending tools/list request...`);
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: `list_tools_${++this.requestId}`,
      method: 'tools/list'
    });

    console.log(`Server ${this.serverId}: Received tools/list response:`, response);

    if (response.error) {
      console.error(`Server ${this.serverId}: tools/list error:`, response.error);
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    const tools = response.result?.tools || [];
    console.log(`Server ${this.serverId}: Extracted ${tools.length} tools from response`);
    this.tools = tools;
    return tools;
  }

  /**
   * Call a specific tool
   */
  async callTool(name: string, args: Record<string, any>): Promise<MCPToolCallResponse> {
    if (!this.isInitialized) {
      throw new Error(`Server ${this.serverId} is not initialized`);
    }

    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: `call_tool_${++this.requestId}`,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    });

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }

  /**
   * Close the connection and cleanup
   */
  async close(): Promise<void> {
    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Use RequestManager for consistent cleanup
    this.requestManager.cleanup(new Error('Connection closed'));

    // Kill the process if it's still running
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.isInitialized = false;
    this.tools = [];
  }

  /**
   * Get server information
   */
  getServerInfo() {
    return {
      id: this.serverId,
      config: this.config,
      isRunning: !!this.process,
      isInitialized: this.isInitialized,
      toolCount: this.tools.length,
      pid: this.process?.pid
    };
  }

  /**
   * Get list of available tools
   */
  getTools(): MCPTool[] {
    return [...this.tools];
  }
}