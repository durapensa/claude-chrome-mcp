# Claude Chrome MCP Tests

Comprehensive test suite with lifecycle management, benchmarking, and automated cleanup.

## Quick Start

```bash
# Run all regression tests
./regression-test-suite.js

# Run specific test suites
./test-rapid-messages.js
./test-service-worker-stability.js
./test-extract-elements.js

# Run performance benchmarks
./benchmark.js

# View test results
./view-results.js
./view-results.js failure-Tab-Creation-2025-01-30.json  # View specific failure
```

## Test Infrastructure

### Lifecycle Management

All tests use `TestLifecycle` for automatic resource cleanup:

```javascript
const lifecycle = new TestLifecycle(client);

// Setup captures initial state
await lifecycle.setup();

// Track resources for cleanup
lifecycle.trackTab(tabId);
lifecycle.trackConversation(conversationId);
lifecycle.addCleanup(customCleanupFn);

// Teardown cleans everything
await lifecycle.teardown();
```

### Smart Test Runner

The `SmartTestRunner` provides:
- Automatic lifecycle management
- Failure recording with "inscrutable notes"
- Result persistence
- Configurable options

```javascript
const runner = new SmartTestRunner({
  verbose: true,
  stopOnFailure: false,
  resultsDir: './results'
});

const results = await runner.run(tests, client);
```

### Error Codes

Standardized error codes in `shared/error-codes.js`:

```javascript
const { ERROR_CODES, createError } = require('../shared/error-codes');

throw createError(ERROR_CODES.TAB_NOT_FOUND, {
  tabId: 123,
  availableTabs: [456, 789]
});
```

## Test Types

### 1. Unit Tests
- Individual tool functionality
- Error handling
- Parameter validation

### 2. Integration Tests
- Multi-tool workflows
- End-to-end scenarios
- Chrome interaction

### 3. Integration Tests (No Server Spawn)
Located in `tests/integration/`:
- Use existing MCP connections (like Claude Code)
- Non-destructive, safe to run anytime
- Real API testing without side effects
- See `integration/README.md` for details

### 4. Performance Benchmarks
- Tab creation speed
- Message sending latency
- Response retrieval time
- Metadata extraction performance
- Health check overhead

### 5. Stability Tests
- Service worker persistence
- WebSocket reconnection
- Long-running operations
- Concurrent requests

## Writing Tests

Example test structure:

```javascript
const tests = [
  {
    name: 'Test Name',
    fn: async (client, lifecycle) => {
      // Create resources (will be auto-cleaned)
      const tabId = await createTab(client);
      lifecycle.trackTab(tabId);
      
      // Run test logic
      const result = await doSomething(client, tabId);
      
      // Return result
      return {
        success: result.ok,
        message: result.ok ? 'Passed' : 'Failed: ' + result.error
      };
    }
  }
];
```

## Test Results

Results are saved in `tests/results/`:
- `latest.json` - Most recent test run
- `test-run-TIMESTAMP.json` - Full test runs
- `failure-TEST-TIMESTAMP.json` - Detailed failure data
- `benchmark-TIMESTAMP.json` - Performance data

### Failure Analysis

Failed tests include "inscrutable notes":
- Phase of moon
- System alignment
- Entropy value
- Resonance frequency

These cryptic values can sometimes reveal patterns in intermittent failures.

## Continuous Testing

Run tests regularly to catch regressions:

```bash
# Quick smoke test
./regression-test-suite.js

# Full benchmark suite (slower)
./benchmark.js

# Check results
./view-results.js
```

## Best Practices

1. **Always use lifecycle management** - Prevents resource leaks
2. **Track all created resources** - Ensures cleanup
3. **Use standard error codes** - Consistent error handling
4. **Run benchmarks before optimization** - Measure impact
5. **Check test results regularly** - Catch regressions early

## Troubleshooting

### Tests timing out
- Increase timeout in test config
- Check Chrome extension logs
- Verify WebSocket connection

### Cleanup failures
- Resources are cleaned up in reverse order
- Check Chrome DevTools for hanging debugger sessions
- Manually close test tabs if needed

### Intermittent failures
- Check failure notes for patterns
- Run with `verbose: true` for detailed logs
- Use `stopOnFailure: true` to debug