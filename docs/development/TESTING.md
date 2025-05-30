# Testing Guide for Claude Chrome MCP

This document outlines the testing procedures for all fixes and features in Claude Chrome MCP.

## Prerequisites

1. Ensure Chrome extension is loaded and connected
2. MCP server is running (`cd mcp-server && npm start`)
3. Claude Desktop has the MCP server configured

## Issue Fixes Testing

### 1. Rapid Message Sending (Issue #2) ✅ FIXED

**Fix Applied**: Added `waitForReady` parameter to `send_message_to_claude_tab` tool

**Test Procedure**:
```bash
# Run automated test
node test-rapid-messages.js
```

**Manual Test**:
1. Open Claude Desktop
2. Create a new Claude tab: `spawn_claude_tab`
3. Send two messages rapidly WITHOUT waitForReady:
   ```
   send_message_to_claude_tab({ tabId: 123, message: "First message" })
   send_message_to_claude_tab({ tabId: 123, message: "Second message" })
   ```
   - Expected: Second message fails with "Send button not found"
4. Send two messages rapidly WITH waitForReady:
   ```
   send_message_to_claude_tab({ tabId: 123, message: "First message", waitForReady: true })
   send_message_to_claude_tab({ tabId: 123, message: "Second message", waitForReady: true })
   ```
   - Expected: Both messages succeed

### 2. Chrome Service Worker Stability (Issue #3)

**Current Status**: Automatic reconnection implemented

**Test Procedure**:
1. Start MCP server and connect Chrome extension
2. Check connection status in Chrome DevTools:
   - Open `chrome://extensions`
   - Click "Service Worker" for Claude Chrome MCP
   - Look for WebSocket connection logs
3. Wait 5+ minutes for service worker to potentially suspend
4. Send a message to verify reconnection works
5. Check logs for reconnection messages

### 3. Extract Conversation Elements Timeout (Issue #4) ✅ IMPROVED

**Improvements Applied**: Added batching and configurable limits

**Test Procedure**:
```bash
# Run automated test
node test-extract-elements.js
```

**Manual Test**:
1. Open a Claude conversation with many code blocks and artifacts
2. Test extraction with default parameters:
   ```
   extract_conversation_elements({ tabId: 123 })
   ```
3. Test with custom limits for large conversations:
   ```
   extract_conversation_elements({ 
     tabId: 123, 
     batchSize: 25,
     maxElements: 500 
   })
   ```
4. Check for `truncated` flag in response if limits are reached
5. Compare performance with execute_script workaround

### 4. Response Status Detection (Issue #5)

**Test Procedure**:
1. Send a message that triggers a long response
2. Immediately check status:
   ```
   get_claude_response_status({ tabId: 123 })
   ```
3. Verify status indicators:
   - `isGenerating`: Should be true during response
   - `hasStopButton`: May be null (known issue)
   - `responseLength`: Should increase during generation

### 5. Empty Conversation Exports (Issue #6)

**Test Procedure**:
1. Create a new tab and immediately export:
   ```
   spawn_claude_tab()
   export_conversation_transcript({ tabId: 123, format: "markdown" })
   ```
   - Expected: Minimal/empty export
2. Send messages and export again:
   ```
   send_message_to_claude_tab({ tabId: 123, message: "Test", waitForReady: true })
   # Wait for response
   export_conversation_transcript({ tabId: 123, format: "markdown" })
   ```
   - Expected: Full conversation export

## Regression Testing

Run these tests after any code changes:

### Basic Functionality
```bash
# 1. Tab Management
spawn_claude_tab()
get_claude_tabs()
close_claude_tab({ tabId: 123 })

# 2. Messaging
send_message_to_claude_tab({ tabId: 123, message: "Test", waitForReady: true })
get_claude_response({ tabId: 123, waitForCompletion: true })

# 3. Batch Operations
batch_send_messages({ 
  messages: [
    { tabId: 123, message: "Message 1" },
    { tabId: 123, message: "Message 2" }
  ],
  sequential: true 
})

# 4. Content Analysis
get_conversation_metadata({ tabId: 123 })
export_conversation_transcript({ tabId: 123, format: "json" })
```

### Performance Testing

1. **Concurrent Operations**:
   - Create 5 tabs simultaneously
   - Send messages to all tabs in parallel
   - Monitor WebSocket hub performance

2. **Long Running Operations**:
   - Keep a conversation active for 30+ minutes
   - Verify service worker stays connected
   - Check memory usage doesn't increase significantly

### Error Handling

1. **Invalid Tab IDs**:
   ```
   send_message_to_claude_tab({ tabId: 99999, message: "Test" })
   ```
   - Expected: Clear error message

2. **Network Disconnection**:
   - Disconnect network briefly
   - Verify reconnection happens automatically
   - Check queued messages are handled properly

## Automated Test Suite

### Run All Tests
```bash
node run-all-tests.js
```

This comprehensive test runner will:
- Check prerequisites
- Run all test suites sequentially
- Provide colored output and progress tracking
- Generate a summary report
- Exit with appropriate status codes

### Individual Test Files
- `test-rapid-messages.js` - Tests Issue #2 fix (waitForReady parameter)
- `test-service-worker-stability.js` - Tests Issue #3 improvements (Chrome Alarms API)
- `test-extract-elements.js` - Tests Issue #4 improvements (batching and limits)

### Running Individual Tests
```bash
node test-rapid-messages.js
node test-service-worker-stability.js
node test-extract-elements.js
```

## Monitoring & Logs

### Chrome Extension Logs
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Service Worker" link for Claude Chrome MCP
4. Monitor Console tab for real-time logs

### MCP Server Logs
```bash
tail -f ~/.claude/logs/mcp-*.log
```

### WebSocket Hub Status
The hub provides detailed connection info in logs:
- Client connections/disconnections
- Message routing
- Error tracking
- Performance metrics

## Known Test Limitations

1. **MCP Timeouts**: Some operations may timeout through MCP (30s limit)
2. **Chrome Automation**: Some UI elements may not be immediately available
3. **Service Worker**: May suspend during long tests

## Reporting Test Results

When reporting test results:
1. Include test environment (OS, Chrome version, Claude Desktop version)
2. Provide exact steps to reproduce
3. Include relevant logs from Chrome extension and MCP server
4. Note any workarounds that helped

## Future Test Improvements

- [ ] Implement automated test runner
- [ ] Add performance benchmarks
- [ ] Create stress testing scenarios
- [ ] Add visual regression tests for Chrome extension
- [ ] Implement continuous integration