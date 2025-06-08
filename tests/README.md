# Claude Chrome MCP: Test Suite
## Test Suite Architecture

## Quick Navigation
**Related Documentation:**
- [CLAUDE.md](../CLAUDE.md) - Commands and workflows
- [Architecture Analysis](../docs/ARCHITECTURE-ANALYSIS.md) - Current state
- [GitHub Issues](https://github.com/durapensa/claude-chrome-mcp/issues) - Active work

**Need Help?** See [Troubleshooting](../docs/TROUBLESHOOTING.md)

## Overview

This test suite uses three distinct categories to provide comprehensive coverage while maintaining reliability and speed:

## 1. Unit Tests (`tests/unit/`)

**Purpose:** Test MCP server functionality in isolation
**Dependencies:** MCP server only (no Chrome extension required)  
**Speed:** Fast (~50ms per test)
**Reliability:** Always runnable

**What we test:**
- MCP server startup and tool registration
- WebSocket relay connection and health
- Tool listing and basic server responses
- Error handling and timeout behavior
- System health reporting

**Example:**
```javascript
test('MCP server registers all expected tools', async () => {
  const tools = await client.listTools();
  expect(tools.tools).toHaveLength(32);
  expect(tools.tools.find(t => t.name.includes('tab_create'))).toBeTruthy();
});
```

## 2. Integration Tests (`tests/integration/`)

**Purpose:** Test complete user workflows end-to-end
**Dependencies:** MCP server + Chrome extension running
**Speed:** Slow (~5-15s per test)  
**Reliability:** Requires Chrome browser with extension

**What we test:**
- Full tab lifecycle (create → send message → get response → close)
- Multi-tab coordination and isolation
- API operations (list/delete conversations)
- Real Claude.ai interaction patterns
- Extension reload and recovery

**Example:**
```javascript
test('Complete tab interaction workflow', async () => {
  const { tabId } = await client.callTool('tab_create');
  await client.callTool('tab_send_message', { tabId, message: "Test" });
  const response = await client.callTool('tab_get_response', { tabId });
  expect(response.completed).toBe(true);
});
```

## 3. Contract Tests (`tests/contract/`)

**Purpose:** Test interface boundaries and error conditions
**Dependencies:** MCP server only
**Speed:** Medium (~200ms per test)
**Reliability:** Always runnable

**What we test:**
- Tool parameter validation
- Error response formats
- Timeout handling when extension unavailable
- Edge cases and boundary conditions
- API contract compliance

**Example:**
```javascript
test('tab_create handles missing extension gracefully', async () => {
  const result = await client.callTool('tab_create');
  expect(result.error).toMatch(/timeout|extension/i);
  expect(result.tabId).toBeUndefined();
});
```

## Test Structure

```
tests/
├── unit/                    # Fast, reliable server tests
│   ├── system-health.test.js
│   ├── system-tools.test.js          # NEW: Debug mode, log levels, operations
│   ├── tool-registration.test.js
│   ├── tab-operations-refactor.test.js
│   └── error-handling-utilities.test.js
├── integration/             # End-to-end workflow tests  
│   ├── tab-workflows.test.js
│   ├── tab-operations-functionality.test.js
│   ├── chrome-tools.test.js          # NEW: Debugger, script execution, DOM
│   ├── tab-advanced-operations.test.js # NEW: Batch ops, forwarding, export
│   └── api-operations.test.js        # NEW: Search, URL generation, deletion
├── contract/                # Interface and error tests
│   └── timeout-behavior.test.js
└── helpers/                 # Shared test utilities
    ├── jest-setup.js
    ├── mcp-test-client.js
    └── pre-flight-check.js
```

## Running Tests

```bash
# Fast tests (unit + contract) - always work
npm run test:fast

# Full test suite - requires Chrome extension
npm test

# Specific categories
npm run test:unit
npm run test:integration  
npm run test:contract
```

## Installation

```bash
cd tests
npm install
```

## Benefits

✅ **Reliable CI/CD:** Unit tests never fail due to browser issues  
✅ **Fast Development:** Can test server changes without Chrome setup  
✅ **Complete Coverage:** Unit tests catch server bugs, integration tests catch workflow bugs  
✅ **Clear Separation:** Easy to understand what each test category validates  
✅ **Practical:** Matches real development and deployment scenarios

## Writing Tests

Use the MCPTestClient helper for all test categories:

```javascript
const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Your Test Suite', () => {
  let client;
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    await client.cleanup();
    await client.disconnect();
  });

  test('Your test case', async () => {
    const result = await client.callTool('your_tool', { param: 'value' });
    expect(result).toBeTruthy();
  });
});
```

## Prerequisites for Integration Tests

Integration tests require Chrome extension to be running. Unit and contract tests work without it.

To verify integration test prerequisites:
```bash
mcp system_health
# Should show: relayConnected: true, extension with connectedClients
```

## Test Coverage

**Current Coverage:** ~85% of MCP tools (28/32 tools tested)

### Coverage by Category:
- **System Tools:** 7/7 tested (100%) ✅
- **Chrome Tools:** 9/9 tested (100%) ✅  
- **Tab Tools:** 11/11 tested (100%) ✅
- **API Tools:** 5/5 tested (100%) ✅

### Key Testing Patterns:

1. **Tab Hygiene:** Tests reuse tabs when possible and always clean up:
   - Shared tab created in `beforeAll` for non-destructive tests
   - New tabs only for navigation/isolation needs
   - Comprehensive cleanup in `afterEach` and `afterAll`

2. **Resource Management:** Tests track and clean up:
   - Debugger sessions (detach after use)
   - Network monitoring (stop after use)
   - Created tabs (close with force flag)

3. **Error Handling:** Each tool category tests:
   - Invalid parameters (IDs, formats)
   - Missing resources (non-existent tabs)
   - Edge cases (empty arrays, timeouts)

### Testing Discoveries:

1. **Response Formats:** Chrome tools return different formats than expected:
   - `chrome_debug_status` returns array, not object with sessions
   - `chrome_get_dom_elements` returns array directly
   - Script execution results nested in `result.value`

2. **Tab Content Scripts:** Must inject content scripts for:
   - Message sending/receiving
   - DOM operations
   - Response extraction

3. **Operation Timing:** Some operations are async by design:
   - Tab creation with `waitForLoad: false` returns operation ID
   - Batch operations support parallel execution
   - Network monitoring requires navigation delay