# Event-Driven Completion Detection Research

## Problem Statement
Current claude-chrome-mcp relies on timeouts and blocking operations that either fail too early or wait too long. Need event-driven, async completion detection system.

## Design Goals
1. **Non-blocking async operations** with ID-tagged requests/results
2. **Out-of-order result handling** - LLMs sort results by ID
3. **MCP notifications** for completion events
4. **Multi-tab observers** - one observer per claude.ai tab
5. **Single reliable indicator** per operation type

## Architecture Requirements

### Operation Types & Completion Indicators
- **Conversation search**: API response completion + DOM list update
- **Message sending**: Message appears in conversation DOM
- **Response generation**: Stop button disappears OR streaming cursor stops  
- **Element extraction**: DOM mutation settles (quiet period)
- **Tab/page navigation**: Claude UI elements fully loaded

### Communication Flow
```
MCP Client → MCP Server → Background Script → Content Script (per tab)
                                ↓
                         Registers operation watcher with ID
                                ↓  
                         Observer detects completion indicator
                                ↓
MCP Client ← MCP Server ← Background Script ← Content Script
         (notification)
```

### ID Tagging Strategy
```javascript
// Request
{ operationId: "search_1748643000", operation: "search", titleSearch: "test" }

// Completion Event  
{ operationId: "search_1748643000", status: "complete", timestamp: 1748643123, data: {...} }
```

### Multi-tab Considerations
- Observers run continuously in ALL claude.ai tabs
- Tabs stay active (not sleeping) to maintain observers
- Operations can be initiated from any tab
- Race conditions handled by operationId matching

## Research Tasks

### Network Inspection Session (Planned)
**Objective**: Capture network traffic and DOM events during key operations to identify reliable completion indicators

**Operations to Monitor**:
1. **Conversation Search**
   - API endpoint: `/api/organizations/{orgId}/chat_conversations`
   - DOM changes: Conversation list updates
   - Timing: Request → Response → DOM update sequence

2. **Message Sending** 
   - API endpoint: `/api/organizations/{orgId}/chat_conversations/{convId}/completion`
   - DOM changes: Message appearance in chat
   - Timing: Send → API call → DOM update

3. **Response Generation**
   - WebSocket/SSE streaming events
   - DOM changes: Stop button appearance/disappearance
   - Timing: Start → Streaming → Completion

4. **Element Extraction**
   - DOM mutation patterns
   - Artifact rendering completion
   - Timing: Mutation → Stability period

**Capture Strategy**:
- Start network inspection
- Perform each operation manually
- Capture full request/response/DOM timeline
- Save to `/docs/development/network-captures-YYYY-MM-DD.json`

### Key Questions for Investigation
1. **API Timing**: What's the typical sequence for search API calls?
2. **DOM Update Patterns**: How quickly do DOM changes follow API responses?
3. **Streaming Indicators**: What network/DOM events signal response completion?
4. **Reliability**: Which indicators are most consistent across operations?

## Implementation Strategy (Post-Research)

### Phase 1: Observer Infrastructure
- Content script observers in all claude.ai tabs
- Background script operation registry
- Event correlation by operationId

### Phase 2: MCP Integration  
- Non-blocking MCP operations return operationId
- MCP notifications for completion events
- Client-side result fetching by operationId

### Phase 3: Operation-Specific Watchers
- Implement completion detection per operation type
- Fallback timeout mechanisms (generous)
- State cleanup and lifecycle management

## Next Steps
1. **Interactive Network Inspection Session** - capture real operation patterns
2. **Analyze captured data** - identify reliable completion indicators  
3. **Design observer architecture** - based on empirical findings
4. **Prototype single operation type** - conversation search as proof of concept
5. **Expand to full operation set** - with lessons learned

---
*Research initiated: 2025-05-30*
*Status: Planning network inspection session*