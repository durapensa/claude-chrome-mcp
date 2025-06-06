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
1. **⚠️ CRITICAL: Test Suite Rewrite**: tests/ directory requires complete rewrite - current tests timeout and are incompatible with v2.6.0 WebSocket architecture (see [Architecture Analysis](ARCHITECTURE-ANALYSIS.md) for detailed requirements)
2. **~~Remove Backward Compatibility~~**: ✅ **COMPLETED** - Cleaned up legacy HTTP polling and old message formats (137 lines removed)
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
- **[Architecture Analysis](ARCHITECTURE-ANALYSIS.md)**: Deep-dive analysis, inconsistencies, and test rewrite requirements
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines

## Current System Status
- **Version**: 2.6.0 (WebSocket-only architecture)
- **Status**: Production-ready with unified operation tracking
- **Important**: Extension needs manual reload after code changes

## Latest Session Work
- **Backward Compatibility Cleanup**: Removed 137 lines of legacy command routing 
- **Unified Command Names**: All tools now use clean domain separation (`system_*`, `chrome_*`, `tab_*`, `api_*`)
- **Architecture Analysis**: Comprehensive system examination revealing test suite incompatibility with v2.6.0 WebSocket architecture
- **Documentation**: Created detailed analysis for critical test suite rewrite requirements

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

