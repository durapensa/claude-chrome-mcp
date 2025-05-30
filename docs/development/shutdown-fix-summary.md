# MCP Server Shutdown Fix Summary

## Problem
The MCP server process was not exiting cleanly when Claude Code shut down, leaving orphaned processes that prevented new Claude Code instances from connecting to the Chrome extension.

## Root Causes
1. **SIGPIPE handling**: The process was trying to shutdown on SIGPIPE signals, which occur when stdout is closed but aren't necessarily shutdown signals
2. **Async shutdown race conditions**: Multiple shutdown paths could trigger simultaneously
3. **Slow shutdown timeouts**: Emergency shutdown had a 1-second delay, graceful shutdown had a 5-second timeout
4. **Missing await statements**: Some async cleanup functions weren't properly awaited

## Implemented Fixes

### 1. Improved Signal Handling
```javascript
// Handle SIGPIPE separately - it's not a shutdown signal
process.on('SIGPIPE', () => {
  console.error('CCM: Received SIGPIPE, stdout likely closed');
  // Don't shutdown on SIGPIPE, just note it
});

// Real shutdown signals
const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
```

### 2. Faster Shutdown Timeouts
- Graceful shutdown timeout: 5000ms → 3000ms
- Emergency shutdown delay: 1000ms → 500ms
- Process exit delay after cleanup: 1000ms → 100ms

### 3. Better Stdin Handling
```javascript
// Handle stdin end/error
if (process.stdin.isTTY === false) {
  process.stdin.on('end', async () => {
    console.error('CCM: stdin closed');
    await this.gracefulShutdown('stdin_closed');
  });

  process.stdin.on('error', async (error) => {
    if (error.code === 'EPIPE') {
      console.error('CCM: stdin EPIPE error');
      await this.gracefulShutdown('stdin_epipe');
    }
  });

  // Resume stdin to detect when it closes
  process.stdin.resume();
}
```

### 4. Prevent Multiple Shutdowns
```javascript
async gracefulShutdown(reason = 'unknown') {
  // Prevent multiple simultaneous shutdowns
  if (this.isShuttingDown) {
    console.error(`CCM: Shutdown already in progress (original: ${this.shutdownReason}, new: ${reason})`);
    return this.shutdownPromise;
  }
  // ... rest of shutdown logic
}
```

### 5. Proper Async Cleanup
- Added `await` to all async cleanup operations
- Hub shutdown now properly terminates all WebSocket connections
- Clear all intervals immediately on shutdown

## Testing
Created comprehensive test suite (`test-shutdown-behavior.js`) that validates:
- ✅ SIGTERM shutdown (clean exit code 0)
- ✅ SIGINT shutdown (Ctrl+C simulation)
- ✅ Multiple MCP servers can coexist
- ✅ Quick restart scenarios
- ⚠️  Stdin close (works but slower than expected)

## User Impact
- MCP server processes now exit cleanly and quickly when Claude Code shuts down
- No more orphaned processes blocking reconnection
- Multiple Claude Code instances can connect/disconnect without issues
- Faster recovery time when restarting Claude Code

## Compatibility
The fix maintains full compatibility with the multi-client architecture:
- Multiple MCP clients (Claude Code, Claude Desktop, Cursor, etc.) can connect simultaneously
- Hub ownership transfers work as designed
- Chrome extension reconnects quickly to available hubs

## Next Steps
- Monitor real-world usage for any edge cases
- Consider optimizing stdin close detection (currently working but could be faster)
- Update popup UI to better show multi-client connection status