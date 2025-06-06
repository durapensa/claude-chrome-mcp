# Restart Instructions

## Steps to Restart Claude Code and Extension

### 1. Reload Chrome Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Find "Claude Chrome MCP Bridge" 
3. Click the refresh/reload button (↻)
4. Verify the extension shows as active

### 2. Exit and Restart Claude Code
1. Exit the current Claude Code session completely
2. Start a new Claude Code session
3. Navigate to the project directory: `/Users/dp/claude-chrome-mcp`

### 3. Verify System Health
After Claude Code restarts, run:
```bash
mcp__claude-chrome-mcp__get_connection_health
```

You should see:
- `hubClient.state: "connected"`
- `server.uptime` showing a value
- `multiHub.isHubOwner: true`

### 4. Test Restored Tools
Test that the restored tools are working:
```bash
# Test basic tool
mcp__claude-chrome-mcp__spawn_claude_dot_ai_tab

# Test restored tool (returns tab ID)
mcp__claude-chrome-mcp__extract_conversation_elements --tabId <tab_id>
```

### 5. Continue Work
Type `continue` to resume where we left off. Claude will:
- Read `/claude/session-management.md` for session context
- Check git log for recent commits
- Resume from the documented state


## If Issues Occur
1. Check Chrome DevTools console for extension errors
2. Verify MCP server is running with `ps aux | grep mcp-server`
3. Check `/claude/problem-resolution.md` for complete troubleshooting procedures
4. Ensure you're in the correct directory before restarting Claude Code