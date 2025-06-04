# WebSocket Relay Mode

The WebSocket relay provides a lightweight alternative to the HTTP polling hub architecture. It enables persistent WebSocket connections between the Chrome extension and MCP servers.

## Architecture

```
Chrome Extension (Offscreen Document)
         ↓ WebSocket
    Message Relay (Port 54321)
         ↓ WebSocket
    MCP Server(s)
```

## Benefits

- **Persistent Connections**: Offscreen documents can maintain WebSocket connections for 12+ hours
- **Low Latency**: Direct push messaging instead of polling
- **Simplified Logic**: Pure message routing with no business logic in the relay
- **Multi-Client Support**: Multiple MCP servers can connect to the same relay

## Running in Relay Mode

### Option 1: Test Script (Recommended for Testing)

```bash
./test-websocket-relay.sh
```

This starts the relay server with appropriate environment variables.

### Option 2: Manual Setup

1. Start the relay server:
```bash
export USE_WEBSOCKET_RELAY=true
node mcp-server/src/relay/start-relay.js
```

2. Start Claude Code with relay mode:
```bash
export USE_WEBSOCKET_RELAY=true
claude-code
```

3. The extension will automatically connect to the relay when reloaded.

## Environment Variables

- `USE_WEBSOCKET_RELAY`: Set to `true` to enable relay mode
- `RELAY_PORT`: Port for the relay server (default: 54321)
- `RELAY_URL`: WebSocket URL for clients (default: ws://localhost:54321)

## Message Types

### Client → Relay
- `identify`: Register client with type and capabilities
- `broadcast`: Send to all clients except sender
- `unicast`: Send to specific client by ID
- `multicast`: Send to all clients of a specific type

### Relay → Client
- `relay_welcome`: Connection confirmation with client ID
- `client_list_update`: List of connected clients
- `relay_message`: Message from another client
- `relay_shutdown`: Relay is shutting down

## Debugging

Check console logs in:
- Chrome DevTools for extension (offscreen document)
- Terminal for relay server
- Claude Code output for MCP server

## Rolling Back

To switch back to HTTP polling mode:
1. Stop the relay server
2. Unset `USE_WEBSOCKET_RELAY` or set it to `false`
3. Restart Claude Code
4. The extension will automatically fall back to HTTP polling