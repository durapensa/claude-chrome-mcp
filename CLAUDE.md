# Claude Chrome MCP

## Quick Commands
```bash
# System health
mcp system_health
mcp system_get_extension_logs --limit 50 --format text

# Basic workflow
mcp tab_create --injectContentScript           # or --no-injectContentScript
mcp tab_send_message --message "Test" --tabId <tab_id>
mcp tab_get_response --tabId <tab_id>

# Claude-to-Claude forwarding
mcp tab_forward_response --sourceTabId <source> --targetTabId <target>

# API operations
mcp api_list_conversations
mcp api_get_conversation_url --conversationId <uuid>
```

## 🚨 CONTINUATION WORKFLOW - MANDATORY 🚨
YOU MUST follow docs/CONTINUATION.md when user types 'continue'
NO EXCEPTIONS - This is your PRIMARY workflow guide

## Documentation
- [Architecture](docs/ARCHITECTURE.md): System design and components
- [Troubleshooting](docs/TROUBLESHOOTING.md): Issues and debugging
- [TypeScript](docs/TYPESCRIPT.md): Type definitions  
- [Continuation](docs/CONTINUATION.md): Session restart workflow

## Context-Aware Guidelines

### Restart Management
WHEN: Making mcp-server/ changes AND user is using Claude Code MCP tools  
THEN: Update docs/CONTINUATION.md → Commit → Request restart

WHEN: Making mcp-server/ changes AND testing with CLI tools only  
THEN: No restart needed (CLI spawns own server)

WHEN: Making extension/ changes  
THEN: Reload extension and verify functionality

WHEN: MCP tools timeout  
THEN: Try `mcp chrome_reload_extension` first

### Code Management
WHEN: Encountering dead or commented-out code  
THEN: Delete immediately

WHEN: Adding functionality AND existing file can accommodate  
THEN: Edit existing file rather than creating new

WHEN: Considering temporary or backup files  
THEN: Don't create - git provides history

### Information Architecture
WHEN: Same information exists in multiple files  
THEN: Choose single source and link from elsewhere

WHEN: Need to reference information  
THEN: Use links like `[See Architecture](docs/ARCHITECTURE.md)` not copies

### Content Lifecycle
WHEN: Finding completed task lists in docs  
THEN: Delete (git commits provide history)

WHEN: Finding "what we accomplished" sections  
THEN: Remove (session artifacts don't belong in docs)

WHEN: Content not actively needed for current work  
THEN: Delete to reduce cognitive load

### Testing Protocol
WHEN: Making mcp-server/ changes  
THEN: Test with CLI tools before committing

WHEN: Using CLI daemon AND made server changes  
THEN: Stop daemon with `mcp daemon stop` first

WHEN: Making extension/ changes  
THEN: Reload extension and verify with MCP tools

WHEN: Tests fail  
THEN: Fix before any commits

### Conflict Resolution
WHEN: Guidelines conflict  
THEN: Prioritize not breaking user workflows

WHEN: Uncertain about restart requirement  
THEN: Ask user about their tool usage context

## Essential Workflows
- Change code → Test to 100% pass → Commit 
- CLI Tool Usage: `cd cli && npm run build && npm install -g` then use global `mcp` command
- After extension/ changes → Reload extension → Test to 100% pass
- Delete test conversations and close tabs to keep Chrome performant
- MCP Tool Timeouts: Try `mcp chrome_reload_extension` first (see [Troubleshooting](docs/TROUBLESHOOTING.md#mcp-tool-timeout-issues))

## MCP Specification Reference
- Located at node_modules/@modelcontextprotocol for MCP-related changes
