#!/bin/bash

# Claude Chrome MCP - Embedded Relay Architecture
# The relay is now embedded in the MCP server with automatic election

echo "=== Claude Chrome MCP - Embedded Relay ==="
echo ""
echo "The WebSocket relay is now embedded in the MCP server!"
echo ""
echo "How it works:"
echo "- First MCP server to start becomes the relay host (port 54321)"
echo "- Additional MCP servers connect as clients to the existing relay"
echo "- Automatic failover if the relay host exits"
echo ""
echo "To check relay health:"
echo "  curl http://localhost:54322/health"
echo ""
echo "Just run Claude Code normally - no separate relay process needed!"
echo ""