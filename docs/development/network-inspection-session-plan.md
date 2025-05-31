# Network Inspection Session Plan

## Objective
Capture empirical data on network traffic and DOM events during claude-chrome-mcp operations to identify reliable completion indicators for event-driven architecture.

## Pre-Session Setup
1. **Open Chrome DevTools** in a claude.ai tab
2. **Network tab open** with "Preserve log" enabled
3. **Console tab open** for DOM monitoring scripts
4. **Start recording** network activity
5. **Clear existing logs** for clean capture

## Operations to Capture

### 1. Conversation Search Operation
**Steps**:
1. Note timestamp: "Starting conversation search capture"
2. Use Claude Desktop: Ask for conversation search with `titleSearch: "test"`
3. Observe in DevTools:
   - Network requests to `/api/organizations/.../chat_conversations`
   - Response timing and payload
   - DOM mutations in conversation list
4. Record timing: Request start → Response complete → DOM update visible

**Capture Data**:
- API endpoint URL and parameters
- Request/response headers and timing
- Response payload structure
- DOM selector for conversation list
- Time delta between API response and DOM update

### 2. Message Sending Operation  
**Steps**:
1. Note timestamp: "Starting message send capture"
2. Use Claude Desktop: Send message to Claude tab
3. Observe in DevTools:
   - POST request to completion endpoint
   - Message appearance in chat DOM
   - Any intermediate loading states
4. Record timing: Send click → API call → Message visible

**Capture Data**:
- Message sending API endpoint
- Request payload structure  
- DOM selector for new message
- Loading state indicators
- Completion timing

### 3. Response Generation Operation
**Steps**:
1. Note timestamp: "Starting response generation capture"  
2. Use Claude Desktop: Send message that triggers response
3. Observe in DevTools:
   - Streaming connections (WebSocket/SSE)
   - Stop button appearance/disappearance
   - Response text incremental updates
4. Record timing: Generation start → Streaming → Stop button gone

**Capture Data**:
- Streaming protocol and endpoints
- Stop button DOM selector
- Response container DOM changes
- Generation completion indicators

### 4. Element Extraction Operation
**Steps**:
1. Note timestamp: "Starting element extraction capture"
2. Use Claude Desktop: Extract conversation elements
3. Observe in DevTools:
   - Any API calls triggered
   - DOM traversal patterns
   - Artifact rendering completion
4. Record timing: Extraction start → DOM stable

**Capture Data**:
- DOM mutation frequency
- Stability detection timing
- Artifact loading patterns
- Element extraction performance

## DOM Monitoring Scripts

**Prepare these scripts in console**:

```javascript
// Conversation list observer
const conversationObserver = new MutationObserver((mutations) => {
  mutations.forEach(m => console.log('Conversation DOM change:', m.type, m.target));
});
conversationObserver.observe(document.querySelector('[data-testid="conversation-list"]') || document.body, {
  childList: true, subtree: true
});

// Message container observer  
const messageObserver = new MutationObserver((mutations) => {
  mutations.forEach(m => console.log('Message DOM change:', m.type, m.target));
});
messageObserver.observe(document.querySelector('[data-testid="messages"]') || document.body, {
  childList: true, subtree: true
});

// Stop button observer
const stopButtonCheck = setInterval(() => {
  const stopButton = document.querySelector('[data-testid="stop-button"]');
  console.log('Stop button present:', !!stopButton);
}, 500);
```

## Data Collection Format

**For each operation, capture**:
```json
{
  "operation": "conversation_search",
  "timestamp": "2025-05-30T...",
  "network": {
    "requests": [...],
    "timing": {...}
  },
  "dom": {
    "mutations": [...],
    "selectors": {...},
    "timing": {...}
  },
  "completion_indicators": [...]
}
```

## Session Output
- **Raw HAR file** from DevTools (Export network log)
- **Console log transcript** with timestamps
- **Structured analysis** in `/docs/development/network-captures-2025-05-30.json`
- **Summary findings** added to research document

## Post-Session Analysis
1. **Identify most reliable completion indicator** per operation
2. **Determine optimal polling frequency** for DOM changes
3. **Document API timing patterns** and variability
4. **Design observer selector strategy** based on findings

Ready to begin the interactive session when you are! We'll work through each operation systematically and capture the empirical data we need to design the event-driven system.