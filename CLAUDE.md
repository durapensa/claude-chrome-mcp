# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session
- Focus: Testing Fixed ContentScriptManager Auto-Injection & Complete Async Workflow
- Last update: 2025-05-31
- Version: 2.4.0 
- Status: ContentScriptManager auto-injection fixed for Manifest V3, ready for end-to-end testing

## Quick Commands
```bash
# FIRST: Reload extension to activate fixed ContentScriptManager
mcp__claude-chrome-mcp__reload_extension

# Check system health 
mcp__claude-chrome-mcp__get_connection_health

# Test complete async system with auto-injection
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab --waitForLoad true --injectContentScript true
mcp__claude-chrome-mcp__send_message_async --message "Test auto-injection - what's 9*7?"
mcp__claude-chrome-mcp__wait_for_operation --operationId <operation_id>
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
- **FIXED**: ContentScriptManager auto-injection for Manifest V3
  - Event listeners moved to top of background.js for service worker persistence
  - Chrome.scripting.executeScript with chrome.debugger fallback
  - Proper global variable handling for contentScriptManager reference
- **ENHANCED**: ConversationObserver completion detection
  - Added monitorResponseElement() for real-time response tracking
  - Added checkResponseContentCompletion() with 2-second delay detection
  - Enhanced mutation observers for text changes and completion states
- **COMPLETED**: Async spawn_claude_dot_ai_tab with injection options
  - waitForLoad, injectContentScript, waitForReady options added
  - Content script injection verification and tab preparation
- **READY**: Complete async workflow from spawn → inject → send → detect → notify

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