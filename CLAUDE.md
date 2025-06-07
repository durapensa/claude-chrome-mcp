# Claude Chrome MCP

**CONTEXT**: You are Claude using Claude Code to work on the Claude Chrome MCP project - a system that enables AI agents to control Chrome browsers through MCP (Model Context Protocol) tools.

**ARCHITECTURE OVERVIEW**: 
```
[AI Agent/Claude Code] → [MCP Server] → [WebSocket Relay] → [Chrome Extension] → [Chrome Browser]
                         32 tools         Port 54321         Manages tabs        Controls Chrome
```

**CRITICAL RULES**:
1. Maintain WHEN/THEN logic structure, decision trees, etc. in this doc, CLAUDE.md
2. Test ALL changes before committing - NO EXCEPTIONS
3. Edit existing files rather than create new ones.
4. As your knowledge and understading of the project improve, make immediate edits to existing docs
5. Single source of truth:
  - GitHub Issues for active work
  - docs for stable knowledge, do not duplicate knowledge across docs
6. WHEN you encounter new, obsolte, or changed workflows, or find improvements to existing workflows
   THEN document them here in CLAUDE.md following these CRITICAL RULES

## SESSION CONTINUITY

WHEN: User types 'continue'
THEN: Execute this sequence:
```bash
mcp system_health        # Check connection
```
→ `TodoRead` → Resume pending tasks OR check active [GitHub Issues](https://github.com/durapensa/claude-chrome-mcp/issues)

**SUCCESS INDICATOR**: TodoRead shows tasks OR you're working on a GitHub issue

## COMMON WORKFLOWS

### 🔧 Basic Tab Automation

WHEN: User asks to interact with Claude.ai
THEN: Follow this tested pattern:
```bash
# 1. Create tab and get ID
mcp tab_create --injectContentScript
# Example output: { "success": true, "tabId": 12345 }

# 2. Send message
mcp tab_send_message --tabId 12345 --message "Hello Claude"
# Returns immediately with operation tracking

# 3. Get response
mcp tab_get_response --tabId 12345
# Example output: { "completed": true, "response": "Hello! How can I help?" }

# 4. Clean up
mcp tab_close --tabId 12345
```

### 🛠️ Development & Testing

WHEN: Making code changes
THEN: Test based on component modified:

**Extension changes** (extension/):
```bash
mcp chrome_reload_extension          # Reload extension
mcp system_health                    # Verify: extension.relayConnected = true
# Test with any mcp__claude-chrome-mcp__* tool
```

**CLI changes** (cli/):
```bash
cd npm run build && npm install -g
mcp system_health
mcp daemon status
# Test with CLI commands (not MCP tools)
```

**Server changes** (mcp-server/):
```bash
mcp daemon restart                   # Restart local daemon
mcp system_health                    # Verify connection
# Test with CLI tools (mcp commands, NOT mcp__claude-chrome-mcp__*)
```

**COMMON MISTAKE**: Using MCP tools to test server changes - they use Claude Code's MCP server, not the CLI MCP server which is easily restartable!

## TROUBLESHOOTING PATTERNS

### Connection Issues

WHEN: Any MCP tool times out
THEN: Follow escalation (stop when fixed):

```bash
# Level 1: Quick reload
mcp chrome_reload_extension
mcp system_health
# CHECK: extension.relayConnected should be true
```

IF: Still not connected
```bash
# Level 2: Manual intervention
echo "Please reload extension at chrome://extensions/"
# User reloads, then:
mcp system_health
```

IF: Still failing
```bash
# Level 3: Full diagnostic
mcp system_enable_extension_debug_mode
mcp system_get_extension_logs --limit 50
# Look for WebSocket errors or "relay" in logs
```

### Operation Failures

WHEN: Operations hang/incomplete
THEN: Diagnose systematically:

```bash
# 1. Check tab validity
mcp tab_list
# VERIFY: Target tabId exists and shows correct URL

# 2. Check content script
mcp tab_debug_page --tabId <id>
# LOOK FOR: "contentScriptInjected": true

# 3. If DOM observer detached:
mcp tab_close --tabId <id>
mcp tab_create --injectContentScript
# Use new tabId for operations
```

### State Recovery

WHEN: Extension crash/Chrome restart
THEN: Full recovery sequence:

```bash
# 1. Verify health
mcp system_health
# MUST SEE: extension.relayConnected = true

# 2. Clean slate
mcp tab_list                         # Note any orphaned tabs
# Close each orphaned tab, then create fresh ones
```

## DIAGNOSTIC RECIPES

### Network Monitoring Pattern

WHEN: Need to debug API calls
THEN: Use this exact sequence:
```bash
# Setup
mcp system_health
mcp chrome_start_network_monitoring --tabId <id>

# Execute operation that's failing
mcp tab_send_message --tabId <id> --message "test"

# Capture results
mcp chrome_get_network_requests --tabId <id>
# LOOK FOR: Failed requests, 4xx/5xx status codes

# Cleanup
mcp chrome_stop_network_monitoring --tabId <id>
```

### Performance Analysis

WHEN: Operations are slow
THEN: Check these known bottlenecks:
- Content script injection: 500-1000ms (normal)
- Tab creation: 2-3 seconds (normal)
- Response retrieval: 1-5 seconds (depends on Claude)
- If slower → Enable debug logs and check for errors

## ARCHITECTURE GOTCHAS

### Configuration Management
**SOLUTION**: Centralized config with environment overrides
**WHEN**: Changing settings
**THEN**: Use environment variables:
```bash
# Examples:
MCP_WEBSOCKET_PORT=12345 npm start
MCP_DEBUG_MODE=true mcp system_health
```

**Config Locations**:
- `mcp-server/src/config.js` - Central MCP server config
- `cli/src/config/defaults.ts` - Central CLI config
- `extension/modules/config.js` - Extension config (with version from manifest)
- Environment variables (MCP_* prefix) - Server & CLI only
- Optional .env file for development - Server & CLI only
- NOTE: Extension config values are hardcoded; version dynamically retrieved from manifest

### Version Management
**POLICY**: Bump minor versions frequently (e.g., 2.6.0 → 2.7.0)
**WHEN**: Components connect
**THEN**: Automatic version checking occurs:
- Major mismatch: Warning logged
- Minor difference: Info logged
- Components include version in relay messages

**Version Source**: Single `VERSION` file at project root

### Resource Cleanup Order
**ISSUE**: Dependencies between cleanup steps
**WHEN**: Cleaning up tabs/debugger
**THEN**: MUST follow this order:
1. Stop network monitoring (if active)
2. Wait for pending operations
3. Detach debugger
4. Release locks
5. Remove content scripts

**NEVER**: Close tab before detaching debugger!

### Test Coverage Gaps
**CURRENT**: 34.4% coverage (11/32 tools tested)
**PRIORITY** when adding tests:
1. Chrome tools: 8/9 untested (critical gap)
2. Tab workflows: Advanced operations untested
3. API sequences: Deletion/search untested

## QUICK REFERENCE

### Most Used Commands
```bash
# Daily essentials
mcp system_health                    # Am I connected?
mcp tab_create --injectContentScript # Start work
mcp tab_list                         # What's open?
mcp chrome_reload_extension          # Fix most issues

# Debug when stuck
mcp tab_debug_page --tabId <id>      # Tab state
mcp system_get_extension_logs        # Recent errors
```

### Tool Categories (32 total)
- **System** (7): Health, operations, debugging
- **Chrome** (9): Browser control, debugging, monitoring  
- **Tab** (11): Claude.ai interaction, batching
- **API** (5): Conversation management

## DECISION TREES

### "Something's Not Working"
```
START
├─ MCP tool timeout?
│  └─ Go to: Connection Issues
├─ Operation hanging?
│  └─ Go to: Operation Failures  
├─ Just restarted Chrome?
│  └─ Go to: State Recovery
└─ Need details?
   └─ Go to: Diagnostic Recipes
```

### "I Changed Code"
```
START
├─ Changed extension/?
│  └─ Test with: mcp chrome_reload_extension
├─ Changed cli/?
│  └─ Test with: rebuild & CLI commands
├─ Changed mcp-server/?
│  └─ Test with: mcp daemon restart & CLI tools
└─ Changed tests/?
   └─ Test with: cd tests && npm test
```

## META-INSTRUCTIONS FOR CLAUDE

WHEN: Using this document
THEN: 
1. Start at "COMMON WORKFLOWS" for typical tasks
2. Jump to "TROUBLESHOOTING PATTERNS" when things break
3. Reference "ARCHITECTURE GOTCHAS" for known issues
4. Use "QUICK REFERENCE" for command syntax

WHEN: Updating this document
THEN:
1. Revise existing WHEN/THEN rules rather than add new ones
2. Include concrete examples with expected output
3. Test every command/sequence before documenting
4. Maintain single source of truth principle

**REMEMBER**: This document is your primary reference. Architecture details are in linked docs. Active work is in GitHub Issues.

# important-instruction-reminders
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files
- NEVER proactively create documentation files