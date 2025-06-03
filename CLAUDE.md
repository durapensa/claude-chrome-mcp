# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## System Status
- Version: 2.5.0 (centralized version management)
- Architecture: MCP-Server-as-Hub with Chrome Extension as WebSocket client
- Structure: Modular architecture with separated components (utils/, hub/, lifecycle/)

## Important System Limitations
- Claude Code cannot restart its own MCP servers. User must exit and re-run Claude Code if claude-chrome-mcp tools are not available
- **RESTART REQUIRED**: After making changes to mcp-server code, user must manually exit and re-run Claude Code to reload the MCP server with updates

## Quick Commands
```bash
# 1. Check system health
mcp__claude-chrome-mcp__get_connection_health

# 2. Test async workflow
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab --injectContentScript true
mcp__claude-chrome-mcp__send_message_async --message "Test async: 7*8=?" --tabId <tab_id>

# 3. Get response after completion
mcp__claude-chrome-mcp__get_claude_dot_ai_response --tabId <tab_id>

# 4. Test Claude-to-Claude forwarding
mcp__claude-chrome-mcp__forward_response_to_claude_dot_ai_tab --sourceTabId <source> --targetTabId <target>
```

## Important Tool Options
- `send_message_to_claude_tab`: Use `waitForReady: true` (default)
- `get_claude_response`: Keep `timeoutMs < 30000` for MCP
- Do not use `waitForCompletion` or similar while testing async operation
- **ALL claude-chrome-mcp tools should operate in async mode by default, with waitForCompletion flags added only if applicable and only for optional use**

## Project Structure
- `extension/` - Chrome extension (HTTP polling client with adaptive intervals)
- `mcp-server/` - MCP server (modular architecture)
  - `src/server.js` - Main entry point (382 lines, modular)
  - `src/hub/` - WebSocket hub, client management, multi-hub coordination
  - `src/utils/` - Error tracking, operation management, debugging
  - `src/lifecycle/` - Process lifecycle and graceful shutdown
- `cli/` - Universal MCP CLI client
- `tests/` - Test suites with lifecycle management
- `docs/` - Documentation and development notes

## Key References
- Architecture: docs/ARCHITECTURE.md
- Troubleshooting: docs/TROUBLESHOOTING.md
- TypeScript: docs/TYPESCRIPT.md
- Roadmap: ROADMAP.md

## Architecture Overview
- **MCP-Server-as-Hub**: MCP server hosts hybrid WebSocket + HTTP hub on port 54321
- **Chrome Extension Client**: Extension uses adaptive HTTP polling (500ms-2s intervals, reduced network load)
- **Simplified Hub Election**: First-come-first-served port binding, immediate failover on connection loss
- **CustomEvent Bridge**: MAIN/ISOLATED world communication for network detection
- **Network-Level Detection**: Uses fetch interception + `/latest` endpoint for response completion
- **Async Operations**: Full async workflow with operation registration and milestone tracking

## Continuation Workflow  
When you type 'continue', follow the standard workflow in docs/CONTINUATION.md

## Testing Workflow
1. **System Health**: `get_connection_health` - verify hub and clients connected
2. **Spawn Tab**: `spawn_claude_dot_ai_tab --injectContentScript true` 
3. **Async Message**: `send_message_async --message "test" --tabId <id>`
4. **Get Response**: `get_claude_dot_ai_response --tabId <id>` (auto-completion detection)
5. **Claude-to-Claude**: `forward_response_to_claude_dot_ai_tab --sourceTabId <src> --targetTabId <tgt>`

## Session Continuity
- **Latest Status**: See docs/CONTINUATION.md for current session and continuation workflow

## Development Guidelines
- **Code Hygiene**: Delete backup/test files immediately after confirming working solution
- **Documentation**: Keep docs architectural, not session-specific
- **Testing**: Use MCP tools first, then test suite for regression
- **Commits**: Frequent commits after testing each granular change
- **File Management**: One working version per component - use git for history
- **Version Management**: Use `node scripts/get-version.js` for current version, `node scripts/update-versions.js` to sync all references

## Critical Directives
- **MAINTAIN CODE HYGIENE**: Prevent file proliferation - "one-in-one-out" rule
- **NO SESSION ARTIFACTS**: Remove temporary context from permanent docs  
- **GIT FOR HISTORY**: Don't keep backup files in filesystem
- **TEST AS YOU GO**: Each change should be immediately testable
- **CLEAN REFERENCES**: Update doc links when files are moved/deleted
- **Do not be overconfident about treating fixes and new work as 'production-ready' or 'enterprise-grade' etc.**

## Essential Workflows
- Change code → Reload extension → Test

## Tool Usage Directive
- Use all of the claude-chrome-mcp tools available to debug, test, and develop

```