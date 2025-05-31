# MCP Server Restart Capability

## Overview

The claude-chrome-mcp server now implements comprehensive restart capability per the MCP lifecycle specification. This enables robust operation with automatic recovery from crashes, graceful shutdown handling, and session continuity.

## Implementation

### Core Components

1. **`lifecycle-manager.js`** - Implements the MCP lifecycle specification
   - Manages five server states: Uninitialized, Initializing, Operational, Disconnected, Shutdown
   - Automatic restart on crash with exponential backoff
   - Health monitoring and process supervision
   - Session continuity with state preservation

2. **`server-wrapper.js`** - Wraps the existing server with lifecycle management
   - Stdio transport handling for MCP protocol
   - Health endpoint (optional)
   - Environment variable configuration

3. **Enhanced `server.js`** - Improved shutdown behavior
   - Fixed SIGPIPE handling (no longer triggers shutdown)
   - Extended timeout from 5 to 30 minutes
   - Less aggressive parent process monitoring (30s instead of 1s)

### Key Features

#### Automatic Restart
- Restarts on non-zero exit codes or unexpected signals
- Configurable max restart attempts (default: 5)
- Exponential backoff with jitter
- Preserves session state across restarts

#### Graceful Shutdown
- 30-second timeout per MCP specification
- Connection draining for active clients
- Resource cleanup with individual timeouts
- Proper exit codes

#### Health Monitoring
- Process health checks every 30 seconds
- Tracks consecutive failures
- Optional HTTP health endpoint
- Real-time status reporting

#### Session Continuity
- Unique session IDs for tracking
- State preservation across restarts
- Automatic cleanup of expired state
- Environment variable passing

## Usage

### Basic Usage (Recommended)
```bash
# Use the wrapper for automatic restart capability
node mcp-server/src/server-wrapper.js
```

### Configuration via Environment Variables
```bash
# Disable restarts
MCP_RESTART_ENABLED=false node mcp-server/src/server-wrapper.js

# Configure restart behavior
MCP_MAX_RESTARTS=10 \
MCP_RESTART_DELAY=5000 \
MCP_HEALTH_INTERVAL=15000 \
node mcp-server/src/server-wrapper.js

# Enable health endpoint
MCP_HEALTH_PORT=8080 node mcp-server/src/server-wrapper.js
```

### Legacy Usage
```bash
# Direct server execution (no restart capability)
node mcp-server/src/server.js
```

## Testing

Run the comprehensive test suite:

```bash
# Basic test
node tests/test-server-lifecycle.js

# Verbose output
VERBOSE_TESTS=1 node tests/test-server-lifecycle.js
```

Test scenarios include:
- Basic start/stop functionality
- Graceful shutdown sequences
- Crash recovery and restart
- Multiple restart cycles
- Health check monitoring
- Max restart limit enforcement
- Process cleanup verification

## Integration with Claude Desktop/Code

Update your MCP configuration to use the wrapper:

```json
{
  "mcpServers": {
    "claude-chrome-mcp": {
      "command": "node",
      "args": ["/path/to/claude-chrome-mcp/mcp-server/src/server-wrapper.js"],
      "env": {
        "MCP_RESTART_ENABLED": "true",
        "MCP_MAX_RESTARTS": "5"
      }
    }
  }
}
```

## Benefits

1. **Reliability** - Automatic recovery from crashes and transient failures
2. **Robustness** - Proper signal handling and resource cleanup
3. **Observability** - Health monitoring and status reporting
4. **Compatibility** - Full MCP specification compliance
5. **Flexibility** - Configurable behavior via environment variables

## Troubleshooting

### Server Won't Start
- Check that the wrapper script is executable: `chmod +x mcp-server/src/server-wrapper.js`
- Verify Node.js version compatibility
- Check for port conflicts on WebSocket hub (54321)

### Excessive Restarts
- Review logs for crash causes
- Adjust `MCP_MAX_RESTARTS` if needed
- Check system resources (memory, file descriptors)

### Health Check Issues
- Verify health endpoint port availability
- Check firewall settings if using remote health checks
- Review health check interval settings

## Status

✅ **Complete** - All MCP lifecycle specification requirements implemented
✅ **Tested** - Comprehensive test suite with 7 test scenarios
✅ **Production Ready** - Enhanced stability and monitoring

The restart capability addresses the early exit issues and provides a robust foundation for reliable MCP server operation.