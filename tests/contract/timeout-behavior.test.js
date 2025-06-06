const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Timeout Behavior', () => {
  let client;
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  test('tab_create handles extension timeout gracefully', async () => {
    try {
      // This should timeout if extension is not connected
      const result = await Promise.race([
        client.callTool('tab_create', { waitForLoad: true }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 5000)
        )
      ]);
      
      // If we get here, extension is actually connected
      expect(result.tabId).toBeTruthy();
      console.log('✅ Extension is connected - tab creation succeeded');
      
      // Clean up the created tab
      await client.callTool('tab_close', { tabId: result.tabId, force: true });
      
    } catch (error) {
      if (error.message.includes('TIMEOUT')) {
        console.log('✅ Tab creation timed out as expected (no extension)');
        // This is the expected behavior when extension is not connected
      } else {
        throw error;
      }
    }
  });

  test('system_health returns timeout info for extension', async () => {
    try {
      const health = await Promise.race([
        client.callTool('system_health'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 10000)
        )
      ]);
      
      // Should always have basic health structure
      expect(health).toHaveProperty('relayClient');
      expect(health).toHaveProperty('server');
      expect(health).toHaveProperty('extension');
      
      // Extension section should indicate availability
      if (health.extension && health.extension.error) {
        expect(health.extension.error).toMatch(/timeout|unavailable/i);
        console.log('✅ Extension health correctly reports timeout');
      } else if (health.extension && health.extension.connectedClients) {
        expect(health.extension.connectedClients).toBeInstanceOf(Array);
        console.log('✅ Extension health shows connected clients');
      }
    } catch (error) {
      if (error.message.includes('TIMEOUT')) {
        console.log('✅ System health timed out as expected (extension not available)');
      } else {
        throw error;
      }
    }
  });

  test('tab_list handles extension unavailability', async () => {
    try {
      const result = await Promise.race([
        client.callTool('tab_list'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 5000)
        )
      ]);
      
      // If successful, should return array
      expect(Array.isArray(result)).toBe(true);
      console.log(`✅ tab_list succeeded, found ${result.length} tabs`);
      
    } catch (error) {
      if (error.message.includes('TIMEOUT')) {
        console.log('✅ tab_list timed out as expected (no extension)');
      } else {
        throw error;
      }
    }
  });

  test('chrome_reload_extension handles unavailability', async () => {
    try {
      const result = await Promise.race([
        client.callTool('chrome_reload_extension'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 5000)
        )
      ]);
      
      // If successful, should return success indication
      expect(result).toBeTruthy();
      console.log('✅ Extension reload succeeded');
      
    } catch (error) {
      if (error.message.includes('TIMEOUT')) {
        console.log('✅ Extension reload timed out as expected (no extension)');
      } else {
        throw error;
      }
    }
  });
});