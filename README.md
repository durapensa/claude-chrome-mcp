# Claude Chrome MCP

Browser automation tool enabling MCP clients (Claude Desktop, Claude Code, Cursor) to interact with claude.ai through Chrome extension and MCP server.

## Components
- **MCP Server**
- **Chrome Extension** (enabled only for claude.ai)
- **CLI Tool**

## Quick Start

### Prerequisites
- Google Chrome browser
- Node.js v16 or higher
- npm installed

### Step 1: Install Chrome Extension
1. Open Chrome and navigate to [chrome://extensions/](chrome://extensions/)
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the `extension/` directory from this project
4. The extension icon should appear in your toolbar

### Step 2: Install Dependencies
```bash
# From the project root directory
cd mcp-server
npm install
```

### Step 3: Configure Claude Desktop
1. Open Claude Desktop settings
2. Navigate to Developer > Edit Config
3. Add this configuration:
```json
{
  "mcpServers": {
    "claude-chrome-mcp": {
      "command": "node",
      "args": ["<absolute-path-to-project>/mcp-server/src/server.js"]
    }
  }
}
```
Replace `<absolute-path-to-project>` with the full path to this project (e.g., `/Users/yourname/claude-chrome-mcp`)

### Step 4: Restart Claude Desktop
After adding the configuration, restart Claude Desktop to load the MCP server. The server will automatically start its embedded WebSocket relay on port 54321.

### Step 5: Test the Connection
In Claude Desktop, you can now use natural language commands like:
- "Check Chrome status"
- "Open a new tab"
- "Send 'Hello, World!' to the new Claude tab"
- "List all open Claude tabs"
- "Search for Claude chats with 'math'"

## Key Features

- Async message sending with completion detection
- Claude-to-Claude response forwarding
- Conversation management via Claude.ai API
- Network inspection and debugging tools
- WebSocket-only architecture with persistent connections
- Health monitoring endpoint for relay status

## Documentation

| Guide | Description |
|-------|-------------|
| [**Architecture Analysis**](docs/ARCHITECTURE-ANALYSIS.md) | Critical issues and improvement roadmap |
| [**Architecture**](docs/ARCHITECTURE.md) | System design and components |
| [**Troubleshooting**](CLAUDE.md#troubleshooting) | Complete troubleshooting and timeout resolution |
| [**Development Workflows**](CLAUDE.md#development-workflow) | Code changes, testing, and development procedures |
| [**TypeScript**](docs/TYPESCRIPT.md) | Type definitions and development |
| [**CLI Tools**](docs/CLI-TROUBLESHOOTING.md) | Command-line interface and setup |
| [**Event Architecture**](docs/event-driven-architecture-diagram.md) | Visual system diagrams |

## Project Resources

- [**MCP Configuration**](CLAUDE.md) - Quick commands and setup
- [**GitHub Releases**](https://github.com/durapensa/claude-chrome-mcp/releases) - Release history  
- [**GitHub Issue Script**](docs/create-claude-code-issue.sh) - Claude Code integration utilities

### CLI Tool (Optional)
```bash
npm install && npm run build && npm link
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude.ai     │    │ Chrome Extension │    │ WebSocket Relay │
│   (Browser)     │◄──►┤ (Offscreen Doc)  │◄──►│   Port 54321    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         ▲
                                                         │
                                                ┌────────┴────────┐
                                                │                 │
                                        ┌───────▼──────┐ ┌───────▼──────┐
                                        │ MCP Server   │ │ Claude Code  │
                                        │ (Relay Mode) │ │ MCP Client   │
                                        └──────────────┘ └──────────────┘
```
