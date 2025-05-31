# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session  
- Focus: CustomEvent Bridge Implementation for Async System
- Last update: 2025-05-31
- Version: 2.4.1
- Status: READY FOR TESTING - CustomEvent bridge implemented, awaiting verification

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
- **COMPLETED**: MCP JSON Parsing Error Resolution
  - Fixed console.log statements in OperationManager corrupting stdout JSON-RPC stream
  - Server now starts cleanly without JSON corruption
- **COMPLETED**: Enhanced MCP Server Stability  
  - Replaced server.js with robust enhanced version
  - Added comprehensive error tracking and lifecycle management
  - Implemented proper signal handling with graceful shutdown
- **COMPLETED**: Content Script Injection Fixes
  - Fixed manifest.json to use content-network.js consistently
  - Implemented hybrid MAIN/ISOLATED world content script injection
  - Network detection working, detecting responses reliably
- **COMPLETED**: CustomEvent Bridge Implementation
  - Research confirmed: Scripts in MAIN world don't have chrome.runtime access
  - Replaced window.postMessage with CustomEvent for cross-world communication
  - More reliable bridge pattern following Chrome extension best practices
  - Both milestone reporting and operation registration updated
- **CURRENT ISSUE**: Bridge communication needs testing
  - Network detection works (responses detected: "81", "9*9=81")
  - message_sent milestones working, response_completed milestones missing
  - CustomEvent bridge should fix the communication gap
- **STATUS**: Ready for testing - extension reload and async workflow verification needed

## Continuation Instructions for Next Session
When you type 'continue', the system is ready for:

1. **PRIORITY ITEM**: Test CustomEvent Bridge Implementation
   - CustomEvent bridge implemented to fix MAIN/ISOLATED world communication
   - Need to reload extension and test async workflow end-to-end
   - Verify response_completed milestones now reach MCP server operations state

2. **System Health Status**:
   - ✅ JSON parsing errors RESOLVED - MCP communication clean
   - ✅ Enhanced server with stability features operational  
   - ✅ Content script injection FIXED - hybrid MAIN/ISOLATED worlds loading
   - ✅ Network detection WORKING - responses detected reliably
   - ✅ CustomEvent bridge IMPLEMENTED - awaiting verification

3. **Current State**:
   - CustomEvent bridge replaces postMessage (extension/background.js)
   - manifest.json fixed to use content-network.js consistently
   - Network detection working: detects "81", "9*9=81" responses
   - message_sent milestones working, response_completed pending bridge test
   - All changes committed: git commits af13148, 06905c6

4. **Files Changed in This Session**:
   - `extension/background.js` (CustomEvent bridge implementation)
   - `extension/manifest.json` (fixed content script path)
   - `CLAUDE.md` (updated with session results)
   - `tests/test-bridge-communication.js` (added for testing)

5. **Next Priorities**:
   - Reload Chrome extension to apply CustomEvent bridge changes
   - Test: mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab --injectContentScript true
   - Test: mcp__claude-chrome-mcp__send_message_async with wait_for_operation
   - Verify response_completed milestones reach operations state
   - Validate complete async workflow functionality
   - Test milestone reception in background script message handlers
   - Implement fallback detection if bridge communication fails
   - Validate end-to-end async workflow completion

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