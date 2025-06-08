# Claude Chrome MCP

**CONTEXT**: You are Claude using Claude Code to work on the Claude Chrome MCP project - a system that enables AI agents to control Chrome browsers through MCP (Model Context Protocol) tools.

**ARCHITECTURE OVERVIEW**: 
```
[AI Agent/Claude Code] → [MCP Server] → [Modular Relay System] → [Chrome Extension] → [Chrome Browser]
                         44 tools         Auto-election         Passive health        Controls Chrome
                                         Port 54321           monitoring
```

**CRITICAL RULES**:

## Document Philosophy

THIS DOCUMENT IS: An operational playbook for daily use
THIS DOCUMENT IS NOT: A development log, architecture guide, or progress tracker

ALWAYS:
- Answer "What do I do?" not "How does it work?"
- Update immediately when workflows change
- Test every command before documenting
- Include expected outputs and timing
- Correct drift the moment it's noticed - no deferrals
- Fill gaps when discovered during use - not "later"
- Formalize patterns after 2+ occurrences

NEVER:
- Document completed work (→ GitHub issues)
- Explain implementations (→ docs/ folder)
- Show code snippets (→ reference file paths)
- Add emoji or decorative glyphs
- Leave "TODO" or "TBD" markers - fix it now
- Accept vague timings like "a while" - measure and specify

## Content Patterns

### Primary Pattern: WHEN/THEN
```
WHEN: [Specific situation]
THEN: [Concrete action with example]
```

### Troubleshooting Pattern: SYMPTOM → DIAGNOSIS → TREATMENT
```
SYMPTOM: MCP tool timeout
DIAGNOSIS: Check connection with `mcp system_health`
TREATMENT: 
  Level 1: `mcp chrome_reload_extension`
  Level 2: Manual reload at chrome://extensions/
  Level 3: Enable debug mode and check logs
```

### Decision Pattern: IF/THEN/ELSE
```
IF: extension.relayConnected = false
THEN: Reload extension
ELSE IF: Still disconnected after reload
THEN: Manual intervention required
ELSE: Continue with operations
```

### Workflow Pattern: CONTEXT → ACTION → EXPECTED
```
CONTEXT: Need to send message to Claude
ACTION: `mcp tab_send_message --tabId 12345 --message "Hello"`
EXPECTED: Returns immediately with operation ID
```

## Information Architecture

