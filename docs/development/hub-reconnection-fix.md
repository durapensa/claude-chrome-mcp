# Hub Reconnection Fix

## Problem
The Chrome extension shows "Hub Not Connected" in the popup after periods of inactivity, even though Claude Code is running and the MCP server (which provides the hub) should be available.

## Root Causes
1. **Stale WebSocket Connection**: The WebSocket connection object remains but is actually closed
2. **No Popup-Triggered Reconnection**: Opening the popup doesn't trigger a reconnection attempt
3. **Service Worker Lifecycle**: Chrome suspends service workers after ~30 seconds of inactivity
4. **State Detection Issues**: The connection state check only looks at WebSocket readyState, not actual connectivity

## Solution

### 1. Enhanced Popup with Reconnection Logic

**Key Changes in popup.js:**
- Force reconnection check when popup opens
- Add periodic hub health checks
- Show reconnect button when disconnected
- Display last connection attempt time

```javascript
// Force immediate hub check and reconnection attempt
await this.forceHubReconnection();

// Periodic health checks
async checkHubHealth() {
  const status = await this.getBackgroundStatus();
  if (!status.hubConnected && status.serverPort) {
    await this.forceHubReconnection();
  }
}
```

### 2. Background Script Improvements

**Key Changes in background.js:**
- Add `forceHubReconnection` message handler
- Implement connection health checks with ping
- Enhanced error handling and timeouts
- Better state tracking

```javascript
// Handle forced reconnection from popup
else if (request.type === 'forceHubReconnection') {
  this.handleForcedReconnection().then(result => {
    sendResponse(result);
  });
  return true; // Keep channel open for async response
}

// Health check with actual ping
async checkConnectionHealth() {
  if (this.hubConnection?.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    this.hubConnection.send(JSON.stringify({ type: 'ping' }));
    return true;
  } catch (error) {
    this.hubConnection = null;
    return false;
  }
}
```

### 3. UI Improvements

**Add to popup.html:**
```html
<!-- Add reconnect button in help section -->
<button id="reconnect-btn" class="reconnect-button" style="display: none;">
  Reconnect
</button>
```

**Add to popup CSS:**
```css
.reconnect-button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  margin-top: 8px;
}

.reconnect-button:hover {
  background: #2563eb;
}

.reconnect-button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}
```

## Implementation Steps

1. **Update popup.js** with the enhanced version that includes:
   - Forced reconnection on popup open
   - Periodic health checks
   - Manual reconnect button handling

2. **Update background.js** to add:
   - `forceHubReconnection` message handler
   - `handleForcedReconnection` method
   - `checkConnectionHealth` method
   - Enhanced keepalive with health checks

3. **Update popup.html** to add:
   - Reconnect button
   - Last connection attempt display

4. **Test the fix**:
   - Start Claude Code (MCP server runs)
   - Wait for extension to connect
   - Wait 5+ minutes for inactivity
   - Open popup - should auto-reconnect
   - If not, click Reconnect button

## Benefits

1. **Automatic Recovery**: Popup opening triggers reconnection
2. **User Control**: Manual reconnect button available
3. **Better Feedback**: Shows connection attempts and timing
4. **Resilient**: Handles stale connections properly
5. **No Performance Impact**: Only checks when popup is open

## Testing Checklist

- [ ] Popup opens and shows correct hub status
- [ ] After inactivity, popup triggers reconnection
- [ ] Reconnect button appears when disconnected
- [ ] Reconnect button successfully reconnects
- [ ] Connection state persists across popup open/close
- [ ] No excessive reconnection attempts
- [ ] Clean error handling for failed connections

## Future Improvements

1. **Exponential Backoff**: Smarter retry timing
2. **Connection Quality Indicator**: Show connection strength
3. **Auto-reconnect Toggle**: User preference for auto-reconnection
4. **Connection History**: Show recent connection events
5. **Hub Availability Detection**: Check if port 54321 is actually listening