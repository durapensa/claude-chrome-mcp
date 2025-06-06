# Troubleshooting Guide

**⚠️ This file has been reorganized for better decision tree flow.**

**For complete problem resolution workflows, see:**
[Problem Resolution](../claude/problem-resolution.md)

This includes:
- Complete MCP timeout resolution (4-step systematic process)
- Connection issue diagnostics (WebSocket relay problems)
- Operation failure troubleshooting (operationId, forwarding, notifications)
- Diagnostic tool selection by issue type
- Logging and debugging procedures

**For development-specific troubleshooting, see:**
[Development Workflows](../claude/development-workflows.md)

**Quick Reference - Most Common Issues:**
- **MCP tools timeout**: `mcp chrome_reload_extension` (wait 5 seconds)
- **Relay not connected**: `mcp system_health` → follow problem resolution steps
- **After extension reload**: Close old tabs, create fresh ones