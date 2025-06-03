# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
```bash
mcp__claude-chrome-mcp__get_connection_health
```

### Step 2: Verify System Readiness
Check connection health output for:
- Hub connected status
- Active client connections
- Any connection issues

### Step 3: Standard Testing Workflow
Once system is healthy:
1. **Spawn Tab**: `spawn_claude_dot_ai_tab --injectContentScript true`
2. **Async Message**: `send_message_async --message "test" --tabId <id>`
3. **Get Response**: `get_claude_dot_ai_response --tabId <id>`
4. **Claude-to-Claude**: `forward_response_to_claude_dot_ai_tab --sourceTabId <src> --targetTabId <tgt>`

### Step 4: If Issues Arise
Follow systematic debugging approach from [Troubleshooting Guide](TROUBLESHOOTING.md#debugging-methodology):
- Use evidence-based network debugging
- Apply proper tool selection
- Avoid common anti-patterns

## Key Documentation
- **[Architecture](ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines
- **[Restart Capability](RESTART-CAPABILITY.md)**: MCP lifecycle and restart mechanisms

## Development Resources
- **[Event-Driven Architecture](event-driven-architecture-diagram.md)**: Visual system overview
- **[GitHub Issue Script](create-claude-code-issue.sh)**: Claude Code integration utilities

## Current System Status
- **Version**: 2.5.0 (MCP-Server-as-Hub architecture with centralized version management)
- **Architecture**: Modular design with separated components (3669→382 lines in server.js)
- **Key Features**: Async operations, Claude-to-Claude forwarding, network detection, multi-hub coordination
- **Modules**: WebSocketHub, AutoHubClient, MultiHubManager, ErrorTracker, OperationManager, ProcessLifecycleManager
- **Version Management**: Centralized via VERSION file and scripts/update-versions.js

## Current Issue: Parameter Mapping in Extension
- **Status**: 🔧 **IN PROGRESS** - Parameter validation failing in extension
- **Problem**: MCP tools returning "Missing required parameters" errors
- **Root Cause**: Extension executeCommand() method receiving full command object instead of command.params
- **Files Changed**: 
  - `extension/modules/hub-client.js` - Fixed parameter extraction in executeCommand()
  - `mcp-server/src/server.js` - Restored reload_extension tool
- **Extension Reload Required**: Manual reload needed at chrome://extensions/
- **Claude Code Restart Required**: MCP server changes need restart to take effect

## Pre-Restart Checklist Completed
- ✅ Parameter mapping fix applied to extension/modules/hub-client.js
- ✅ reload_extension tool restored to MCP server
- ✅ README.md updated to remove outdated build instructions
- ✅ All changes committed to git
- ✅ Temporary files cleaned up

## Post-Restart Testing Plan
1. **System Health**: Verify hub connection with `get_connection_health`
2. **Extension Reload**: Test `reload_extension` tool (should work after restart)
3. **Parameter Validation**: Test `send_message_async` and `get_claude_dot_ai_response`
4. **Full Workflow**: spawn_claude_dot_ai_tab → send_message_async → get_claude_dot_ai_response → forward_response_to_claude_dot_ai_tab