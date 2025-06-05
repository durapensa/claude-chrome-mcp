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
**COMPREHENSIVE DEBUGGING COMPLETED**: Systematic error analysis and fixes implemented

### ✅ Fixed Issues (Extension Reload Required)
- **Parameter Passing**: All 20 tools converted from inputSchema to zodSchema
- **Service Worker Imports**: Fixed dynamic import restriction in system_get_logs  
- **Content Script Tracking**: Fixed stale hasContentScript state after navigation
- **Tab Forwarding**: Enhanced connection error handling with auto-injection
- **Debugger Lifecycle**: Comprehensive attachment/detachment management
- **Batch Operations**: Analyzed response timeout issues (status detection gaps)

### ⚠️ Critical Issue: Dual Operation ID Systems
**ARCHITECTURE BUG**: MCP server (`op_*`) and extension (`ext_op_*`) generate separate operation IDs

**Impact**: `system_wait_operation` fails because server doesn't track extension-generated IDs

**Fix Required** (Post-Restart):
1. Modify `tab_send_message` handler to create MCP server operation first
2. Pass server operation ID to extension instead of extension self-generating
3. Update extension to report operation milestones back to server
4. Test `system_wait_operation` with unified operation tracking

### Next Steps After Restart  
**CLI DEBUGGING SETUP COMPLETE**: Use CLI for rapid iteration without Claude Code restarts

#### CLI-First Development Workflow
```bash
# CLI daemon configured with both servers:
./bin/mcp servers     # claude-chrome-mcp: 28 tools, filesystem: 11 tools
./bin/mcp system_health    # Test MCP server changes instantly
./bin/mcp edit_file /path  # Edit code without restarts
```

#### Operation ID Unification (HIGH PRIORITY)
**Current Bug**: MCP server generates `op_*` IDs, extension generates `ext_op_*` IDs
**Fix Plan**:
1. Edit `mcp-server/src/tools/tab-tools.js` via CLI to create operation first  
2. Pass server operation ID to extension instead of self-generating
3. Update extension to report milestones back to server
4. Test `system_wait_operation` with unified tracking

#### Secondary Tasks
1. **Extension Reload**: Manual reload for tested changes
2. **Performance**: Address batch operation timeout detection gaps  
3. **Testing**: Verify all error handling improvements

## Session History
**See git commit history for detailed session summaries and accomplishments**