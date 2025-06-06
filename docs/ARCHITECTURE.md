# Claude Chrome MCP Architecture

## Overview

Claude Chrome MCP enables multiple AI agents (Claude Code, Claude Desktop, Cursor, etc.) to control Chrome browsers simultaneously through a clean, event-driven architecture. The system uses Chrome's offscreen documents API for persistent WebSocket connections and a lightweight message relay for routing, with all coordination logic residing in the Chrome extension.

## Core Architecture Principles

1. **MCP Servers are Isolated** - Each server operates independently, unaware of others
2. **Relay is Stateless** - Pure message router with no business logic
3. **Extension is the Brain** - All coordination, locking, and conflict resolution
4. **Persistent Connections** - Offscreen documents maintain WebSocket without keepalives
5. **Event-Driven** - No polling, pure push-based messaging
6. **Protocol-Compliant** - Uses MCP protocol's clientInfo for identification
7. **Async Operations** - Long-running operations return immediately with tracking (via OperationManager)

## Async Operation Pattern

**Implemented in**: `api_delete_conversations` (mcp-server/src/tools/api-tools.js)  
**TODO**: Review other bulk operations for similar async treatment:
- Batch operations that might timeout (e.g., bulk tab operations)
- Long-running API calls (e.g., conversation exports)  
- Multi-step operations with progress tracking

**Pattern**: Tool returns `{ success: true, operationId, status: "async_queued" }` immediately, then uses `OperationManager` for background processing and `system_wait_operation` for completion tracking.

## System Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Claude Code  │     │Claude Desktop│     │   Cursor     │
│              │     │              │     │              │
│ MCP Server A │     │ MCP Server B │     │ MCP Server C │
│  ┌────────┐  │     │  ┌────────┐  │     │  ┌────────┐  │
│  │ Relay  │  │     │  │ Relay  │  │     │  │ Relay  │  │
│  │(Active)│  │     │  │(Standby)│  │     │  │(Standby)│  │
│  └────┬───┘  │     │  └────────┘  │     │  └────────┘  │
└───────┼──────┘     └──────────────┘     └──────────────┘
        │
        │ WebSocket (port 54321)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│                   Chrome Extension                      │
│                                                         │
│  ┌────────────────┐     ┌─────────────────────────┐   │
│  │   Offscreen    │     │    Service Worker       │   │
│  │   Document     │     │                         │   │
│  │                │     │  ┌─────────────┐       │   │
│  │ ┌──────────┐  │     │  │Coordination │       │   │
│  │ │WebSocket │◄─┼─────┼─▶│   Engine    │       │   │
│  │ │  Client  │  │     │  └─────────────┘       │   │
│  │ └──────────┘  │     │                         │   │
│  │                │     │  ┌─────────────┐       │   │
│  │  Persistent    │     │  │     Tab     │       │   │
│  │  Connection    │     │  │ Controller  │       │   │
│  └────────────────┘     │  └─────────────┘       │   │
│                         │                         │   │
│                         └─────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                                    │
                            ┌───────▼────────┐
                            │ Claude.ai Tabs │
                            └────────────────┘
