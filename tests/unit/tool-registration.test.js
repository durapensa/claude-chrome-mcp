const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Tool Registration', () => {
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
      'mcp__claude-chrome-mcp__tab_create',
      'mcp__claude-chrome-mcp__tab_list', 
      'mcp__claude-chrome-mcp__tab_close',
      'mcp__claude-chrome-mcp__tab_send_message',
      'mcp__claude-chrome-mcp__tab_get_response'
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
      'mcp__claude-chrome-mcp__system_health',
      'mcp__claude-chrome-mcp__system_get_extension_logs'
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
      'mcp__claude-chrome-mcp__api_list_conversations',
      'mcp__claude-chrome-mcp__api_get_conversation_metadata'
    ];
    
    for (const expectedTool of expectedApiTools) {
      const found = response.tools.find(t => t.name === expectedTool);
      expect(found).toBeTruthy();
    }
    
    console.log(`✅ Found ${apiTools.length} API tools`);
  });
});