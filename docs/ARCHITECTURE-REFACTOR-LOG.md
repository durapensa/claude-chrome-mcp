# Architecture Refactor Log

This document tracks the ongoing architecture refactoring effort across multiple sessions.

## Refactor Goals
1. ~~Remove all polling patterns in favor of event-driven async~~ ✅
2. ~~Implement centralized logging system~~ ✅ (Winston installed)
3. Clean up TODO items and incomplete features
4. ~~Unify overlapping modules~~
5. Create centralized configuration
6. Implement proper async patterns (AbortController, Promise.race)
7. Update documentation to reflect current implementation

## Session 2: January 6, 2025 - Part 6

### Completed
- [x] Designed new architecture using offscreen documents + WebSocket
- [x] Complete rewrite of ARCHITECTURE.md with new design
- [x] Updated todos with implementation phases
- [x] Removed ARCHITECTURE-V2.md (consolidated into ARCHITECTURE.md)

### Architecture Decision: Offscreen Documents + WebSocket

After extensive analysis of alternatives (SSE, native messaging, WebTransport, etc.), we chose:
- **Offscreen Documents** for persistent WebSocket connection (12+ hours)
- **Simple Message Relay** replacing complex hub logic
- **Extension as Brain** with all coordination logic
- **No External Libraries** - native WebSocket is sufficient

### Next Implementation Steps

#### Phase 1: Offscreen Document (High Priority)
1. Add `offscreen` permission to manifest.json
2. Create offscreen.html and offscreen.js
3. Implement WebSocket client with auto-reconnect
4. Bridge messaging between offscreen ↔ service worker

#### Phase 2: Refactor Hub to Relay
1. Strip all business logic from hub
2. Implement pure message routing
3. Keep same port (54321) for compatibility
4. Test failover scenarios

#### Phase 3: Extension Coordination
1. Move lock management to extension
2. Implement operation queuing per tab
3. Add client health monitoring
4. Create conflict resolution policies

## Session 1: January 6, 2025

### Completed (Committed)
- [x] Removed backup files: `server-original.js`, `server-pre-tools-refactor.js` (commit: c3e2774)
- [x] Refactored OperationManager to use EventEmitter instead of polling (commit: a0e0007)
  - Replaced 100ms setTimeout polling with event-driven architecture
  - Added events: `operation:completed`, `operation:failed`, `operation:updated`
  - Proper cleanup of listeners and timeouts

### Tested
- EventEmitter implementation works correctly
- Operations complete without polling
- Proper event emission and cleanup
- Issue: Extension creates operation IDs, MCP server never sees them

## Refactor Principles
1. **Incremental Changes**: Make 2-3 significant changes per session
2. **Test Before Proceeding**: Verify each change works before moving on
3. **Document Everything**: Keep this log updated with each change
4. **Commit Frequently**: Each logical change gets its own commit
5. **Maintain Backwards Compatibility**: Don't break existing functionality

## Known Issues to Address
1. **Two Operation ID Systems**: Extension and MCP server track separately
2. **Console.log Proliferation**: 232 console statements need centralized logging
3. **TODO Comments**: Multiple TODOs in production code
4. **Module Duplication**: tab-management.js vs tab-operations.js

## Architecture Insights
- Current hub is overloaded with business logic
- HTTP polling adds unnecessary latency
- Service worker limitations drive complexity
- Offscreen documents solve persistence problem cleanly

## Testing Strategy
- Use existing MCP tools for integration testing
- Create focused unit tests for new components
- Maintain backward compatibility during transition
- Test failover and error scenarios thoroughly