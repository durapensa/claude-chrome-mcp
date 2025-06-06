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
1. **⚠️ CRITICAL: Test Suite Rewrite**: tests/ directory requires complete rewrite - current tests timeout and are incompatible with v2.6.0 WebSocket architecture
2. **Remove Backward Compatibility**: Clean up legacy HTTP polling and old message formats (v2.6.0 is fully WebSocket)
3. **Performance Optimization**: Message batching and queue optimization in extension
4. **Error Recovery**: Enhance reconnection logic and error handling  
5. **TypeScript Migration**: Complete migration of remaining JavaScript files
6. **Documentation**: Keep docs minimal and up-to-date per Critical Directives

### Known Issues to Address
- Tab operation timeouts under heavy load
- Memory usage in long-running sessions
- Extension debug log buffering improvements

### When Todo List is Empty
1. **Run manual tests** to ensure system stability (avoid broken /tests suite - see High Priority #1):
   - `mcp system_health` - Check system status
   - `mcp tab_create` - Test tab creation
   - `mcp tab_send_message` - Test messaging functionality
2. Review recent commits for follow-up work
3. Consider improvements from Project Priorities above

## Key Documentation
- **[Architecture](ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines

## Current System Status
- **Version**: 2.6.0 (WebSocket-only architecture)
- **Status**: Production-ready with unified operation tracking
- **Important**: Extension needs manual reload after code changes

## Latest Session Work
- Simplified MCP server connection flow by removing callback pattern
- Changed to sequential initialization: connect server → get client info → connect relay
- No more deferred connections or callbacks - just straightforward order of operations
- Cleaner, more maintainable code without unnecessary complexity

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

