# Claude Chrome MCP Test Suite v3

Modern, WebSocket-native test suite for Claude Chrome MCP.

## Prerequisites

1. Chrome extension loaded and running
2. MCP server accessible
3. No existing Claude.ai tabs open

## Installation

```bash
cd tests
npm install
```

## Running Tests

### Quick Start
```bash
# Run all tests
npm test

# Or use the test runner
node run-tests.js
```

### Test Categories
```bash
# Integration tests only
npm run test:integration

# Performance tests only  
npm run test:performance

# Resilience tests only
npm run test:resilience

# Watch mode for development
npm run test:watch
```

## Test Structure

```
tests/
├── integration/          # End-to-end workflow tests
├── performance/         # WebSocket relay performance
├── resilience/          # Fault tolerance (coming soon)
└── helpers/            # Test utilities and helpers
```

## Key Design Principles

- **Black-box testing**: Tests use actual MCP tools, not internal APIs
- **WebSocket-native**: Built for v2.6.0+ architecture
- **Real Chrome integration**: Tests against actual extension
- **Operation-aware**: Understands async operation lifecycle

## Writing New Tests

Use the provided helpers for consistent test patterns:

```javascript
const { MCPTestClient } = require('../helpers/mcp-test-client');
const { expectValidResponse } = require('../helpers/assertions');
const { waitForResponse } = require('../helpers/test-scenarios');

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
    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Your test logic here
  });
});
```

## Troubleshooting

- Ensure Chrome extension is loaded before running tests
- Close all Claude.ai tabs before starting test run
- Check system health with `mcp system_health` if tests fail
- Use verbose mode for detailed output: `npm run test:verbose`