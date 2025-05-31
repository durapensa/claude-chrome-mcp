# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## System Status
- Version: 2.4.1
- Architecture: Extension-as-Hub with CustomEvent bridge for async operations
- Status: STABLE - Network-level response detection with complete async workflow

## Quick Commands
```bash
# 1. Check system health
mcp__claude-chrome-mcp__get_connection_health

# 2. Test async workflow
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab --injectContentScript true
mcp__claude-chrome-mcp__send_message_async --message "Test async: 7*8=?" --tabId <tab_id>

# 3. Get response after completion
mcp__claude-chrome-mcp__get_claude_dot_ai_response --tabId <tab_id>
```

## Important Tool Options
- `send_message_to_claude_tab`: Use `waitForReady: true` (default)
- `get_claude_response`: Keep `timeoutMs < 30000` for MCP

## Project Structure
- `extension/` - Chrome extension (WebSocket client)
- `mcp-server/` - MCP server
- `cli/` - Command-line tools
- `tests/` - Test suites with lifecycle management
- `docs/` - Documentation and development notes

## Key References
- Architecture: docs/ARCHITECTURE.md
- Troubleshooting: docs/TROUBLESHOOTING.md
- TypeScript: docs/TYPESCRIPT.md
- Roadmap: ROADMAP.md

## Architecture Overview
- **Extension-as-Hub**: Chrome extension runs WebSocket server, MCP clients connect to it
- **CustomEvent Bridge**: MAIN/ISOLATED world communication for network detection
- **Network-Level Detection**: Uses fetch interception + `/latest` endpoint for response completion
- **Async Operations**: Full async workflow with operation registration and milestone tracking

## Continuation Workflow
When you type 'continue', the system is ready for development and testing:

1. **System Health Check**: `get_connection_health`
2. **Standard Testing**: Follow testing workflow below  
3. **Development Tasks**: See Architecture and Troubleshooting docs for guidance

## Testing Workflow
1. **System Health**: `get_connection_health` - verify hub and clients connected
2. **Spawn Tab**: `spawn_claude_dot_ai_tab --injectContentScript true` 
3. **Async Message**: `send_message_async --message "test" --tabId <id>`
4. **Wait for Completion**: `wait_for_operation --operationId <id>`
5. **Get Response**: `get_claude_dot_ai_response --tabId <id>`

## Development Guidelines
- **Code Hygiene**: Delete backup/test files immediately after confirming working solution
- **Documentation**: Keep docs architectural, not session-specific
- **Testing**: Use MCP tools first, then test suite for regression
- **Commits**: Frequent commits after testing each granular change
- **File Management**: One working version per component - use git for history

## Critical Directives
- **MAINTAIN CODE HYGIENE**: Prevent file proliferation - "one-in-one-out" rule
- **NO SESSION ARTIFACTS**: Remove temporary context from permanent docs  
- **GIT FOR HISTORY**: Don't keep backup files in filesystem
- **TEST AS YOU GO**: Each change should be immediately testable
- **CLEAN REFERENCES**: Update doc links when files are moved/deleted