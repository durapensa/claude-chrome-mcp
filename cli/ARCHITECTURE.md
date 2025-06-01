# Universal MCP CLI - Architecture & Design Document

## Executive Summary

Transform the existing claude-chrome-mcp CLI into a **Universal MCP Client** that can dynamically discover, connect to, and interact with any MCP server via stdio transport. The CLI will support multiple simultaneous servers, handle tool name collisions intelligently, and provide both interactive and non-interactive modes with full GNU-style option support.

## Core Principles

1. **Universal MCP Compatibility** - Work with any stdio MCP server, not just claude-chrome-mcp
2. **Dynamic Tool Discovery** - Auto-generate CLI commands from MCP tool schemas  
3. **Multi-Server Architecture** - Load and manage multiple MCP servers simultaneously
4. **Intelligent Namespace Management** - Handle tool name collisions with precedence rules
5. **Persistent Daemon Model** - Background process manages server lifecycle
6. **Standard CLI Experience** - Full GNU-style options, pipes, JSON output, interactive mode

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  CLI Commands   │    │   MCP Daemon    │    │  MCP Servers    │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ mcp spawn   │ │◄──►│ │ Server Mgr  │ │◄──►│ │claude-chrome│ │
│ │ mcp @fs ls  │ │    │ │ Tool Router │ │    │ │ filesystem  │ │
│ │ mcp chat    │ │    │ │ Namespace   │ │    │ │ anthropic   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        │                        │                        │
     Unix CLI                Unix Socket              stdio pipes
```

## Component Architecture

### 1. CLI Interface (`src/cli.ts`)
- **Command Parser** - Dynamic command generation from MCP schemas
- **Argument Processor** - GNU-style option parsing with schema validation
- **Output Formatter** - Human/JSON/YAML output with color support
- **Daemon Client** - Unix socket communication with daemon

### 2. MCP Daemon (`src/daemon/`)
- **Server Manager** - Spawn, monitor, and lifecycle management of MCP servers
- **Tool Registry** - Dynamic tool discovery and namespace resolution
- **Request Router** - Route tool calls to appropriate servers
- **Connection Pool** - Manage stdio connections to multiple servers

### 3. Configuration System (`src/config/`)
- **Config Parser** - Load and validate `~/.mcp-cli/config.json`
- **Server Definitions** - Command, environment, and lifecycle settings
- **Runtime Settings** - Defaults, output preferences, timeouts

### 4. Interactive Shell (`src/interactive/`)
- **REPL Environment** - Command history, tab completion, context switching
- **Multi-Server Context** - Server-aware prompt and tool suggestions
- **Pipeline Support** - Cross-server command chaining

## Key Interfaces

### MCP Server Configuration
```typescript
interface ServerConfig {
  command: string[]                    // ["node", "server.js"]
  args?: string[]                      // Additional arguments
  cwd?: string                         // Working directory
  env?: Record<string, string>         // Environment variables
  description?: string                 // Human description
  priority?: number                    // Tool precedence (lower = higher priority)
  auto_start?: boolean                 // Start with daemon
  idle_timeout?: string               // "5m", "1h" - shutdown after idle
  health_check?: string               // Tool name for health monitoring
}
```

### Tool Registry
```typescript
interface QualifiedTool {
  name: string                        // Tool name
  server_id: string                   // Owning server
  schema: JSONSchema7                 // MCP tool schema
  canonical: boolean                  // First-defined (default when unqualified)
  description: string                 // Tool description
}

interface ToolNamespace {
  tools: Map<string, QualifiedTool>   // tool_name → canonical tool
  collisions: Map<string, string[]>   // tool_name → [server1, server2, ...]
  byServer: Map<string, QualifiedTool[]> // server_id → tools
}
```

### Command Structure
```typescript
interface ParsedCommand {
  server_id?: string                  // @server-name prefix
  tool_name: string                   // Tool to invoke
  args: Record<string, any>           // Parsed arguments
  flags: {
    json?: boolean                    // --json output
    verbose?: boolean                 // --verbose logging
    timeout?: number                  // --timeout duration
    help?: boolean                    // --help flag
  }
}
```

## Configuration Format

### `~/.mcp-cli/config.json`
```json
{
  "servers": {
    "claude-chrome": {
      "command": ["node", "/path/to/claude-chrome-mcp/mcp-server/src/server.js"],
      "description": "Claude Chrome browser automation",
      "priority": 1,
      "auto_start": true,
      "health_check": "get_connection_health",
      "idle_timeout": "10m"
    },
    "filesystem": {
      "command": ["mcp-server-filesystem"],
      "args": ["--base-path", "/"],
      "description": "File system operations",
      "priority": 2,
      "auto_start": true
    },
    "anthropic": {
      "command": ["mcp-server-anthropic"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      },
      "description": "Anthropic API access",
      "priority": 3,
      "auto_start": false,
      "idle_timeout": "30m"
    }
  },
  "daemon": {
    "socket": "~/.mcp-cli/daemon.sock",
    "log_file": "~/.mcp-cli/daemon.log",
    "log_level": "info",
    "idle_timeout": "1h"
  },
  "defaults": {
    "output": "human",
    "timeout": "30s",
    "color": "auto"
  }
}
```

## Command Line Interface

### Basic Command Structure
```bash
mcp [GLOBAL_OPTIONS] [@SERVER:] TOOL_NAME [TOOL_OPTIONS] [ARGUMENTS]
```

### Global Options (Always Available)
```bash
--json, -j              Output as JSON
--verbose, -v           Verbose logging
--timeout DURATION      Operation timeout (30s, 5m, 1h)
--server SERVER         Use specific server for this command
--config PATH           Use alternate config file
--help, -h              Show help
--version               Show version
--                      End of options (treat remaining as arguments)
```

### Tool Name Resolution
```bash
# Unqualified - uses first-defined (highest priority) server
mcp spawn --url https://claude.ai

