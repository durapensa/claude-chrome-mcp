# Claude Chrome MCP (CCM) - Technical Specification

## Project Overview

Claude Chrome MCP (CCM) is a developer tool suite that enables Claude Desktop, or other MCP-enabled client such as the CCM CLI, to interact with claude.ai in Chrome browsers through the Model Context Protocol (MCP). The system consists of four synchronized components:

1. **Chrome Extension** - Provides chrome.debugger access via WebSocket
2. **Local MCP Server** - Node.js server exposing Chrome capabilities to Claude Desktop  
3. **CLI Tool** - Command-line interface following Claude Code conventions
4. **WebSocket Bridge** - Real-time communication between extension and MCP server

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

## Component Specifications

### 1. Chrome Extension

**Manifest V3 Structure:**
```json
{
  "manifest_version": 3,
  "name": "Claude Chrome MCP",
  "version": "1.0.0",
  "permissions": [
    "debugger",
    "tabs",
    "activeTab",
    "storage",
    "webNavigation"
  ],
  "host_permissions": [
    "https://claude.ai/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["https://claude.ai/*"],
    "js": ["content.js"]
  }]
}
```

**Key Files:**
- `background.js` - Service worker with WebSocket client to MCP server
- `content.js` - Claude.ai page interaction and session detection
- `debugger.js` - Chrome debugger API wrapper
- `websocket-client.js` - WebSocket communication with MCP server

**Core Functionality:**
- Detect navigation to claude.ai domains
- Extract session identifiers from cookies/localStorage
- Provide chrome.debugger access via WebSocket to MCP server
- Maintain persistent WebSocket connection with keepalive
- Handle chrome.debugger attachment and command forwarding

### 2. Local MCP Server (Node.js)

**Technology Stack:** Node.js with @modelcontextprotocol/sdk

**Communication:** 
- MCP protocol to Claude Desktop
- WebSocket server for Chrome Extension communication
- HTTP API for CLI tool integration

**Core Architecture:**
```javascript
class CCMMCPServer {
  constructor() {
    this.webSocketServer = new WebSocketServer({ port: 54321 });
    this.extensionConnection = null;
    this.mcpServer = new MCPServer({
      name: "claude-chrome-mcp",
      version: "1.0.0"
    });
  }
}
```

**MCP Tools to Expose:**

#### High-Level Tools:
- `spawn_claude_tab` - Create new Claude session in new tab
- `get_claude_sessions` - List all active Claude tabs
- `send_message_to_claude` - Send message to specific Claude session
- `get_claude_response` - Retrieve response from Claude session

#### Minimal Chrome Debugger Tools (Incremental):
- `debug_attach` - Attach debugger to tab (foundational)
- `navigate_tab` - Navigate tab to URL (basic navigation)
- `execute_script` - Execute JavaScript in page context (DOM interaction)
- `get_dom_elements` - Extract DOM elements (page inspection)
- `get_cookies` - Extract cookies from tab (session management)

*Additional debugging capabilities added as needed for specific CCM features*

**MCP Resources:**
- `claude_sessions` - Real-time list of active Claude sessions
- `tab_state` - Current state of monitored tabs
- `network_logs` - Network request logs per tab

### 3. CLI Tool (ccm)

**Technology Stack:** Node.js/TypeScript

**Communication:** HTTP requests to local MCP server + WebSocket for real-time updates

**Command Structure (following Claude Code conventions):**

```bash
# Basic usage
ccm help
ccm version

# Session management
ccm sessions list
ccm sessions spawn [--message="initial prompt"]
ccm sessions send <session-id> "message"
ccm sessions get <session-id>

# Browser control
ccm tabs list
ccm tabs create <url>
ccm tabs navigate <tab-id> <url>
ccm tabs close <tab-id>

# Debugging
ccm debug attach <tab-id>
ccm debug command <tab-id> <cdp-command> [params]
ccm debug script <tab-id> <script-file>

# Network monitoring
ccm network monitor <tab-id>
ccm network logs <tab-id>

# DOM interaction
ccm dom query <tab-id> <selector>
ccm dom click <tab-id> <selector>
ccm dom type <tab-id> <selector> <text>
```

