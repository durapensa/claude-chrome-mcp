# New Claude Tab Management Functions

## Overview

These new functions provide enhanced tab and conversation management for Claude.ai, with clear separation between **tab IDs** (Chrome browser tabs) and **conversation IDs** (Claude conversation UUIDs).

## Key Concepts

- **Tab ID**: Chrome browser tab identifier (number) - e.g., `123456789`
- **Conversation ID**: Claude conversation UUID (string) - e.g., `"550e8400-e29b-41d4-a716-446655440000"`

## New Functions

### 1. `close_claude_tab`

Closes a specific Claude.ai tab by its Chrome tab ID.

**Parameters:**
- `tabId` (number, required): The Chrome tab ID to close
- `force` (boolean, optional): Force close even if there are unsaved changes (default: false)

**Example Usage:**

```javascript
// Close a tab (will warn if unsaved content)
await claude.close_claude_tab({
  tabId: 123456789
});

// Force close a tab regardless of unsaved content
await claude.close_claude_tab({
  tabId: 123456789,
  force: true
});
```

**Response Example:**
```json
{
  "success": true,
  "tabId": 123456789,
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "tabUrl": "https://claude.ai/chat/550e8400-e29b-41d4-a716-446655440000",
  "tabTitle": "Claude conversation",
  "closedAt": 1703001234567,
  "wasForced": false
}
```

**Error Cases:**
- Tab not found
- Tab is not a Claude.ai tab
- Unsaved content (when force=false)

### 2. `open_claude_conversation_tab`

Opens a specific Claude conversation in a new tab using the conversation ID.

**Parameters:**
- `conversationId` (string, required): The Claude conversation UUID
- `activate` (boolean, optional): Whether to activate the new tab (default: true)
- `waitForLoad` (boolean, optional): Whether to wait for page load (default: true)
- `loadTimeoutMs` (number, optional): Max wait time for load (default: 10000)

**Example Usage:**

```javascript
// Open a conversation and activate the tab
await claude.open_claude_conversation_tab({
  conversationId: "550e8400-e29b-41d4-a716-446655440000"
});

// Open conversation in background without waiting for load
await claude.open_claude_conversation_tab({
  conversationId: "550e8400-e29b-41d4-a716-446655440000",
  activate: false,
  waitForLoad: false
});

// Open with custom load timeout
await claude.open_claude_conversation_tab({
  conversationId: "550e8400-e29b-41d4-a716-446655440000",
  loadTimeoutMs: 15000
});
```

**Response Example:**
```json
{
  "success": true,
  "tabId": 987654321,
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://claude.ai/chat/550e8400-e29b-41d4-a716-446655440000",
  "title": "Claude conversation",
  "wasExisting": false,
  "activated": true,
  "createdAt": 1703001234567,
  "loadVerified": true,
  "loadTimeMs": 2341,
  "conversationTitle": "My Research Project",
  "hasMessages": true
}
```

**Special Behaviors:**
- If conversation is already open in a tab, returns existing tab info
- Validates conversation ID format (must be UUID)
- Optionally waits for page to fully load and verifies conversation loaded correctly

### 3. Network Monitoring Functions

#### `start_network_inspection`

Start monitoring network requests for a specific tab.

```javascript
await claude.start_network_inspection({
  tabId: 123456789
});
```

#### `stop_network_inspection`

Stop monitoring network requests for a specific tab.

```javascript
await claude.stop_network_inspection({
  tabId: 123456789
});
```

#### `get_captured_requests`

Get all captured network requests for a tab.

```javascript
const requests = await claude.get_captured_requests({
  tabId: 123456789
});

console.log(`Captured ${requests.stats.totalRequests} requests`);
console.log(`Success rate: ${requests.stats.successfulRequests}/${requests.stats.totalRequests}`);
```

## Common Workflows

### 1. Opening a Specific Conversation