# Qualified - explicit server selection
mcp @claude-chrome:spawn --url https://claude.ai
mcp @filesystem:list-files --path /tmp

# Server context prefix (alternative syntax)
mcp @claude-chrome spawn --url https://claude.ai
```

### Dynamic Command Generation
Each MCP tool automatically becomes a CLI command with:
- **Positional arguments** from required schema properties
- **Optional flags** from optional schema properties  
- **Type validation** based on JSON schema
- **Help text** from schema descriptions

### Example Tool Schema → CLI Mapping
```json
// MCP Tool Schema
{
  "name": "send_message_async",
  "description": "Send message asynchronously to Claude tab",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tabId": {"type": "number", "description": "Tab ID"},
      "message": {"type": "string", "description": "Message to send"},
      "waitForCompletion": {"type": "boolean", "default": false}
    },
    "required": ["tabId", "message"]
  }
}
```

```bash
# Generated CLI Command
mcp send-message-async TAB_ID MESSAGE [OPTIONS]

Send message asynchronously to Claude tab

Arguments:
  TAB_ID                  Tab ID
  MESSAGE                 Message to send

Options:
  -w, --wait-for-completion    Wait for completion [default: false]
      --no-wait-for-completion Don't wait for completion
  -j, --json                   Output as JSON
  -h, --help                   Show help
```

## Interactive Mode

### Shell Interface
```bash
mcp chat
# or
mcp --interactive
```

### Interactive Features
- **Multi-line input** with proper escaping
- **Tab completion** for commands, options, file paths
- **Command history** with search
- **Server context switching** (`use @server-name`)
- **Pipeline support** for cross-server workflows
- **Built-in help system** with command discovery

### Interactive Commands
```bash
help                    # List all available tools
help TOOL               # Show help for specific tool
servers                 # Show server status
use @SERVER             # Switch default server context
history                 # Show command history
clear                   # Clear screen
exit                    # Exit interactive mode
```

## Daemon Architecture

### Daemon Lifecycle
1. **Auto-start on first CLI command** if not running
2. **Server management** - spawn, monitor, restart servers
3. **Idle timeout** - shutdown daemon after period of inactivity
4. **Graceful shutdown** - cleanup servers and connections

### Process Management
```typescript
class MCPServer {
  id: string
  config: ServerConfig
  process: ChildProcess | null
  connection: MCPConnection | null
  status: 'stopped' | 'starting' | 'ready' | 'error' | 'idle'
  lastUsed: Date
  tools: QualifiedTool[]
  
  async start(): Promise<void>
  async stop(): Promise<void>
  async restart(): Promise<void>
  async healthCheck(): Promise<boolean>
  async callTool(name: string, args: any): Promise<any>
}
```

### Communication Protocol
```typescript
// CLI → Daemon messages
interface DaemonRequest {
  type: 'tool_call' | 'list_tools' | 'server_status' | 'shutdown'
  server_id?: string
  tool_name?: string
  args?: Record<string, any>
  request_id: string
  timeout?: number
}

