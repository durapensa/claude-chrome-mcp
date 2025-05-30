# Hub Not Starting Issue

## Problem
The WebSocket hub on port 54321 is not running even though the claude-chrome-mcp server should have started it. The Chrome extension shows "Hub Not Connected" and no process is listening on port 54321.

## Investigation

1. **MCP Server has embedded hub**: The server.js includes WebSocketHub class and AutoHubClient
2. **AutoHubClient should start hub**: In `startHubAndConnect()`, it creates and starts a WebSocketHub
3. **Port check shows nothing**: `lsof -i :54321` returns no listening process

## Possible Causes

1. **Hub start failure**: The hub might be failing to start due to:
   - Port permissions
   - Previous instance not cleaned up
   - Error during initialization

2. **AutoHubClient connection logic**: The client might be:
   - Connecting to existing hub instead of starting its own
   - Failing silently during hub startup
   - Not being initialized properly

3. **MCP server lifecycle**: The server might be:
   - Not calling the hub initialization code
   - Shutting down the hub prematurely
   - Running in a mode that doesn't start the hub

## Diagnosis Steps

1. Check MCP server console output for hub-related messages
2. Verify AutoHubClient initialization path
3. Check for error handling around hub startup
4. Look for conditional logic that might skip hub creation

## Code Analysis

In `AutoHubClient.connect()`:
```javascript
async connect() {
  try {
    // First, try to connect to existing hub
    await this.tryConnectToHub();
    console.error('CCM: Connected to existing hub as', this.clientInfo.name);
  } catch (error) {
    // If no hub exists, start our own
    console.error('CCM: No existing hub found, starting embedded hub...');
    await this.startHubAndConnect();
    console.error('CCM: Started embedded hub and connected as', this.clientInfo.name);
  }
}
```

The logic tries to connect to existing hub first, and only starts its own if that fails.

## Potential Fixes

1. **Force hub start**: Add environment variable to force hub creation
2. **Better error reporting**: Add more logging around hub initialization
3. **Port check before start**: Verify port is available before starting
4. **Retry logic**: Add retries for hub startup failures

## Workaround

For now, users can manually start the hub by running the MCP server directly:
```bash
node mcp-server/src/server.js
```

This should start the hub and allow the extension to connect.

## Root Cause Hypothesis

The most likely cause is that the MCP server running via Claude Code is successfully connecting to a non-existent hub (false positive) or the hub startup is failing silently. The try/catch block might be catching and suppressing the actual error.