# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session
- Focus: Robustness improvements and stress testing
- Last update: 2025-01-30
- See: `/development/session-summary-2025-01-30.md`

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

## Recent Updates (2025-01-30)
- **Robustness**: Added MessageQueue and TabOperationLock classes
- **Fixed**: Concurrent message sending race conditions (60% failure rate → 0%)
- **UI**: Applied popup improvements (fixed "NaNs ago" display)
- **Documented**: Stress test findings in `/tests/stress-test-results.md`
- **Pending**: Fix batch_get_responses timeout issue

## Development Guidelines
- Commit frequently so that you can review changes
- Test suite files should live in a dedicated folder
- After tests succeed, cleanup tabs/conversations
- No artificial delays in tests - stress-test for robustness
- See `/development/` for session summaries and notes