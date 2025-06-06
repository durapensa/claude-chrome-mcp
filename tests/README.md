# Claude Chrome MCP Test Suite v3

Modern, WebSocket-native test suite for Claude Chrome MCP.

## Prerequisites

### Required Setup
1. **Chrome Browser** must be running
2. **Chrome Extension** must be:
   - Installed at `chrome://extensions/`
   - Enabled (toggle switch ON)
   - Connected to relay (check popup status)
3. **MCP Server** must be accessible:
   - CLI daemon running: `mcp daemon status`
   - Or standalone server available
4. **Clean State**:
   - Close all existing Claude.ai tabs
   - Ensure no pending operations

### Verify Prerequisites
```bash
# Check system health
mcp system_health

# Expected output should show:
# - relayConnected: true
# - extension: { connectedClients: [...] }
# - At least one 'chrome-extension' client

# If extension not connected:
mcp chrome_reload_extension
```

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

### Common Test Failures

#### "SETUP FAILED: Chrome extension not connected to relay"
The extension is loaded but not communicating with the relay.
```bash
# Solution 1: Reload extension via MCP
mcp chrome_reload_extension

# Solution 2: Manual reload
# 1. Go to chrome://extensions/
# 2. Find "Claude Chrome MCP"
# 3. Click the refresh icon
# 4. Wait 5 seconds for reconnection
```

#### "TIMEOUT: Tool 'tab_create' did not respond"
The extension cannot create Chrome tabs.
```bash
# Check if Chrome is running and extension has permissions
# Verify popup shows "Connected" status
# Try creating a tab manually:
mcp tab_create --injectContentScript
```

#### "No Chrome extension clients connected"
The extension background script isn't running.
```bash
# Check extension logs
mcp system_get_extension_logs --limit 50

# Enable debug mode for more info
mcp system_enable_extension_debug_mode
```

### Pre-Test Checklist
1. ✅ Chrome browser is open
2. ✅ Extension shows "Connected" in popup
3. ✅ `mcp system_health` shows healthy state
4. ✅ No Claude.ai tabs are open
5. ✅ No active operations in progress

### Debug Mode
For detailed diagnostics during test failures:
```bash
# Enable extension debug logging
mcp system_enable_extension_debug_mode

# Run tests with verbose output
npm run test:verbose

# Check logs after failure
mcp system_get_extension_logs --limit 100
```