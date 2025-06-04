# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
```bash
mcp__claude-chrome-mcp__get_connection_health
```

### Step 2: Verify System Readiness
Check connection health output for:
- Hub connected status (or relay in WebSocket mode)
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
- **Version**: 2.5.0 (Transitioning to WebSocket-only architecture)
- **Architecture**: WebSocket relay fully functional, removing HTTP code next
- **Key Features**: 
  - Async operations, Claude-to-Claude forwarding
  - WebSocket relay with health monitoring (port 54322)
  - Persistent connections via offscreen documents (12+ hours)
  - Pure message routing relay for simplified architecture
- **Next Phase**: Complete migration to WebSocket-only
- **Important**: Extension needs manual reload, Claude Code needs restart after MCP server changes

## Latest Session Summary (2025-01-06 - Part 9: Production Features & Housekeeping)

### What Was Accomplished

1. **WebSocket Relay Successfully Tested**:
   - Confirmed bidirectional communication working
   - All MCP tools functioning through relay
   - Fixed response routing issues

2. **Added Production Features to Relay**:
   - Health monitoring endpoint on port 54322 (`/health`)
   - Real-time metrics tracking:
     - Messages routed, clients connected/disconnected
     - Uptime, errors, client details
   - Proper shutdown handling for health server

3. **Key Fixes Applied**:
   - Fixed offscreen document creation (valid reason: DOM_SCRAPING)
   - Fixed relay unicast message wrapping
   - Fixed extension command execution for relay mode
   - Added localhost WebSocket permissions to manifest

4. **Decision Made**: No need for HTTP backward compatibility
   - Will proceed with WebSocket-only architecture
   - Simplifies codebase significantly
   - Removes port conflicts and complexity

### Session Handoff Point - Context Refresh Needed

**Current State**:
- Relay server provides health monitoring
- WebSocket communication fully functional
- Ready to remove HTTP polling code
- MCP server currently running in HTTP hub mode (blocking port 54321)

### Next Session: Complete WebSocket-Only Migration

1. **Remove HTTP Code from Extension**:
   - Remove HTTP polling logic from hub-client.js
   - Remove command polling and health check intervals
   - Simplify to WebSocket-only connection
   - Remove sendCommandResponse HTTP method

2. **Remove Hub Server Code**:
   - Remove websocket-hub.js (HTTP + WebSocket hybrid)
   - Update MCP server to always use relay mode
   - Remove hub election logic
   - Remove USE_WEBSOCKET_RELAY checks

3. **Simplify Connection Logic**:
   - Make relay connection the only option
   - Remove fallback mechanisms
   - Update error messages for clarity
   - Simplify initialization flow

4. **Update Documentation**:
   - Remove references to HTTP polling
   - Update README with WebSocket-only instructions
   - Update architecture diagrams
   - Create production deployment guide

### Restart Instructions After Compact

**Important**: The MCP server is currently running in HTTP hub mode on port 54321.

1. **After Claude Code exits from compact**, start relay FIRST:
   ```bash
   # Terminal 1:
   ./test-websocket-relay.sh
   ```

2. **Then start Claude Code with relay mode**:
   ```bash
   # Terminal 2:
   export USE_WEBSOCKET_RELAY=true
   claude-code
   ```

3. **Verify relay is working**:
   ```bash
   # Check health endpoint:
   curl http://localhost:54322/health
   
   # Test in Claude Code:
   mcp__claude-chrome-mcp__get_connection_health
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

## Previous Sessions

### Session 8: WebSocket Relay Implementation
- Implemented Phase 1: Offscreen document infrastructure
- Implemented Phase 2: WebSocket relay server with routing
- Fixed message routing issues for bidirectional communication
- Tested full end-to-end WebSocket flow successfully

### Session 7: Architecture Design
- Identified hub complexity and HTTP polling bottlenecks
- Designed new architecture with offscreen documents
- Planned WebSocket relay approach
- Created implementation roadmap

### Session 6: Modular Refactor
- Completed major architecture refactor
- Extracted hub components into modular structure
- Improved error handling and operation management
- Set foundation for WebSocket migration

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