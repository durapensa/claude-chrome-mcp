# Claude Chrome MCP

**CRITICAL**: Maintain the WHEN/THEN and related structure and logic in this file when making additions or other changes.
- better to revise existing WHEN/THEN statements rather than write new ones, unless writing new simplifies
**CRITICAL**: When considering writing to this file, carefully evaluate the WHEN/THEN and related structure and logic to ensure consistancy, simplicity while preserving decision trees, and no looping.

## 🚨 SESSION MANAGEMENT 🚨

WHEN: User types 'continue'  
THEN: `mcp system_health` → `TodoRead` → Continue pending tasks OR check [GitHub Issues](https://github.com/durapensa/claude-chrome-mcp/issues) → reference [Architecture Analysis](docs/ARCHITECTURE-ANALYSIS.md)

## DEVELOPMENT WORKFLOW

WHEN: Writing test code  
THEN: **REQUIRED before commit:**
- `cd tests && npm install` → Install dependencies
- `npm test` → Run at least one test to verify framework works
- Fix any failures → Only then commit

WHEN: Code changes complete  
THEN: **Test by component → Fix failures → Commit workflow:**
- extension/: **REQUIRED** `mcp chrome_reload_extension` → Test
- cli/: **REQUIRED** `cd cli && npm run build && npm install -g` → Test commands  
- mcp-server/: **REQUIRED** `mcp daemon restart` → Test CLI tools (`mcp` commands)
- tests/: **REQUIRED** `cd tests && npm test` → Verify tests pass

**CRITICAL**: When testing mcp-server/ changes, use CLI tools (`mcp`) not MCP tools (`mcp__claude-chrome-mcp__*`)
- CLI tools use local daemon (affected by restart)  
- MCP tools use Claude Code's server (unaffected by local changes)

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
1. `mcp chrome_reload_extension`
2. `mcp system_health` 
3. Request that user manually reload extension reload at chrome://extensions/

WHEN: Operations hang OR don't complete  
THEN: **Check systematically:**
1. Verify target tab is valid/active
2. Check operation state/content script injection
3. Close targert tab and open new Claude.ai tab (DOM observer detached)

WHEN: Need diagnostics  
THEN: **Evidence gathering pattern:**
- `system_health` → Monitor network → Execute → Check logs → Stop monitoring
- Enable debug mode: `system_enable_extension_debug_mode` → `system_get_extension_logs`

## ESSENTIAL COMMANDS

```bash
# Core workflow
mcp system_health
mcp tab_create --injectContentScript
mcp tab_send_message --message "Quick: 2 + 2" --tabId <id>
mcp tab_get_response --tabId <id>

# Forwarding & API
mcp tab_forward_response --sourceTabId <source> --targetTabId <target>
mcp tab_get_response --targetTabId <target>

# GitHub operations (use gh CLI)
gh issue list --repo durapensa/claude-chrome-mcp
gh issue view <number> --repo durapensa/claude-chrome-mcp
```

## DOCUMENTATION
- [Architecture](docs/ARCHITECTURE.md) | [TypeScript](docs/TYPESCRIPT.md) | [Architecture Analysis](docs/ARCHITECTURE-ANALYSIS.md)
- MCP Specification: node_modules/@modelcontextprotocol
