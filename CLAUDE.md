# Claude Chrome MCP Project

## Status: PRODUCTION READY 🚀

Enhanced MCP tools for Claude Desktop to interact with claude.ai through Chrome automation.

## Recent Updates (2025-01-30)

### Fixed Issues ✅
1. **WebSocket Hub Routing**: Removed hardcoded `validToolTypes` list - hub now forwards all MCP client messages
2. **Extract Conversation Elements**: Optimized with efficient duplicate detection and proper async handling
3. **Export Transcript**: Working for both markdown and JSON formats
4. **Send Message Reliability**: Fixed special character escaping and implemented `waitForReady` option
5. **Batch Operations**: Sequential messages now wait for Claude to be ready between sends

### Known Issues ⚠️
- `batch_get_responses` - 30-second timeout conflicts with MCP timeout
- Chrome service workers suspend WebSocket connections (handled with reconnection)

## Comprehensive Testing Plan

### 1. Core Functionality Tests

#### 1.1 Tab Management
```javascript
// Test 1: List all Claude tabs
get_claude_tabs()

// Test 2: Create new tab
spawn_claude_tab()

// Test 3: Open specific conversation
open_claude_conversation_tab({conversationId: "uuid-here"})

// Test 4: Close tab
close_claude_tab({tabId: 123, force: false})
```

#### 1.2 Message Sending (Priority - Known Issues)
```javascript
// Test 1: Send to new conversation
const tab = await spawn_claude_tab()
await sleep(3000) // Wait for load
send_message_to_claude_tab({tabId: tab.id, message: "Hello Claude"})

// Test 2: Send to existing conversation
send_message_to_claude_tab({tabId: 123, message: "Follow-up message"})

// Test 3: Send with special characters
send_message_to_claude_tab({tabId: 123, message: "Test with 'quotes' and \"double quotes\" and newlines\n\nLike this"})

// Test 4: Send with waitForReady (ensures Claude finished previous response)
send_message_to_claude_tab({tabId: 123, message: "Message after waiting", waitForReady: true})

// Test 4: Send long message
send_message_to_claude_tab({tabId: 123, message: "A".repeat(5000)})

// Test 5: Rapid sequential sends
for (let i = 0; i < 5; i++) {
  send_message_to_claude_tab({tabId: 123, message: `Message ${i}`})
  await sleep(1000)
}
```

#### 1.3 Response Handling
```javascript
// Test 1: Get response with completion
get_claude_response({tabId: 123, waitForCompletion: true, timeoutMs: 20000})

// Test 2: Get response without waiting
get_claude_response({tabId: 123, waitForCompletion: false})

// Test 3: Get response with metadata
get_claude_response({tabId: 123, waitForCompletion: true, includeMetadata: true})

// Test 4: Get response status
get_claude_response_status({tabId: 123})
```

#### 1.4 Batch Operations
```javascript
// Test 1: Parallel batch send
batch_send_messages({
  messages: [
    {tabId: 123, message: "Tab 1 message"},
    {tabId: 456, message: "Tab 2 message"}
  ],
  sequential: false
})

// Test 2: Sequential batch send
batch_send_messages({
  messages: [
    {tabId: 123, message: "First message"},
    {tabId: 123, message: "Second message"}
  ],
  sequential: true
})

// Test 3: Batch get responses (adjust timeout)
batch_get_responses({
  tabIds: [123, 456],
  waitForAll: true,
  timeoutMs: 20000  // Less than MCP timeout
})
```

#### 1.5 Content Analysis
```javascript
// Test 1: Get metadata for simple conversation
get_conversation_metadata({tabId: 123, includeMessages: false})

// Test 2: Get metadata with messages
get_conversation_metadata({tabId: 123, includeMessages: true})

// Test 3: Extract conversation elements
extract_conversation_elements({tabId: 123})

// Test 4: Export as markdown
export_conversation_transcript({tabId: 123, format: 'markdown'})

// Test 5: Export as JSON
export_conversation_transcript({tabId: 123, format: 'json'})
```

#### 1.6 Advanced Operations
```javascript
// Test 1: Execute simple script
execute_script({tabId: 123, script: "document.title"})

// Test 2: Query DOM elements
get_dom_elements({tabId: 123, selector: "button"})

// Test 3: Debug page
debug_claude_page({tabId: 123})

// Test 4: Delete conversation
delete_claude_conversation({tabId: 123})
```

### 2. Edge Case Tests

#### 2.1 Error Handling
- Send message to non-existent tab
- Get response from tab with no conversation
- Export empty conversation
- Extract elements from non-Claude page

#### 2.2 Timing Issues
- Send message immediately after tab creation
- Get response while Claude is still typing
- Close tab during response generation

#### 2.3 Content Edge Cases
- Conversations with code artifacts
- Conversations with images
- Very long conversations (100+ messages)
- Conversations with tables and lists

### 3. Performance Tests

