# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## System Status
- Version: 2.5.0 (centralized version management)
- Architecture: WebSocket-only with offscreen documents
- Structure: Modular architecture with relay-based messaging
- Connection: Persistent WebSocket via Chrome offscreen documents (port 54322)

## Important System Limitations
- Claude Code cannot restart its own MCP servers. User must exit and re-run Claude Code if claude-chrome-mcp tools are not available
- **RESTART REQUIRED**: After making changes to mcp-server code, user must manually exit and re-run Claude Code to reload the MCP server with updates
- **EMBEDDED RELAY**: WebSocket relay is now embedded in MCP server with automatic election (no separate process needed)

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
- `extension/` - Chrome extension (transitioning from HTTP polling to WebSocket)
  - `offscreen.html` - (planned) Offscreen document for persistent WebSocket
  - `offscreen.js` - (planned) WebSocket connection management
  - `background.js` - Service worker with coordination logic
- `mcp-server/` - MCP server (modular architecture)
  - `src/server.js` - Main entry point (382 lines, modular)
  - `src/relay/` - Message relay for WebSocket communication
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

## Architecture Overview (WebSocket-Only with Embedded Relay)
- **Embedded Relay**: WebSocket relay embedded in MCP server with automatic election
  - First MCP server becomes relay host on port 54321
  - Additional servers connect as clients
  - Automatic failover on host exit
- **Offscreen Documents**: Persistent WebSocket connection (12+ hours)
- **Extension as Brain**: All coordination, locking, and conflict resolution in extension
- **Event-Driven**: Pure push messaging (no HTTP polling)
- **Multi-Agent Support**: Multiple MCP servers coordinate through relay
- **Health Endpoint**: http://localhost:54322/health for relay monitoring

## Continuation Workflow  
When you type 'continue', follow the standard workflow in docs/CONTINUATION.md

## Testing Workflow
1. **System Health**: `get_connection_health` - verify relay and clients connected
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

## Key Troubleshooting Memory
- If you encounter missing or broken tools, functions, etc. check git history, including pre-refactor source file content, as they may have been removed during refactor

## MCP Specification Reference
- MCP specification and source code is located at node_modules/@modelcontextprotocol. always reference this when making changes related to MCP