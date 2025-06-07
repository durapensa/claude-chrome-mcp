# Claude Chrome MCP

**CRITICAL**: Maintain the WHEN/THEN and related structure and logic in this file when making additions or other changes.
- better to revise existing WHEN/THEN statements rather than write new ones, unless writing new simplifies
**CRITICAL**: When considering writing to this file, carefully evaluate the WHEN/THEN and related structure and logic to ensure consistancy, simplicity while preserving decision trees, and no looping.

## 🚨 SESSION MANAGEMENT 🚨

WHEN: User types 'continue'  
THEN: `mcp system_health` → `TodoRead` → Continue pending tasks OR check [GitHub Issues](https://github.com/durapensa/claude-chrome-mcp/issues) → reference [Architecture Analysis](docs/ARCHITECTURE-ANALYSIS.md)

## DEVELOPMENT WORKFLOW

WHEN: Code changes complete  
THEN: **Manual testing by component → Fix failures → Commit workflow:**
- extension/: **REQUIRED** `mcp chrome_reload_extension` → Test with MCP tools
- cli/: **REQUIRED** `cd cli && npm run build && npm install -g` → Test commands  
- mcp-server/: **REQUIRED** `mcp daemon restart` → Test CLI tools (`mcp` commands)

**CRITICAL**: When manually testing mcp-server/ changes, use CLI tools (`mcp`) not MCP tools (`mcp__claude-chrome-mcp__*`)
- CLI tools use local daemon (affected by restart)  
- MCP tools use Claude Code's server (unaffected by local changes)

## TEST SUITE (tests/)

**CRITICAL**: Test suite is **COMPLETELY INDEPENDENT** from development workflows above.

WHEN: Working with test suite  
THEN: **Independent MCP SDK client approach:**
- Test suite spawns its own mcp-server instances
- Tests are pure MCP SDK clients (like Claude Desktop)
- Integration tests require only Chrome running (no CLI tools)
- `cd tests && npm test` → Run test suite independently
- Test failures are separate from manual testing workflows

WHEN: Managing code  
THEN: **Simplify and consolidate:**
- Consider deleting dead/commented code immediately
- Edit existing files rather than create new; ask user if new file creation seems a good choice to maintain existing modularity schemas
- Don't create temporary files (git provides history)
- **Single source for information, link from elsewhere** (GitHub Issues for active work, docs for stable analysis)
- **DON'T duplicate tracking** between docs and GitHub Issues - use Issues for active work, docs for context
- **DON'T document implementation details in project docs when git captures them** (TODOs, pattern notes, completed features)

## TROUBLESHOOTING

WHEN: MCP tools timeout OR connection issues  
THEN: **Escalating resolution:**
1. `mcp chrome_reload_extension` (wait 5 seconds)
2. `mcp system_health` → Check extension.relayConnected status
3. IF relayConnected = false → Request user manually reload extension at chrome://extensions/
4. IF still failing → Check [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for component-specific issues

WHEN: Operations hang OR don't complete  
THEN: **Check systematically:**
1. Verify target tab is valid/active with `mcp tab_list`
2. Check operation state/content script injection with `mcp tab_debug_page --tabId <id>`
3. IF DOM observer detached → Close target tab and `mcp tab_create` new Claude.ai tab
4. IF persistent → Check [CLI-specific issues](docs/CLI-TROUBLESHOOTING.md)

WHEN: Extension crash OR Chrome restart  
THEN: **Recovery workflow:**
1. Verify Chrome extension loaded at chrome://extensions/
2. `mcp chrome_reload_extension` to restart extension
3. `mcp system_health` to verify relay reconnection
4. Close old tabs and create fresh tabs with `mcp tab_create`

WHEN: Need diagnostics OR investigation  
THEN: **Evidence gathering pattern:**
- `mcp system_health` → Start `mcp chrome_start_network_monitoring --tabId <id>` → Execute failing operation → `mcp chrome_get_network_requests --tabId <id>` → Stop monitoring
- Enable debug mode: `mcp system_enable_extension_debug_mode` → `mcp system_get_extension_logs` → `mcp system_disable_extension_debug_mode`
- Check logs: Extension logs via debug mode, MCP server logs via ~/.claude-chrome-mcp/logs/

WHEN: Test failures OR development issues  
THEN: **Component isolation:**
- Test suite issues → `cd tests && npm test` (completely independent)
- CLI tools issues → See [CLI Troubleshooting](docs/CLI-TROUBLESHOOTING.md)
- Extension issues → Use MCP tools for diagnosis (`mcp` commands)
- MCP server issues → Use CLI tools for testing (`cd cli && npm run build && npm install -g`)

## ESSENTIAL COMMANDS

WHEN: Need command syntax OR examples  
THEN: **Reference patterns below, see individual tool docs for full parameters**

```bash
# Health & Diagnostics
mcp system_health                                    # Connection status
mcp chrome_reload_extension                          # Restart extension
mcp system_enable_extension_debug_mode               # Enable logging

# Core Tab Workflow
mcp tab_create --injectContentScript                 # Create Claude.ai tab
mcp tab_list                                         # List open tabs
mcp tab_send_message --message "Quick: 2 + 2" --tabId <id>
mcp tab_get_response --tabId <id>                    # Get response
mcp tab_close --tabId <id>                           # Close tab

# Advanced Tab Operations
mcp tab_forward_response --sourceTabId <src> --targetTabId <target>
mcp tab_get_response_status --tabId <id>             # Progress tracking
mcp tab_extract_elements --tabId <id>                # Extract artifacts
mcp tab_batch_operations --operation send_messages --messages [...]

# API Operations
mcp api_list_conversations                           # Recent conversations
mcp api_search_conversations --titleSearch "keyword"
mcp api_get_conversation_url --conversationId <uuid>
mcp api_delete_conversations --conversationIds [...]

# Development & GitHub (use gh CLI)
gh issue list --repo durapensa/claude-chrome-mcp
gh issue view <number> --repo durapensa/claude-chrome-mcp
```

## DOCUMENTATION

WHEN: Need system understanding  
THEN: **Follow information hierarchy:**

**Operational Guidance:**
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Quick issue resolution
- [CLI Tools](docs/CLI-TROUBLESHOOTING.md) - Command-line specific issues

**Technical Design:**
- [Architecture](docs/ARCHITECTURE.md) - Stable system design principles
- [Architecture Analysis](docs/ARCHITECTURE-ANALYSIS.md) - Current state analysis and evidence-based findings  
- [TypeScript Reference](docs/TYPESCRIPT.md) - Type definitions and development

**Development:**
- [Test Suite](tests/README.md) - Three-category test architecture
- [Extension Development](extension/README.md) - Chrome extension setup

**Project Coordination:**
- [GitHub Issues](https://github.com/durapensa/claude-chrome-mcp/issues) - Active development work
- MCP Specification: node_modules/@modelcontextprotocol

**Single Source Principle**: This file (CLAUDE.md) contains decision workflows. Other docs provide context and details.
