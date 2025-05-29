# Changelog

## 2025-01-30 - New Tools Implementation & Bug Fixes

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