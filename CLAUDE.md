# Claude Chrome MCP

Production-ready MCP tools for Claude Desktop to interact with claude.ai through Chrome automation.

## Quick Start

```bash
# Install dependencies
cd mcp-server && npm install

# Start MCP server
npm start

# Verify connection
claude mcp list
```

## Key Features

- **Tab Management**: Create, list, open, and close Claude tabs
- **Messaging**: Send messages with special character support and `waitForReady` option
- **Response Handling**: Get responses with completion detection and metadata
- **Batch Operations**: Send to multiple tabs, get multiple responses
- **Content Analysis**: Extract metadata, export conversations (markdown/JSON)
- **Advanced Tools**: Execute scripts, query DOM, debug pages

## Important Options

### Send Message with Wait
```javascript
send_message_to_claude_tab({
  tabId: 123,
  message: "Your message",
  waitForReady: true  // Waits for Claude to finish previous response
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

## Known Issues & Roadmap

- See [ISSUES.md](ISSUES.md) for current known issues
- See [ROADMAP.md](ROADMAP.md) for planned features

## Architecture

- WebSocket hub on port 54321
- Chrome extension connects as WebSocket client
- MCP server forwards requests through hub
- Automatic reconnection on disconnect

## Development

When adding new tools:
1. Add tool definition in MCP server
2. Add handler in Chrome extension background.js
3. Test thoroughly
4. Update this documentation if needed

## Logs & Debugging

- Chrome extension logs: `chrome://extensions` → Claude Chrome MCP → Service Worker
- MCP logs: `~/.claude/logs/mcp-*.log`
- WebSocket traffic visible in Chrome DevTools