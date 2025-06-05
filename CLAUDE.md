# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## System Status
- Version: 2.6.0 (WebSocket-only architecture)
- Status: **PARAMETER PASSING FIXED** - refactored to native Zod schemas
- **RESTART REQUIRED**: Major MCP server changes require Claude Code restart

## Quick Commands
```bash
# System health
mcp__claude-chrome-mcp__system_health
mcp__claude-chrome-mcp__system_get_logs --limit 50 --format text

# Basic workflow
mcp__claude-chrome-mcp__tab_create --injectContentScript true
mcp__claude-chrome-mcp__tab_send_message --message "Test" --tabId <tab_id>
mcp__claude-chrome-mcp__tab_get_response --tabId <tab_id>

# Claude-to-Claude forwarding
mcp__claude-chrome-mcp__tab_forward_response --sourceTabId <source> --targetTabId <target>

# API operations
mcp__claude-chrome-mcp__api_list_conversations
mcp__claude-chrome-mcp__api_get_conversation_url --conversationId <uuid>
```

## Continuation Workflow  
**CRITICAL**: When you type 'continue', follow docs/CONTINUATION.md

## Documentation
- **[Architecture](docs/ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](docs/TROUBLESHOOTING.md)**: Issues and debugging
- **[TypeScript](docs/TYPESCRIPT.md)**: Type definitions  
- **[Restart Capability](docs/RESTART-CAPABILITY.md)**: MCP server lifecycle
- **[Continuation](docs/CONTINUATION.md)**: Session restart workflow

## Critical Directives
- **RESTART REQUIRED**: Any MCP server code changes require Claude Code restart
- **MAINTAIN CODE HYGIENE**: "one-in-one-out" rule
- **ZERO INSTRUCTION DUPLICATION**: Reference other docs, never repeat
- **NO SESSION ARTIFACTS**: Git history captures accomplishments
- **STREAMLINE AGGRESSIVELY**: Delete bloat immediately
- **GIT FOR HISTORY**: No backup files or detailed session logs in docs
- **TEST AS YOU GO**: Each change immediately testable

## Essential Workflows
- Change code → Reload extension → Test
- Use TodoRead for active tasks
- Use MCP tools for debugging and development
- After making changes to extension/ always attempt to reload the extension with MCP tools or, if that fails, ask the user to manually reload the extension

## MCP Specification Reference
- Located at node_modules/@modelcontextprotocol for MCP-related changes

## Restart Procedure
- In the case RESTART REQUIRED: Exit and restart Claude Code or similar, ensure that docs/CONTINUATION.md and other system documentation is updated per Critical Directives, before asking the user to restart. (ultrathink)