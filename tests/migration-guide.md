# Test Suite Migration Guide: Shared MCP Connection

## Overview

To resolve timeout issues when running multiple tests, we're migrating from individual MCP connections per test to a shared connection pattern. This guide explains how to migrate existing tests.

## Quick Migration Steps

### 1. Simple Drop-in Replacement

For tests that create their own MCP client, replace:

```javascript
// OLD: Individual client
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const transport = new StdioClientTransport({
  command: 'node',
  args: ['../mcp-server/src/server.js']
});

const client = new Client({
  name: 'test-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
// ... use client
await client.close();
```

With:

```javascript
// NEW: Shared client
const { getTestClient } = require('./helpers/test-client-adapter');

const client = await getTestClient();
// ... use client (same API)
await client.close(); // Safe to call (no-op for shared client)
```

### 2. Direct Shared Client Usage

For new tests or full migration:

```javascript
const sharedClient = require('./helpers/shared-client');

// No need to connect - handled automatically
const result = await sharedClient.callTool('spawn_claude_tab', {});

// No need to close - managed by shared client lifecycle
```

### 3. Using with Test Lifecycle

```javascript
const sharedClient = require('./helpers/shared-client');
const TestLifecycle = require('./helpers/lifecycle');

async function runTest() {
  const lifecycle = new TestLifecycle(sharedClient);
  
  try {
    await lifecycle.setup();
    
    // Your test code
    const result = await sharedClient.callTool('spawn_claude_tab', {});
    const tabId = JSON.parse(result.content[0].text).id;
    lifecycle.trackTab(tabId);
    
    // ... more test logic
    
  } finally {
    await lifecycle.teardown();
  }
}
```

## Migration Patterns

### Pattern 1: Minimal Changes (Using Adapter)

```javascript
// Before
async function runTest() {
  let client;
  try {
    const transport = new StdioClientTransport({...});
    client = new Client({...});
    await client.connect(transport);
    
    const result = await client.callTool('get_claude_dot_ai_tabs', {});
    
  } finally {
    if (client) await client.close();
  }
}

// After
async function runTest() {
  const client = await getTestClient();
  try {
    const result = await client.callTool('get_claude_dot_ai_tabs', {});
  } finally {
    await client.close(); // Safe no-op
  }
}
```

### Pattern 2: Full Migration (Direct Shared Client)

```javascript
// Before
class MyTest {
  async setup() {
    this.transport = new StdioClientTransport({...});
    this.client = new Client({...});
    await this.client.connect(this.transport);
  }
  
  async test() {
    return this.client.callTool('spawn_claude_tab', {});
  }
  
  async teardown() {
    await this.client.close();
  }
}

// After  
class MyTest {
  async setup() {
    // No setup needed
  }
  
  async test() {
    return sharedClient.callTool('spawn_claude_tab', {});
  }
  
  async teardown() {
    // No teardown needed
  }
}
```

### Pattern 3: Test Suite Runner

```javascript
// Before
const tests = [
  {
    name: 'Test 1',
    fn: async () => {
      const client = await createClient();
      try {
        // test logic
      } finally {
        await client.close();
      }
    }
  }
];

// After
const tests = [
  {
    name: 'Test 1', 
    fn: async () => {
      // Just use sharedClient directly
      const result = await sharedClient.callTool('spawn_claude_tab', {});
      // test logic
    }
  }
];

// Run with shared client already connected
await sharedClient.connect();
for (const test of tests) {
  await test.fn();
}
await sharedClient.close();
```

## Environment Variables

Control client behavior with environment variables:

```bash
# Force individual clients (legacy behavior)
USE_INDIVIDUAL_MCP_CLIENT=1 node test-file.js

# Force shared client (default)
USE_SHARED_MCP_CLIENT=1 node test-file.js
```

## Benefits

1. **Faster test execution** - No startup overhead for each test
2. **Avoids timeout issues** - Single connection reused across tests
3. **Better resource usage** - One MCP server process instead of many
4. **Automatic reconnection** - Built-in error recovery
5. **Backward compatible** - Adapter allows gradual migration

## Troubleshooting

### Connection Issues

The shared client includes automatic reconnection:

```javascript
// This is handled automatically
try {
  await sharedClient.callTool('get_claude_dot_ai_tabs', {});
} catch (error) {
  // Shared client will attempt reconnection
  // Error only thrown after max attempts
}
```

### Test Isolation

Each test should still clean up its resources:

```javascript
const lifecycle = new TestLifecycle(sharedClient);
lifecycle.trackTab(tabId); // Will be cleaned up
```

### Debugging

Check shared client status:

```javascript
console.log(sharedClient.getInfo());
// { clientId: '...', isConnected: true, isConnecting: false }
```

## Complete Example

Here's a fully migrated test:

```javascript
#!/usr/bin/env node

const sharedClient = require('./helpers/shared-client');
const TestLifecycle = require('./helpers/lifecycle');

async function testTabOperations() {
  const lifecycle = new TestLifecycle(sharedClient);
  
  try {
    await lifecycle.setup();
    
    // Create tab
    const spawnResult = await sharedClient.callTool('spawn_claude_tab', {});
    const tabInfo = JSON.parse(spawnResult.content[0].text);
    lifecycle.trackTab(tabInfo.id);
    
    // Send message
    await sharedClient.callTool('send_message_to_claude_tab', {
      tabId: tabInfo.id,
      message: 'Hello, Claude!',
      waitForReady: true
    });
    
    // Get response
    const response = await sharedClient.callTool('get_claude_response', {
      tabId: tabInfo.id,
      waitForCompletion: true,
      timeoutMs: 10000
    });
    
    console.log('✅ Test passed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await lifecycle.teardown();
  }
}

// Run test
testTabOperations().catch(console.error);
```

## Next Steps

1. Start with new tests using shared client
2. Migrate existing tests that have timeout issues
3. Use the adapter for tests that need minimal changes
4. Gradually migrate all tests to shared client pattern