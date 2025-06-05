# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
`mcp system_health`

### Step 2: Read TodoList  
`TodoRead` to see active tasks

### Step 3: Resume Active Work
- Continue with pending tasks from previous session
- If issues arise, follow [Troubleshooting Guide](TROUBLESHOOTING.md#debugging-methodology)

## Key Documentation
- **[Architecture](ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines

## Current System Status
- **Version**: 2.6.0 (WebSocket-only architecture)
- **Status**: Production-ready with unified operation tracking
- **Important**: Extension needs manual reload after code changes

## CLI Usage
The CLI daemon auto-spawns when running commands. Use `mcp help` for available commands.

## Logging System
- **Log Location**: `~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-{pid}.log`
- **Viewing Logs**: `tail -f ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log`

### Extension Debug Logging
```bash
mcp system_enable_extension_debug_mode  # Enable debug mode
mcp system_get_extension_logs --limit 50 --format text  # Get logs
mcp system_disable_extension_debug_mode  # Disable debug mode
```

