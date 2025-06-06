# Development Workflows

## Code Change Protocols

WHEN: Encountering dead or commented-out code  
THEN: Delete immediately

WHEN: Adding functionality AND existing file can accommodate  
THEN: Edit existing file rather than creating new

WHEN: Considering temporary or backup files  
THEN: Don't create - git provides history

## MCP Server Changes

WHEN: Making mcp-server/ changes  
THEN: Test with CLI tools before committing

WHEN: Using CLI daemon AND made server changes  
THEN: Stop daemon with `mcp daemon stop` first

## Extension Changes

WHEN: Making extension/ changes  
THEN: Always reload extension before testing

WHEN: Extension reload completed  
THEN: Complete procedure:
1. Close old tabs: `mcp tab_close --tabId <id> --force`
2. Create fresh tabs: `mcp tab_create --injectContentScript`
3. Verify functionality with MCP tools

## Testing Protocol

WHEN: Tests fail  
THEN: Fix before any commits

WHEN: Ready to commit changes  
THEN: Follow Change → Test to 100% pass → Commit workflow

WHEN: Debugging async operations  
THEN: Use systematic evidence gathering:
1. `mcp system_health`
2. `mcp chrome_start_network_monitoring --tabId <id>`
3. Execute operation
4. `mcp chrome_get_network_requests --tabId <id>`
5. `mcp chrome_stop_network_monitoring --tabId <id>`

## CLI Tool Usage

WHEN: Need to use CLI tools  
THEN: Follow setup procedure:
1. `cd cli && npm run build && npm install -g`
2. Use global `mcp` command

## Information Architecture

WHEN: Same information exists in multiple files  
THEN: Choose single source and link from elsewhere

WHEN: Need to reference information  
THEN: Use links like `[See Architecture](docs/ARCHITECTURE.md)` not copies

## Content Lifecycle

WHEN: Finding completed task lists in docs  
THEN: Delete (git commits provide history)

WHEN: Finding "what we accomplished" sections  
THEN: Remove (session artifacts don't belong in docs)

WHEN: Content not actively needed for current work  
THEN: Delete to reduce cognitive load