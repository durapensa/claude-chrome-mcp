# Changelog

## 2025-05-31 - Version 2.4.0: Event-Driven Completion Detection

### Added
- **Event-Driven Completion Detection System**: Revolutionary replacement of timeout-based operations
  - `send_message_async`: Returns operation ID immediately, sends message asynchronously
  - `get_response_async`: Returns operation ID immediately, retrieves response asynchronously  
  - `wait_for_operation`: Waits for operation completion with real-time progress updates
  - **OperationManager**: Async operation state management with disk persistence
  - **NotificationManager**: MCP notification system for real-time progress streaming
  - **ConversationObserver**: DOM MutationObserver for milestone detection in real-time

- **Milestone Detection**: Real-time DOM event detection
  - `message_sent`: Detects when messages are successfully sent
  - `response_started`: Detects when Claude begins responding
  - `response_completed`: Detects when responses are fully rendered
  - All milestones include timestamps and relevant data payloads

- **MCP Notification Streaming**: Real-time progress updates via MCP protocol
  - `notifications/progress` method for operation progress
  - Live milestone notifications as they occur
  - Operation completion notifications with full results

- **State Persistence**: Operations survive server restarts
  - Auto-created `.operations-state.json` for state recovery
  - Operation history and milestone tracking
  - Graceful recovery from crashes or restarts

### Changed
- **Architecture**: Complete shift from timeout-based to event-driven operations
  - No more arbitrary timeouts waiting for completion
  - Real-time detection of actual browser events
  - Faster, more reliable operation completion
  - Better resource utilization and scalability

### Benefits
- **Speed**: Operations complete as soon as events occur, not after timeouts
- **Reliability**: Based on actual DOM events, not time estimates
- **Real-time Feedback**: Live progress updates via MCP notifications
- **Robustness**: State persistence and recovery capabilities
- **Efficiency**: No polling or waiting - purely event-driven

### Technical Implementation
- **Files Modified**:
  - `mcp-server/src/server.js`: Added OperationManager, NotificationManager, async tools
  - `extension/content.js`: Added ConversationObserver with DOM monitoring
  - `extension/background.js`: Added operation milestone forwarding
- **Testing**: Comprehensive test suite for event-driven system
  - `tests/test-event-driven-simple.js`: Core functionality verification
  - Integrated into main test runner for continuous validation

## 2025-05-31 - Version 2.3.0: Tool Renaming & Hub Reliability

### Added
- **Enhanced Hub Startup**: Improved WebSocket hub startup reliability
  - Fixed detection logic for existing hubs
  - Added force hub creation mode for Claude Code environment
  - Better error reporting for port conflicts and permissions
  - More robust connection establishment

- **Extension Reconnection**: Enhanced Chrome extension reconnection capabilities
  - Auto-reconnection on popup open
  - Forced reconnection requests from popup to background
  - Better handling of service worker suspension/wake cycles
  - Persistent connection monitoring and recovery

### Changed
- **Tool Renaming for Clarity**: Renamed browser tab operation tools to distinguish from API tools
  - `spawn_claude_tab` → `spawn_claude_dot_ai_tab`
  - `get_claude_tabs` → `get_claude_dot_ai_tabs`
  - `send_message_to_claude_tab` → `send_message_to_claude_dot_ai_tab`
  - `get_claude_response` → `get_claude_dot_ai_response`
  - `debug_claude_page` → `debug_claude_dot_ai_page`
  - `close_claude_tab` → `close_claude_dot_ai_tab`
  - `open_claude_conversation_tab` → `open_claude_dot_ai_conversation_tab`
  - `get_claude_response_status` → `get_claude_dot_ai_response_status`
  - API tools (`get_claude_conversations`, `search_claude_conversations`, etc.) remain unchanged

### Fixed
- **Hub Startup Issues**: Resolved critical WebSocket hub not starting on port 54321
  - Fixed faulty detection logic in AutoHubClient.connect()
  - Hub now starts reliably in all MCP host environments
  - Added environment-specific hub creation logic

- **Extension Connectivity**: Improved Chrome extension connection reliability
  - Better reconnection handling on service worker restart
  - Enhanced popup script with forced reconnection capability
  - More robust WebSocket connection establishment

### Technical Improvements
- **Version Consistency**: All components now at version 2.3.0
  - Main package.json: 2.3.0
  - MCP server package.json: 2.3.0  
  - Chrome extension manifest: 2.3.0
- **Comprehensive Testing**: All tools verified working with new naming
- **Documentation Updates**: Tool renaming and benefits documented

### Breaking Changes
⚠️ **Tool names changed**: Old tool names no longer work
- Scripts using old browser tab tool names need updating
- All functionality preserved, only names changed for clarity

## 2025-01-30 - Session 3: Robustness Improvements

