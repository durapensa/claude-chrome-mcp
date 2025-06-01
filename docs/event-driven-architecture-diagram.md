# Event-Driven Completion Detection Architecture

## System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EVENT-DRIVEN COMPLETION DETECTION                      │
│                                    SYSTEM                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────────┐
│   Claude Code   │    │   MCP Server     │    │        Chrome Extension        │
│     Client      │    │                  │    │                                 │
│                 │    │                  │    │  ┌─────────────────────────────┐ │
│                 │    │                  │    │  │       Content Script       │ │
│                 │    │                  │    │  │                             │ │
│ 1. send_message │────┤ OperationManager │    │  │   ConversationObserver      │ │
│    _async()     │    │                  │    │  │   (MutationObserver)        │ │
│                 │    │ - Creates opId   │    │  │                             │ │
│ ◄─── opId ──────┤    │ - Stores state   │    │  │   DOM Event Detection:      │ │
│                 │    │ - Returns        │    │  │   • Message sent            │ │
│                 │    │   immediately    │    │  │   • Response started        │ │
│                 │    │                  │    │  │   • Response completed      │ │
│                 │    │                  │    │  └─────────────────────────────┘ │
│                 │    │                  │    │              │                   │
│ 2. wait_for_    │    │                  │    │              │ Milestone Events  │
│    operation()  │    │                  │    │              ▼                   │
│                 │    │                  │    │  ┌─────────────────────────────┐ │
│                 │    │                  │    │  │     Background Script      │ │
│                 │    │                  │    │  │                             │ │
│                 │    │                  │    │  │ • Receives DOM milestones   │ │
│                 │    │                  │    │  │ • Forwards to WebSocket Hub │ │
│                 │    │                  │    │  └─────────────────────────────┘ │
│                 │    │                  │    └─────────────────────────────────┘
│                 │    │                  │                     │
│                 │    │                  │                     │ WebSocket
│                 │    │                  │ ◄───────────────────┘ Messages
│                 │    │                  │
│                 │    │ NotificationMgr  │
│                 │    │                  │
│                 │    │ • Receives       │
│                 │    │   milestones     │
│                 │    │ • Updates opId   │
│                 │    │   state          │
│ ◄─── Result ────┤    │ • Sends MCP      │
│                 │    │   notifications  │
│                 │    │                  │
└─────────────────┘    └──────────────────┘
```

## MCP Notification Flow

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                            MCP NOTIFICATION SYSTEM                             │
└────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Claude Code   │         │   MCP Server     │         │ Chrome Extension│
│     Client      │         │                  │         │                 │
│                 │         │                  │         │                 │
│ 1. Calls async  │ ──────► │ OperationManager │         │                 │
│    tool         │         │                  │         │                 │
│                 │         │ Creates:         │         │                 │
│ ◄─── opId ──────│         │ • operationId    │         │                 │
│                 │         │ • initial state  │         │                 │
│                 │         │                  │         │                 │
│                 │         │                  │         │                 │
│ 2. Calls        │ ──────► │ Waits for        │         │                 │
│    wait_for_    │         │ completion...    │         │                 │
│    operation    │         │                  │         │                 │
│                 │         │        │         │         │                 │
│                 │         │        │         │         │                 │
│                 │         │        ▼         │         │                 │
│                 │         │ NotificationMgr  │ ◄─────── │ DOM Milestone   │
│                 │         │                  │         │ Detected        │
│                 │         │ Receives:        │         │                 │
│                 │         │ • milestone type │         │                 │
│                 │         │ • operationId    │         │                 │
│                 │         │ • timestamp      │         │                 │
│                 │         │ • data payload   │         │                 │
│                 │         │                  │         │                 │
│                 │         │        │         │         │                 │
│                 │         │        ▼         │         │                 │
│                 │         │ Updates State    │         │                 │
│                 │         │ • milestone []   │         │                 │
│                 │         │ • status         │         │                 │
│                 │         │ • result data    │         │                 │
│                 │         │                  │         │                 │
│                 │         │        │         │         │                 │
│                 │         │        ▼         │         │                 │
│                 │         │ Sends MCP        │         │                 │
│                 │         │ Notification:    │         │                 │
│  ◄── Notification ────────│                  │         │                 │
│  (progress/update)│       │ {                │         │                 │
│                 │         │   method:        │         │                 │
│                 │         │   "notifications │         │                 │
│                 │         │   /progress"     │         │                 │
│                 │         │   params: {...}  │         │                 │
│                 │         │ }                │         │                 │
│                 │         │                  │         │                 │
│                 │         │        │         │         │                 │
│                 │         │        ▼         │         │                 │
│ ◄─── Result ────│         │ Returns Final    │         │                 │
│     (when       │         │ Result           │         │                 │
│      complete)  │         │                  │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Detailed Component Interaction

### 1. Operation Lifecycle

```
1. send_message_async(tabId, message)
   ├── Creates operationId: "send_message_1234567890_abc123"
   ├── Stores initial state in OperationManager
   ├── Returns immediately with operationId
   └── Triggers message sending to Chrome tab

