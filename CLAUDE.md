# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## System Status
- Version: 2.6.0 (WebSocket-only architecture)
- Status: Production-ready with embedded relay
- **RESTART REQUIRED**: After MCP server code changes, exit and re-run Claude Code

## Quick Commands
```bash
# System health
mcp__claude-chrome-mcp__get_connection_health

# Basic workflow
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab --injectContentScript true
mcp__claude-chrome-mcp__send_message_async --message "Test" --tabId <tab_id>
mcp__claude-chrome-mcp__get_claude_dot_ai_response --tabId <tab_id>

# Claude-to-Claude forwarding
mcp__claude-chrome-mcp__forward_response_to_claude_dot_ai_tab --sourceTabId <source> --targetTabId <target>
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

## MCP Specification Reference
- Located at node_modules/@modelcontextprotocol for MCP-related changes