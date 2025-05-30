# Chrome Extension Reconnection Test Checklist

## Pre-Test Setup
- [ ] Chrome extension is loaded and active
- [ ] Extension popup is visible and shows "Connected" status
- [ ] Current connection health shows as "healthy"

## Test Steps

### 1. Before Claude Code Exit
- [ ] Open Chrome extension popup
- [ ] Note the current status (should show WebSocket Hub connected)
- [ ] Note any Claude.ai sessions listed
- [ ] Keep the popup open to watch status changes

### 2. Exit Claude Code
- [ ] Press Ctrl+C in Claude Code terminal
- [ ] Watch extension popup - should show "Not connected" within 1-2 seconds
- [ ] Note the time when disconnection occurs

### 3. Monitor Reconnection Attempts
- [ ] Watch Chrome DevTools console (chrome://extensions → Claude Chrome MCP → service worker)
- [ ] You should see:
  - "Disconnected from WebSocket Hub"
  - "Scheduling reconnection attempt" messages
  - "Persistent reconnection attempt" every 5 seconds

### 4. Restart Claude Code
- [ ] Start Claude Code again
- [ ] Note the time when you start it
- [ ] Watch extension popup for reconnection

### 5. Verify Reconnection
- [ ] Extension should show "Connected" within 5 seconds
- [ ] Calculate total reconnection time (should be < 5 seconds)
- [ ] Verify MCP clients show "Claude Code" as connected
- [ ] Test basic functionality (e.g., get_claude_tabs)

## Expected Timeline
1. Claude Code exit → Extension shows disconnected: ~1 second
2. Claude Code restart → Hub available: ~2-3 seconds  
3. Extension detects hub → Connected status: ~1-2 seconds
4. **Total time**: < 5 seconds

## Success Criteria
- ✅ No manual extension reload required
- ✅ Reconnection happens within 5 seconds
- ✅ Extension functionality restored automatically
- ✅ No "NaNs ago" display issues

## Troubleshooting
- If reconnection takes > 5 seconds, check DevTools console for errors
- If manual reload is needed, the fix didn't work properly
- Check chrome://extensions for any extension errors

## Console Commands for Testing
```bash
# In Chrome DevTools console (service worker)
chrome.storage.local.get(['reconnectAttempts', 'hasPersistentReconnect'], console.log)

# Check current connection state
ccmHub.isConnected()
ccmHub.reconnectAttempts
ccmHub.persistentReconnectInterval
```