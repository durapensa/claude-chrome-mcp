# Claude Chrome MCP Project

## Status: PRODUCTION READY ✅

All core functionality working reliably with API-based implementations.

## Core Features

### Working MCP Tools
- ✅ `get_claude_tabs` - Lists all Claude.ai tabs with conversation IDs  
- ✅ `get_claude_conversations` - Fetches conversation list from API using cookie auth
- ✅ `spawn_claude_tab` - Creates new Claude tabs
- ✅ `send_message_to_claude_tab` - Sends messages to conversations  
- ✅ `get_claude_response` - Retrieves latest responses
- ✅ `delete_claude_conversation` - API-based deletion (no UI automation)
- ✅ `open_claude_conversation_tab` - Opens specific conversations by ID
- ✅ `close_claude_tab` - Closes tabs with optional force flag
- ✅ `debug_attach` - Chrome debugger integration
- ✅ `execute_script` - JavaScript execution with awaitPromise support
- ✅ `get_dom_elements` - DOM querying

### Network Tools (for API discovery)
- ✅ `start_network_inspection` - Monitor network requests
- ✅ `stop_network_inspection` - Stop monitoring  
- ✅ `get_captured_requests` - Retrieve captured requests

## Architecture

**Multi-Client Support**: Chrome Extension serves as hub, supporting simultaneous connections from:
- Claude Desktop (via MCP)
- Claude Code (via MCP) 
- CLI tools (direct WebSocket)

**Key Implementation**: 
- Organization ID extracted from `lastActiveOrg` cookie (no hardcoded values)
- Direct API calls instead of UI automation for reliability
- WebSocket-based communication for real-time coordination

## Installation Notes

- Extension loads unpacked from `extension/` folder
- MCP Server: `node mcp-server/src/server.js` 
- CLI: `npm run build && npm link` in `cli/` folder

## Development Notes

- commit changes after successfully tested milestones
- never kill node processes that host MCP servers you are using
- Organization ID and auth cookies are extracted dynamically (never hardcoded)