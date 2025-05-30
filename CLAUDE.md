# Claude Chrome MCP

MCP (Model Context Protocol) server for Claude Desktop to interact with claude.ai through Chrome automation.

## Quick Start

```bash
# Install dependencies
cd mcp-server && npm install

# Configure Claude Desktop (claude_desktop_config.json):
{
  "mcpServers": {
    "claude-chrome-mcp": {
      "command": "node",
      "args": ["/path/to/claude-chrome-mcp/mcp-server/src/server.js"]
    }
  }
}
```

## Key Features

- **Tab Management**: Create, list, open, and close Claude tabs
- **Messaging**: Send messages with `waitForReady` (default: true)
- **Response Handling**: Get responses with completion detection
- **Batch Operations**: Send to multiple tabs
- **Content Analysis**: Extract metadata, export conversations
- **Health Monitoring**: Check connection status with `get_connection_health`

## Important Options

### Send Message with Wait
```javascript
send_message_to_claude_tab({
  tabId: 123,
  message: "Your message",
  waitForReady: true,  // Default: true
  maxRetries: 3        // Default: 3
})
```

### Response with Timeout
```javascript
get_claude_response({
  tabId: 123,
  waitForCompletion: true,
  timeoutMs: 20000  // Must be < 30000 for MCP
})
```

## Architecture

- WebSocket hub on port 54321
- Chrome extension connects as WebSocket client  
- MCP server forwards requests through hub
- Automatic reconnection with exponential backoff

## For Developers

See `.claude/instructions.md` for session workflow and development guidelines.

## Memories

- Keep md files in this project structured, organized and consistent among them all, with minimal redundancies and adequate references among them, each one true to the purpose of its name, and keeping CLAUDE.md as uncluttered as possible, such that you will chain-load the necessary files upon starting up and being asked to begin work.
- Commit frequently so that you can review changes.
- Test suite files should live in a dedicated folder