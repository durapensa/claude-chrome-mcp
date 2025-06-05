# Implementation Guide: Dynamic Tool Compose

**Feature**: `dynamic_tool_compose` - Runtime tool composition engine  
**Priority**: High (Replaces workflow system entirely)  
**Effort**: Phase 1 (2-3 days), Full implementation (1-2 weeks)  
**Impact**: Transforms claude-chrome-mcp into self-improving system

## Executive Summary

Implement `dynamic_tool_compose` to create new MCP tools at runtime by composing existing tools. This enables powerful workflows like `quick_claude "explain quantum physics"` that spawn tabs, send messages, and return responses as a single tool call. Uses MCP's built-in tool notification system for immediate availability.

## Architecture Overview

### Core Components Required

1. **Tool Composer Engine** - Validates and compiles compositions into executable functions
2. **Execution Engine** - Runs composed tool chains with parameter flow between steps
3. **Library Manager** - Persists and loads tool definitions to/from JSON file
4. **MCP Integration** - Registers tools dynamically and triggers change notifications

### Parameter Flow Concept
The system needs to resolve parameter references like `$input.message` (from tool parameters) and `$step1.tabId` (from previous step results) throughout the execution chain.

## Composition Definition Schema

### Required Fields
- **name**: Tool name (alphanumeric + underscore, must be valid JavaScript identifier)
- **description**: Human-readable description for MCP tool list
- **steps**: Array of tool calls in execution order

### Optional Fields
- **parameters**: Schema defining what parameters the composed tool accepts
- **output**: Which step result to return (defaults to last step)
- **save**: Whether to persist to library (defaults to true)

### Step Definition Structure
Each step needs:
- **tool**: Name of existing tool to call
- **params**: Parameters for that tool, supporting reference resolution
- **condition**: (Future) Conditional execution logic
- **parallel**: (Future) Parallel execution flag

### Parameter Reference System
The system should support these reference patterns:
- `$input.fieldName` - References input parameters to the composed tool
- `$step1.resultField` - References results from step 1
- `$stepN.nested.field` - Deep property access in step results

## File Structure Requirements

### New Files to Create (Dynamic Composition System)
1. **`mcp-server/src/composition/tool-composer.js`** - Core ToolComposer class with validation and compilation
2. **`mcp-server/src/composition/execution-engine.js`** - Parameter resolution and step execution logic
3. **`mcp-server/src/composition/library-manager.js`** - Persistence and loading of composed tools
4. **`mcp-server/src/composition/composition-schema.js`** - Zod schemas for validation
5. **`mcp-server/src/tools/composition-tools.js`** - MCP tool definitions and handlers for compose operations
6. **`~/.claude-chrome-mcp/composed-tools.json`** - Persistent tool library

### Files to Modify
1. **`mcp-server/src/tools/index.js`** - Add composition tools to exports
2. **`mcp-server/src/server.js`** - Integration with main server class

## Core Functionality Specifications

### ToolComposer Class Requirements
- **validateComposition()**: Validate schema against Zod definition
- **validateToolDependencies()**: Ensure all referenced tools exist
- **compileComposition()**: Convert definition into executable async function
- **resolveParameters()**: Handle `$input` and `$step` reference resolution
- **registerComposedTool()**: Add tool to MCP server and handlers map
- **saveToLibrary()/loadFromLibrary()**: Persistence methods

### Tool Handler Requirements
- **dynamic_tool_compose**: Main composition creation tool
- **list_composed_tools**: Show all dynamically created tools
- **remove_composed_tool**: Delete composed tools

### MCP Integration Points
- Dynamic tool list updates (existing tools + composed tools)
- Tool change notifications when compositions are added/removed
- Proper error handling and validation responses

## Validation Requirements

### Composition Validation
- Name uniqueness and format validation
- Tool dependency checking (all referenced tools must exist)
- Parameter schema validation using Zod
- Circular dependency detection

### Runtime Validation
- Parameter type checking during execution
- Reference resolution error handling
- Step execution error recovery

## Persistence Specifications

### Library Format
JSON file storing composition definitions keyed by tool name, automatically loaded at server startup.

### Storage Location
`~/.claude-chrome-mcp/composed-tools.json` for user-specific tool libraries.

### Error Handling
Graceful degradation if library file is corrupted or missing.

## MCP SDK Integration Points

### Tool Registration
Use existing `ListToolsRequestSchema` handler to include dynamic tools in tool list responses.

### Change Notifications
Leverage MCP's automatic tool change notification system when tool list is modified.

### Parameter Validation
Use MCP's built-in `inputSchema` validation for composed tool parameters.

## Testing Requirements

### Basic Functionality Tests
1. Create simple 2-step composition
2. Execute composed tool with parameter flow
3. Verify tool appears in MCP tool list
4. Test persistence across server restarts

### Reference Resolution Tests
1. `$input` parameter passing
2. `$step` result chaining
3. Nested property access
4. Error handling for invalid references

### Integration Tests
1. MCP client sees new tools immediately
2. No conflicts with existing tool names
3. Proper error responses for composition failures

## Example Use Case

Create a `quick_claude` tool that:
1. Spawns a Claude tab with content script injection
2. Sends the input message to that tab
3. Retrieves and returns the response

This should work as: `quick_claude({ message: "explain quantum physics" })`

## Success Criteria

### Functional Requirements
- Compositions execute successfully with proper parameter flow
- Tools persist and reload correctly
- MCP integration works seamlessly
- Clear error messages for failures

### Performance Requirements
- Tool composition under 100ms
- Minimal execution overhead vs manual tool calls
- Fast library loading at startup

### User Experience
- Intuitive composition syntax
- Immediate tool availability after creation
- Clear feedback on composition success/failure

This specification provides the framework for Claude Code to implement the dynamic tool composition system interactively.