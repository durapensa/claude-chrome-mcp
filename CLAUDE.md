# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session
- Focus: Test Suite Organization & Comprehensive Tool Testing
- Last update: 2025-05-31
- Version: 2.4.0 
- Status: Event-driven system operational, ready for test organization

## Quick Commands
```bash
# Check system health (ALWAYS run first)
mcp__claude-chrome-mcp__get_connection_health

# Test organized event-driven system
cd tests/organized && node test-event-driven-system.js

# Run comprehensive test suite
cd tests && node run-all-tests-v2.js
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

## Recent Updates (2025-05-31)
- **COMPLETED**: Event-Driven Completion Detection System (v2.4.0)
  - send_message_async, get_response_async, wait_for_operation tools
  - Real-time milestone detection via DOM MutationObserver
  - MCP notification streaming for live progress updates
  - Operation state persistence and recovery
  - Comprehensive test suite integration
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
- git commit frequently, whenever tasks are completed and tested. test as you go!