# Claude Chrome MCP

**CONTEXT**: You are Claude using Claude Code to work on the Claude Chrome MCP project - a system that enables AI agents to control Chrome browsers through MCP (Model Context Protocol) tools.

**ARCHITECTURE OVERVIEW**: 
```
[AI Agent/Claude Code] → [MCP Server] → [Modular Relay System] → [Chrome Extension] → [Chrome Browser]
                         44 tools         Auto-election         Passive health        Controls Chrome
                                         Port 54321           monitoring
```

**CRITICAL RULES**:

WHEN: Writing documentation in CLAUDE.md
THEN: Use WHEN/THEN logic structure and decision trees

WHEN: Making ANY code changes
THEN: Test changes thoroughly before committing - NO EXCEPTIONS

WHEN: Need to implement new functionality
THEN: Edit existing files rather than create new ones

WHEN: Your knowledge of the project improves
THEN: Make immediate edits to existing docs to reflect new understanding

WHEN: Tracking work or knowledge
THEN: Use single source of truth:
  - GitHub Issues → active work
  - docs folder → stable knowledge
  - NEVER duplicate knowledge across docs

WHEN: Encountering new, obsolete, or changed workflows
THEN: Document them here in CLAUDE.md following these CRITICAL RULES

WHEN: Documenting in any file
THEN: Don't include code examples (reference file paths instead)

WHEN: Writing any documentation, issues, or code
THEN: NEVER use emoji or pictogram glyphs - remove them when found

WHEN: Ready to commit changes
THEN: Follow this sequence:
  1. Run `git status` to review changes
  2. Stage files selectively with `git add <specific-files>`
  3. NEVER use `git add .` without explicit permission
  4. Write detailed commit message with implementation details
  5. Run `git status` again to verify clean working directory

WHEN: Multiple unrelated changes exist
THEN: Commit them separately with focused commit messages

WHEN: Need to interact with GitHub (issues, PRs, etc.)
THEN: Use gh command via Bash tool (NOT WebFetch):
```bash
gh issue list --repo durapensa/claude-chrome-mcp
gh issue view 7
gh api repos/durapensa/claude-chrome-mcp/pulls/123/comments
```

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

**IMPORTANT SYNC/ASYNC PATTERN**: 
- MCP commands handle their own timing - DO NOT use `sleep` delays
- Commands either block until complete OR return immediately with proper async handling
- BAD: `sleep 3 && mcp system_health`
- GOOD: `mcp system_health` (runs immediately, shows current state)

### 🚀 Batch Operations (Advanced)

WHEN: Need to coordinate multiple tabs
THEN: Use batch operations for efficiency:
```bash
# Send messages to multiple tabs in parallel
mcp tab_batch_operations \
  --operation send_messages \
  --messages '[{"tabId":123,"message":"Hello"},{"tabId":456,"message":"Hi"}]' \
  --sequential false

# Get responses from multiple tabs
mcp tab_batch_operations \
  --operation get_responses \
  --tabIds '[123,456]'
```

**DISCOVERED**: Batch operations support parallel execution by default!

### Development & Testing

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
# Look for WebSocket errors, relay module issues, or connection patterns
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

### Inactivity Disconnection Investigation (Issue #7)

WHEN: Extension disconnects after inactivity
THEN: Collect investigation data:

```bash
# 1. Document the gap
mcp daemon status                    # Note uptime vs extension startup
mcp system_health                    # Capture connection status

# 2. Check for patterns
mcp system_get_extension_logs --limit 50
# LOOK FOR: Time gap between last activity and restart

# 3. Record timeline
# Note: Time of last known working state
# Note: Time of disconnection discovery
# Note: Manual intervention required (reload at chrome://extensions/)

# 4. Update GitHub Issue #7 with findings:
# - Duration of inactivity before disconnection
# - Whether recovery was automatic or manual
# - Any error patterns in logs
# - Browser idle state during disconnection
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

### Log File Access

WHEN: Need persistent logs for debugging
THEN: Access log files at these locations:
```bash
# CLI daemon logs (check actual path with 'mcp daemon status')
~/.local/share/mcp/logs/mcp-cli-daemon-PID-{PID}.log

# MCP server logs  
~/.claude-chrome-mcp/logs/claude-chrome-mcp-server-PID-{PID}.log

# Exception logs
daemon-exceptions.log
daemon-rejections.log
```

**Commands for log access**:
```bash
# Check daemon status (shows log file path and size)
mcp daemon status

# Extension debug logs
mcp system_enable_extension_debug_mode
mcp system_get_extension_logs --limit 50
```

## ARCHITECTURE GOTCHAS

### Relay System Architecture (v2.7.0+)
**DESIGN**: Modular relay system with auto-election and passive health monitoring
**WHEN**: Debugging connection issues
**THEN**: Understand these architectural improvements:

**Modular Components**:
- `relay-core.js` - Shared message types and constants
- `websocket-server.js` - Server-side relay with health endpoints  
- `websocket-client.js` - Client connection management with reconnection
- `relay-index.js` - Auto-election coordinator (server/client roles)
- `mcp-relay-client.js` - MCP-specific wrapper

**Connection Health Monitoring**:
- **Passive Monitoring**: Health tracked via normal message flow (zero overhead)
- **Real-time Metrics**: Message counts, activity timestamps, idle detection
- **User Visibility**: Extension popup shows live connection status with traffic indicators
- **No Ping/Pong**: Eliminated active health checks in favor of message activity tracking

**Benefits**: Better maintainability, improved debugging, zero health monitoring overhead, richer user feedback

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
- `mcp-server/src/config.js` - Central MCP server config (includes all Claude URL templates and validation)
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

**VERSION BUMP PROCESS**:
```bash
# 1. Update VERSION file
echo "2.6.2" > VERSION

# 2. Run update script (updates all files + validates)
npm run update-versions

# 3. Commit with detailed message
git add .
git commit -m "chore: bump version to 2.6.2"

# 4. Push to GitHub
git push origin main
```

**DETAILS**: See docs/VERSION-MANAGEMENT.md for complete process

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

### Test Coverage
**CURRENT**: 100% coverage (32/32 tools tested) ✅
**COMPLETED**: All MCP tools now have comprehensive test coverage
- Chrome tools: 9/9 tested (debugger, script execution, DOM, network monitoring)
- Tab tools: 11/11 tested (including batch ops, forwarding, export)
- API tools: 5/5 tested (search, URL generation, deletion)
- System tools: 7/7 tested (debug mode, log levels, operations)


## QUICK REFERENCE

### Most Used Commands
```bash
# Daily essentials
mcp system_health                    # Am I connected?
mcp tab_create --injectContentScript # Start work
mcp tab_list                         # What's open?
mcp chrome_reload_extension          # Fix most issues

# Resource state management
mcp resource_state_summary           # View all tracked resources
mcp resource_cleanup_orphaned        # Find/clean orphaned resources

# Debug when stuck
mcp tab_debug_page --tabId <id>      # Tab state
mcp system_get_extension_logs        # Recent errors
```

### Tool Categories (44 total)
- **System** (7): Health, operations, debugging
- **Chrome** (9): Browser control, debugging, monitoring  
- **Tab** (11): Claude.ai interaction, batching
- **API** (5): Conversation management
- **Resource** (12): State management, resource tracking

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