# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
```bash
mcp__claude-chrome-mcp__get_connection_health
```

### Step 2: Verify System Readiness
Check connection health output for:
- Hub connected status
- Active client connections
- Any connection issues

### Step 3: Standard Testing Workflow
Once system is healthy:
1. **Spawn Tab**: `spawn_claude_dot_ai_tab --injectContentScript true`
2. **Async Message**: `send_message_async --message "test" --tabId <id>`
3. **Get Response**: `get_claude_dot_ai_response --tabId <id>`
4. **Claude-to-Claude**: `forward_response_to_claude_dot_ai_tab --sourceTabId <src> --targetTabId <tgt>`

### Step 4: If Issues Arise
Follow systematic debugging approach from [Troubleshooting Guide](TROUBLESHOOTING.md#debugging-methodology):
- Use evidence-based network debugging
- Apply proper tool selection
- Avoid common anti-patterns

## Key Documentation
- **[Architecture](ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines
- **[Restart Capability](RESTART-CAPABILITY.md)**: MCP lifecycle and restart mechanisms

## Development Resources
- **[Event-Driven Architecture](event-driven-architecture-diagram.md)**: Visual system overview
- **[GitHub Issue Script](create-claude-code-issue.sh)**: Claude Code integration utilities

## Current System Status
- **Version**: 2.5.0 (Event-driven architecture with WebSocket relay option)
- **Architecture**: Phase 1 & 2 complete - WebSocket relay mode available
- **Key Features**: 
  - Async operations, Claude-to-Claude forwarding
  - Dual mode: HTTP polling (default) or WebSocket relay (via feature flag)
  - Persistent connections via offscreen documents (12+ hours)
  - Pure message routing relay for simplified architecture
- **Next Phase**: Phase 3 - Testing and optimization
- **Important**: Extension needs manual reload, Claude Code needs restart after MCP server changes

## Latest Session Summary (2025-01-06 - Part 8: WebSocket Relay Implementation)

### What Was Accomplished

#### Phase 1 Completed - Offscreen Document Infrastructure:
1. Added `offscreen` permission to manifest.json
2. Created offscreen.html and offscreen.js for persistent WebSocket
3. Implemented RelayConnection class with auto-reconnection and message queuing
4. Updated background.js to create and manage offscreen document
5. Added message bridging between service worker and offscreen
6. Extended HubClient with relay methods

#### Phase 2 Completed - WebSocket Relay Server:
1. **Created Minimal WebSocket Relay**:
   - Pure message routing server (message-relay.js)
   - Support for multiple client connections
   - Client identification and type-based routing
   - No business logic - just message passing

2. **Updated MCP Server Integration**:
   - Added RelayClient for MCP servers to connect as relay clients
   - Modified AutoHubClient to support both HTTP and WebSocket modes
   - Feature flag USE_WEBSOCKET_RELAY for mode switching
   - Backward compatible - falls back to HTTP polling when flag is off

3. **Enhanced Extension Integration**:
   - Offscreen document identifies itself to relay
   - Extension hub-client handles relay messages and routes MCP requests
   - Bidirectional message flow: MCP Server ↔ Relay ↔ Extension

4. **Testing Infrastructure**:
   - Created test-websocket-relay.sh for easy testing
   - Comprehensive relay/README.md documentation
   - Environment variable configuration

### Next Session: Phase 3 - Testing and Optimization

1. **End-to-End Testing**:
   - Run relay server with `./test-websocket-relay.sh`
   - Test MCP tool execution through relay
   - Verify bidirectional message flow
   - Monitor connection persistence (1+ hour test)

2. **Performance Optimization**:
   - Measure latency: HTTP polling vs WebSocket
   - Optimize message routing paths
   - Add connection pooling if needed
   - Implement message compression

3. **Production Readiness**:
   - Add relay health endpoints
   - Implement relay clustering/failover
   - Add monitoring and metrics
   - Create deployment documentation

4. **Gradual Migration**:
   - Test with subset of users via feature flag
   - Monitor for issues in relay mode
   - Plan deprecation of HTTP polling
   - Update all documentation

### Testing Commands
```bash
# Terminal 1: Start relay server
./test-websocket-relay.sh

# Terminal 2: Start Claude Code with relay mode
export USE_WEBSOCKET_RELAY=true
claude-code

# Test basic functionality
mcp__claude-chrome-mcp__get_connection_health
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab
```

### Key Implementation Files
- `/extension/manifest.json` - ✅ Offscreen permission added
- `/extension/offscreen.html` - ✅ Created
- `/extension/offscreen.js` - ✅ WebSocket connection implemented
- `/extension/background.js` - ✅ Offscreen document management added
- `/mcp-server/src/relay/message-relay.js` - ✅ Created - pure message routing
- `/mcp-server/src/relay/relay-client.js` - ✅ Created - MCP server relay client
- `/mcp-server/src/hub/hub-client.js` - ✅ Updated - supports relay mode
- `/test-websocket-relay.sh` - ✅ Created - test script

### Testing Commands After Implementation
```bash
# Test new WebSocket connection
mcp__claude-chrome-mcp__get_connection_health

# Verify event-driven messaging
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab
mcp__claude-chrome-mcp__send_message_async --message "Test offscreen: 7*8" --tabId <id>

# Monitor for polling removal
# Should see WebSocket events, not HTTP polls
```

## Detailed Implementation Plan

### Phase 1: Offscreen Document Implementation

#### Step 1.1: Update Extension Manifest
```json
// extension/manifest.json - Add permission
{
  "permissions": [
    "debugger",
    "tabs", 
    "storage",
    "offscreen"  // NEW
  ]
}
```

#### Step 1.2: Create Offscreen Document Files
```html
<!-- extension/offscreen.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Claude Chrome MCP Offscreen</title>
</head>
<body>
  <script src="offscreen.js"></script>
</body>
</html>
```

#### Step 1.3: Implement WebSocket Connection
```javascript
// extension/offscreen.js - Basic structure
class RelayConnection {
  constructor() {
    this.ws = null;
    this.reconnectDelay = 1000;
    this.connect();
  }
  
  connect() {
    this.ws = new WebSocket('ws://localhost:54321');
    // Implementation details in actual code
  }
}
```

#### Step 1.4: Update Service Worker
```javascript
// extension/background.js - Add offscreen management
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  
  if (!existingContexts.length) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WEBSOCKET'],
      justification: 'Maintain persistent WebSocket connection to relay'
    });
  }
}
```

#### Step 1.5: Bridge Messaging
- Service worker ↔ offscreen document via chrome.runtime messaging
- Keep existing HTTP polling as fallback during transition
- Add feature flag to switch between polling and WebSocket

### Phase 2: Hub to Relay Refactor

#### Step 2.1: Create Minimal Relay
```javascript
// mcp-server/src/relay/message-relay.js
class MessageRelay {
  constructor(port = 54321) {
    this.clients = new Map();
    this.wss = new WebSocket.Server({ port });
    // Pure routing logic only
  }
}
```

#### Step 2.2: Remove Business Logic from Hub
- Extract client management to separate module
- Remove health monitoring logic (move to extension)
- Remove command queuing (move to extension)
- Keep only WebSocket server and routing

#### Step 2.3: Update MCP Server Integration
- Replace hub references with relay
- Update connection logic
- Maintain backward compatibility

### Phase 3: Extension Coordination Engine

#### Step 3.1: Implement Lock Manager
```javascript
// extension/modules/lock-manager.js
class LockManager {
  constructor() {
    this.locks = new Map(); // tabId -> lock info
    this.queues = new Map(); // tabId -> operation queue
  }
}
```

#### Step 3.2: Move Client Tracking
- Track connected MCP servers in extension
- Implement health monitoring via heartbeats
- Handle client disconnection cleanup

#### Step 3.3: Implement Operation Queuing
- Queue operations per tab
- Priority-based scheduling
- Timeout handling

### Testing Strategy

#### Phase 1 Tests
1. Verify offscreen document creation
2. Test WebSocket connection persistence (leave running 1+ hours)
3. Test message flow: Service Worker ↔ Offscreen ↔ Relay
4. Verify no keepalive needed
5. Test reconnection on relay restart

#### Phase 2 Tests
1. Test relay with zero business logic
2. Verify message routing works
3. Test failover when active relay exits
4. Ensure backward compatibility

#### Phase 3 Tests
1. Test multi-client coordination
2. Verify lock management
3. Test operation queuing
4. Test conflict resolution

### Rollback Plan
- Keep HTTP polling code during transition
- Feature flags for gradual rollout
- Git tags at each phase completion
- Document any breaking changes

### Success Criteria
- [ ] WebSocket stays connected 12+ hours
- [ ] Message latency <10ms
- [ ] Relay failover <2 seconds
- [ ] Zero message loss during failover
- [ ] Multiple MCP servers coordinate smoothly

## Previous Sessions

### Session 5: Architecture Refactor
- Replaced OperationManager polling with EventEmitter
- Started centralized logging implementation
- Identified need for better connection architecture

### Session 4: Response Capture Fix
- Fixed DOM observer to wait for streaming completion
- Added content stability detection
- Simplified content extraction

### Session 3: Tool Restoration
- Fixed missing tool command routing
- Updated Claude.ai DOM selectors
- Implemented missing conversation methods

### Session 2: Modular Architecture
- Created modular tool structure
- Fixed 18+ missing tools
- Established clean separation of concerns