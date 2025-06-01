/**
 * Universal MCP CLI - Configuration Types
 * 
 * Uses Claude Desktop configuration format with optional CLI extensions.
 */

// ===== Claude Desktop Configuration Format =====

export interface ClaudeDesktopServerConfig {
  command: string;                      // "node" or full path to executable
  args?: string[];                      // Command arguments
  cwd?: string;                         // Working directory
  env?: Record<string, string>;         // Environment variables
  
  // CLI-specific extensions (optional)
  priority?: number;                    // Tool precedence (lower = higher priority)
  autoStart?: boolean;                  // Start with daemon
  idleTimeout?: string;                // "5m", "1h" - shutdown after idle
  healthCheck?: string;                // Tool name for health monitoring
  description?: string;                // Human description
}

export interface DaemonConfig {
  socket?: string;                     // Unix socket path
  logFile?: string;                    // Log file path
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  idleTimeout?: string;               // Daemon idle timeout
}

export interface DefaultsConfig {
  output?: 'human' | 'json' | 'yaml';
  timeout?: string;
  color?: 'auto' | 'always' | 'never';
}

export interface MCPCliConfig {
  mcpServers: Record<string, ClaudeDesktopServerConfig>;
  daemon?: DaemonConfig;               // Optional CLI-specific settings
  defaults?: DefaultsConfig;           // Optional CLI-specific settings
}

// ===== Internal Server Config (normalized) =====

export interface ServerConfig {
  command: string[];                    // ["node", "server.js"] - normalized from Claude format
  cwd?: string;                         // Working directory
  env?: Record<string, string>;         // Environment variables
  priority: number;                     // Tool precedence (lower = higher priority)
  auto_start: boolean;                  // Start with daemon
  idle_timeout: string;                // "5m", "1h" - shutdown after idle
  health_check?: string;               // Tool name for health monitoring
  description: string;                 // Human description
}

// ===== Default Values =====

export const DEFAULT_DAEMON_CONFIG: Required<DaemonConfig> = {
  socket: '~/.config/mcp/daemon.sock',
  logFile: '~/.config/mcp/daemon.log',
  logLevel: 'info',
  idleTimeout: '1h'
};

export const DEFAULT_DEFAULTS_CONFIG: Required<DefaultsConfig> = {
  output: 'human',
  timeout: '30s',
  color: 'auto'
};

export const DEFAULT_SERVER_EXTENSIONS = {
  priority: 999,
  autoStart: false,  // Don't auto-start by default - user must explicitly enable
  idleTimeout: '10m',
  description: 'MCP Server'
};