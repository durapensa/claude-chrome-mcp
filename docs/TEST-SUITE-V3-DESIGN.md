# Test Suite V3 Design (From-Scratch Rewrite)

## Philosophy: Test Real User Workflows

**Principle**: Test what users actually use, not internal implementation details.

Current tests are fundamentally incompatible with v2.6.0 WebSocket architecture. Rather than retrofit, we design a clean, modern test suite from scratch.

## Proposed New Test Structure

```
tests-v3/
├── integration/          # End-to-end workflow tests
│   ├── basic-tab-lifecycle.test.js
│   ├── message-send-receive.test.js  
│   ├── multi-tab-coordination.test.js
│   ├── conversation-management.test.js
│   └── error-recovery.test.js
├── performance/         # WebSocket relay performance
│   ├── operation-latency.test.js
│   ├── concurrent-operations.test.js
│   └── resource-cleanup.test.js
├── resilience/          # Fault tolerance
│   ├── extension-restart.test.js
│   ├── websocket-reconnection.test.js
│   ├── operation-timeout.test.js
│   └── chrome-crash-recovery.test.js
├── helpers/
│   ├── mcp-test-client.js    # Real MCP client wrapper
│   ├── test-scenarios.js     # Common workflow patterns
│   ├── assertions.js         # Domain-specific assertions
│   └── test-lifecycle.js     # Setup/teardown management
└── run-tests.js         # Simple test runner
```

## Key Design Principles

### 1. **Test Through Public Interface**
- Use actual MCP tools (`mcp__claude-chrome-mcp__*`)
- No access to internal server state
- Test black-box behavior, not implementation
- Real MCP client connections, not mocked transports

### 2. **Operation-Centric Testing**
- Every test understands async operation lifecycle
- Proper wait-for-completion patterns
- Operation timeout and error handling
- Test operation state transitions

### 3. **Real Chrome Integration**
- Tests run against actual Chrome extension
- Real WebSocket relay communication
- Actual Claude.ai tab interaction
- No mocked browser APIs

### 4. **Scenario-Driven**
- Each test represents a real user workflow
- Multi-step operations with proper sequencing
- Error injection at realistic failure points
- Test end-to-end user journeys

### 5. **WebSocket-Native from Day 1**
- Use actual MCP SDK client
- Test through real WebSocket relay
- No HTTP polling assumptions
- Modern async/await patterns

## Sample Test Implementation

```javascript
// tests-v3/integration/basic-tab-lifecycle.test.js
const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Basic Tab Lifecycle', () => {
  let client;
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    await client.cleanup();
    await client.disconnect();
  });

  test('Create tab, send message, get response, close tab', async () => {
    // Create tab with content script injection
    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Verify tab is ready and listed
    const tabs = await client.callTool('tab_list');
    expect(tabs.find(t => t.id === tabId)).toBeTruthy();
    
    // Send message and wait for completion
    await client.callTool('tab_send_message', {
      tabId,
      message: "What is the capital of France?",
      waitForCompletion: true
    });
    
    // Get response and verify content
    const response = await client.callTool('tab_get_response', { tabId });
    expect(response.content).toContain('Paris');
    expect(response.completed).toBe(true);
    
    // Clean up tab
    await client.callTool('tab_close', { tabId });
    
    // Verify cleanup
    const tabsAfter = await client.callTool('tab_list');
    expect(tabsAfter.find(t => t.id === tabId)).toBeFalsy();
  });
});
```

## MCP Test Client Design

```javascript
// tests-v3/helpers/mcp-test-client.js
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');

class MCPTestClient {
  constructor() {
    this.client = new Client({
      name: "test-client",
      version: "1.0.0"
    }, {
      capabilities: {}
    });
    this.createdTabs = [];
  }
  
  async connect() {
    // Connect to actual MCP server via stdio
    const transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '../../mcp-server/src/server.js')]
    });
    
    await this.client.connect(transport);
  }
  
  async callTool(toolName, params = {}) {
    const fullToolName = `mcp__claude-chrome-mcp__${toolName}`;
    const result = await this.client.callTool(fullToolName, params);
    
    // Track created resources for cleanup
    if (toolName === 'tab_create' && result.tabId) {
      this.createdTabs.push(result.tabId);
    }
    
    return result;
  }
  
  async cleanup() {
    // Clean up all created resources
    for (const tabId of this.createdTabs) {
      try {
        await this.callTool('tab_close', { tabId, force: true });
      } catch (e) {
        // Tab might already be closed
      }
    }
    this.createdTabs = [];
  }
}
```

## Test Categories

### 1. **Integration Tests** (Core Functionality)
- Tab lifecycle (create, interact, close)
- Message sending and response retrieval
- Multi-tab coordination and locking
- API operations (list conversations, delete, etc.)

### 2. **Performance Tests** (Scalability)
- Operation latency benchmarks
- Concurrent operation handling
- Resource cleanup efficiency
- WebSocket throughput

### 3. **Resilience Tests** (Fault Tolerance)
- Extension restart scenarios
- WebSocket disconnection/reconnection
- Operation timeout handling
- Chrome crash recovery

## Benefits Over Current Suite

✅ **Simple**: ~200 lines vs 1000+ in current suite  
✅ **Reliable**: Tests actual architecture, not outdated patterns  
✅ **Maintainable**: Tests match user workflows exactly  
✅ **Fast**: No compatibility layers or API translation overhead  
✅ **Modern**: WebSocket-native, async-first design  
✅ **Complete**: Real end-to-end testing, not mocked components

## Implementation Plan

1. **Setup Phase**: Create test structure and MCP client wrapper
2. **Core Tests**: Implement basic tab lifecycle and message tests  
3. **Extended Tests**: Add performance and resilience testing
4. **Migration**: Replace old test suite with new v3 architecture

This design eliminates all architectural debt and provides a solid foundation for long-term test maintainability.