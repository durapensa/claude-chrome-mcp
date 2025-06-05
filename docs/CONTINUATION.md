# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
```bash
mcp__claude-chrome-mcp__get_connection_health
```

### Step 2: Verify System Readiness
Check connection health output for:
- Relay connected status (WebSocket mode)
- Active client connections
- Any connection issues

### Step 3: Standard Testing Workflow (OPTIONAL - only if user requests)
**Rule: Skip testing workflow by default unless user specifically asks for it**

If testing is requested:
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
- **[Restart Capability](RESTART-CAPABILITY.md)**: MCP lifecycle and restart mechanisms

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
  - Operation IDs: `op_{tool_name}_{timestamp}` format with MCP server as sole authority
- **Status**: Production-ready WebSocket architecture
- **Important**: Extension needs manual reload after code changes

## Current Work Focus
**PARAMETER PASSING BUG FIXED**: Major refactor to Zod schemas complete

### Fixed Issues
- **Tool Registration**: Fixed handler signature from `(extra)` to `(args, extra)`
- **Schema System**: Replaced JSON Schema with native Zod schemas
- **Dependencies**: Added Zod package for proper validation
- **Tool Definitions**: Converted tab_create, tab_send_message, system_get_logs to Zod

### Next Steps After Restart
1. **Test Parameter Passing**: Try `tab_send_message --tabId <id> --message "test"`
2. **Verify All Tools**: Test system_get_logs with parameters
3. **Clean Debug Code**: Remove extensive debug logging after verification
4. **Complete Conversion**: Convert remaining tools to Zod schemas

### Files Modified This Session
- `mcp-server/src/server.js` - Fixed tool registration to use Zod schemas
- `mcp-server/src/tools/tab-tools.js` - Converted to Zod schemas
- `mcp-server/src/tools/system-tools.js` - Converted to Zod schemas
- `mcp-server/package.json` - Added Zod dependency

## Session History
**See git commit history for detailed session summaries and accomplishments**