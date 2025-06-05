#!/usr/bin/env node

/**
 * Standalone WebSocket relay server
 * Run this for standalone relay server mode (when not using embedded relay)
 */

const { MessageRelay } = require('./message-relay');
const { createLogger } = require('../utils/logger');

// Create logger
const logger = createLogger('RelayStandalone');

// Check if running in relay mode
const USE_RELAY = process.env.USE_WEBSOCKET_RELAY === 'true';
const RELAY_PORT = process.env.RELAY_PORT || 54321;

async function main() {
  if (!USE_RELAY) {
    logger.info('USE_WEBSOCKET_RELAY is not set to true. Exiting.');
    process.exit(0);
  }
  
  logger.info('Starting WebSocket relay server...');
  
  const relay = new MessageRelay(Number(RELAY_PORT));
  
  // Handle shutdown signals
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await relay.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await relay.stop();
    process.exit(0);
  });
  
  try {
    await relay.start();
    logger.info('WebSocket relay server running', { port: RELAY_PORT });
  } catch (error) {
    logger.error('Failed to start', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error', error);
    process.exit(1);
  });
}

module.exports = { main };