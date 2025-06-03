# Hub Election Fix - Removing Forced Hub Creation

## Issue Discovered
The MCP server was forcing hub creation with `CCM_FORCE_HUB_CREATION = '1'`, which conflicted with the multi-hub election architecture:

1. **Port Conflicts**: Multiple MCP servers tried to bind to port 54321
2. **Election Bypass**: Hub election mechanism was bypassed by forced creation
3. **Connection Failures**: Second and subsequent servers would fail with EADDRINUSE

## Root Cause
- Added in commit f0ebb89 to fix "hub not starting" issues
- Was meant to ensure MCP server always creates its own hub
- Conflicted with the distributed multi-hub architecture

## Solution Applied
1. Removed the line `process.env.CCM_FORCE_HUB_CREATION = '1';` from `server.js`
2. Removed Claude Code exception from hub-client.js that forced hub creation
   - Changed: `forceHubCreation = ... || process.env.ANTHROPIC_ENVIRONMENT === 'claude_code'`
   - To: `forceHubCreation = process.env.CCM_FORCE_HUB_CREATION === '1'`

## Expected Behavior After Fix
1. **First MCP Server**: Checks for existing hub, creates one if none found
2. **Subsequent Servers**: Connect to existing hub on port 54321
3. **Hub Election**: If hub fails, election determines new hub owner
4. **Chrome Extension**: Connects to the single active hub on port 54321

## Architecture Notes
- Multi-hub discovery runs on port 54322
- Main hub runs on port 54321
- Hub election uses priority scoring:
  - Claude Code instances get +50 priority (preferred but not forced)
  - Uptime adds up to +100 priority
  - Higher priority wins elections
- Lexicographic ID ordering as tiebreaker
- Claude Code no longer forces hub creation, allowing proper multi-instance coordination

## Testing Required
After restarting Claude Code:
1. First instance should create hub
2. Second instance should connect as client
3. Extension should see both MCP clients
4. Killing first instance should trigger election

## Related Components
- `AutoHubClient.connect()` - Hub detection logic
- `MultiHubManager` - Election and failover
- `WebSocketHub` - Single hub instance per port