```

## Component Details

### 1. MCP Servers
Each MCP server (Claude Code, Claude Desktop, Cursor, etc.) runs independently:

- **Implements MCP Protocol** - Exposes tools to AI agents
- **Embeds Message Relay** - Simple WebSocket server component
- **Operation ID Authority** - Sole generator and manager of operation IDs
- **State Management** - Tracks operation lifecycle and milestones
- **Sends Notifications** - Reports progress back to AI agents

**Operation ID Design**: MCP servers generate operation IDs using format `op_{tool_name}_{timestamp}` and maintain complete operation state. The extension coordinates using these IDs but never generates its own.

### 2. Message Relay
A minimal WebSocket server embedded in each MCP server:

- **Port 54321** - Standard port for all relays
- **First-Come-First-Served** - First server to bind becomes active
- **Pure Router** - No parsing, validation, or business logic
- **Fast Failover** - Next server takes over in <2 seconds
- **Message Format** - Simple JSON with 'to', 'from', and payload

### 3. Chrome Extension

#### Offscreen Document (Connection Layer)
Introduced in Chrome 109, offscreen documents provide persistent execution contexts:

- **Persistent WebSocket** - Maintains connection for 12+ hours
- **No Keepalives Needed** - Survives service worker suspension
- **Message Bridge** - Relays between WebSocket and service worker
- **Minimal Footprint** - Just connection handling code

#### Service Worker (Logic Layer)
The brain of the system:

- **Coordination Engine**
  - Tab lock management with ownership tracking
  - Operation queuing per tab
  - Client health monitoring
  - Conflict resolution policies

- **Tab Controller**
  - Executes browser automation
  - Manages Chrome API calls
  - Handles debugger attachment

- **State Management**
  - Uses chrome.storage.local for persistence
  - Tracks active operations
  - Maintains client registry

#### Content Scripts (DOM Layer)
Injected into Claude.ai tabs:

- **DOM Observation** - Detects message sending and response completion
- **Event Reporting** - Sends milestones to service worker
- **Isolated Context** - Runs in page context for DOM access

## Communication Flow

### 1. Command Flow (MCP → Browser)
```
AI Agent → MCP Server → Relay → Offscreen Doc → Service Worker → Tab
```

Example:
```json
{
  "id": "op_send_message_async_1749063882796",
  "to": "extension",
  "type": "tab.execute",
  "params": {
    "tabId": 789,
    "action": "send_message",
    "message": "Explain quantum computing"
  }
}
```

### 2. Response Flow (Browser → MCP)
```
Content Script → Service Worker → Offscreen Doc → Relay → MCP Server → AI Agent
```

Example:
```json
{
  "id": "op_send_message_async_1749063882796",
  "to": "mcp-server-a",
  "type": "operation.complete",
  "result": {
    "success": true,
    "response": "Quantum computing uses quantum mechanical phenomena..."
  }
}
```

## Multi-Agent Coordination

### Lock Management
The extension prevents conflicts through intelligent locking:

```javascript
// Lock structure
{
  tabId: "123",
  owner: "mcp-server-a",
  operation: "send_message",
  acquired: 1234567890,
  expires: 1234597890,
  priority: 1
}
```

### Coordination Strategies

1. **Cooperative Locking** (Default)
   - Operations wait for locks to release
   - FIFO queue per tab
   - No interruption of running operations

2. **Priority-Based**
   - Higher priority operations can request preemption
   - Current operation completes gracefully
   - Preemptor notified when ready

3. **Timeout Protection**
   - Locks auto-expire after 30 seconds
   - Dead client detection via heartbeat
   - Automatic cleanup and recovery

### Example Scenarios

**Scenario 1: Sequential Operations**
```
T+0: Claude Code locks tab 1, sends code
T+2: Claude Desktop queues request for tab 1
T+5: Claude Code releases lock
T+5: Claude Desktop acquires lock, runs tests
```

**Scenario 2: Parallel Operations**
```
T+0: Claude Code works on tab 1
T+0: Claude Desktop works on tab 2
T+0: Cursor works on tab 3
(All operate simultaneously on different tabs)
```

## Implementation Details

### Message Relay (Embedded in MCP Server)
```javascript
class MessageRelay {
  constructor(port = 54321) {
    this.clients = new Map();
    this.wss = new WebSocket.Server({ port });
    
    this.wss.on('connection', (ws) => {
      const clientId = generateId();
      this.clients.set(clientId, ws);
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        const target = this.clients.get(msg.to);
        if (target) {
          target.send(JSON.stringify({
            from: clientId,
            ...msg
          }));
        }
      });
    });
  }
}
```

### Offscreen Document WebSocket
```javascript
// No keepalive needed - persistent connection!
class RelayConnection {
  constructor() {
    this.ws = new WebSocket('ws://localhost:54321');
    
    this.ws.onmessage = (event) => {
      // Forward to service worker
      chrome.runtime.sendMessage({
        type: 'relay.message',
        data: JSON.parse(event.data)
      });
    };
    
    // Listen for outgoing messages
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'relay.send') {
        this.ws.send(JSON.stringify(msg.data));
      }
    });
  }
}
```

### State Persistence
```javascript
// Service worker uses chrome.storage.local
await chrome.storage.local.set({
  tabLocks: { /* current locks */ },
  operationQueues: { /* pending operations */ },
  clientStates: { /* connected clients */ }
});
```

## Key Design Decisions

### Why Offscreen Documents?
- **Problem**: Service workers suspend after 30 seconds
- **Solution**: Offscreen documents can run for 12+ hours
- **Benefit**: No keepalive hacks needed

### Why Not Libraries?
- **WebSocket**: Native API is sufficient for our needs
- **Message Queue**: Chrome's runtime messaging handles it
- **Reconnection**: Not needed with persistent connections
- **Result**: ~200 lines of code instead of 87KB+ of libraries

### Why Keep the Relay?
- **Discovery**: MCP servers know where to connect (localhost:54321)
- **Routing**: Clean separation between multiple clients
- **Simplicity**: No complex service discovery needed

## Next Architecture Tasks

### Remove Backward Compatibility
- System is now fully WebSocket-based (v2.6.0)
- Old message formats and HTTP polling code can be removed
- Simplify relay by removing legacy format support
- Clean up any temporary compatibility layers

## Security Considerations

- **Localhost Only** - Relay only accepts local connections
- **No Authentication** - Relies on localhost security model
- **Limited Permissions** - Extension only accesses claude.ai
- **User Consent** - Debugger API requires explicit approval

## Performance Characteristics

- **Latency**: <10ms for local WebSocket messaging
- **Throughput**: Handles 1000+ ops/second
- **Memory**: Minimal (~10MB for relay, ~20MB for extension)
- **CPU**: Near zero when idle (event-driven)

## Future Enhancements

1. **Advanced Coordination**
   - Transaction support for multi-step operations
   - Collaborative workflows between agents
   - Shared context and memory

2. **Performance Optimizations**
   - Message compression for large responses
   - Batch operation support
   - Predictive resource allocation

3. **Developer Experience**
   - Real-time operation tracing
   - Visual lock state inspector
   - Performance profiling tools

## Related Documentation

- [Problem Resolution](../claude/problem-resolution.md) - Complete troubleshooting and timeout resolution
- [Session Management](../claude/session-management.md) - Session continuation and workflow procedures
- [TypeScript Types](TYPESCRIPT.md) - API type definitions