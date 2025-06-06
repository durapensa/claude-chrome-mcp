# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
`mcp system_health`

### Step 2: Read TodoList  
`TodoRead` to see active tasks

### Step 3: Resume Active Work
- Continue with pending tasks from TodoList
- If TodoList is empty, check Project Priorities below
- If issues arise, follow [Troubleshooting Guide](TROUBLESHOOTING.md#debugging-methodology)

## Project Priorities & Next Steps

### High Priority Improvements
1. **Remove Backward Compatibility**: Clean up legacy HTTP polling and old message formats (v2.6.0 is fully WebSocket)
2. **Performance Optimization**: Message batching and queue optimization in extension
3. **Error Recovery**: Enhance reconnection logic and error handling  
4. **TypeScript Migration**: Complete migration of remaining JavaScript files
5. **Test Coverage**: Add integration tests for critical workflows
6. **Documentation**: Keep docs minimal and up-to-date per Critical Directives

### Known Issues to Address
- Tab operation timeouts under heavy load
- Memory usage in long-running sessions
- Extension debug log buffering improvements

### When Todo List is Empty
1. Run tests to ensure system stability: `cd tests && node regression-test-quick.js`
2. Check for TODO/FIXME comments in codebase
3. Review recent commits for follow-up work
4. Consider improvements from Project Priorities above

## Key Documentation
- **[Architecture](ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines

## Current System Status
- **Version**: 2.6.0 (WebSocket-only architecture)
- **Status**: Production-ready with unified operation tracking
- **Important**: Extension needs manual reload after code changes

## Latest Session Work
- Refactored MCP server connection flow to connect to relay AFTER receiving client initialization
- Removed client info update complexity - now gets client name during MCP initialization
- Fixed TypeError when starting server by using proper `oninitialized` callback instead of proxy
- Simplified architecture: MCP client → server (stdio) → get client name → connect to relay

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

