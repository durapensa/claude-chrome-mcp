# Known Issues

## High Priority

### 1. ~~`batch_get_responses` Timeout Conflict~~ ✅ RESOLVED
- **Problem**: 30-second timeout conflicts with MCP timeout
- **Solution**: Removed the problematic tool entirely. Use individual `get_claude_response` calls or implement custom batch logic in your application
- **Note**: The tool has been removed from the MCP server to prevent timeout issues

### 2. Rapid Message Sending Failures
- **Problem**: Sending messages too quickly fails with "Send button not found"
- **Impact**: Sequential operations may fail without proper waiting
- **Workaround**: Use `waitForReady: true` option

## Medium Priority

### 3. Chrome Service Worker Suspension
- **Problem**: WebSocket connections drop when service worker suspends
- **Impact**: Temporary loss of connection requiring reconnection
- **Status**: Handled with automatic reconnection

### 4. `extract_conversation_elements` MCP Timeout
- **Problem**: Large conversations timeout via MCP tool
- **Impact**: Cannot extract elements from very long conversations
- **Workaround**: Use `execute_script` directly

## Low Priority

### 5. Response Status Detection
- **Problem**: `hasStopButton` returns null in some cases
- **Impact**: Cannot always detect if Claude is actively streaming
- **Workaround**: Check other indicators like response length changes

### 6. Empty Conversation Exports
- **Problem**: Newly created tabs may export empty conversations
- **Impact**: Export tools return minimal data
- **Workaround**: Ensure conversation has messages before exporting

## Reporting Issues

To report new issues, please visit: https://github.com/anthropics/claude-chrome-mcp/issues