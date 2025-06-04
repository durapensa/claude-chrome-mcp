#!/bin/bash

# Test script for WebSocket relay mode
# This script starts the relay server and sets environment variables for relay mode

echo "=== Claude Chrome MCP WebSocket Relay Test ==="
echo ""
echo "This script will:"
echo "1. Start the WebSocket relay server on port 54321"
echo "2. Start health monitoring endpoint on port 54322"
echo "3. Set USE_WEBSOCKET_RELAY=true for MCP server"
echo ""
echo "To check relay health:"
echo "  curl http://localhost:54322/health"
echo ""
echo "Press Ctrl+C to stop the relay server"
echo ""

# Start relay server
echo "Starting WebSocket relay server..."
export USE_WEBSOCKET_RELAY=true
export RELAY_PORT=54321

node mcp-server/src/relay/start-relay.js