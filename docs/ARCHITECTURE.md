# Architecture

## System Overview

Claude Chrome MCP uses a three-tier architecture to enable communication between Claude Desktop and Chrome browser tabs.

```
Claude Desktop (MCP Client)
        ↓
MCP Server (Node.js)
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
- Exposes tools for Claude Desktop to use
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