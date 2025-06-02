# Claude Chrome MCP - Architecture V2.4.1+

## Multi-Server Hub Architecture

### Overview
Claude Chrome MCP now supports a **distributed multi-server architecture** where multiple MCP servers can run simultaneously from different clients (Claude Code, Claude Desktop, Cursor) with automatic hub election and failover.

### Architecture Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Claude Code   │    │ Claude Desktop  │    │     Cursor      │
│                 │    │                 │    │                 │
│  MCP Server A   │    │  MCP Server B   │    │  MCP Server C   │
│  (Hub Owner)    │    │   (Client)      │    │   (Client)      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
          │    WebSocket Hub     │                      │
          │    (Port 54321)      │                      │
          │ ┌─────────────────┐  │                      │
          └─│  Central Hub    │◄─┼──────────────────────┘
            │                 │  │
            │ • Route Messages│  │
            │ • Manage Clients│  │
            │ • Health Monitor│  │
            └─────────┬───────┘  │
                      │          │
                      ▼          ▼
            ┌─────────────────────────┐
            │   Chrome Extension      │
            │   (WebSocket Client)    │
            │                         │
            │ • Connects to Hub       │
            │ • Auto-reconnects       │
            │ • Browser API Bridge    │
            └─────────────────────────┘
```

### Hub Election & Failover

#### 1. **Hub Discovery**
- New MCP servers check for existing hub on port 54321
- If hub exists → connect as client
- If no hub → become hub owner

#### 2. **Hub Election Priority**
```javascript
Priority Factors:
- Claude Code environment: +50 points
- Server uptime: +1 point per minute
- Base priority: 100 points
```

#### 3. **Automatic Failover**
1. **Health Monitoring**: All servers monitor hub health (15s intervals)
2. **Failure Detection**: Hub timeout after 30s of no contact  
3. **Election Trigger**: Remaining servers automatically elect new hub
4. **Client Migration**: Chrome extension reconnects to new hub seamlessly

#### 4. **Multi-Hub Coordination**
- **Discovery Service**: Port 54322 for server-to-server communication
- **Health Checks**: Continuous monitoring between servers
- **Graceful Shutdown**: Hubs announce shutdown to trigger planned elections

### Modular Code Structure

```
mcp-server/src/
├── server.js                 # Main entry point (lightweight)
├── utils/
│   ├── error-tracker.js      # Enhanced error handling
│   ├── debug-mode.js         # Debug logging utilities  
│   ├── operation-manager.js  # Async operation tracking
│   └── notification-manager.js # MCP notifications
├── lifecycle/
│   └── process-manager.js    # Process lifecycle & graceful shutdown
├── hub/
│   ├── websocket-hub.js      # Central WebSocket hub (622 lines → extracted)
│   ├── client-connection.js  # Individual client connections
│   ├── hub-client.js         # Hub client with election logic
│   └── multi-hub-manager.js  # Multi-server coordination
└── tools/
    └── [Tool implementations] # MCP tool handlers
```

### Key Stability Improvements

#### ✅ **Eliminated Aggressive Shutdowns**
- **Before**: 8+ shutdown triggers (idle timeouts, parent checks, stdin errors)
- **After**: Only essential signals (SIGTERM, actual disconnects)

#### ✅ **Event-Driven Architecture** 
- **Hub Health**: Based on actual WebSocket events, not polling
- **Client Reconnection**: Automatic retry with exponential backoff
- **Process Monitoring**: Real disconnect events vs. aggressive health checks

#### ✅ **Multi-Server Support**
- **Hub Election**: Automatic election when hub fails
- **Seamless Failover**: Clients automatically migrate to new hub
- **Distributed Resilience**: System survives individual server crashes

### Response Detection Enhancements

#### **Async Message Flow**
1. `send_message_async` → Returns operation ID immediately
2. Event-driven completion detection via network monitoring
3. `get_claude_dot_ai_response` → Retrieves completed responses
4. Built-in timeout and retry logic

#### **Completion Detection**
- **Network Level**: Monitors fetch requests to `/latest` endpoint
- **DOM Observation**: Watches for response completion indicators  
- **CustomEvent Bridge**: MAIN/ISOLATED world communication
- **Automatic Timeout**: Configurable timeouts with graceful fallback

### Deployment Benefits

#### **For Multiple Clients**
- **Claude Code**: Preferred hub owner (highest priority)
- **Claude Desktop**: Automatic client, seamless reconnection
- **Cursor**: Automatic client, shared hub resources
- **Independence**: Each client can run independently, automatic coordination

#### **Fault Tolerance**
- **Hub Resilience**: Automatic failover if hub crashes
- **Client Recovery**: Chrome extension auto-reconnects to new hub
- **Zero Downtime**: Elections happen in ~2-5 seconds
- **Graceful Degradation**: System continues with remaining servers

### Migration Notes

#### **Breaking Changes**
- ⚠️ **Architecture**: "Extension-as-Hub" → "MCP-Server-as-Hub"  
- ⚠️ **Imports**: Modular structure requires updated imports
- ⚠️ **Configuration**: New multi-hub environment variables

#### **Backward Compatibility**
- ✅ **MCP Protocol**: Fully compatible with existing clients
- ✅ **Tool Interface**: All existing tools work unchanged  
- ✅ **Chrome Extension**: Requires no changes, auto-adapts
- ✅ **API Responses**: Response format unchanged

### Environment Variables

```bash
# Hub Configuration
CCM_FORCE_HUB_CREATION=1          # Force this server to become hub
CCM_HUB_ELECTION_TIMEOUT=30000    # Hub election timeout (ms)
CCM_DISCOVERY_PORT=54322          # Multi-hub discovery port

# Legacy (now disabled for stability)
# CCM_MAX_IDLE_TIME=300000        # DISABLED - was causing premature exits
# CCM_PARENT_PID=12345            # DISABLED - aggressive parent monitoring

# Debug
CCM_DEBUG=1                       # Enable debug logging
CCM_VERBOSE=1                     # Enable verbose logging
```

### Future Enhancements

#### **Planned Features**
- **Load Balancing**: Distribute clients across multiple hubs
- **Hub Clustering**: Multiple active hubs with client routing
- **Cross-Network**: Support for hubs across different machines
- **Hub Health Dashboard**: Real-time monitoring interface

#### **Tool Ecosystem**
- **Tool Distribution**: Hub-based tool sharing between clients
- **Resource Pooling**: Shared browser sessions across clients  
- **Synchronized State**: Cross-client conversation synchronization