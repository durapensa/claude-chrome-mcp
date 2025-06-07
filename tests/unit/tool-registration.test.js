const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');

describe('Tool Registration', () => {
  let client;
  
  beforeAll(async () => {
    // Fail-early check for unit test prerequisites
    const preFlightCheck = new PreFlightCheck();
    const result = await preFlightCheck.forUnitTests();
    console.log(result.message);
  });
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  test('MCP server registers all expected tools', async () => {
    const response = await client.client.listTools();
    
    expect(response).toHaveProperty('tools');
    expect(response.tools).toBeInstanceOf(Array);
    expect(response.tools.length).toBeGreaterThan(30);
    
    console.log(`✅ Found ${response.tools.length} registered tools`);
  });

  test('All tab management tools are registered', async () => {
    const response = await client.client.listTools();
    const tabTools = response.tools.filter(t => t.name.includes('tab_'));
    
    const expectedTabTools = [
      'tab_create',
      'tab_list', 
      'tab_close',
      'tab_send_message',
      'tab_get_response'
    ];
    
    for (const expectedTool of expectedTabTools) {
      const found = response.tools.find(t => t.name === expectedTool);
      expect(found).toBeTruthy();
      expect(found.description).toBeTruthy();
    }
    
    console.log(`✅ All ${expectedTabTools.length} tab tools are registered`);
  });

  test('All system tools are registered', async () => {
    const response = await client.client.listTools();
    const systemTools = response.tools.filter(t => t.name.includes('system_'));
    
    const expectedSystemTools = [
      'system_health',
      'system_get_extension_logs'
    ];
    
    for (const expectedTool of expectedSystemTools) {
      const found = response.tools.find(t => t.name === expectedTool);
      expect(found).toBeTruthy();
    }
    
    console.log(`✅ Found ${systemTools.length} system tools`);
  });

  test('All API tools are registered', async () => {
    const response = await client.client.listTools();
    const apiTools = response.tools.filter(t => t.name.includes('api_'));
    
    const expectedApiTools = [
      'api_list_conversations',
      'api_get_conversation_metadata'
    ];
    
    for (const expectedTool of expectedApiTools) {
      const found = response.tools.find(t => t.name === expectedTool);
      expect(found).toBeTruthy();
    }
    
    console.log(`✅ Found ${apiTools.length} API tools`);
  });
});