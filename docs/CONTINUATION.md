# Session Continuation Guide

## Standard Continuation Workflow

When you type 'continue' in a fresh Claude Code instance:

### Step 1: System Health Check
```bash
mcp__claude-chrome-mcp__get_connection_health
```

### Step 2: Verify System Readiness
Check connection health output for:
- Hub connected status
- Active client connections
- Any connection issues

### Step 3: Standard Testing Workflow
Once system is healthy:
1. **Spawn Tab**: `spawn_claude_dot_ai_tab --injectContentScript true`
2. **Async Message**: `send_message_async --message "test" --tabId <id>`
3. **Get Response**: `get_claude_dot_ai_response --tabId <id>`
4. **Claude-to-Claude**: `forward_response_to_claude_dot_ai_tab --sourceTabId <src> --targetTabId <tgt>`

### Step 4: If Issues Arise
Follow systematic debugging approach from [Troubleshooting Guide](TROUBLESHOOTING.md#debugging-methodology):
- Use evidence-based network debugging
- Apply proper tool selection
- Avoid common anti-patterns

## Key Documentation
- **[Architecture](ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](TROUBLESHOOTING.md)**: Issues, debugging methodology, and solutions  
- **[TypeScript](TYPESCRIPT.md)**: Type definitions and development guidelines
- **[Restart Capability](RESTART-CAPABILITY.md)**: MCP lifecycle and restart mechanisms

## Development Resources
- **[Event-Driven Architecture](event-driven-architecture-diagram.md)**: Visual system overview
- **[GitHub Issue Script](create-claude-code-issue.sh)**: Claude Code integration utilities

## Current System Status
- **Version**: 2.4.1 (MCP-Server-as-Hub architecture)
- **Architecture**: Modular design with separated components (3669→382 lines in server.js)
- **Key Features**: Async operations, Claude-to-Claude forwarding, network detection, multi-hub coordination
- **Modules**: WebSocketHub, AutoHubClient, MultiHubManager, ErrorTracker, OperationManager, ProcessLifecycleManager
- **Known Limitations**: Manual polling required until Claude Code auto-resume implemented