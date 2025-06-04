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
1. **Spawn Tab**: `spawn_claude_dot_ai_tab --injectContentScript true`
2. **Async Message**: `send_message_async --message "test" --tabId <id>`
3. **Get Response**: `get_claude_dot_ai_response --tabId <id>`
4. **Claude-to-Claude**: `forward_response_to_claude_dot_ai_tab --sourceTabId <src> --targetTabId <tgt>`

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
- **Important**: Extension needs manual reload, Claude Code needs restart after MCP server changes

## Current Work Focus
**Use TodoRead to see active tasks**

Priority improvements identified:
1. Centralized logging migration (in progress)
2. Enhanced error handling with ErrorTracker
3. Module consolidation (tab-management vs tab-operations)

## Session History
**See git commit history for detailed session summaries and accomplishments**