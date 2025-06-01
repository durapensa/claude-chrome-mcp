# Troubleshooting Guide

## Chrome Extension Shows "Hub Not Connected"

### Problem
The Chrome extension popup shows "WebSocket Hub: Not connected" even when Claude Code is running with the MCP server.

### Diagnosis
Run the diagnostic script:
```bash
node shared/check-hub-status.js
```

If it shows "No hub is running on port 54321", the MCP server hasn't started the WebSocket hub.

### Quick Fix (Workaround)

1. **Option 1: Restart Claude Code**
   - Close Claude Code completely
   - Reopen and reconnect to the project
   - Check the extension popup again

2. **Option 2: Manual Hub Start**
   - Open a terminal in the project directory
   - Run: `CCM_FORCE_HUB_CREATION=1 node mcp-server/src/server.js`
   - The extension should connect within 5 seconds

3. **Option 3: Use the Reconnect Button**
   - If the hub is actually running but extension shows disconnected
   - Click the "Reconnect" button in the extension popup (if visible)

### Permanent Fix

The issue is in the MCP server's hub detection logic. To fix:

1. **Set environment variable** (in your MCP host settings or .env):
   ```
   CCM_FORCE_HUB_CREATION=1
   ```

2. **Update MCP server** to force hub creation when needed

### Why This Happens

1. The MCP server tries to connect to an existing hub first
2. Sometimes this check gives a false positive (thinks hub exists when it doesn't)
3. The server then skips starting its own hub
4. Result: No hub running, extension can't connect

### Verification

After applying the fix, verify:
1. Run `lsof -i :54321` - should show node process listening
2. Run `node shared/check-hub-status.js` - should show hub running
3. Extension popup should show "Connected to port 54321"

## Async Operation Issues

### Async Operations Not Completing
**Symptoms**: Operation returns `operationId` but never sends completion notification.

**Diagnosis**:
1. Check if DOM observer is working: Look for console messages in Claude.ai tab
2. Verify operation is in state file: `cat .operations-state.json`
3. Check MCP server logs for notification sending

**Fixes**:
1. **Reload Claude.ai tab**: DOM observer may have detached
2. **Restart MCP server**: Recovers operations from state file
3. **Check content script injection**: Ensure content script is properly injected

### Forward Response Tool Issues
**Symptoms**: `forward_response_to_claude_dot_ai_tab` returns operation ID but message doesn't appear in target tab.

**Fixes**:
1. **Verify target tab**: Ensure target tab ID is valid and tab is active
2. **Check template syntax**: Ensure `{response}` placeholder is properly formatted
3. **Wait for source completion**: Source tab must have completed response before forwarding

### MCP Notification Delays
**Symptoms**: Operations complete but notifications arrive late or not at all.

**Diagnosis**: Check WebSocket connection health with `get_connection_health`

**Fixes**:
1. **Restart extension**: May resolve WebSocket notification issues
2. **Check network connectivity**: Ensure localhost connections aren't blocked
3. **Verify hub is running**: `lsof -i :54321` should show active connection

## Other Common Issues

### Extension Doesn't Auto-Reconnect After Inactivity

**Fix**: The latest version includes auto-reconnection on popup open. If not working:
1. Reload the extension in Chrome
2. Check chrome://extensions for any errors
3. Ensure you're using the latest popup.js

### Multiple MCP Clients Show as Connected

**Normal**: You might see multiple clients if:
- You have multiple Claude Code instances
- You ran manual tests
- Previous connections weren't cleaned up

**Fix**: Restart the MCP server to clear stale connections

### "NaN ago" in Last Active Time

**Fix**: This was fixed in the latest popup.js. Reload the extension.

### Tab Pool Not Working

**Fix**: Enable with environment variable:
```
TAB_POOL_ENABLED=1
```

## Debug Mode

Enable verbose logging:
```bash
CCM_DEBUG=1 CCM_VERBOSE=1 node mcp-server/src/server.js
```

This will show detailed hub startup and connection logs.