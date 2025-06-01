# Claude Chrome MCP

Browser automation tool enabling MCP clients (Claude Desktop, Claude Code, Cursor) to interact with claude.ai through Chrome extension and MCP server.

## Components
- **Chrome Extension** - WebSocket hub providing claude.ai browser access
- **MCP Server** - Exposes Chrome capabilities to MCP clients
- **CLI Tool** - Direct command-line browser control

## Quick Start

1. **Install Chrome Extension**: Load `extension/` directory in Chrome developer mode
2. **Install MCP Server**: Add to your MCP client configuration (see [CLAUDE.md](CLAUDE.md))
3. **Test Connection**: Run health check and spawn test tab

## Key Features

- Async message sending with completion detection
- Claude-to-Claude response forwarding
- Conversation management via Claude.ai API
- Network inspection and debugging tools
- Multi-client WebSocket hub architecture

## Documentation

| Guide | Description |
|-------|-------------|
| [**Getting Started**](docs/CONTINUATION.md) | Session continuation and standard workflow |
| [**Architecture**](docs/ARCHITECTURE.md) | System design and components |
| [**Troubleshooting**](docs/TROUBLESHOOTING.md) | Common issues and debugging methodology |
| [**TypeScript**](docs/TYPESCRIPT.md) | Type definitions and development |
| [**Restart Capability**](docs/RESTART-CAPABILITY.md) | MCP lifecycle management |
| [**Event Architecture**](docs/event-driven-architecture-diagram.md) | Visual system diagrams |

## Project Resources

- [**MCP Configuration**](CLAUDE.md) - Quick commands and setup
- [**Changelog**](CHANGELOG.md) - Release history  
- [**Roadmap**](ROADMAP.md) - Planned features
- [**GitHub Issue Script**](docs/create-claude-code-issue.sh) - Claude Code integration utilities

## Installation

### Chrome Extension
1. Navigate to `chrome://extensions/` in Chrome
2. Enable "Developer mode" 
3. Click "Load unpacked" and select `extension/` directory

### MCP Server
```bash
cd mcp-server && npm install
```

Add to your MCP client configuration (see [CLAUDE.md](CLAUDE.md) for examples).

### CLI Tool (Optional)
```bash
cd cli && npm install && npm run build && npm link
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude.ai     │    │  Chrome Extension│◄──►│  Claude Desktop │
│   (Browser)     │    │  WebSocket Hub   │    │  MCP Client     │
└─────────────────┘    │                  │    └─────────────────┘
         ▲              │                  │           
         │              │                  │◄──►┌─────────────────┐
         └──────────────┤                  │    │  Claude Code    │
                        │                  │    │  MCP Client     │
                        └──────────────────┘    └─────────────────┘
```