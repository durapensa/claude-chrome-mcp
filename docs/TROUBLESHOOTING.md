# Claude Chrome MCP: Troubleshooting
## Quick Reference Guide

**For complete troubleshooting workflows, see [CLAUDE.md](../CLAUDE.md) TROUBLESHOOTING section.**

## Quick Reference - Most Common Issues

**MCP tools timeout:**
1. `mcp chrome_reload_extension` (wait 5 seconds)
2. `mcp system_health` 
3. Request user manually reload extension at chrome://extensions/

**Operations hang or don't complete:**
1. Verify target tab is valid/active
2. Check operation state/content script injection
3. Close target tab and open new Claude.ai tab (DOM observer detached)

**Need diagnostics:**
- `system_health` → Monitor network → Execute → Check logs → Stop monitoring
- Enable debug mode: `system_enable_extension_debug_mode` → `system_get_extension_logs`

## Component-Specific Issues

**CLI-specific troubleshooting:** See [CLI-TROUBLESHOOTING.md](CLI-TROUBLESHOOTING.md)

**Test-related issues:** See [tests/README.md](../tests/README.md)