### Added
- **MessageQueue class**: Serializes operations per tab to prevent race conditions
  - Queues operations with promises for proper async handling
  - Adds 100ms delay between operations to prevent conflicts
  - Automatic queue processing per tab
  
- **TabOperationLock class**: Prevents conflicting operations
  - Defines operation conflicts (send_message vs get_response)
  - Acquires/releases locks for operation types
  - Prevents race conditions between related operations

- **Stress test suite**: `tests/stress-test-no-delays.js`
  - Tests rapid tab creation/closure
  - Tests concurrent message sending
  - Tests rapid status polling
  - Tests race conditions
  - Documents findings in `tests/stress-test-results.md`

### Fixed
- **Concurrent message sending**: Reduced failure rate from 60% to 0%
  - Messages now queued per tab
  - Proper serialization prevents conflicts
  
- **Race conditions**: Operations now properly synchronized
  - send_message and get_response can't conflict
  - Locks ensure operation atomicity

### UI Improvements
- Fixed "NaNs ago" timing display in popup
- Added card-based layout for better visual hierarchy
- Improved client and session information display
- Added hover effects and better empty states

### Known Issues
- `batch_get_responses` returns no output (needs investigation)
- Tab close operations sometimes timeout under stress

## 2025-01-30 - Session 2: Reliability Improvements

### Added
- **Retry logic for `send_message_to_claude_tab`**: 
  - Added `maxRetries` parameter (default: 3, max: 5)
  - Exponential backoff between retries (1s, 2s, 4s)
  - Retries on both waitForReady failures and send button errors
  - Returns retry information in response
  
- **`get_connection_health` tool**: Monitor system health
  - WebSocket hub connection status and reconnect attempts
  - Chrome alarms status for service worker persistence
  - Connected clients list and debugger sessions
  - Activity tracking (keepalive and hub messages)
  - Overall health status with issue detection

### Changed
- **`waitForReady` default**: Changed to `true` for `send_message_to_claude_tab`
- **Improved tracking**: Added timestamps for keepalive and hub messages

## 2025-01-30 - Session 1: Issue Fixes & Testing Infrastructure

### Fixed Issues

#### Issue #2: Rapid Message Sending Failures ✅
- Added `waitForReady` parameter to `send_message_to_claude_tab` tool
- Changed default to `true` for safer operation
- Created `test-rapid-messages.js` for verification

#### Issue #3: Chrome Service Worker Suspension ✅ 
- Added Chrome Alarms API (15-second interval)
- Implemented exponential backoff reconnection
- Added connection state persistence
- Created `test-service-worker-stability.js`

#### Issue #4: Extract Conversation Elements Timeout ✅
- Added `batchSize` parameter (default: 50)
- Added `maxElements` parameter (default: 1000)
- Implemented early termination with `truncated` flag
- Created `test-extract-elements.js`

### Testing Infrastructure
- Created comprehensive test suite with `run-all-tests.js`
- Added individual test scripts for each fix
- Documented testing procedures in TESTING.md

## 2025-01-30 - Original Release: New Tools Implementation

### Added
- **Enhanced `get_claude_response`**: Now waits for response completion by default
  - Added `waitForCompletion` parameter (default: true)
  - Added `timeoutMs` parameter (default: 10000ms)
  - Added `includeMetadata` parameter for completion indicators
  - Detects completion via dropdown buttons and absence of streaming indicators
  
- **`batch_send_messages`**: Send messages to multiple Claude tabs
  - Supports parallel (default) or sequential execution
  - Returns detailed results for each tab
  
- **`get_conversation_metadata`**: Analyze conversation content
  - Message counts and token estimates
  - Content feature detection (code blocks, artifacts, images, tables)
  - Optional detailed message information
  
- **`export_conversation_transcript`**: Export full conversations
  - Supports markdown and JSON formats
  - Includes code blocks, artifacts, and statistics
  - Preserves conversation structure

### Fixed
- Response truncation issues by implementing proper completion detection
- Message ordering using DOM position comparison
- Artifact containers now properly detected
- Chrome extension WebSocket connection issues
  - Fixed syntax errors in background.js (escaped strings in template literals)
  - Changed localhost to 127.0.0.1 to avoid DNS issues
  - Added service worker wake-up handling
- `get_conversation_metadata` ReferenceError
  - Fixed undefined `allMessages` variable outside scope
  - Moved message collection outside conditional block
- `export_conversation_transcript` script execution issues
  - Fixed template literal interpolation for format parameter
  - Identified complex script issues (needs further refinement)

### Technical Improvements
- Better DOM traversal for message selection
- Stability checks for response completion
- Improved error handling and timeout management
- Enhanced logging for debugging connection issues
- Added automatic reconnection on service worker wake-up