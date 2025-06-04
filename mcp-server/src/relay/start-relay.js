#!/usr/bin/env node

/**
 * Standalone WebSocket relay server
 * Run this for standalone relay server mode (when not using embedded relay)
 */

const { MessageRelay } = require('./message-relay');

// Check if running in relay mode
const USE_RELAY = process.env.USE_WEBSOCKET_RELAY === 'true';
const RELAY_PORT = process.env.RELAY_PORT || 54321;

async function main() {
  if (!USE_RELAY) {
    console.log('[Relay] USE_WEBSOCKET_RELAY is not set to true. Exiting.');
    process.exit(0);
  }
  
  console.log('[Relay] Starting WebSocket relay server...');
  
  const relay = new MessageRelay(Number(RELAY_PORT));
  
  // Handle shutdown signals
  process.on('SIGINT', async () => {
    console.log('[Relay] Received SIGINT, shutting down...');
    await relay.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('[Relay] Received SIGTERM, shutting down...');
    await relay.stop();
    process.exit(0);
  });
  
  try {
    await relay.start();
    console.log('[Relay] WebSocket relay server running on port', RELAY_PORT);
  } catch (error) {
    console.error('[Relay] Failed to start:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[Relay] Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { main };