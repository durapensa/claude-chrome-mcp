# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session
- Focus: MCP Notification System - Network-Level Response Completion Detection
- Last update: 2025-05-31  
- Version: 2.4.0
- Status: Fixed get_response_async removal, implementing network stream interception for reliable completion detection

## Quick Commands - After Restart
```bash
# 1. Check system health after restart
mcp__claude-chrome-mcp__get_connection_health

# 2. Test streamlined async workflow with network-level detection
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab --injectContentScript true
mcp__claude-chrome-mcp__send_message_async --message "Test network stream detection: what's 7*8?"
# Should receive MCP notification when network stream completes

# 3. Use regular get_claude_dot_ai_response to retrieve completed response
mcp__claude-chrome-mcp__get_claude_dot_ai_response --tabId <tab_id> --waitForCompletion false
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
- **COMPLETED**: Streamlined async architecture
  - Removed redundant `get_response_async` tool - use `get_claude_dot_ai_response` after MCP notification
  - Cleaned up documentation to reflect streamlined workflow
  - Confirmed MCP notification pipeline works for `message_sent` milestone
- **IN PROGRESS**: Network-level completion detection
  - Identified issue: DOM-based detection unreliable due to React batching/timing
  - Implemented fetch() interception to detect stream completion directly
  - Added network monitoring for Claude API streaming responses
- **KEY INSIGHT**: Network stream completion is more reliable than DOM mutation detection
- **NEXT**: Test network-level detection and commit working solution

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