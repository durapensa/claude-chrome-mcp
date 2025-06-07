#!/usr/bin/env node

/**
 * Universal MCP CLI - Main Entry Point
 * 
 * Phase 1: Basic daemon functionality with single server and tool execution.
 */

// Load centralized config early
import { CLI_CONFIG } from './config/defaults';
import chalk from 'chalk';
import { ConfigLoader } from './config/config-loader';
import { DaemonClient } from './cli/daemon-client';
import { YargsParser, ParsedArgs } from './cli/yargs-parser';
import { MCPCliConfig, ServerConfig, DaemonConfig, DefaultsConfig } from './types/config';

interface CLIOptions {
  json?: boolean;
  verbose?: boolean;
  timeout?: string;
  server?: string;
  config?: string;
  help?: boolean;
  version?: boolean;
}

class MCPCli {
  private config: MCPCliConfig;
  private servers: Record<string, ServerConfig>;
  private daemon: Required<DaemonConfig>;
  private defaults: Required<DefaultsConfig>;
  private client: DaemonClient;
  private options: CLIOptions = {};

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
    this.client = new DaemonClient(daemon.socket);
  }

  /**
   * Parse command line arguments using Yargs
   */
  async parseArgs(args: string[]): Promise<ParsedArgs> {
    const parsed = await YargsParser.parse(args);
    
    // Apply global options to instance
    this.options = {
      json: parsed.globalOptions.json,
      verbose: parsed.globalOptions.verbose,
      timeout: parsed.globalOptions.timeout,
      server: parsed.globalOptions.server,
      config: parsed.globalOptions.config,
      help: parsed.globalOptions.help,
      version: parsed.globalOptions.version
    };

    return parsed;
  }

  /**
   * Execute the CLI command
   */
  async run(args: string[]): Promise<void> {
    try {
      const parsed = await this.parseArgs(args);

      // Handle built-in commands
      switch (parsed.command) {
        case 'help':
          await this.showHelp();
          return;
        
        case 'version':
          this.showVersion();
          return;
        
        case 'daemon':
          await this.handleDaemonCommand(parsed.subcommand || 'status');
          return;
        
        case 'servers':
          await this.handleServersCommand();
          return;
        
        case 'tools':
          await this.handleToolsCommand();
          return;
        
        default:
          // Try to execute as a tool
          await this.executeTool(parsed.command, parsed.toolArgs);
      }

    } catch (error) {
      this.client.disconnect();
      if (this.options.verbose) {
        console.error(chalk.red('Error:'), (error as Error).stack);
      } else {
        console.error(chalk.red('Error:'), (error as Error).message);
      }
      process.exit(1);
    }
    
    // Ensure process exits cleanly
    process.exit(0);
  }

  /**
   * Show help information
   */
  private async showHelp(): Promise<void> {
    console.log(chalk.bold('Universal MCP CLI'));
    console.log('Dynamic CLI client for any MCP server\n');
    
    console.log(chalk.bold('Usage:'));
    console.log('  mcp [OPTIONS] COMMAND [ARGS]');
    console.log('  mcp [OPTIONS] [@SERVER:]TOOL [ARGS]\n');
    
    console.log(chalk.bold('Built-in Commands:'));
    console.log('  help                             Show this help');
    console.log('  version                          Show version');
    console.log('  daemon start|stop|restart|status Manage daemon');
    console.log('  servers                          List server status');
    console.log('  tools                            List available tools\n');
    
    console.log(chalk.bold('Global Options:'));
    console.log('  -h, --help              Show help');
    console.log('  -v, --version           Show version');
    console.log('  -j, --json              Output as JSON');
    console.log('  --verbose               Verbose output');
    console.log('  --timeout DURATION      Request timeout');
    console.log('  --server SERVER         Use specific server');
    console.log('  --config PATH           Config file path\n');

    try {
      // Try to connect to daemon and show available tools
      await this.client.connect();
      const toolsData = await this.client.listTools();
      
      if (toolsData.tools && toolsData.tools.length > 0) {
        console.log(chalk.bold('Available Tools:'));
        
        // Group by server
        const byServer = new Map<string, any[]>();
        for (const tool of toolsData.tools) {
          if (!byServer.has(tool.server_id)) {
            byServer.set(tool.server_id, []);
          }
          byServer.get(tool.server_id)!.push(tool);
        }
        
        for (const [serverId, tools] of byServer) {
          console.log(chalk.cyan(`  ${serverId}:`));
          for (const tool of tools) {
            console.log(`    ${tool.name} - ${tool.description}`);
          }
        }
      }
    } catch (error) {
      console.log(chalk.yellow('(Start daemon to see available tools)'));
    }
  }

  /**
   * Show version information
   */
  private showVersion(): void {
    console.log(`mcp-cli v${CLI_CONFIG.VERSION}`);
  }

  /**
   * Handle daemon commands
   */
  private async handleDaemonCommand(subcommand: string): Promise<void> {
    switch (subcommand) {
      case 'start':
        await this.startDaemon();
        break;
      
      case 'stop':
        await this.stopDaemon();
        break;
      
      case 'restart':
        await this.restartDaemon();
        break;
      
      case 'status':
        await this.showDaemonStatus();
        break;
      
      default:
        throw new Error(`Unknown daemon command: ${subcommand}`);
    }
  }

  /**
   * Start the daemon
   */
  private async startDaemon(): Promise<void> {
    // Check for existing daemon processes first
    const { spawn } = require('child_process');
    const existingProcesses = await new Promise<number>((resolve) => {
      const pgrep = spawn('pgrep', ['-f', 'node /Users/dp/claude-chrome-mcp/cli/dist/daemon/daemon.js'], {
        stdio: ['ignore', 'pipe', 'ignore']
      });
      
      let output = '';
      pgrep.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      pgrep.on('close', (code: number | null) => {
        // Count the number of lines (processes)
        const lines = output.trim().split('\n').filter(line => line.trim());
        resolve(code === 0 ? lines.length : 0);
      });
    });

    if (existingProcesses > 0) {
      console.log(chalk.yellow(`Found ${existingProcesses} existing daemon process(es), cleaning up first...`));
      await this.stopDaemon();
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (DaemonClient.isDaemonRunning(this.daemon.socket)) {
      console.log(chalk.yellow('Daemon is already running'));
      return;
    }

    console.log('Starting daemon...');
    try {
      await DaemonClient.spawnDetachedDaemon(this.options.config);
      
      // Wait for daemon to start
      let attempts = 0;
      const maxAttempts = 10; // 5 seconds max
      
      while (attempts < maxAttempts && !DaemonClient.isDaemonRunning(this.daemon.socket)) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      if (DaemonClient.isDaemonRunning(this.daemon.socket)) {
        console.log(chalk.green('Daemon started successfully'));
      } else {
        console.log(chalk.red('Daemon failed to start (socket not found)'));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Failed to start daemon:'), (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Stop the daemon
   */
  private async stopDaemon(): Promise<void> {
    if (!DaemonClient.isDaemonRunning(this.daemon.socket)) {
      console.log(chalk.yellow('Daemon is not running'));
      return;
    }

    try {
      // Try graceful shutdown first
      await this.client.connect();
      await this.client.shutdown();
      console.log(chalk.green('Daemon stopped successfully'));
    } catch (error) {
      console.warn(chalk.yellow('Graceful shutdown failed, using force kill...'));
      
      // Force kill all daemon processes as fallback
      const { spawn } = require('child_process');
      try {
        await new Promise<void>((resolve, reject) => {
          const killProcess = spawn('pkill', ['-f', 'node /Users/dp/claude-chrome-mcp/cli/dist/daemon/daemon.js'], {
            stdio: 'ignore'
          });
          
          killProcess.on('close', (code: number | null) => {
            // pkill exits with 1 if no processes found, which is fine
            if (code === 0 || code === 1) {
              resolve();
            } else {
              reject(new Error(`pkill failed with code ${code}`));
            }
          });
          
          killProcess.on('error', reject);
        });
        
        console.log(chalk.green('Daemon processes killed successfully'));
      } catch (killError) {
        console.error(chalk.red('Failed to kill daemon processes:'), (killError as Error).message);
      }
    }
  }

  /**
   * Restart the daemon (stop then start)
   */
  private async restartDaemon(): Promise<void> {
    console.log('Restarting daemon...');
    await this.stopDaemon();
    await this.startDaemon();
  }

  /**
   * Show daemon status
   */
  private async showDaemonStatus(): Promise<void> {
    if (!DaemonClient.isDaemonRunning(this.daemon.socket)) {
      console.log(chalk.yellow('Daemon is not running'));
      return;
    }

    try {
      await this.client.connect();
      const status = await this.client.getServerStatus();
      
      if (this.options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log(chalk.bold('Daemon Status:'));
        console.log(`  Running: ${chalk.green('Yes')}`);
        console.log(`  Servers: ${status.stats.running_servers}/${status.stats.total_servers}`);
        console.log(`  Tools: ${status.stats.total_tools}`);
        
        // Show MCP server processes if any are running
        if (status.servers && status.servers.length > 0) {
          console.log(chalk.bold('\nMCP Servers:'));
          for (const server of status.servers) {
            const statusColor = 
              server.status === 'ready' ? chalk.green :
              server.status === 'error' ? chalk.red :
              server.status === 'starting' ? chalk.yellow :
              chalk.gray;
            
            const pid = server.process && server.process.pid ? 
              ` (PID: ${server.process.pid})` : '';
            
            console.log(`  ${chalk.cyan(server.id)}: ${statusColor(server.status)}${pid}`);
            
            if (server.error) {
              console.log(`    Error: ${chalk.red(server.error)}`);
            }
            if (server.tools && server.tools.length > 0) {
              console.log(`    Tools: ${server.tools.length}`);
            }
          }
        }
      }
      
      // Disconnect to allow process to exit cleanly
      this.client.disconnect();
    } catch (error) {
      console.error(chalk.red('Failed to get daemon status:'), (error as Error).message);
      this.client.disconnect();
    }
  }

  /**
   * Handle servers command
   */
  private async handleServersCommand(): Promise<void> {
    await this.ensureDaemonRunning();
    await this.client.connect();

    const status = await this.client.getServerStatus();
    
    if (this.options.json) {
      console.log(JSON.stringify(status, null, 2));
      this.client.disconnect();
      return;
    }

    console.log(chalk.bold('Server Status:'));
    for (const server of status.servers as any[]) {
      const statusColor = server.status === 'ready' ? chalk.green : 
                         server.status === 'error' ? chalk.red : 
                         chalk.yellow;
      
      console.log(`  ${chalk.cyan(server.id)}: ${statusColor(server.status)}`);
      if (server.tools) {
        console.log(`    Tools: ${server.tools.length}`);
      }
      if (server.error) {
        console.log(`    Error: ${chalk.red(server.error)}`);
      }
    }
    
    this.client.disconnect();
  }

  /**
   * Handle tools command
   */
  private async handleToolsCommand(): Promise<void> {
    await this.ensureDaemonRunning();
    await this.client.connect();
    
    const toolsData = await this.client.listTools();
    
    if (this.options.json) {
      console.log(JSON.stringify(toolsData, null, 2));
      this.client.disconnect();
      return;
    }

    console.log(chalk.bold('Available Tools:'));
    
    if (toolsData.tools.length === 0) {
      console.log(chalk.yellow('No tools available'));
      this.client.disconnect();
      return;
    }

    // Group by server
    const byServer = new Map<string, any[]>();
    for (const tool of toolsData.tools) {
      if (!byServer.has(tool.server_id)) {
        byServer.set(tool.server_id, []);
      }
      byServer.get(tool.server_id)!.push(tool);
    }
    
    for (const [serverId, tools] of byServer) {
      console.log(`\n${chalk.cyan(serverId)}:`);
      for (const tool of tools) {
        const collision = toolsData.collisions[tool.name] ? ' ⚠️' : '';
        console.log(`  ${tool.name}${collision} - ${tool.description}`);
      }
    }

    if (Object.keys(toolsData.collisions).length > 0) {
      console.log(chalk.yellow('\nTool name collisions:'));
      for (const [toolName, servers] of Object.entries(toolsData.collisions)) {
        console.log(`  ${toolName}: ${(servers as string[]).join(', ')}`);
      }
    }
    
    this.client.disconnect();
  }

  /**
   * Execute a tool
   */
  private async executeTool(toolName: string, args: Record<string, any>): Promise<void> {
    await this.ensureDaemonRunning();
    await this.client.connect();

    // Parse server prefix if present
    let serverId: string | undefined;
    let actualToolName = toolName;

    if (toolName.startsWith('@')) {
      const match = toolName.match(/^@([^:]+):?(.*)$/);
      if (match) {
        serverId = match[1];
        actualToolName = match[2] || actualToolName;
      }
    }

    if (this.options.server) {
      serverId = this.options.server;
    }

    // Map positional arguments to tool schema if available
    const mappedArgs = await this.mapToolArguments(actualToolName, args, serverId);

    try {
      const result = await this.client.callTool(
        actualToolName,
        mappedArgs,
        serverId,
        this.options.verbose ? (progress) => {
          console.log(chalk.gray(`[${progress.step}/${progress.total}] ${progress.message}`));
        } : undefined
      );

      if (this.options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Format result for human reading
        if (result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            if (item.type === 'text' && item.text) {
              console.log(item.text);
            }
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      }

      this.client.disconnect();

    } catch (error) {
      this.client.disconnect();
      throw new Error(`Tool execution failed: ${(error as Error).message}`);
    }
  }

  /**
   * Map tool arguments using schema information
   */
  private async mapToolArguments(toolName: string, args: Record<string, any>, serverId?: string): Promise<Record<string, any>> {
    // If args already has proper key-value pairs, return as-is
    if (!args.args || args.args.length === 0) {
      const { args: _, ...otherArgs } = args;
      return await this.convertArgTypes(otherArgs, undefined, toolName, serverId);
    }

    try {
      // Get tool schema from daemon
      const toolsData = await this.client.listTools(serverId);
      const tool = toolsData.tools.find((t: any) => t.name === toolName);
      
      if (tool?.schema?.properties) {
        const schema = tool.schema;
        const properties = Object.keys(schema.properties);
        const required = schema.required || [];
        const positionalArgs = args.args as string[];
        const mappedArgs: Record<string, any> = {};

        // Copy any existing named arguments
        const { args: _, ...namedArgs } = args;
        Object.assign(mappedArgs, namedArgs);

        // Map positional arguments to schema properties
        for (let i = 0; i < positionalArgs.length && i < properties.length; i++) {
          const propName = properties[i];
          if (!mappedArgs.hasOwnProperty(propName)) {
            mappedArgs[propName] = this.convertValueBySchema(positionalArgs[i], schema.properties[propName]);
          }
        }

        return await this.convertArgTypes(mappedArgs, schema, toolName, serverId);
      }
    } catch (error) {
      // If schema lookup fails, fall back to positional mapping
      if (this.options.verbose) {
        console.warn(chalk.yellow('Warning: Could not load tool schema, using positional arguments'));
      }
    }

    // Fallback: simple positional mapping
    const { args: positionalArgs, ...namedArgs } = args;
    if (positionalArgs && positionalArgs.length > 0) {
      // For tools like list_directory that expect a "path" parameter
      if (positionalArgs.length === 1) {
        return await this.convertArgTypes({ path: positionalArgs[0], ...namedArgs }, undefined, toolName, serverId);
      }
    }

    return await this.convertArgTypes(namedArgs, undefined, toolName, serverId);
  }

  /**
   * Convert argument types based on schema
   */
  private async convertArgTypes(args: Record<string, any>, schema?: any, toolName?: string, serverId?: string): Promise<Record<string, any>> {
    const converted: Record<string, any> = {};
    
    // If no schema provided but we have a tool name, try to get schema
    if (!schema && toolName) {
      try {
        const toolsData = await this.client.listTools(serverId);
        const tool = toolsData.tools.find((t: any) => t.name === toolName);
        schema = tool?.schema;
      } catch (error) {
        // Ignore schema lookup errors
      }
    }
    
    for (const [key, value] of Object.entries(args)) {
      if (schema?.properties?.[key]) {
        converted[key] = this.convertValueBySchema(value, schema.properties[key]);
      } else {
        // Values should already be converted by yargs parser
        converted[key] = value;
      }
    }
    
    return converted;
  }

  /**
   * Convert a value based on schema type
   */
  private convertValueBySchema(value: any, propSchema: any): any {
    if (propSchema?.type === 'boolean' && typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === 'yes' || lower === 'on' || lower === '1') {
        return true;
      }
      if (lower === 'false' || lower === 'no' || lower === 'off' || lower === '0') {
        return false;
      }
    }
    
    if (propSchema?.type === 'number' && typeof value === 'string') {
      const num = Number(value);
      if (!isNaN(num)) {
        return num;
      }
    }
    
    return value;
  }

  /**
   * Ensure daemon is running
   */
  private async ensureDaemonRunning(): Promise<void> {
    if (!DaemonClient.isDaemonRunning(this.daemon.socket)) {
      if (this.options.verbose) {
        console.log('Auto-starting daemon...');
      }
      await DaemonClient.ensureDaemonRunning(this.daemon.socket, this.options.config);
    }
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  try {
    // Load configuration
    const configPath = args.find((arg, i) => args[i - 1] === '--config');
    const { config, servers, daemon, defaults } = await ConfigLoader.load(configPath);
    
    // Create and run CLI
    const cli = new MCPCli(config, servers, daemon, defaults);
    await cli.run(args);
    
  } catch (error) {
    console.error(chalk.red('Error:'), (error as Error).message);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled rejection:'), error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught exception:'), error);
  process.exit(1);
});

// Run if this file is executed directly
if (require.main === module) {
  main();
}