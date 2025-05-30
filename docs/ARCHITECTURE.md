# Architecture

## System Overview

Claude Chrome MCP uses a three-tier architecture to enable communication between any MCP host and Chrome browser tabs.

```
MCP Host (Claude Desktop, Claude Code, Cursor, etc.)
        ↓
claude-chrome-mcp Server (Node.js)
        ↓
WebSocket Hub (Port 54321)
        ↓
Chrome Extension (Service Worker)
        ↓
Claude.ai Tabs
```

## Components

### 1. MCP Server (`mcp-server/src/server.js`)
- Implements Model Context Protocol (MCP) specification
- Connects to WebSocket hub as a client
- Exposes tools for any MCP host to use
- Handles request/response routing

### 2. WebSocket Hub
- Runs on localhost:54321
- Central message broker between MCP server and Chrome extension
- Implements health monitoring and keepalive
- Manages client registration and routing

### 3. Chrome Extension
- **Service Worker** (`background.js`): Main hub client, handles all commands
- **Content Script** (`content.js`): Injects into Claude.ai pages for DOM access
- **Popup** (`popup.html`): Status display and manual controls
- Uses Chrome Debugger API for advanced operations

### 4. Communication Flow

1. **Tool Request**: Claude Desktop → MCP Server
2. **Forward to Hub**: MCP Server → WebSocket Hub
3. **Route to Extension**: Hub → Chrome Extension
4. **Execute Command**: Extension performs action on Claude.ai tab
5. **Return Result**: Reverse path back to Claude Desktop

## Key Design Decisions

### WebSocket Hub Architecture
- **Why**: Chrome extensions can't directly expose servers
- **Benefits**: Decouples MCP server from Chrome extension
- **Resilience**: Automatic reconnection with exponential backoff

### Multi-Client Hub Support
- **Design**: Multiple MCP clients can connect simultaneously to the same Chrome extension
- **Clients**: Claude Code, Claude Desktop, Cursor, and other MCP-compatible tools
- **Hub Transfer**: Automatic handoff when one MCP server exits and another starts
  - Old hub from exiting server gracefully disconnects
  - New hub from starting server takes over quickly
  - Chrome extension automatically reconnects to the new hub
  - All operations resume without manual intervention
- **Benefits**: Seamless workflow switching between different AI coding tools

### Chrome Debugger API
- **Why**: Enables script execution and network inspection
- **Trade-off**: Shows "Debugger attached" banner
- **Alternative**: Content scripts have limited capabilities

### Service Worker Persistence
- **Challenge**: Chrome suspends service workers after ~30 seconds
- **Solution**: Chrome Alarms API fires every 15 seconds
- **Fallback**: Automatic reconnection on wake

## Security Considerations

- WebSocket hub only accepts localhost connections
- No authentication (relies on localhost security)
- Chrome extension has limited permissions (only claude.ai)
- Debugger API requires user consent

## Performance Optimizations

- Connection pooling for multiple operations
- Batching support for bulk operations
- Early termination for large extractions
- Retry logic with exponential backoff

## Error Handling

- Each layer validates and sanitizes inputs
- Graceful degradation on connection loss
- Detailed error messages for debugging
- Health monitoring endpoint for diagnostics