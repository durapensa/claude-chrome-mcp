# Troubleshooting Guide

## Chrome Extension Shows "Relay Not Connected"

### Problem
The Chrome extension popup shows "WebSocket Relay: Not connected" even when Claude Code is running with the MCP server.

### Diagnosis
Check relay status:
```bash
mcp system_health
```

Look for `"relayConnected": true` in the output.

### Quick Fix

1. **Option 1: Restart Claude Code**
   - Close Claude Code completely
   - Reopen and reconnect to the project
   - Check the extension popup again

2. **Option 2: Reload Extension**
   - Use `mcp chrome_reload_extension` to reload the extension
   - Wait 5 seconds for reconnection

3. **Option 3: Manual Reload**
   - Open Chrome Extensions page (chrome://extensions/)
   - Find "Claude Chrome MCP" and click reload button

### Why This Happens

1. The MCP server starts a WebSocket relay on port 54321
2. Extension may disconnect during development/debugging
3. Offscreen documents maintain persistent connections
4. Connection issues usually resolve with extension reload

### Verification

After applying the fix, verify:
1. Run `lsof -i :54321` - should show node process listening
2. Run `mcp system_health` - should show relay connected
3. Extension popup should show "Connected to relay"

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

**Diagnosis**: Check WebSocket connection health with `system_health`

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

## Debugging Methodology

### Evidence-Based Network Debugging

When debugging async operations or network-related issues, use systematic evidence gathering:

**Step 1: Health Check**
```bash
mcp__claude-chrome-mcp__system_health
```

**Step 2: Network Inspection** (for async/network issues)
```bash
# Start monitoring BEFORE sending messages
mcp__claude-chrome-mcp__chrome_start_network_monitoring --tabId <id>

# Send test message
mcp__claude-chrome-mcp__tab_send_message --message "test" --tabId <id>

# Analyze actual traffic patterns
mcp__claude-chrome-mcp__chrome_get_network_requests --tabId <id>

# Stop monitoring
mcp__claude-chrome-mcp__chrome_stop_network_monitoring --tabId <id>
```

**Step 3: Analyze Evidence**
- Look for `/latest` endpoints in captured requests
- Verify `/completion` streams are being detected
- Check if network interception is working

### Critical Development Pattern

**Always reload extension after code changes**:
1. Make changes to `extension/background.js`
2. **Reload Chrome extension** (chrome://extensions)
3. Test changes

**Common failure pattern**: Changing code → Testing → Assuming fix doesn't work → More debugging
**Correct pattern**: Changing code → **Reloading extension** → Testing → Verification

### Common Debugging Anti-Patterns

❌ **Don't fallback to console logging methodology**
- Avoid using `execute_script` for logging when network tools exist
- Don't assume network patterns without evidence

❌ **Don't skip systematic tool usage**
- Network inspection should be first step for network issues
- Use MCP tools methodically rather than randomly

✅ **Do use evidence-based approach**
- Capture actual network traffic before making assumptions

## MCP Tool Timeout Issues

### When MCP tools are timing out

**Symptoms**: 
- MCP commands hang or timeout
- `mcp daemon status` times out
- Tools that usually work suddenly stop responding

**Troubleshooting Steps**:

1. **Reload the Extension First** (Most Common Fix)
   ```bash
   mcp chrome_reload_extension
   ```
   Wait 5 seconds for reconnection

2. **Check System Health**
   ```bash
   mcp system_health
   ```
   
3. **Restart the Daemon** (if extension reload doesn't help)
   ```bash
   mcp daemon stop && sleep 1 && mcp daemon start
   ```

4. **Manual Extension Reload** (if CLI reload fails)
   - Open chrome://extensions/
   - Find "Claude Chrome MCP" 
   - Click the reload button
   
5. **Check Logs for Errors**
   ```bash
   tail -50 ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log | grep -i error
   ```

**Why Extension Reload Helps**:
- Extension may lose WebSocket connection to relay
- Background scripts can enter suspended state
- Content scripts may become stale
- Offscreen documents might need reinitialization

**Important**: After extension reload, existing tabs lose their content scripts. You must:
1. Close old tabs with `mcp tab_close --tabId <id> --force`
2. Create fresh tabs with `mcp tab_create --injectContentScript`

**Best Practice**: Always try reloading the extension first when experiencing timeouts before deeper debugging.
- Use systematic tool sequences
- Verify each component independently

### Tool Selection Guide

**For async operation issues**:
1. `system_health` - System status
2. `chrome_start_network_monitoring` - Traffic analysis
3. `tab_get_response` - Response verification
4. `tab_debug_page` - Page state

**For connection issues**:
1. `system_health` - Relay and client status
2. `tab_list` - Tab verification
3. `chrome_debug_attach` - Advanced debugging

## Logging and Debugging

### Understanding Log Sources

There are **two distinct log systems**:

1. **MCP Server Logs** (winston files)
   - Location: `~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log`
   - Contains: MCP server operations, relay client activity, tool executions
   - Always active, written to disk
   - View: `tail -f ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log`

2. **Chrome Extension Logs** (forwarded to MCP server)
   - Source: Chrome extension background/content scripts
   - Contains: Extension initialization, tab operations, content script activity
   - Requires debug mode enabled to forward to MCP server
   - View: `mcp system_get_extension_logs`

### Development Logging Workflow

**Step 1: Enable Extension Debug Mode**
```bash
# Enable all extension logs
mcp system_enable_extension_debug_mode

# Or enable only ERROR level logs
mcp system_enable_extension_debug_mode --errorOnly

# Set extension log level
mcp system_set_extension_log_level --level DEBUG
```

**Step 2: Perform Operations**
```bash
# Execute your test operations
mcp tab_create --injectContentScript
mcp tab_send_message --message "test" --tabId <id>
```

**Step 3: Review Extension Logs**
```bash
# Get recent extension logs
mcp system_get_extension_logs --limit 50 --format text

# Filter by component
mcp system_get_extension_logs --component background --limit 20

# Get specific log levels
mcp system_get_extension_logs --level ERROR --limit 10
```

**Step 4: Check MCP Server Logs**
```bash
# View real-time MCP server logs
tail -f ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log

# Search for errors
grep -i error ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log
```

**Step 5: Disable Debug Mode** (optional)
```bash
mcp system_disable_extension_debug_mode
```

### Common Extension Components

When filtering extension logs by component:
- `background` - Extension background script
- `relay-client` - WebSocket relay communication
- `content-script` - Claude.ai page interactions
- `batch-operations` - Multi-tab operations
- `tab-operations` - Individual tab management

### Testing Flow Best Practices

1. **After extension code changes - reload extension**
   ```bash
   mcp chrome_reload_extension
   ```

2. **After MCP server/tool changes - restart CLI daemon**
   ```bash
   mcp daemon stop && sleep 2 && mcp daemon start
   ```

3. **Enable debug mode before testing**
   ```bash
   mcp system_enable_extension_debug_mode --errorOnly
   ```

4. **Clean up test tabs (especially after extension reload)**
   ```bash
   mcp tab_list
   mcp tab_close --tabId <id> --force
   # After extension reload, always create fresh tabs
   mcp tab_create --injectContentScript
   ```

5. **Monitor both log sources during testing**
   - Terminal 1: `tail -f ~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log`
   - Terminal 2: `mcp system_get_extension_logs --limit 20` (run periodically)

### Extension Reload Behavior
- Extension reload clears ALL content scripts from existing tabs
- Tabs created before reload will show "Content script not available" errors
- **Required workflow**: Close old tabs → Create fresh tabs after any extension reload
- This is expected behavior, not a bug

### Log Level Guidelines

**Extension Log Levels** (from most to least verbose):
- `VERBOSE` - Everything (development debugging)
- `DEBUG` - Detailed operation tracking
- `INFO` - Normal operations
- `WARN` - Potential issues
- `ERROR` - Critical failures only

**MCP Server Log Levels**:
- Set via `LOG_LEVEL` environment variable
- Same hierarchy as extension levels
- Controls what gets written to winston files

**For response detection**:
1. `chrome_start_network_monitoring` - Monitor `/latest` endpoints
2. `chrome_execute_script` - Manual completion triggers
3. `chrome_get_network_requests` - Network pattern analysis

## Debug Mode

Enable verbose logging:
```bash
CCM_DEBUG=1 CCM_VERBOSE=1 node mcp-server/src/server.js
```

This will show detailed hub startup and connection logs.