# Known Issues

## High Priority

### 1. ~~`batch_get_responses` Timeout Conflict~~ ✅ RESOLVED
- **Problem**: 30-second timeout conflicts with MCP timeout
- **Solution**: Removed the problematic tool entirely. Use individual `get_claude_response` calls or implement custom batch logic in your application
- **Note**: The tool has been removed from the MCP server to prevent timeout issues

### 2. ~~Rapid Message Sending Failures~~ ✅ RESOLVED
- **Problem**: Sending messages too quickly fails with "Send button not found"
- **Solution**: Added `waitForReady` parameter to `send_message_to_claude_tab` tool
- **Usage**: Set `waitForReady: true` when sending messages in sequence

## Medium Priority

### 3. ~~Chrome Service Worker Suspension~~ ✅ IMPROVED
- **Problem**: WebSocket connections drop when service worker suspends
- **Solution**: Implemented Chrome Alarms API to keep service worker alive
- **Improvements**:
  - Chrome alarm triggers every 15 seconds to prevent suspension
  - Exponential backoff reconnection (1s to 30s max)
  - Connection state persistence in Chrome storage
  - Automatic connection health checks
- **Status**: Significantly improved stability

### 4. ~~`extract_conversation_elements` MCP Timeout~~ ✅ IMPROVED
- **Problem**: Large conversations timeout via MCP tool
- **Solution**: Added batching and early termination parameters
- **New Parameters**:
  - `batchSize`: Max elements to process per type (default: 50)
  - `maxElements`: Max total elements before stopping (default: 1000)
- **Improvements**:
  - Processes elements in configurable batches
  - Early termination prevents timeout on large conversations
  - Returns `truncated` flag when limit is reached
- **Workaround**: Can still use `execute_script` for custom extraction

## Low Priority

### 5. Response Status Detection
- **Problem**: `hasStopButton` returns null in some cases
- **Impact**: Cannot always detect if Claude is actively streaming
- **Status**: Expected behavior - `hasStopButton` is null after response completion
- **Workaround**: Check other indicators like response length changes or `isStreaming` flag
- **Testing Notes**: Confirmed working correctly during generation (returns true), returns null after completion

### 6. Empty Conversation Exports
- **Problem**: Newly created tabs may export empty conversations
- **Impact**: Export tools return minimal data
- **Status**: Expected behavior - new tabs have no conversation history
- **Workaround**: Ensure conversation has messages before exporting
- **Testing Notes**: Confirmed exports work correctly once messages are added

## Evaluation Needed

### 7. Logging Infrastructure
- **Current State**: Basic console.log statements throughout codebase
- **Evaluation Needed**:
  - Current logging volume and usefulness
  - Performance impact of existing logs
  - Which components need better observability
- **Considerations**:
  - Chrome extension logs go to service worker console
  - MCP server logs to stdout
  - No centralized log aggregation
- **Next Steps**: Audit existing logs before implementing structured logging

## Reporting Issues

To report new issues, please visit: https://github.com/anthropics/claude-chrome-mcp/issues