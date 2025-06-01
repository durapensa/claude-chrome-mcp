/**
 * Universal MCP CLI - CLI Types
 * 
 * Types for CLI command parsing and processing.
 */

// ===== CLI Types =====

export interface ParsedCommand {
  server_id?: string;                  // @server-name prefix
  tool_name: string;                   // Tool to invoke
  args: Record<string, any>;           // Parsed arguments
  flags: CLIFlags;
}

export interface CLIFlags {
  json?: boolean;                      // --json output
  verbose?: boolean;                   // --verbose logging
  timeout?: number;                    // --timeout duration (seconds)
  help?: boolean;                      // --help flag
  server?: string;                     // --server override
  config?: string;                     // --config file path
}

export interface CLIOption {
  long: string;                        // --tab-id
  short?: string;                      // -t
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  defaultValue?: any;
  description: string;
}