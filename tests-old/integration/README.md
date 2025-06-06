# Integration Tests

This directory contains integration tests for Claude Chrome MCP that can run without spawning new MCP servers.

## Overview

These tests are designed to:
- Use existing MCP connections (like Claude Code's)
- Be non-destructive and safe to run
- Test real API functionality without side effects
- Provide examples for testing MCP tools

## Test Files

### 1. `mcp-direct-tests.js`
Basic integration tests with mock responses. Can run standalone to verify test structure.

```bash
node mcp-direct-tests.js
```

### 2. `live-mcp-tests.js`
Tests that can detect and use a live MCP connection. Falls back to mock mode if no connection available.

```bash
# Run basic tests only
node live-mcp-tests.js

# Include potentially disruptive tests (requires confirmation)
node live-mcp-tests.js --disruptive
```

### 3. `claude-code-integration.js`
Example test structure for running tests from within Claude Code using the `mcp__claude-chrome-mcp__` tools.

## Running Tests with Claude Code

When Claude Code is connected, you can run real integration tests:

```javascript
// Example: Test connection health
const health = await mcp__claude-chrome-mcp__get_connection_health();
console.log('Health:', health);

// Example: List tabs safely
const tabs = await mcp__claude-chrome-mcp__get_claude_tabs();
console.log('Open tabs:', tabs.length);
```

## Safe Testing Practices

1. **Read-Only First**: Start with operations that don't modify state
   - `get_connection_health`
   - `get_claude_tabs`
   - `get_claude_conversations`
   - `get_tab_pool_stats`

2. **Isolated Operations**: When testing modifications, use:
   - Unique conversation IDs
   - Test-specific tabs that are cleaned up
   - Non-production data

3. **Cleanup**: Always clean up created resources:
   ```javascript
   const createdTabs = [];
   try {
     // Create test tabs
     const tab = await spawn_claude_tab();
     createdTabs.push(tab.id);
     
     // Run tests...
     
   } finally {
     // Clean up
     for (const tabId of createdTabs) {
       await close_claude_tab({ tabId });
     }
   }
   ```

## Test Categories

### Non-Disruptive (Safe)
- Health checks
- Listing operations
- Status queries
- Statistics gathering

### Potentially Disruptive (Requires Care)
- Creating new tabs
- Sending messages
- Modifying conversations
- Batch operations

## Writing New Integration Tests

Follow this pattern:

```javascript
async function testFeature() {
  const runner = new TestRunner();
  
  // Non-disruptive test
  await runner.run('Safe read operation', async () => {
    const result = await someReadOnlyOperation();
    assert(result.success);
  });
  
  // Disruptive test with safeguards
  await runner.run('Create resource test', async () => {
    let resourceId;
    try {
      resourceId = await createResource();
      // Test the resource
    } finally {
      if (resourceId) {
        await cleanupResource(resourceId);
      }
    }
  }, { disruptive: true });
  
  runner.printSummary();
}
```

## Benefits

1. **No Server Overhead**: Tests run instantly using existing connections
2. **Real API Testing**: Test actual MCP tool behavior
3. **Safe Exploration**: Read-only tests can run anytime
4. **CI/CD Friendly**: Can be integrated into continuous testing

## Future Improvements

- [ ] Add performance benchmarks
- [ ] Create stress tests (with safeguards)
- [ ] Add visual regression tests for UI elements
- [ ] Build automated test runner for Claude Code