#### 3.1 Load Testing
- Open 10 Claude tabs simultaneously
- Send messages to 5 tabs in parallel
- Export 5 conversations concurrently

#### 3.2 Stress Testing
- Send 50 messages rapidly to single tab
- Extract elements from conversation with 100+ code blocks
- Get responses from 10 tabs simultaneously

### 4. Integration Tests

#### 4.1 Full Workflow
```javascript
// Complete conversation workflow
const tab = await spawn_claude_tab()
await sleep(3000)
await send_message_to_claude_tab({tabId: tab.id, message: "Write a Python hello world"})
const response = await get_claude_response({tabId: tab.id, waitForCompletion: true})
const metadata = await get_conversation_metadata({tabId: tab.id})
const transcript = await export_conversation_transcript({tabId: tab.id, format: 'markdown'})
await close_claude_tab({tabId: tab.id})
```

### 5. Debugging Procedures

#### 5.1 When send_message_to_claude_tab fails:
1. Check if tab exists: `get_claude_tabs()`
2. Verify tab URL is Claude.ai
3. Check if message input is ready: `execute_script({tabId, script: "!!document.querySelector('[contenteditable]')"})`
4. Check for error messages in DOM
5. Verify WebSocket connection status

#### 5.2 When responses timeout:
1. Check response status: `get_claude_response_status({tabId})`
2. Look for stop button: `execute_script({tabId, script: "!!document.querySelector('button[aria-label*=\"Stop\"]')"})`
3. Check for error indicators
4. Verify conversation is active

## Key Improvements Made

### Send Message Reliability
1. **Proper Character Escaping**: Now handles quotes, newlines, backslashes, tabs correctly
2. **Promise-Based Send**: Function waits for send button click to complete
3. **waitForReady Option**: Checks for Stop button presence to detect if Claude is still streaming
4. **Smart Sequential Sending**: Batch operations automatically use waitForReady

### Response Completion Detection
- **Stop Button**: Only appears during active response generation
- **Input Field State**: Remains editable when Claude is ready
- **Network Traffic**: `/completion` endpoint streams responses, `/latest` called after completion

## Architecture Notes

### WebSocket Communication
- Hub runs on port 54321
- Chrome extension connects as client using `ws://127.0.0.1:54321`
- Messages routed based on client type (mcp_client, chrome_extension)
- Automatic reconnection on disconnect

### Chrome Extension
- Service worker handles WebSocket connection
- Debugger API for script execution
- Content scripts for DOM interaction
- Handles multiple simultaneous operations

### MCP Server
- Forwards tool requests to WebSocket hub
- 30-second timeout for all operations
- Maintains request/response correlation

## Development Guidelines

### Adding New Tools
1. Add tool definition in MCP server
2. Add case handler in Chrome extension background.js
3. Implement the tool function
4. Add tests to this testing plan
5. No need to update hub (forwards all MCP messages now)

### Debugging Tips
- Check Chrome extension logs: chrome://extensions → Claude Chrome MCP → Service Worker
- Monitor WebSocket traffic in Chrome DevTools
- Use `execute_script` for quick DOM debugging
- Add console.log statements in background.js for tracing

## Next Priority Tasks

1. **Fix send_message_to_claude_tab reliability**
   - Investigate timing issues
   - Add retry logic
   - Improve input field detection

2. **Optimize batch_get_responses**
   - Reduce internal timeout to 20 seconds
   - Add early termination option
   - Consider streaming responses

3. **Enhance error reporting**
   - Add detailed error codes
   - Include DOM state in errors
   - Improve timeout messages

## Testing Commands

```bash
# Run MCP server
cd /Users/dp/claude-chrome-mcp/mcp-server && npm start

# Check MCP connection
claude mcp list

# Monitor logs
tail -f ~/.claude/logs/mcp-*.log
```

## Session Summary (2025-01-30)

### Completed ✅
1. Fixed WebSocket hub hardcoded tool list - now dynamically forwards all MCP messages
2. Fixed `send_message_to_claude_tab` special character escaping
3. Implemented `waitForReady` option that detects Stop button for streaming state
4. Removed artificial delays in favor of proper ready state detection
5. Updated batch send to use waitForReady automatically in sequential mode
6. Created comprehensive testing plan in CLAUDE.md

### Still To Do 📝
1. Fix `extract_conversation_elements` MCP timeout (works via execute_script but not as tool)
2. Optimize `batch_get_responses` timeout to work within MCP's 30-second limit
3. Add retry logic for transient failures
4. Implement streaming response updates
5. Add more robust error handling with specific error codes

### Key Findings 🔍
- Stop button only appears during active response generation
- Network shows `/completion` for streaming, `/latest` when done
- Messages can overwrite if sent too rapidly without waiting
- Chrome extension logs are crucial for debugging (chrome://extensions)
- WebSocket reconnection is automatic but can cause brief outages