```javascript
// Get list of available conversations first (if needed)
const sessions = await claude.get_claude_sessions();

// Open a specific conversation
const result = await claude.open_claude_conversation_tab({
  conversationId: "550e8400-e29b-41d4-a716-446655440000",
  waitForLoad: true
});

console.log(`Opened conversation in tab ${result.tabId}`);
```

### 2. Safely Closing Tabs

```javascript
// Check for unsaved content first
const result = await claude.close_claude_tab({
  tabId: 123456789,
  force: false
});

if (!result.success && result.reason === 'unsaved_content') {
  console.log('Tab has unsaved content. Force close? (y/n)');
  // ... handle user input ...
  
  // Force close if confirmed
  await claude.close_claude_tab({
    tabId: 123456789,
    force: true
  });
}
```

### 3. Tab Management with Network Monitoring

```javascript
// Open conversation with monitoring
const tab = await claude.open_claude_conversation_tab({
  conversationId: "550e8400-e29b-41d4-a716-446655440000"
});

// Start network monitoring
await claude.start_network_inspection({
  tabId: tab.tabId
});

// Perform some actions...
await claude.send_message_to_claude({
  tabId: tab.tabId,
  message: "What are the latest AI developments?"
});

// Wait for response
await new Promise(resolve => setTimeout(resolve, 5000));

// Get network activity
const networkData = await claude.get_captured_requests({
  tabId: tab.tabId
});

console.log(`Network activity: ${networkData.stats.totalRequests} requests`);

// Stop monitoring and close
await claude.stop_network_inspection({
  tabId: tab.tabId
});

await claude.close_claude_tab({
  tabId: tab.tabId
});
```

### 4. Managing Multiple Conversations

```javascript
const conversationIds = [
  "550e8400-e29b-41d4-a716-446655440000",
  "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "6ba7b811-9dad-11d1-80b4-00c04fd430c8"
];

// Open all conversations
const openTabs = [];
for (const conversationId of conversationIds) {
  const result = await claude.open_claude_conversation_tab({
    conversationId,
    activate: false, // Don't activate each one
    waitForLoad: false // Don't wait for each to load
  });
  openTabs.push(result);
}

console.log(`Opened ${openTabs.length} conversation tabs`);

// Later, close all tabs
for (const tab of openTabs) {
  await claude.close_claude_tab({
    tabId: tab.tabId,
    force: true // Force close to avoid prompts
  });
}
```

## Error Handling

### Common Error Scenarios

1. **Invalid Tab ID**
   ```javascript
   try {
     await claude.close_claude_tab({ tabId: 999999999 });
   } catch (error) {
     console.error('Tab not found:', error.message);
   }
   ```

2. **Invalid Conversation ID**
   ```javascript
   try {
     await claude.open_claude_conversation_tab({ 
       conversationId: "invalid-id" 
     });
   } catch (error) {
     console.error('Invalid conversation ID format:', error.message);
   }
   ```

3. **Load Timeout**
   ```javascript
   try {
     await claude.open_claude_conversation_tab({
       conversationId: "550e8400-e29b-41d4-a716-446655440000",
       loadTimeoutMs: 5000
     });
   } catch (error) {
     console.error('Page load timeout:', error.message);
   }
   ```

## Best Practices

1. **Always validate conversation IDs** before attempting to open them
2. **Use `force: false`** initially when closing tabs to respect user data
3. **Set appropriate timeouts** when waiting for page loads
4. **Monitor network requests** when debugging conversation loading issues
5. **Clean up tabs** after completing automated workflows
6. **Handle existing tabs gracefully** - the functions will detect if a conversation is already open

## Integration Notes

These functions integrate seamlessly with existing Claude Chrome MCP tools:

- Use `get_claude_sessions()` to discover available tabs and their conversation IDs
- Use `send_message_to_claude()` and `get_claude_response()` for interaction
- Use network monitoring to debug loading or API issues
- Combine with `execute_script()` for advanced automation workflows