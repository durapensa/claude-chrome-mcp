# Organized Test Suite

## Test Categories

### Core Functionality Tests
- `test-event-driven-system.js` - Event-driven completion detection (primary)
- `test-basic-operations.js` - Spawn, send, get response, close tabs
- `test-conversation-management.js` - Search, metadata, export conversations

### Reliability Tests  
- `test-rapid-operations.js` - Fast message sending, waitForReady validation
- `test-service-worker-stability.js` - Chrome extension persistence
- `test-extract-elements.js` - Large conversation handling with limits

### Advanced Features Tests
- `test-batch-operations.js` - Multiple tabs, batch messaging
- `test-tab-pool.js` - Connection reuse and management
- `test-async-operations.js` - Concurrent operation handling

### Integration Tests
- `test-regression-suite.js` - Full MCP tool validation
- `test-stress-testing.js` - High-load scenarios
- `test-error-handling.js` - Failure modes and recovery

### Development Tests
- `test-connection-health.js` - System health monitoring
- `test-discovery-framework.js` - API discovery and validation

## Test Execution Order

1. **Health Check**: Verify system is ready
2. **Core**: Basic functionality works
3. **Reliability**: Edge cases and robustness  
4. **Advanced**: Complex scenarios
5. **Integration**: Full system validation
6. **Stress**: Performance under load

## Browser Testing

All tests will show live activity in Chrome browser:
- Tabs opening/closing automatically
- Messages sent and responses received
- Real-time milestone detection
- Automatic cleanup after completion