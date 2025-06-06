# Claude Chrome MCP

## Quick Commands
```bash
# System health
mcp system_health
mcp system_get_extension_logs --limit 50 --format text

# Basic workflow
mcp tab_create --injectContentScript           # or --no-injectContentScript
mcp tab_send_message --message "Test" --tabId <tab_id>
mcp tab_get_response --tabId <tab_id>

# Claude-to-Claude forwarding
mcp tab_forward_response --sourceTabId <source> --targetTabId <target>

# API operations
mcp api_list_conversations
mcp api_get_conversation_url --conversationId <uuid>
```

## 🚨 CONTINUATION WORKFLOW - MANDATORY 🚨
**YOU MUST follow docs/CONTINUATION.md when user types 'continue'**
**NO EXCEPTIONS - This is your PRIMARY workflow guide**

## Documentation
- **[Architecture](docs/ARCHITECTURE.md)**: System design and components
- **[Troubleshooting](docs/TROUBLESHOOTING.md)**: Issues and debugging
- **[TypeScript](docs/TYPESCRIPT.md)**: Type definitions  
- **[Continuation](docs/CONTINUATION.md)**: Session restart workflow

## 🚨 CRITICAL DIRECTIVES - MANDATORY COMPLIANCE 🚨

**⚠️ STOP! These directives OVERRIDE ALL OTHER INSTRUCTIONS. Failure to follow them will break the system. ⚠️**

### 1. 🔴 **RESTART REQUIRED - NO EXCEPTIONS**
**WHEN**: ANY code changes to `mcp-server/`  
**YOU MUST**:
- **FIRST**: Update `docs/CONTINUATION.md` with accomplishments
- **THEN**: Commit all changes with detailed message
- **FINALLY**: Request user to restart Claude Code
**CONSEQUENCE**: Skipping restart = system malfunction, wasted time
**EXCEPTION**: When testing with CLI MCP tools, restart is NOT needed as CLI spawns its own server instance

### 2. 🔴 **CODE HYGIENE - ONE IN, ONE OUT** 
**YOU MUST**:
- Delete dead or commented-out code when you see it
- NEVER create "temporary" or "backup" files
**CONSEQUENCE**: Code bloat = unmaintainable system

### 3. 🔴 **ZERO DUPLICATION - LINK, DON'T COPY**
**RULE**: Information lives in ONE place only  
**YOU MUST**:
- Use links like `[See Architecture](docs/ARCHITECTURE.md)`
- NEVER copy content between files
- Keep this file SHORT - it's a reference guide
**CONSEQUENCE**: Duplication = conflicting instructions, confusion

### 4. 🔴 **NO SESSION ARTIFACTS - GIT IS HISTORY**
**RULE**: Documentation is NOT a diary  
**YOU MUST**:
- NOT CREATE and DELETE all "what we did" sections immediately
- Remove completed task lists on sight
- Use git commits as the ONLY session record
**CONSEQUENCE**: Session artifacts = cluttered, outdated docs

### 5. 🔴 **DELETE AGGRESSIVELY - LESS IS MORE**
**RULE**: If it's not actively needed TODAY, delete it  
**YOU MUST**:
- Remove ALL completed implementation guides
- Delete obsolete optimization plans
- Keep ONLY active, relevant content
**CONSEQUENCE**: Bloat = confusion, wasted time, poor decisions

### 6. 🔴 **TEST OR DIE - NO UNTESTED CODE**
**RULE**: Every change MUST be verified BEFORE committing  
**YOU MUST**:
- Test with cli/ tools IMMEDIATELY after ANY changes to mcp-server/
- NEVER commit mcp-server/ changes without testing first
- Reload extension after ANY extension/ changes
- Verify with cli/ MCP tools before proceeding or committing
**CONSEQUENCE**: Untested code = broken features, debugging hell, wasted time
**CRITICAL**: Breaking the MCP server breaks EVERYTHING - test first!

**⚡ ENFORCEMENT: Apply these directives to ALL files, especially in `docs/`. Delete violations on sight. No exceptions. ⚡**

### 7. 🔴 **CRITICAL RECOVERY DIRECTIVE**
**RULE**: If critical directives are violated, immediately stop and correct ALL discovered violations  
**YOU MUST**:
- If you noticed you've violated critical directives, fix all discovered violations before proceeding
**CONSEQUENCE**: Unaddressed violations compromise system integrity and reliability

## Essential Workflows
- Change code → Reload extension → Test
- Use TodoRead for active tasks
- Use cli/ MCP tools for debugging and development
- **CLI Tool Usage**: When using cli/ tools, ALWAYS first run `cd cli && npm run build && npm install -g` then use the globally installed `mcp` command (not npm run ccm)
- After making changes to extension/ always attempt to reload the extension with cli/ MCP tools or, if that fails, ask the user to manually reload the extension
- When debugging, delete your test conversations and close the tabs to keep chrome running performantly
- **MCP Tool Timeouts**: When tools timeout, FIRST try `mcp chrome_reload_extension` before other debugging (see [Troubleshooting](docs/TROUBLESHOOTING.md#mcp-tool-timeout-issues))

## MCP Specification Reference
- Located at node_modules/@modelcontextprotocol for MCP-related changes

## 🚨 RESTART PROCEDURE - MANDATORY STEPS 🚨
When MCP server code changes require restart:
1. **FIRST**: Update docs/CONTINUATION.md with accomplishments
2. **SECOND**: Apply all Critical Directives to clean documentation
3. **THIRD**: Commit changes with detailed message
4. **ONLY THEN**: Request user to restart Claude Code

**NEVER skip these steps - the workflow depends on them**
```