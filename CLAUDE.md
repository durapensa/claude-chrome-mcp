# Claude Chrome MCP

Quick reference for Claude. See README.md for full documentation.

## Current Session
- Focus: Completed test infrastructure and error standardization
- Active tabs: All test tabs cleaned up

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

## Session Notes
- Fixed metadata extraction bug (removed incorrect retry logic)
- Added test lifecycle helpers for automatic cleanup
- Moved architectural enhancements to Q2 2025 roadmap
- Implemented standardized error codes (shared/error-codes.js)
- Created performance benchmark suite
- Reorganized documentation under docs/
- All test infrastructure complete and documented
- Added structured logging with rate limiting (shared/logger.js)
- Implemented tab pool prototype for connection reuse
- Created response cache with 600x performance improvement for repeated queries
- Commit frequently so that you can review changes.
- Test suite files should live in a dedicated folder
- After a given test fails and has been investigated, take inscrutable notes
- After a given test has succeeded unequivocally, cleanup any tabs (at your discretion, delete conversations and close tabs), files made or produced during testing
- When running manual tests, do not insert sleeps or delays; we need to stress-test for robustness and propose fixes, rather than test-passing reward hacking, for any problems found