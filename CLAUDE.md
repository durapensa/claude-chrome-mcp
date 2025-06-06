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
YOU MUST follow [Session Management](claude/session-management.md) when user types 'continue'
NO EXCEPTIONS - This is your PRIMARY workflow guide

## Context-Aware Workflows

WHEN: User types 'continue' OR managing sessions  
THEN: See [Session Management](claude/session-management.md)

WHEN: Making code changes OR testing  
THEN: See [Development Workflows](claude/development-workflows.md)

WHEN: Encountering timeouts OR connection issues  
THEN: See [Problem Resolution](claude/problem-resolution.md)

## Documentation
- [Architecture](docs/ARCHITECTURE.md): System design and components
- [TypeScript](docs/TYPESCRIPT.md): Type definitions  
- [Architecture Analysis](docs/ARCHITECTURE-ANALYSIS.md): Foundational issues analysis

## Essential Workflows
- Change code → Test to 100% pass → Commit 
- CLI Tool Usage: `cd cli && npm run build && npm install -g` then use global `mcp` command
- For all development workflows: See [Development Workflows](claude/development-workflows.md)
- For timeout issues: See [Problem Resolution](claude/problem-resolution.md)

## MCP Specification Reference
- Located at node_modules/@modelcontextprotocol for MCP-related changes