// Daemon → CLI responses  
interface DaemonResponse {
  request_id: string
  status: 'success' | 'error' | 'progress'
  data?: any
  error?: string
  progress?: {
    message: string
    step: number
    total: number
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure
**Files to create:**
- `src/daemon/server-manager.ts` - MCP server lifecycle management
- `src/daemon/tool-registry.ts` - Tool discovery and namespace management
- `src/daemon/mcp-connection.ts` - Stdio MCP protocol implementation
- `src/config/config-loader.ts` - Configuration parsing and validation
- `src/cli/command-parser.ts` - Dynamic CLI command generation

**Deliverable:** Basic daemon that can spawn one MCP server and execute one tool

### Phase 2: Multi-Server Support
**Files to create:**
- `src/daemon/namespace-resolver.ts` - Tool collision handling
- `src/daemon/request-router.ts` - Route commands to appropriate servers
- `src/cli/gnu-parser.ts` - Full GNU-style option parsing
- `src/cli/output-formatter.ts` - Human/JSON/YAML formatting

**Deliverable:** Multiple servers, tool collision resolution, qualified tool names

### Phase 3: Interactive Mode
**Files to create:**
- `src/interactive/repl.ts` - Interactive shell implementation
- `src/interactive/completion.ts` - Tab completion for commands and options
- `src/interactive/history.ts` - Command history and search

**Deliverable:** Full interactive mode with tab completion and history

### Phase 4: Advanced Features
**Files to create:**
- `src/daemon/health-monitor.ts` - Server health checking and auto-restart
- `src/cli/pipeline-parser.ts` - Cross-server pipeline support
- `src/utils/json-schema-cli.ts` - Enhanced schema → CLI mapping

**Deliverable:** Production-ready CLI with all advanced features

## File Structure

```
cli/
├── ARCHITECTURE.md                 # This document
├── package.json                    # Node.js package definition
├── tsconfig.json                   # TypeScript configuration
├── bin/
│   └── mcp                         # Executable entry point
├── src/
│   ├── mcp.ts                      # Main CLI entry point
│   ├── daemon/
│   │   ├── daemon.ts               # Main daemon process
│   │   ├── server-manager.ts       # MCP server lifecycle management
│   │   ├── tool-registry.ts        # Tool discovery and registration
│   │   ├── namespace-resolver.ts   # Tool collision resolution
│   │   ├── request-router.ts       # Route requests to servers
│   │   ├── mcp-connection.ts       # Stdio MCP protocol implementation
│   │   └── health-monitor.ts       # Server health monitoring
│   ├── cli/
│   │   ├── command-parser.ts       # Dynamic command generation
│   │   ├── gnu-parser.ts           # GNU-style argument parsing
│   │   ├── output-formatter.ts     # Output formatting
│   │   └── daemon-client.ts        # Daemon communication
│   ├── interactive/
│   │   ├── repl.ts                 # Interactive shell
│   │   ├── completion.ts           # Tab completion
│   │   └── history.ts              # Command history
│   ├── config/
│   │   ├── config-loader.ts        # Configuration loading
│   │   ├── schema.ts               # Configuration schema
│   │   └── defaults.ts             # Default configuration
│   ├── utils/
│   │   ├── json-schema-cli.ts      # Schema to CLI mapping
│   │   ├── process-utils.ts        # Process management utilities
│   │   └── logger.ts               # Logging utilities
│   └── types/
│       ├── config.ts               # Configuration types
│       ├── daemon.ts               # Daemon communication types
│       ├── mcp.ts                  # MCP protocol types
│       └── cli.ts                  # CLI-specific types
├── dist/                           # Compiled JavaScript output
└── node_modules/                   # Dependencies
```

## Dependencies

### Core Dependencies
```json
{
  "commander": "^11.1.0",           // CLI framework (temporary, will replace)
  "ws": "^8.14.2",                 // Remove - no WebSocket needed
  "chalk": "^4.1.2",               // Terminal colors  
  "inquirer": "^9.2.0",            // Interactive prompts
  "ajv": "^8.12.0",                // JSON schema validation
  "json-schema-to-typescript": "^13.1.0", // Schema type generation
  "yargs-parser": "^21.1.1"        // GNU-style argument parsing
}
```

### Development Dependencies
```json
{
  "typescript": "^5.3.3",
  "ts-node": "^10.9.2", 
  "@types/node": "^20.10.4",
  "jest": "^29.7.0",
  "nodemon": "^3.0.2"
}
```

## Success Criteria

### Functional Requirements
- ✅ **Universal MCP compatibility** - Works with any stdio MCP server
- ✅ **Dynamic tool discovery** - Commands auto-generated from schemas
- ✅ **Multi-server support** - Multiple servers loaded simultaneously  
- ✅ **Intelligent collision handling** - Tool precedence and qualified names
- ✅ **GNU-style options** - Full POSIX compliance with long/short options
- ✅ **Interactive mode** - REPL with completion and history
- ✅ **JSON/Human output** - Flexible output formatting
- ✅ **Persistent daemon** - Background process management

### Performance Requirements
- **Startup time** - < 200ms for cached commands
- **Tool execution** - < 1s overhead for simple tools
- **Memory usage** - < 50MB for daemon + 3 servers
- **Server startup** - < 5s for complex servers like claude-chrome-mcp

### Usability Requirements
- **Zero configuration** - Works out of box with reasonable defaults
- **Intuitive commands** - Tool names match MCP tool names exactly
- **Helpful errors** - Clear error messages with suggestions
- **Tab completion** - Full completion for commands, options, file paths
- **Help system** - Comprehensive help with examples

## Migration Strategy

### Backward Compatibility
- **Existing scripts** - Current `ccm` commands should work as `mcp` commands
- **Configuration** - Provide migration tool from old config format
- **Gradual adoption** - Both CLIs can coexist during transition

### Rollout Plan
1. **Alpha** - Core functionality, single server support
2. **Beta** - Multi-server, interactive mode, existing users testing
3. **RC** - Full feature set, documentation, migration tools
4. **GA** - Replace existing CLI, update documentation

This architecture creates a **universal MCP CLI client** that positions claude-chrome-mcp as one of many possible MCP servers, while providing a superior command-line experience for the entire MCP ecosystem.