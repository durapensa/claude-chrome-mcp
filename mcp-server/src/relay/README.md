# WebSocket Relay (Embedded)

The WebSocket relay is embedded directly in each MCP server, providing persistent connections between the Chrome extension and MCP servers.

## Architecture

```
Chrome Extension (Offscreen Document)
         ↓ WebSocket
    Embedded Relay (Port 54321)
      (Part of MCP Server)
```

## Benefits

- **Persistent Connections**: Offscreen documents can maintain WebSocket connections for 12+ hours
- **Low Latency**: Direct push messaging instead of polling
- **Simplified Logic**: Pure message routing with no business logic in the relay
- **Multi-Client Support**: Multiple MCP servers can connect, with first-come-first-served port binding
- **Automatic Failover**: If primary server stops, next server takes over port 54321

## How It Works

The relay is automatically started when the MCP server starts:

1. MCP server attempts to bind to port 54321
2. If successful, it becomes the active relay
3. Other MCP servers connect as relay clients
4. Chrome extension connects to the active relay
5. All communication flows through the active relay

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