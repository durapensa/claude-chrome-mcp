#!/usr/bin/env node

// Standalone WebSocket server for Claude Code (Port 54322)
// This runs independently to handle Chrome extension connections

const WebSocketServer = require('./src/websocket-server.js');

console.log('Starting standalone WebSocket server for Claude Code on port 54322...');

const server = new WebSocketServer(54322);

server.start()
  .then(() => {
    console.log('Claude Code WebSocket server started successfully on port 54322');
  })
  .catch((error) => {
    console.error('Failed to start Claude Code WebSocket server:', error);
    process.exit(1);
  });

// Handle graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}, shutting down WebSocket server gracefully...`);
  try {
    server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));