# Session Management

## Continue Workflow

WHEN: User types 'continue'  
THEN: Execute mandatory workflow:
1. Run `mcp system_health`
2. Use `TodoRead` to check active tasks
3. Continue with pending tasks OR check Project Priorities if empty

## TodoList Management

WHEN: TodoList has active tasks  
THEN: Continue with pending tasks, following Change → Test to 100% pass → Commit workflow

WHEN: TodoList is empty AND system health is good  
THEN: Address Critical Architecture Improvements in priority order:
- State Drift Prevention: Unified resource state management
- Configuration Management: Centralize configuration in single source  
- Error Recovery Patterns: Circuit breakers and intelligent retry logic
- Resource Cleanup Ordering: Define cleanup order dependencies

WHEN: Critical Architecture Improvements are complete  
THEN: Proceed with Test Suite Rewrite

## Session Restart Logic

WHEN: Making mcp-server/ changes AND user is using Claude Code MCP tools  
THEN: Update claude/session-management.md → Commit → Request restart

WHEN: Making mcp-server/ changes AND testing with CLI tools only  
THEN: No restart needed (CLI spawns own server)

WHEN: Uncertain about restart requirement  
THEN: Ask user about their tool usage context

## Project Context

WHEN: System health check fails  
THEN: See [Problem Resolution](problem-resolution.md) for diagnostic procedures

WHEN: Need architecture context  
THEN: See [Architecture Analysis](../docs/ARCHITECTURE-ANALYSIS.md) for foundational issues

WHEN: Working on any task  
THEN: Follow Change → Test to 100% pass → Commit workflow