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
- **Version**: 2.5.0 (Event-driven architecture with offscreen documents planned)
- **Architecture**: Transitioning to offscreen documents + WebSocket
- **Key Features**: Async operations, Claude-to-Claude forwarding, network detection, multi-hub coordination
- **Next Phase**: Implementing persistent WebSocket via offscreen documents

## Latest Session Summary (2025-01-06 - Part 6: Architecture Design)

### What Was Accomplished
1. **Architecture Analysis**:
   - Identified that hub contains too much business logic
   - Recognized extension HTTP polling as a bottleneck
   - Discovered offscreen documents as solution for persistent connections

2. **New Architecture Designed**:
   - Offscreen documents for persistent WebSocket (12+ hours)
   - Simple message relay replacing complex hub
   - All coordination logic moved to extension
   - Event-driven messaging replacing polling

3. **Documentation Updated**:
   - Complete rewrite of ARCHITECTURE.md
   - Clear migration path defined
   - Implementation phases outlined

### Next Session: Implementation Phase 1

1. **Create Offscreen Document**:
   - Add offscreen permission to manifest
   - Create offscreen.html and offscreen.js
   - Implement WebSocket connection

2. **Update Extension Architecture**:
   - Add offscreen document creation logic
   - Bridge service worker ↔ offscreen messaging
   - Maintain backward compatibility

3. **Test New Connection**:
   - Verify persistent WebSocket
   - Test message flow both directions
   - Confirm no keepalive needed

### Key Implementation Files
- `/extension/manifest.json` - Add offscreen permission
- `/extension/offscreen.html` - Minimal HTML for offscreen context
- `/extension/offscreen.js` - WebSocket connection logic
- `/extension/background.js` - Offscreen document management

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