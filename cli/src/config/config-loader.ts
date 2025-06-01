/**
 * Universal MCP CLI - Configuration Loader
 * 
 * Handles loading, validation, and merging of MCP CLI configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  MCPCliConfig, 
  ServerConfig,
  ClaudeDesktopServerConfig,
  DEFAULT_DAEMON_CONFIG, 
  DEFAULT_DEFAULTS_CONFIG,
  DEFAULT_SERVER_EXTENSIONS
} from '../types/config';

export class ConfigLoader {
  private static readonly CONFIG_PATHS = [
    '~/.config/mcp/config.json',
    '~/.mcp-cli/config.json',
    './mcp-config.json'
  ];

  /**
   * Load configuration from file with fallbacks and validation
   */
  static async load(configPath?: string): Promise<{ 
    config: MCPCliConfig; 
    servers: Record<string, ServerConfig>;
    daemon: Required<typeof DEFAULT_DAEMON_CONFIG>;
    defaults: Required<typeof DEFAULT_DEFAULTS_CONFIG>;
  }> {
    const rawConfig = await this.loadConfigFile(configPath);
    return this.processConfig(rawConfig);
  }

  /**
   * Load raw configuration from file
   */
  private static async loadConfigFile(configPath?: string): Promise<MCPCliConfig> {
    if (configPath) {
      return this.loadFromPath(this.expandPath(configPath));
    }

    // Try default paths in order
    for (const defaultPath of this.CONFIG_PATHS) {
      const expandedPath = this.expandPath(defaultPath);
      if (fs.existsSync(expandedPath)) {
        return this.loadFromPath(expandedPath);
      }
    }

    // No config file found, return minimal config
    return { mcpServers: {} };
  }

  /**
   * Load configuration from specific path
   */
  private static loadFromPath(filePath: string): MCPCliConfig {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      
      // Expand environment variables in the configuration
      return this.expandEnvironmentVariables(config);
    } catch (error) {
      throw new Error(`Failed to load config from ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Process and normalize configuration
   */
  private static processConfig(rawConfig: MCPCliConfig): {
    config: MCPCliConfig;
    servers: Record<string, ServerConfig>;
    daemon: Required<typeof DEFAULT_DAEMON_CONFIG>;
    defaults: Required<typeof DEFAULT_DEFAULTS_CONFIG>;
  } {
    // Process daemon config with defaults
    const daemon = {
      ...DEFAULT_DAEMON_CONFIG,
      ...rawConfig.daemon
    };
    
    // Expand paths in daemon config
    daemon.socket = this.expandPath(daemon.socket);
    daemon.logFile = this.expandPath(daemon.logFile);

    // Process defaults with defaults
    const defaults = {
      ...DEFAULT_DEFAULTS_CONFIG,
      ...rawConfig.defaults
    };

    // Process servers
    const servers: Record<string, ServerConfig> = {};
    let defaultPriority = 1;

    for (const [serverId, claudeServerConfig] of Object.entries(rawConfig.mcpServers)) {
      servers[serverId] = this.normalizeServerConfig(serverId, claudeServerConfig, defaultPriority++);
    }

    return {
      config: rawConfig,
      servers,
      daemon,
      defaults
    };
  }

  /**
   * Normalize Claude Desktop server config to internal format
   */
  private static normalizeServerConfig(
    serverId: string, 
    claudeConfig: ClaudeDesktopServerConfig, 
    defaultPriority: number
  ): ServerConfig {
    if (!claudeConfig.command) {
      throw new Error(`Server '${serverId}': 'command' is required`);
    }

    // Build command array from Claude Desktop format
    const command = [claudeConfig.command, ...(claudeConfig.args || [])];

    // Expand paths in command - only expand if it looks like a file path
    const expandedCommand = command.map(cmd => {
      // Don't expand npm packages (starting with @), simple commands, or flag-like arguments
      if (cmd.startsWith('@') || cmd.startsWith('-') || (!cmd.includes('/') && !cmd.startsWith('~'))) {
        return cmd; // Leave npm packages, flags, and simple commands as-is
      }
      if (cmd.includes('/') || cmd.startsWith('~')) {
        return this.expandPath(cmd);
      }
      return cmd;
    });

    // Build normalized config
    const normalizedConfig: ServerConfig = {
      command: expandedCommand,
      cwd: claudeConfig.cwd ? this.expandPath(claudeConfig.cwd) : undefined,
      env: claudeConfig.env,
      priority: claudeConfig.priority ?? defaultPriority,
      auto_start: claudeConfig.autoStart ?? DEFAULT_SERVER_EXTENSIONS.autoStart,
      idle_timeout: claudeConfig.idleTimeout ?? DEFAULT_SERVER_EXTENSIONS.idleTimeout,
      health_check: claudeConfig.healthCheck,
      description: claudeConfig.description ?? `${DEFAULT_SERVER_EXTENSIONS.description}: ${serverId}`
    };

    return normalizedConfig;
  }

  /**
   * Expand ~ and environment variables in paths
   */
  private static expandPath(inputPath: string): string {
    if (!inputPath) return inputPath;

    // Expand ~ to home directory
    let expandedPath = inputPath.replace(/^~/, os.homedir());

    // Expand environment variables like ${VAR} and $VAR
    expandedPath = expandedPath.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });
    
    expandedPath = expandedPath.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, varName) => {
      return process.env[varName] || '';
    });

    return path.resolve(expandedPath);
  }

  /**
   * Recursively expand environment variables in configuration object
   */
  private static expandEnvironmentVariables(obj: any): any {
    if (typeof obj === 'string') {
      return this.expandEnvironmentVariable(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.expandEnvironmentVariables(item));
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.expandEnvironmentVariables(value);
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Expand environment variables in a string value
   */
  private static expandEnvironmentVariable(value: string): string {
    if (typeof value !== 'string') return value;

    // Expand ${VAR} and $VAR patterns
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    }).replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, varName) => {
      return process.env[varName] || '';
    });
  }

  /**
   * Create default configuration directory and file
   */
  static async createDefaultConfig(): Promise<string> {
    const configDir = this.expandPath('~/.config/mcp');
    const configPath = path.join(configDir, 'config.json');

    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Create default config if it doesn't exist
    if (!fs.existsSync(configPath)) {
      const defaultConfig: MCPCliConfig = {
        mcpServers: {
          "claude-chrome-mcp": {
            command: "node",
            args: [path.resolve(__dirname, "../../../mcp-server/src/server.js")],
            description: "Claude Chrome browser automation",
            priority: 1,
            autoStart: true,
            healthCheck: "get_connection_health"
          }
        },
        daemon: DEFAULT_DAEMON_CONFIG,
        defaults: DEFAULT_DEFAULTS_CONFIG
      };

      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }

    return configPath;
  }

  /**
   * Parse timeout string to seconds
   */
  static parseTimeout(timeout: string): number {
    const match = timeout.match(/^(\d+)([smh]?)$/);
    if (!match) {
      throw new Error(`Invalid timeout format: ${timeout}. Use format like '30s', '5m', '1h'`);
    }

    const value = parseInt(match[1]);
    const unit = match[2] || 's';

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      default: throw new Error(`Invalid timeout unit: ${unit}`);
    }
  }

  /**
   * Validate configuration schema
   */
  static validate(config: MCPCliConfig): string[] {
    const errors: string[] = [];

    // Validate mcpServers
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      errors.push("Configuration must have a 'mcpServers' object");
    } else {
      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        if (!serverConfig.command || typeof serverConfig.command !== 'string') {
          errors.push(`Server '${serverId}': 'command' must be a string`);
        }
        
        if (serverConfig.priority !== undefined && typeof serverConfig.priority !== 'number') {
          errors.push(`Server '${serverId}': 'priority' must be a number`);
        }

        if (serverConfig.args !== undefined && !Array.isArray(serverConfig.args)) {
          errors.push(`Server '${serverId}': 'args' must be an array`);
        }
      }
    }

    // Validate daemon config (optional)
    if (config.daemon) {
      if (config.daemon.socket !== undefined && typeof config.daemon.socket !== 'string') {
        errors.push("Daemon 'socket' must be a string");
      }
      if (config.daemon.logLevel !== undefined && !['debug', 'info', 'warn', 'error'].includes(config.daemon.logLevel)) {
        errors.push("Daemon 'logLevel' must be one of: debug, info, warn, error");
      }
    }

    return errors;
  }
}