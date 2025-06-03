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
- **Version**: 2.5.0 (Event-driven architecture with offscreen documents planned)
- **Architecture**: Transitioning to offscreen documents + WebSocket
- **Key Features**: Async operations, Claude-to-Claude forwarding, network detection, multi-hub coordination
- **Next Phase**: Implementing persistent WebSocket via offscreen documents

## Latest Session Summary (2025-01-06 - Part 6: Architecture Design)

### What Was Accomplished
1. **Architecture Analysis**:
   - Identified that hub contains too much business logic
   - Recognized extension HTTP polling as a bottleneck
   - Discovered offscreen documents as solution for persistent connections

2. **New Architecture Designed**:
   - Offscreen documents for persistent WebSocket (12+ hours)
   - Simple message relay replacing complex hub
   - All coordination logic moved to extension
   - Event-driven messaging replacing polling

3. **Documentation Updated**:
   - Complete rewrite of ARCHITECTURE.md
   - Clear migration path defined
   - Implementation phases outlined

### Next Session: Implementation Phase 1

1. **Create Offscreen Document**:
   - Add offscreen permission to manifest
   - Create offscreen.html and offscreen.js
   - Implement WebSocket connection

2. **Update Extension Architecture**:
   - Add offscreen document creation logic
   - Bridge service worker ↔ offscreen messaging
   - Maintain backward compatibility

3. **Test New Connection**:
   - Verify persistent WebSocket
   - Test message flow both directions
   - Confirm no keepalive needed

### Key Implementation Files
- `/extension/manifest.json` - Add offscreen permission
- `/extension/offscreen.html` - Minimal HTML for offscreen context
- `/extension/offscreen.js` - WebSocket connection logic
- `/extension/background.js` - Offscreen document management

### Testing Commands After Implementation
```bash
# Test new WebSocket connection
mcp__claude-chrome-mcp__get_connection_health

# Verify event-driven messaging
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab
mcp__claude-chrome-mcp__send_message_async --message "Test offscreen: 7*8" --tabId <id>

# Monitor for polling removal
# Should see WebSocket events, not HTTP polls
```

## Previous Sessions

### Session 5: Architecture Refactor
- Replaced OperationManager polling with EventEmitter
- Started centralized logging implementation
- Identified need for better connection architecture

### Session 4: Response Capture Fix
- Fixed DOM observer to wait for streaming completion
- Added content stability detection
- Simplified content extraction

### Session 3: Tool Restoration
- Fixed missing tool command routing
- Updated Claude.ai DOM selectors
- Implemented missing conversation methods

### Session 2: Modular Architecture
- Created modular tool structure
- Fixed 18+ missing tools
- Established clean separation of concerns