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

### 2. Start MCP Server

```bash
cd mcp-server
npm install
npm start
```

Server runs on WebSocket port 54321 and connects to Claude Desktop via MCP.

### 3. Install CLI Tool

```bash
cd cli
npm install
npm run build
npm link  # Makes 'ccm' command globally available
```

## Usage

With all components running:
- Extension automatically detects claude.ai sessions
- MCP server exposes tools to Claude Desktop
- CLI provides direct browser control

## Development Status

- ✅ Chrome Extension (WebSocket bridge, session detection)
- 🚧 MCP Server (in progress)
- ⏳ CLI Tool (pending)

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Claude Web    │    │  Chrome Extension│◄──►│  Local MCP      │◄──►│  Claude Desktop │
│                 │    │                  │    │  Server (Node)  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        ▲
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   CCM CLI Tool  │◄──►│   WebSocket     │
                       └─────────────────┘    └─────────────────┘
```