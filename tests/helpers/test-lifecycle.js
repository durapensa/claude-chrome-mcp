// Test lifecycle management helpers

const { MCPTestClient } = require('./mcp-test-client');

const setupTestEnvironment = async () => {
  const client = new MCPTestClient();
  
  try {
    // Connect to MCP server
    await client.connect();
    
    // Verify system health
    const health = await client.callTool('system_health');
    
    if (!health.relayConnected || !health.extension) {
      throw new Error('System not ready for testing: Extension or relay not connected');
    }
    
    // Clean up any existing test tabs
    const tabs = await client.callTool('tab_list');
    for (const tab of tabs) {
      if (tab.url && tab.url.includes('claude.ai')) {
        try {
          await client.callTool('tab_close', { tabId: tab.id, force: true });
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    }
    
    return client;
  } catch (error) {
    await client.disconnect();
    throw error;
  }
};

const teardownTestEnvironment = async (client) => {
  if (!client) return;
  
  try {
    // Clean up all created resources
    await client.cleanup();
    
    // Disconnect from server
    await client.disconnect();
  } catch (error) {
    console.error('Error during test teardown:', error);
  }
};

const withTestClient = (testFn) => {
  return async () => {
    let client;
    try {
      client = await setupTestEnvironment();
      await testFn(client);
    } finally {
      await teardownTestEnvironment(client);
    }
  };
};

const waitForSystemReady = async (client, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const health = await client.callTool('system_health');
      if (health.relayConnected && health.extension) {
        return true;
      }
    } catch (e) {
      // System might not be ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('System failed to become ready after ' + maxAttempts + ' attempts');
};

module.exports = {
  setupTestEnvironment,
  teardownTestEnvironment,
  withTestClient,
  waitForSystemReady
};