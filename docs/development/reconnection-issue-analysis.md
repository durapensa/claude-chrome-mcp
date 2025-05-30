# Chrome Extension Reconnection Issue Analysis

## Problem Summary
When Claude Code restarts, the Chrome extension fails to reconnect to the WebSocket hub, showing "Failed to connect to WebSocket Hub" error. Users must manually reload the extension to restore the connection.

## Root Cause Analysis

### Architecture Overview
```
[Claude Code MCP Server] ←→ [WebSocket Hub :54321] ←→ [Chrome Extension]
```

### Issue Details

1. **Hub Lifecycle Tied to MCP Server**
   - When MCP server starts and no hub exists, it creates and "owns" the hub
   - When MCP server shuts down, it takes the hub with it
   - Chrome extension loses connection and cannot create a new hub

2. **Asymmetric Reconnection Capabilities**
   - MCP Server: Can both connect to existing hub OR create new hub
   - Chrome Extension: Can ONLY connect to existing hub

3. **Timing Issues**
   - Extension attempts reconnection but finds no hub
   - Eventually gives up or reduces retry frequency
   - When MCP server restarts and creates hub, extension isn't actively trying

## Current Reconnection Logic

### MCP Server (Working correctly)
```javascript
// Robust reconnection with hub creation fallback
async connect() {
  try {
    await this.connectToExistingHub(5000);
  } catch (error) {
    await this.startHubAndConnect(); // Can create new hub
  }
}
```

### Chrome Extension (Insufficient)
```javascript
// Only tries to connect, cannot create hub
connectToHub() {
  this.hubConnection = new WebSocket(`ws://localhost:${HUB_PORT}`);
  // ... error leads to scheduleReconnect()
}
```

## Why Manual Reload Works
When user reloads the extension:
1. All state is reset (reconnectAttempts = 0)
2. Fresh connection attempt is made immediately
3. By this time, MCP server has already created the hub
4. Connection succeeds

## Proposed Solutions

### Solution 1: Enhanced Reconnection (Recommended)
Add persistent reconnection with intelligent backoff reset:

```javascript
class CCMHub {
  constructor() {
    this.maxReconnectAttempts = -1; // Infinite
    this.resetAttemptsAfter = 300000; // 5 minutes
    this.lastConnectionAttempt = 0;
    this.persistentReconnectInterval = null;
  }

  scheduleReconnect() {
    // Reset attempts if enough time has passed
    if (Date.now() - this.lastConnectionAttempt > this.resetAttemptsAfter) {
      this.reconnectAttempts = 0;
    }
    
    // Continue with exponential backoff...
    
    // Also set up persistent retry every 30 seconds
    if (!this.persistentReconnectInterval) {
      this.persistentReconnectInterval = setInterval(() => {
        if (!this.isConnected()) {
          this.connectToHub();
        }
      }, 30000);
    }
  }
}
```

### Solution 2: Hub Status Endpoint
Add a lightweight HTTP endpoint to check hub status:
- Extension polls endpoint before WebSocket connection
- Knows when hub is available
- Reduces failed WebSocket connection attempts

### Solution 3: Chrome Storage Events
Use Chrome storage to communicate between extension instances:
- MCP server (via extension API) sets flag when hub is ready
- Extension watches for this flag before attempting connection

## Recommended Implementation

1. **Immediate**: Implement Solution 1 (Enhanced Reconnection)
   - Minimal code changes
   - Solves the immediate problem
   - No architectural changes needed

2. **Future**: Consider Solution 2 or 3 for robustness
   - Better visibility into hub status
   - Reduced failed connection attempts
   - Improved user experience

## Testing the Fix

1. Start Claude Code with extension connected
2. Stop Claude Code (Ctrl+C or close terminal)
3. Wait 10 seconds
4. Restart Claude Code
5. Extension should reconnect within 30 seconds without manual reload

## Impact
- Users won't need to manually reload extension after Claude Code restarts
- Better developer experience during development/testing
- More robust connection handling overall