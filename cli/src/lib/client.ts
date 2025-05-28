import { spawn } from 'child_process';
import chalk from 'chalk';
import path from 'path';

export interface ClaudeTab {
  id: number;
  url: string;
  title: string;
  active: boolean;
  debuggerAttached: boolean;
}

export interface MessageResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class CCMClient {
  private mcpProcess: any = null;
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();

  constructor(
    private serverUrl: string = 'ws://localhost:54322', // This parameter is now ignored but kept for compatibility
    private verbose: boolean = false
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.verbose) {
        console.log(chalk.gray('Starting MCP server...'));
      }

      // Find the MCP server script path
      const serverPath = path.resolve(__dirname, '../../../mcp-server/src/server.js');
      
      // Spawn the MCP server as a child process
      this.mcpProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
        env: { 
          ...process.env,
          CCM_CLIENT_TYPE: 'cli',
          CCM_CLIENT_NAME: 'CCM CLI'
        }
      });

      let connected = false;
      const connectionTimeout = setTimeout(() => {
        if (!connected) {
          this.mcpProcess?.kill();
          reject(new Error('MCP server startup timeout'));
        }
      }, 10000);

      // Wait for the server to be ready
      this.mcpProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        if (this.verbose) {
          console.log(chalk.gray('MCP Server:'), output.trim());
        }
        
        // Look for server ready signal
        if (output.includes('MCP server started') && !connected) {
          connected = true;
          clearTimeout(connectionTimeout);
          if (this.verbose) {
            console.log(chalk.green('Connected to MCP server'));
          }
          resolve();
        }
      });

      this.mcpProcess.stdout.on('data', (data: Buffer) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.trim()) {
              const message = JSON.parse(line);
              this.handleMessage(message);
            }
          }
        } catch (error) {
          // Ignore JSON parse errors for non-JSON output
        }
      });

      this.mcpProcess.on('error', (error: Error) => {
        clearTimeout(connectionTimeout);
        reject(new Error(`Failed to start MCP server: ${error.message}`));
      });

      this.mcpProcess.on('exit', (code: number) => {
        if (this.verbose) {
          console.log(chalk.yellow(`MCP server exited with code ${code}`));
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    // Clear pending requests
    for (const [requestId, { reject, timeout }] of this.pendingRequests) {
      clearTimeout(timeout);
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }
  }

  private handleMessage(message: any): void {
    if (this.verbose) {
      console.log(chalk.gray('Received message:'), JSON.stringify(message, null, 2));
    }

    // Handle MCP responses - look for the result field
    if (message.result && message.id) {
      const result = message.result;
      
      // If result has content array, extract the text
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (textContent) {
          try {
            const parsedResult = JSON.parse(textContent.text);
            this.resolveRequest(parsedResult, message.id);
          } catch (error) {
            // Handle plain text responses
            this.resolveRequest({ text: textContent.text }, message.id);
          }
        }
      } else {
        // Direct result
        this.resolveRequest(result, message.id);
      }
    } else if (message.error && message.id) {
      this.rejectRequest(message.error, message.id);
    }
  }

  private resolveRequest(result: any, requestId: string): void {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(requestId);
      pendingRequest.resolve(result);
    }
  }

  private rejectRequest(error: any, requestId: string): void {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(requestId);
      pendingRequest.reject(new Error(error.message || error.toString()));
    }
  }

  private async sendMCPToolCall(toolName: string, args: any = {}, timeout: number = 10000): Promise<any> {
    if (!this.mcpProcess) {
      throw new Error('MCP process not initialized');
    }

    const requestId = `req_${++this.requestId}`;
    
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${toolName}`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutHandle });

      const mcpRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      if (this.verbose) {
        console.log(chalk.gray('Sending MCP request:'), JSON.stringify(mcpRequest, null, 2));
      }

      this.mcpProcess.stdin.write(JSON.stringify(mcpRequest) + '\n');
    });
  }

  // Public API methods using MCP tools
  
  async getClaudeSessions(): Promise<ClaudeTab[]> {
    return await this.sendMCPToolCall('get_claude_sessions');
  }

  async spawnClaudeTab(url: string = 'https://claude.ai'): Promise<{ id: number; url: string; title: string }> {
    return await this.sendMCPToolCall('spawn_claude_tab', { url });
  }

  async attachDebugger(tabId: number): Promise<{ attached: boolean }> {
    return await this.sendMCPToolCall('debug_attach', { tabId });
  }

  async detachDebugger(tabId: number): Promise<{ detached: boolean }> {
    // Note: There's no detach tool in the new MCP server, so we'll simulate it
    return { detached: true };
  }

  async executeScript(tabId: number, script: string): Promise<any> {
    return await this.sendMCPToolCall('execute_script', { tabId, script });
  }

  async sendMessage(tabId: number, message: string): Promise<MessageResponse> {
    return await this.sendMCPToolCall('send_message_to_claude', { tabId, message });
  }

  async getLatestResponse(tabId: number): Promise<any> {
    return await this.sendMCPToolCall('get_claude_response', { tabId });
  }

  async getDOMElements(tabId: number, selector: string): Promise<any[]> {
    return await this.sendMCPToolCall('get_dom_elements', { tabId, selector });
  }
}