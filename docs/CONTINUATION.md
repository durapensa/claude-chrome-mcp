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
  - **✅ Unified Operation IDs**: Server-generated `op_{tool_name}_{timestamp}` format
- **Status**: Production-ready with unified operation tracking
- **Important**: Extension needs manual reload after code changes

## Current Work Focus
**✅ WINSTON LOGGING REFACTOR COMPLETED**: All console statements replaced with structured logging

### ✅ Major Accomplishments
- **Winston Logger**: Created comprehensive `logger.js` replacing `debug-mode.js`
- **Structured Logging**: All 88 console statements migrated to winston with proper log levels
- **Component-based Logging**: Each module has its own logger with component identification
- **File Rotation**: Logs saved to `~/.claude-chrome-mcp/logs/` with 10MB rotation (5 files max)
- **MCP Compliance**: All output to stderr, stdout remains clean for JSON-RPC protocol
- **Error Tracking Integration**: ErrorTracker enhanced with winston while maintaining in-memory analytics
- **Shared Tab Management**: Created unified `tab-management.js` utilities for all tools
- **Code Deduplication**: `ensureClaudeTabForApi()` and `ensureConversationTab()` shared across tools
- **API Tab Creation**: Consistent `/new` tab creation when no Claude.ai tabs exist
- **Operation ID System**: Fixed dual ID issue, `system_wait_operation` works across MCP boundary
- **Parameter Passing**: All 20 tools converted from inputSchema to zodSchema
- **CLI Debugging**: Rapid iteration workflow without Claude Code restarts
- **On-Demand Debug Logging**: Hybrid real-time log forwarding from extension to MCP server
  - Added `system_enable_extension_debug_mode`, `system_disable_extension_debug_mode`, `system_set_extension_log_level` tools
  - ERROR logs sent immediately, other logs batched every 2 seconds  
  - Component filtering and error-only mode supported
  - Extension logger enhanced with debug mode toggle and MCP forwarding
  - LOG_ERROR messages handled in background.js
  - MCP relay client processes log notifications and forwards to NotificationManager

### ✅ Performance Debugging Workflow Established
```bash
# Bulk conversation cleanup
./bin/mcp api_delete_conversations --conversationIds id1 --conversationIds id2

# Immediate tab cleanup (critical for Chrome performance)
for tabId in $(./bin/mcp tab_list | grep -o '"id": [0-9]*' | grep -o '[0-9]*' | tail -n +2); do 
  ./bin/mcp tab_close --tabId $tabId
done
```

## CLI-First Development Environment
**Fully Functional**: CLI daemon configured with both servers for rapid iteration

```bash
# CLI tools available:
./bin/mcp servers           # claude-chrome-mcp: 28 tools, filesystem: 11 tools
./bin/mcp system_health     # Test MCP server changes instantly
./bin/mcp edit_file /path   # Edit code without restarts
./bin/mcp tab_send_message  # Returns unified server operation IDs
./bin/mcp system_wait_operation --operationId op_* # Works end-to-end
```

## Logging System
**Winston-based Structured Logging**: Professional logging with file rotation

- **Log Location**: `~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-{pid}.log`
- **Log Levels**: error, warn, info, debug, verbose (set via LOG_LEVEL env)
- **Components**: Each module has named logger (e.g., 'Relay', 'ChromeMCPServer')
- **Viewing Logs**: `tail -f ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log`