# Claude Chrome MCP (CCM)

Developer tool suite enabling Claude Desktop to interact with claude.ai in Chrome browsers through the Model Context Protocol (MCP).

## Components

- **Chrome Extension** - Provides chrome.debugger access via WebSocket (claude.ai only)
- **MCP Server** - Node.js server exposing Chrome capabilities to Claude Desktop  
- **CLI Tool** - Command-line interface for direct browser control

## Quick Start

### 1. Install Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` directory from this project
5. Extension should appear as "Claude Chrome MCP"

The extension will only activate on claude.ai pages and requires no configuration.

### 2. Install MCP Server to Claude Desktop

```bash
cd mcp-server
npm install
```

Add to Claude Desktop's MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "claude-chrome-mcp": {
      "command": "node",
      "args": ["/path/to/claude-chrome-mcp/mcp-server/src/server.js"]
    }
  }
}
```

Replace `/path/to/claude-chrome-mcp` with your actual project path.

Claude Desktop will start the MCP server on launch.

### 4. Install CLI Tool

```bash
cd cli
npm install
npm run build
npm link  # Makes 'ccm' command globally available
```

## Testing

1. **Verify Extension**: Load extension in Chrome and visit claude.ai
2. **Check MCP Connection**: Start MCP server, should show "Extension connected"
3. **Test in Claude Desktop**: Ask Claude to "spawn a new Claude tab" or "get Claude sessions"

Available MCP tools:
- `spawn_claude_tab` - Create new Claude.ai tab
- `get_claude_sessions` - List active Claude tabs
- `send_message_to_claude` - Send messages to Claude sessions
- `get_claude_response` - Get latest responses
- `debug_attach` - Attach Chrome debugger
- `execute_script` - Run JavaScript in tabs
- `get_dom_elements` - Query DOM elements

## Usage

### MCP Tools in Claude Desktop

With all components running, Claude Desktop has access to these tools:
- `spawn_claude_tab` - Create new Claude.ai tab
- `get_claude_sessions` - List active Claude tabs
- `send_message_to_claude` - Send messages to Claude sessions
- `get_claude_response` - Get latest responses
- `debug_attach` - Attach Chrome debugger
- `execute_script` - Run JavaScript in tabs
- `get_dom_elements` - Query DOM elements

### CLI Usage

The `ccm` command-line tool provides direct control over Claude.ai tabs:

#### Basic Commands

```bash
# List all Claude.ai sessions
ccm sessions

# Create a new Claude tab
ccm spawn

# Send a message to a specific tab
ccm send 123456789 "Hello, Claude!"

# Get the latest response from a tab
ccm response 123456789

# Execute JavaScript in a tab
ccm script 123456789 "document.title"

# Query DOM elements
ccm elements 123456789 ".message"
```

#### Advanced Usage

```bash
# Show detailed session information
ccm sessions --json

# Create tab and wait for it to load
ccm spawn --wait 10

# Send message and wait for response
ccm send 123456789 "What is 2+2?" --wait --timeout 30

# Execute script from file
ccm script 123456789 --file my-script.js

# Get only text content from latest response
ccm response 123456789 --raw

# Count matching elements
ccm elements 123456789 ".conversation" --count

# Attach/detach debugger manually
ccm attach 123456789
ccm attach 123456789 --detach
```

#### Global Options

```bash
# Use custom server URL
ccm --server ws://localhost:8080 sessions

# Enable verbose logging
ccm --verbose send 123456789 "Hello"

# Disable colored output
ccm --no-color sessions
```

#### Getting Tab IDs

To get tab IDs for use with other commands:

```bash
# List sessions with IDs
ccm sessions

# Get just the tab IDs
ccm sessions --quiet

# Use in scripts
TAB_ID=$(ccm sessions --quiet | head -1)
ccm send $TAB_ID "Hello from script!"
```

## Development Status

- ✅ Chrome Extension (WebSocket bridge, session detection, popup UI)
- ✅ MCP Server (WebSocket server, 8 tools for Claude Desktop)
- ✅ CLI Tool (7 commands with full MCP parity)

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Claude Web    │    │  Chrome Extension│◄──►│  Local MCP      │◄──►│  Claude Desktop │
│                 │    │  (Background +   │    │  Server (Node)  │    │                 │
└─────────────────┘    │   Popup UI)      │    │                 │    └─────────────────┘
                       └──────────────────┘    └─────────────────┘
                                │                        ▲
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   CCM CLI Tool  │◄──►│   WebSocket     │
                       │    (Node.js)    │    │  Port 54321     │
                       └─────────────────┘    └─────────────────┘
```

**Component Responsibilities:**
- **Chrome Extension**: WebSocket bridge, session detection, user interface
- **MCP Server**: Protocol translation, tool exposure to Claude Desktop
- **CLI Tool**: Direct command-line control, scripting automation
- **WebSocket Server**: Communication hub for all components