2. ConversationObserver (Content Script)
   ├── MutationObserver watches DOM changes
   ├── Detects: message_sent, response_started, response_completed
   ├── Sends milestone to Background Script
   └── Background forwards to WebSocket Hub

3. NotificationManager (MCP Server)
   ├── Receives milestone from Chrome Extension
   ├── Updates operation state with milestone
   ├── Sends MCP notification to Claude Code
   └── Marks operation as completed when appropriate

4. wait_for_operation(operationId)
   ├── Polls OperationManager for completion
   ├── Receives real-time MCP notifications
   ├── Returns when operation status = "completed"
   └── Includes all milestones and final result
```

### 2. Milestone Detection Events

```
DOM Events Detected by ConversationObserver:

┌─────────────────────────────────────────────┐
│ message_sent                                │
│ ├── Trigger: Message appears in chat        │
│ ├── Data: { messageText, timestamp }        │
│ └── Status: Operation can proceed           │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ response_started                            │
│ ├── Trigger: Assistant response begins      │
│ ├── Data: { startTime }                     │
│ └── Status: Response generation in progress │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ response_completed                          │
│ ├── Trigger: Response fully rendered        │
│ ├── Data: { responseText, totalMessages }   │
│ └── Status: Operation completed             │
└─────────────────────────────────────────────┘
```

### 3. MCP Notification Schema

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "operation_progress_token",
    "progress": {
      "operationId": "send_message_1234567890_abc123",
      "milestone": "response_completed",
      "timestamp": 1748713281345,
      "data": {
        "response": {
          "text": "Complete response text...",
          "isComplete": true,
          "totalMessages": 4
        }
      }
    }
  }
}
```

## Key Advantages

### ✅ **No More Timeouts**
- Operations complete based on actual DOM events
- No arbitrary waiting periods
- Reliable completion detection

### ✅ **Real-Time Progress**
- MCP notifications provide instant updates
- Client receives progress as it happens
- Better user experience with live feedback

### ✅ **Robust State Management**
- Operation state persisted to disk
- Recovery from crashes/restarts
- Milestone history preserved

### ✅ **Event-Driven Architecture**
- Reactive to actual browser events
- Efficient resource usage
- Scalable to multiple operations

## Implementation Files

- **MCP Server**: `mcp-server/src/server.js` (OperationManager, NotificationManager)
- **Content Script**: `extension/content.js` (ConversationObserver)
- **Background Script**: `extension/background.js` (WebSocket forwarding)
- **State Persistence**: `mcp-server/.operations-state.json` (auto-created)

## Related Documentation

- [**Architecture**](ARCHITECTURE.md) - Complete system design overview
- [**Troubleshooting**](TROUBLESHOOTING.md) - Debugging async operations and network issues

---

*This event-driven system replaces the previous timeout-based approach with reliable, real-time milestone detection and MCP notification streaming.*