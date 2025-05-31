# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session
- Focus: Fast and Reliable Async Functionality - Optimized ContentScriptManager & ConversationObserver
- Last update: 2025-05-31
- Version: 2.4.0 
- Status: Removed tab reloading kludge, created fast content script, simplified injection - ready for testing optimized async workflow

## Quick Commands - After Restart
```bash
# 1. Check system health after restart
mcp__claude-chrome-mcp__get_connection_health

# 2. Test complete optimized async workflow
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab --waitForLoad true --injectContentScript true
mcp__claude-chrome-mcp__send_message_async --message "Test complete async system - what's 7*8?"
# Should receive INSTANT MCP notification when response completes (no need to poll)

# 3. If successful, test get_response_async as well
mcp__claude-chrome-mcp__get_response_async --tabId <tab_id>
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
- **COMPLETED**: ContentScriptManager auto-injection mechanism 
  - Fixed injection using chrome.scripting.executeScript with files approach
  - Disabled conflicting automatic injection listeners to prevent race conditions
  - Added detailed error handling and logging for injection debugging
  - Verified injection working with `contentScriptInjected: true` response
- **COMPLETED**: Async operation registration system
  - Added `send_content_script_message` method to background script using chrome.tabs.sendMessage
  - Updated handleSendMessageAsync/handleGetResponseAsync to use message passing instead of execute_script
  - Added chrome.runtime.onMessage listener to content-fast.js for operation registration
  - Fixed execution context issue (ISOLATED world vs MAIN world) for proper chrome.runtime access
- **READY**: Test complete optimized async workflow after MCP server restart
- **NEXT**: Verify instant MCP notifications on response completion

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