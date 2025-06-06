# Claude Chrome MCP

## 🚨 SESSION MANAGEMENT 🚨

WHEN: User types 'continue'  
THEN: `mcp system_health` → `TodoRead` → Continue pending tasks OR address Critical Architecture Improvements

## DEVELOPMENT WORKFLOW

WHEN: Code changes complete  
THEN: **Test by component → Fix failures → Commit workflow:**
- extension/: Reload extension → Test
- cli/: **REQUIRED** `cd cli && npm run build && npm install -g` → Test commands  
- mcp-server/: `mcp daemon restart` → Test

WHEN: Managing code  
THEN: **Simplify and consolidate:**
- Consider deleting dead/commented code immediately
- Edit existing files rather than create new; ask user if new file creation seems a good choice
- Don't create temporary files (git provides history)
- Single source for information, link from elsewhere

## TROUBLESHOOTING

WHEN: MCP tools timeout OR connection issues  
THEN: **Escalating resolution:**
1. `mcp chrome_reload_extension`
2. `mcp system_health` 
3. Manual extension reload at chrome://extensions/

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
mcp tab_send_message --message "Test" --tabId <id>
mcp tab_get_response --tabId <id>

# Forwarding & API
mcp tab_forward_response --sourceTabId <source> --targetTabId <target>
mcp api_list_conversations
mcp api_get_conversation_url --conversationId <uuid>
```

## DOCUMENTATION
- [Architecture](docs/ARCHITECTURE.md) | [TypeScript](docs/TYPESCRIPT.md) | [Architecture Analysis](docs/ARCHITECTURE-ANALYSIS.md)
- MCP Specification: node_modules/@modelcontextprotocol