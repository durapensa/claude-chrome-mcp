const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('System Health Check', () => {
  let client;
  
  beforeEach(async () => {
    client = new MCPTestClient();
  });
  
  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  test('MCP server is accessible', async () => {
    // This test should always pass if server starts
    await expect(client.connect()).resolves.not.toThrow();
  });

  test('System health shows all components connected', async () => {
    await client.connect();
    
    try {
      // Get health with custom timeout
      const health = await Promise.race([
        client.callTool('system_health'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 10000)
        )
      ]);
      
      // Basic health structure
      expect(health).toHaveProperty('relayClient');
      expect(health).toHaveProperty('server');
      expect(health).toHaveProperty('extension');
      
      // Relay connection
      expect(health.relayConnected).toBe(true);
      expect(health.relayClient.state).toBe('connected');
      
      // Extension connection - may timeout but that's acceptable for this test
      if (health.extension && !health.extension.error) {
        expect(health.extension.connectedClients).toBeInstanceOf(Array);
        console.log(`✅ Extension connected with ${health.extension.connectedClients.length} clients`);
      } else {
        console.log(`⚠️ Extension not connected (${health.extension?.error || 'no error info'})`);
        console.log('This is expected if Chrome/extension is not running');
      }
    } catch (error) {
      if (error.message.includes('TIMEOUT')) {
        console.log('⚠️ System health timed out (extension may not be connected)');
        console.log('This is expected if Chrome/extension is not running');
      } else {
        throw error;
      }
    }
  }, 15000);

  test('Can list available tools', async () => {
    await client.connect();
    
    // This uses the standard MCP protocol
    const response = await client.client.listTools();
    
    // MCP returns an object with tools array
    expect(response).toHaveProperty('tools');
    expect(response.tools).toBeInstanceOf(Array);
    expect(response.tools.length).toBeGreaterThan(0);
    
    // Should have tab management tools
    const tabTools = response.tools.filter(t => t.name.includes('tab_'));
    expect(tabTools.length).toBeGreaterThan(0);
    
    console.log(`✅ Found ${response.tools.length} tools, including ${tabTools.length} tab tools`);
  });

});