# Problem Resolution

## MCP Tool Timeout Issues

WHEN: MCP tools hang or timeout  
THEN: Try systematic resolution in order:
1. `mcp chrome_reload_extension` (wait 5 seconds)
2. `mcp system_health` to check status
3. `mcp daemon stop && sleep 1 && mcp daemon start`
4. Manual extension reload at chrome://extensions/

WHEN: Extension reload completed  
THEN: Close old tabs and create fresh ones:
1. `mcp tab_close --tabId <id> --force`
2. `mcp tab_create --injectContentScript`

## Connection Issues

WHEN: Extension popup shows "WebSocket Relay: Not connected"  
THEN: Run `mcp system_health` to check relay status

WHEN: `system_health` shows `"relayConnected": false`  
THEN: Try in order:
1. `mcp chrome_reload_extension` (wait 5 seconds)
2. Restart Claude Code completely
3. Manual extension reload at chrome://extensions/

WHEN: Connection fix applied  
THEN: Verify with `mcp system_health` showing `"relayConnected": true`

## Operation Issues

WHEN: Operation returns `operationId` but never completes  
THEN: Check in order:
1. Reload Claude.ai tab (DOM observer may have detached)
2. Verify operation in `.operations-state.json`
3. Check content script injection status

WHEN: `tab_forward_response` returns ID but message doesn't appear  
THEN: Verify:
1. Target tab ID is valid and tab is active
2. `{response}` placeholder syntax is correct
3. Source tab has completed response before forwarding

WHEN: Operations complete but notifications are delayed  
THEN: Try `mcp chrome_reload_extension` to resolve WebSocket issues

## Diagnostic Tool Selection

WHEN: Need diagnostic tool selection  
THEN: Use based on issue type:
- **Async operations**: `system_health` → `chrome_start_network_monitoring` → `tab_get_response`
- **Connection issues**: `system_health` → `tab_list` → `chrome_debug_attach`

WHEN: Debugging async operations  
THEN: Use systematic evidence gathering:
1. `mcp system_health`
2. `mcp chrome_start_network_monitoring --tabId <id>`
3. Execute operation
4. `mcp chrome_get_network_requests --tabId <id>`
5. `mcp chrome_stop_network_monitoring --tabId <id>`

## Logging and Diagnostics

WHEN: Need to debug extension behavior  
THEN: Enable debug mode and check logs:
1. `mcp system_enable_extension_debug_mode --errorOnly`
2. Execute operation
3. `mcp system_get_extension_logs --limit 20`

WHEN: Need to check MCP server logs  
THEN: View logs at `~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-*.log`

WHEN: Extension reload completed  
THEN: Content scripts are cleared - close old tabs and create fresh ones

## Conflict Resolution

WHEN: Guidelines conflict  
THEN: Prioritize not breaking user workflows

WHEN: Problem persists after standard resolution  
THEN: Enable debug logging and review systematic evidence-gathering procedures above