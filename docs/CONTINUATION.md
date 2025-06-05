# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
cli/ MCP tool system_health
or
MCP tool system_health

### Step 2: Verify System Readiness
Check connection health output for:
- Relay connected status (WebSocket mode)
- Active client connections
- Any connection issues

### Step 3: Standard Testing Workflow (OPTIONAL - only if user requests)
**Rule: Skip testing workflow by default unless user specifically asks for it**

If testing is requested, use cli/ MCP tools:
1. **Create Tab**: `tab_create --injectContentScript true`
2. **Send Message**: `tab_send_message --message "test" --tabId <id>`
3. **Get Response**: `tab_get_response --tabId <id>`
4. **Forward Response**: `tab_forward_response --sourceTabId <src> --targetTabId <tgt>`

### Step 4: Resume Active Work
- Read current todo list with TodoRead
- Continue with pending tasks from previous session
- If issues arise, follow [Troubleshooting Guide](TROUBLESHOOTING.md#debugging-methodology)

## Key Documentation
- **[Architecture](ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines

## Development Resources
- **[Event-Driven Architecture](event-driven-architecture-diagram.md)**: Visual system overview
- **[GitHub Issue Script](create-claude-code-issue.sh)**: Claude Code integration utilities

## Current System Status
- **Version**: 2.6.0 (WebSocket-only architecture)
- **Architecture**: WebSocket relay with offscreen documents
- **Key Features**: 
  - Async operations, Claude-to-Claude forwarding
  - WebSocket relay with health monitoring (port 54322)
  - Persistent connections via offscreen documents (12+ hours)
  - Pure message routing relay for simplified architecture
  - MCP protocol-compliant client identification via clientInfo
  - Unified Operation IDs: Server-generated `op_{tool_name}_{timestamp}` format
- **Status**: Production-ready with unified operation tracking
- **Important**: Extension needs manual reload after code changes

## CLI Usage
The CLI daemon auto-spawns when running commands. Use `mcp help` for available commands.

## Logging System
**Winston-based Structured Logging**: Professional logging with file rotation

- **Log Location**: `~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-{pid}.log`
- **Log Levels**: error, warn, info, debug, verbose (set via LOG_LEVEL env)
- **Components**: Each module has named logger (e.g., 'Relay', 'ChromeMCPServer')
- **Viewing Logs**: `tail -f ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log`

### Extension Debug Logging
On-demand debug log forwarding from Chrome extension to MCP server:

```bash
# Enable debug mode (all logs)
mcp system_enable_extension_debug_mode

# Enable error-only mode
mcp system_enable_extension_debug_mode --errorOnly

# Set log level
mcp system_set_extension_log_level --level DEBUG

# Get extension logs
mcp system_get_extension_logs --limit 50 --format text

# Disable debug mode
mcp system_disable_extension_debug_mode
```

## Recent Accomplishments (2025-06-05)

### Tool Naming and Logging Improvements
1. **MCP Tool Clarity**: Renamed `system_get_logs` → `system_get_extension_logs` for clear distinction
   - Updated tool descriptions to clarify extension vs MCP server logs
   - Updated extension handlers in `relay-client.js`
   - Enhanced CLI command documentation

2. **Comprehensive Testing Workflow Documentation**: 
   - Added detailed logging section to `docs/TROUBLESHOOTING.md`
   - Documented two distinct log systems (MCP server winston vs extension logs)
   - Added testing workflow best practices with proper restart procedures

### Verified System Functionality
1. **NotificationManager Async Implementation**: Confirmed working correctly
   - Async methods properly implemented with MCP SDK compliance
   - Uses correct `await this.server.server.notification()` pattern

2. **Extension Reload Workflow**: Verified and documented behavior
   - Extension reload clears content scripts from existing tabs (expected)
   - Proper workflow: close old tabs → create fresh tabs after reload

3. **CLI Tools Edge Case Testing**: Comprehensive validation completed
   - Timeout/extension reload workflow verified working
   - Error handling and parameter validation confirmed functional