PUT THIS HERE | NOT HERE
---|---
Operational procedures | Implementation details
Command examples with output | Code snippets
Troubleshooting steps | Root cause analysis
Active warnings (e.g., Issue #7) | Resolved issues
File path references | File contents

ROUTING RULES:
- Active work → GitHub Issues
- Stable knowledge → docs/ folder  
- What changed → Commit messages
- How to operate → CLAUDE.md
- Why it works → Architecture docs

## Command Documentation Standards

GOOD EXAMPLE:
```bash
# Create tab (2-3 seconds)
mcp tab_create --injectContentScript
# Output: { "success": true, "tabId": 12345 }
```

BAD EXAMPLE:
```bash
# Create a tab
mcp tab_create  # Missing timing, options, output format
```

PATTERN FOR COMMANDS:
1. Purpose comment with timing expectation
2. Full command with common options
3. Expected output format or behavior
4. Common failure modes (if any)

## Critical Operational Rules

ALWAYS:
- Test in correct environment (Extension → MCP tools, Server → CLI tools)
- Check `mcp system_health` before complex operations
- Use `timeout` if you notice commands timing out
- Use file paths not code: "See implementation in `path/to/file.js:123`"
- Document timing: "Returns immediately" vs "Blocks 2-3 seconds"
- Capture error codes/messages when encountered → Add to patterns
- Verify recovery with explicit checklist after any failure
- Document performance baseline on first observation

NEVER:
- Add `sleep` delays (commands handle own timing)
- Test server changes with MCP tools
- Create new files when existing ones can be edited
- Skip documenting a workaround - formalize it immediately
- Use relative performance terms without baseline numbers

## Troubleshooting Decision Tree

```
Problem Detected
├─ Connection Issue?
│  ├─ YES → See "Connection Issues" pattern
│  └─ NO → Continue
├─ Operation Hanging?
│  ├─ YES → See "Operation Failures" pattern
│  └─ NO → Continue
├─ After Chrome Restart?
│  ├─ YES → See "State Recovery" pattern
│  └─ NO → Continue
└─ Need Detailed Diagnosis?
   └─ See "Diagnostic Recipes"
```

## Git Workflow Rules

BEFORE COMMITTING:
1. ✓ All tests pass
2. ✓ Changes are related
3. ✓ Working directory is clean

COMMIT SEQUENCE:
```bash
git status                    # Review all changes
git add <specific-files>      # Stage selectively  
git commit -m "type: description"
git status                    # Verify clean state
```

IF: Multiple unrelated changes
THEN: Split into separate commits
EXAMPLE: 
- Commit 1: "fix: tab operation timeout handling"
- Commit 2: "docs: update troubleshooting guide"

## Testing Patterns

Component → Test Method:
- `extension/*` → `mcp chrome_reload_extension` + MCP tools
- `cli/*` → `npm run build && npm install -g` + CLI commands  
- `mcp-server/*` → `mcp daemon restart` + CLI tools
- `tests/*` → `cd tests && npm test`

COMMON MISTAKE PATTERN:
```
MISTAKE: Using MCP tools after server changes
WHY: MCP tools use Claude Code's server, not your local daemon
CORRECT: Use CLI tools (mcp commands without __claude-chrome-mcp__)
```

## Meta-Rules for Updating This Document

WHEN UPDATING:
- Prefer revising existing patterns over adding new ones
- Combine related WHEN/THEN rules when possible
- Test every command/workflow before documenting
- Keep examples concrete with real values
- Update within the same session when drift detected
- Add missing decision branches immediately when discovered

STRUCTURE NEW CONTENT AS:
1. Identify the pattern type (operational, troubleshooting, decision)
2. Choose appropriate logical flow
3. Include concrete example with expected output
4. Add to correct section
5. Remove any duplicate information
6. Verify no gaps remain in the workflow
7. Include error codes and recovery verification

DRIFT CORRECTION PROTOCOL:
```
WHEN: Any documented behavior doesn't match reality
THEN: 
1. Test current behavior
2. Update documentation immediately
3. Include version/date if behavior changed
4. NO "will update later" - fix now
```

GAP FILLING PROTOCOL:
```
WHEN: Missing information noticed during use
THEN:
1. Gather the missing data
2. Add to appropriate section
3. Test the addition
4. Cross-reference related sections
```

PERFORMANCE BASELINE PROTOCOL:
```
WHEN: First timing observation made
THEN: Document as: "Operation X: Y±Z seconds (measured DATE)"
NOT: "Operation X: fast" or "usually quick"
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

**NOTE**: Batch operations execute in parallel by default (use --sequential true for sequential)

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

### Relay System Architecture
**WHEN**: Debugging connection issues
**THEN**: Check these relay components:
- `relay-core.js` - Shared message types and constants
- `websocket-server.js` - Server-side relay with health endpoints  
- `websocket-client.js` - Client connection management with reconnection
- `relay-index.js` - Auto-election coordinator (server/client roles)
- `mcp-relay-client.js` - MCP-specific wrapper

**Health Monitoring**:
- Health tracked via normal message flow (no active pings)
- Extension popup shows live connection status with traffic indicators
- Check message counts, activity timestamps in system_health output

### Configuration Management
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
**WHEN**: Need to bump version
**THEN**: Follow this process:
```bash
# 1. Update VERSION file
echo "X.Y.Z" > VERSION

# 2. Run update script (updates all files + validates)
npm run update-versions

# 3. Commit with detailed message
git add .
git commit -m "chore: bump version to X.Y.Z"

# 4. Push to GitHub
git push origin main
```

**WHEN**: Components connect
**THEN**: Version checking occurs automatically:
- Major mismatch: Warning logged
- Minor difference: Info logged

**DETAILS**: See docs/VERSION-MANAGEMENT.md for complete process

### Resource Cleanup Order
**WHEN**: Cleaning up tabs/debugger
**THEN**: MUST follow this order:
1. Stop network monitoring (if active)
2. Wait for pending operations
3. Detach debugger
4. Release locks
5. Remove content scripts

**NEVER**: Close tab before detaching debugger!



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