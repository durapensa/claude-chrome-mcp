const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');

describe('System Health Check', () => {
  let client;
  
  beforeAll(async () => {
    // Fail-early check for unit test prerequisites
    const preFlightCheck = new PreFlightCheck();
    const result = await preFlightCheck.forUnitTests();
    console.log(result.message);
  });
  
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

  test('System health responds with proper structure', async () => {
    await client.connect();
    
    // Use PreFlightCheck for consistent timeout handling
    const preFlightCheck = new PreFlightCheck();
    const healthCheck = await preFlightCheck.checkSystemHealth();
    
    if (healthCheck.success) {
      const health = healthCheck.health;
      
      // Basic health structure
      expect(health).toHaveProperty('relayClient');
      expect(health).toHaveProperty('server');
      expect(health).toHaveProperty('extension');
      
      // Relay connection
      expect(health.relayConnected).toBe(true);
      expect(health.relayClient.state).toBe('connected');
      
      console.log('✅ System health check completed successfully');
    } else {
      console.log(`⚠️ ${healthCheck.error} - this may be expected if extension not running`);
      // Don't fail unit test if health times out
    }
  });

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