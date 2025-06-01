#!/bin/bash

# Script to create GitHub issue for Claude Code MCP notification-driven auto-resume feature

set -e

# Check if gh CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

# Create the issue using heredoc
gh issue create \
    --repo "anthropics/claude-code" \
    --title "Add MCP Notification-Driven Auto-Resume for Async Operations" \
    --label "enhancement" \
    --body "$(cat <<'EOF'
## Summary

Claude Code currently lacks automatic continuation capabilities when MCP tools complete async operations. This creates a significant UX gap where users must manually check operation status or Claude must resort to polling patterns, breaking the async workflow experience.

## Problem Description

### Current Async Workflow Limitation

When Claude executes async MCP operations (like those in [claude-chrome-mcp](https://github.com/durapensa/claude-chrome-mcp)), the workflow breaks:

1. Claude calls async MCP tool → Returns `operationId` immediately
2. MCP server completes work → Sends MCP progress notifications  
3. **Gap**: Claude Code receives notifications but cannot automatically resume Claude's workflow
4. User must manually prompt Claude to continue OR Claude must poll for completion

### Real-World Example

Testing the `forward_response_to_claude_dot_ai_tab` tool from claude-chrome-mcp:

```typescript
// Claude executes:
mcp__claude-chrome-mcp__forward_response_to_claude_dot_ai_tab
  --sourceTabId 948571226 --targetTabId 948571227

// Returns immediately:
{
  "operationId": "forward_response_1748777880049_swlbdmv3d",
  "status": "started", 
  "type": "forward_response",
  "timestamp": 1748777880051
}

// Then... Claude is stuck waiting with no way to know when it completes
```

## Proposed Solution: MCP Notification-Driven Auto-Resume

Add an **event-driven auto-resume system** that bridges MCP async completion notifications back to Claude's conversation flow.

### Core Architecture

#### 1. **Automatic Continuation on MCP Completion**
```typescript
// When MCP server sends completion notification:
{
  "method": "notifications/progress",
  "params": {
    "progressToken": "forward_response_1748777880049_swlbdmv3d", 
    "progress": 1.0,
    "status": "completed",
    "result": { /* operation results */ }
  }
}

// Claude Code automatically injects continuation message:
"🔔 **Async Operation Completed**

Operation `forward_response_1748777880049_swlbdmv3d` finished successfully:
- **Type**: forward_response
- **Source→Target**: Tab 948571226 → Tab 948571227  
- **Status**: Response forwarded successfully

You can now continue with next steps or retrieve the target response."
```

#### 2. **Smart Context Preservation**
```typescript
interface AsyncOperationContext {
  operationId: string;
  operationType: string; 
  startTimestamp: number;
  conversationContext: string;    // What Claude was working on
  todoContext?: TodoItem[];       // Related todo items  
  expectedNextSteps?: string[];   // Suggested continuations
  toolParameters: Record<string, any>; // Original tool params
}
```

#### 3. **Configuration Options**
```typescript
// Claude Code settings
{
  "mcp": {
    "autoResume": {
      "enabled": true,
      "operationTypes": ["forward_response", "send_message_async", "batch_operations"],
      "includeContext": true,
      "includeTodoUpdates": true,
      "customPromptTemplate": "Auto-resume: {operationType} completed. {results}"
    }
  }
}
```

### Implementation Components

#### 1. **MCP Notification Handler** (new)
- `MCPNotificationHandler` class to process progress notifications
- Operation context tracking with conversation state preservation  
- Automatic message injection to Claude conversation flow

#### 2. **Enhanced Tool Execution** (modify existing)
- Inject `progressToken` into async MCP tool calls
- Track operation context when tools return `operationId`
- Map completion notifications back to conversation context

#### 3. **Todo List Integration** (extend existing)
- Auto-update todo items when related operations complete
- Mark async operations as completed in todo context
- Suggest next steps based on operation results

## Benefits

### For Users
- **Seamless Async Workflows**: No more manual "are we done yet?" checking
- **True Automation**: Enable complex multi-step async automation pipelines
- **Better UX**: Claude feels more responsive and intelligent

### For Developers  
- **Event-Driven Architecture**: Follows modern async patterns (AWS EventBridge, Azure Event Grid)
- **MCP Protocol Alignment**: Proper utilization of MCP progress notification system
- **Extensible**: Works with any MCP server implementing progress notifications

### For claude-chrome-mcp Integration
- **Unlock Full Potential**: Enable sophisticated browser automation workflows
- **Multi-Tab Orchestration**: Claude can manage complex tab interactions automatically  
- **Workflow Chaining**: Connect operations across multiple Claude instances seamlessly

## Use Cases

### 1. **Multi-Claude Workflows** 
```bash
# Claude can now orchestrate this automatically:
1. spawn_claude_dot_ai_tab × 3
2. send_message_async to each → auto-resume when complete
3. forward_response between tabs → auto-resume when complete  
4. batch_get_responses → auto-resume when complete
5. analyze_results → continue with next workflow
```

### 2. **Browser Automation Pipelines**
- Research tasks across multiple Claude tabs
- A/B testing different prompts automatically
- Content generation and cross-validation workflows

### 3. **Development Workflows**
- Async testing with automatic result collection
- Multi-step deployment processes with checkpoints
- Batch operations with automatic progress tracking

## Technical Considerations

### MCP Protocol Alignment
This leverages the existing [MCP progress notification system](https://spec.modelcontextprotocol.io/specification/draft/basic/utilities/progress/) properly instead of working around it.

### Backward Compatibility
- Existing sync tools continue working unchanged
- Async tools work better with auto-resume but don't break without it
- Configuration allows gradual adoption

### Performance
- Minimal overhead: Only tracks operations that return `operationId`
- Memory efficient: Context cleanup after completion
- User configurable: Can disable per operation type

## Related Work

- **claude-chrome-mcp**: This issue was discovered while testing async browser automation workflows
- **MCP Specification**: Builds on existing progress notification standards
- **Event-Driven Architecture**: Follows patterns from AWS EventBridge, Azure Event Grid

## Implementation Priority

**High Impact, Medium Effort**

This would significantly enhance Claude Code's async capabilities and unlock new automation use cases, particularly for MCP servers like claude-chrome-mcp that provide rich async workflows.

---

**Note**: This issue emerged from testing advanced async workflows with [claude-chrome-mcp](https://github.com/durapensa/claude-chrome-mcp), where the lack of auto-resume created a poor user experience for sophisticated browser automation tasks.
EOF
)"

echo "✅ Issue created successfully!"
echo "🔗 View at: https://github.com/anthropics/claude-code/issues"