**Implementation Requirements:**
- Node.js/TypeScript for robust error handling
- HTTP client for MCP server communication
- WebSocket client for real-time updates
- Structured JSON output for programmatic use
- Interactive mode for development workflows
- Configuration file support (~/.ccm/config.json)

## Development Phases

### Phase 1: Basic Infrastructure
1. Chrome extension with WebSocket client and debugger permissions
2. Node.js MCP server with WebSocket server
3. Claude.ai detection and session extraction
4. Basic MCP tools with tab management
5. CLI with session spawning and messaging

### Phase 2: Incremental Debugging Features
1. Add debugging tools as needed for specific CCM capabilities
2. Network monitoring (if required for Claude session management)
3. Additional DOM tools (as workflows demand them)
4. Extended JavaScript execution (for complex automation needs)

### Phase 3: Agent Orchestration
1. Multi-agent coordination tools
2. Cross-session state management
3. Advanced workflow automation
4. Performance monitoring and optimization

## Technical Implementation Notes

### Session Detection Strategy:
```javascript
// Extract session info from the most straightforward method
function detectClaudeSession() {
  // Priority order:
  // 1. URL parameters
  // 2. localStorage keys
  // 3. Cookie values
  // 4. Network request headers (via debugger)
}
```

### WebSocket Communication Protocol:
```javascript
// Extension to MCP Server
{
  "type": "debugger_command",
  "tabId": 123,
  "command": "Runtime.evaluate", 
  "params": { "expression": "document.title" }
}

// MCP Server to Extension  
{
  "type": "debugger_response",
  "tabId": 123,
  "result": { "value": "Claude" }
}
```

### Service Worker Persistence Strategy:
```javascript
// WebSocket keepalive every 20 seconds
setInterval(() => {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ type: 'keepalive' }));
  }
}, 20000);
```

### Real-time Synchronization:
- Extension broadcasts state changes to all connected clients
- CLI maintains persistent connection for real-time updates
- Claude Desktop receives MCP notifications for tool availability

## Security Considerations (Local Development)

- No authentication tokens stored in code or memory
- Session identifiers extracted only when needed
- Debug capabilities restricted to development domains
- All communication stays within local machine boundaries

## Testing Strategy

1. **Unit Tests:** Each component tested independently
2. **Integration Tests:** Full workflow testing with real Claude sessions
3. **Performance Tests:** Multi-tab scenarios and resource usage
4. **User Testing:** Developer workflow validation

## File Structure

```
claude-chrome-mcp/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── debugger.js
│   └── websocket-client.js
├── mcp-server/
│   ├── package.json
│   ├── src/
│   │   ├── server.js
│   │   ├── mcp-handler.js
│   │   ├── websocket-server.js
│   │   └── chrome-bridge.js
│   └── bin/ccm-server
├── cli/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── commands/
│   │   └── lib/
│   └── bin/ccm
├── shared/
│   ├── types.ts
│   └── protocols.ts
├── tests/
└── docs/
```

## Next Steps for Implementation

1. Set up project structure with separate MCP server
2. Implement basic Chrome extension with WebSocket client
3. Create Node.js MCP server with WebSocket server capability
4. Build CLI foundation with HTTP client to MCP server
5. Implement Claude.ai detection and session management
6. Add chrome.debugger integration via WebSocket bridge
7. Test end-to-end workflows with real Claude sessions
8. Iterate based on developer feedback

## Success Metrics

- Extension successfully detects and manages Claude sessions
- MCP server maintains stable connection to Claude Desktop
- WebSocket bridge handles chrome.debugger commands reliably
- CLI provides intuitive developer experience
- Multi-agent workflows function reliably
- Performance remains acceptable with multiple active sessions
