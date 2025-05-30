# Changelog

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