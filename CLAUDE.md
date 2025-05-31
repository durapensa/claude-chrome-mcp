# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session
- Focus: Hub startup fix and version management
- Last update: 2025-05-30
- See: `/development/CURRENT_STATE.md` (CRITICAL - Read First!)
- Session summaries: `/development/session-summary-2025-05-30*.md`

## Quick Commands
```bash
# Run tests
cd tests && node regression-test-suite.js

# Check system health
mcp__claude-chrome-mcp__get_connection_health
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
- Testing: docs/development/TESTING.md  
- Issues: docs/development/ISSUES.md
- Roadmap: ROADMAP.md

## Recent Updates (2025-05-30)
- **FIXED**: MCP server shutdown issue - now exits cleanly when host terminates
- **Completed**: Test suite refactoring with shared connections
- **Completed**: Tab pool production implementation (v2)
- **Completed**: TypeScript types for all APIs
- **Completed**: Integration tests without server spawn
- **Completed**: Enhanced signal handling and process lifecycle management

## Development Guidelines
- Commit frequently so that you can review changes
- Test suite files should live in a dedicated folder
- After tests succeed, cleanup tabs/conversations
- No artificial delays in tests - stress-test for robustness
- See `/development/` for session summaries and notes
- At the completion of each granular fix or task, if possible test just that fix or task before moving onto the rest; enhance the test suite if necessary, keeping it granular enough for this workflow

## Workflow Consistency Checklist
- Verify entire workflow launch process for Claude Code
- Ensure proper instruction and directive chaining
- Check workflow paths starting from CLAUDE.md
- Validate references in chained markdown files
- Maintain consistency in startup and continuation protocols

## Critical Directives
- do not overwrite or move user-added memories to CLAUDE.md
- regularly cleanup all of project md files for summary, analysis, plans, etc. incorporating only current state into documentation md files. key and well tested changes can be placed in the changelog

## Testing Guidelines
- when testing, always attempt to test first from claude-chrome-mcp tools available to you before using tests in tests/

## Development Memories
- when developing with MCP always refer to mcp-server/node_modules/@modelcontextprotocol
- in documentation, notes, and other places, do not add indications that features are completed until after extensive testing and Claude Code user approval