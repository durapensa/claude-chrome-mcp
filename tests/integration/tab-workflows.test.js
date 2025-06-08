const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');
const { globalTabHygiene, setupTabHygiene, cleanupAllTabs } = require('../helpers/tab-hygiene');

describe('Tab Workflows (Requires Extension)', () => {
  let client;
  
  beforeAll(async () => {
    // Check full integration prerequisites including MCP connectivity and extension availability
    const preFlightCheck = new PreFlightCheck();
    
    try {
      const mcpResult = await preFlightCheck.forIntegrationTests(); // Full prerequisite check
      console.log(`✅ Integration prerequisites verified (${mcpResult.mcp.toolCount} tools, extension ready)`);
      console.log('✅ Extension connectivity confirmed');
    } catch (error) {
      throw new Error(`Integration prerequisites failed: ${error.message}`);
    }
    
    // Initialize tab hygiene
    const tempClient = new MCPTestClient();
    await tempClient.connect();
    await setupTabHygiene(tempClient);
    await tempClient.disconnect();
  }, 10000); // 10s timeout for beforeAll
  
  afterAll(async () => {
    // Clean up all tabs created by this test suite
    await cleanupAllTabs();
  }, 10000);
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    if (client) {
      await client.cleanup();
      await client.disconnect();
    }
  });

  test('Can list existing tabs', async () => {
    const result = await client.callTool('tab_list');
    
    expect(Array.isArray(result.tabs)).toBe(true);
    console.log(`✅ Found ${result.tabs.length} tabs`);
  }, 20000); // 20s timeout

  test('Can create and close tab', async () => {
    const tabId = await globalTabHygiene.createDedicatedTab({
      waitForLoad: true,
      injectContentScript: true
    });
    
    expect(tabId).toBeTruthy();
    
    // Verify tab exists
    const tabList = await client.callTool('tab_list');
    const createdTab = tabList.tabs.find(t => t.id === tabId);
    expect(createdTab).toBeTruthy();
    
    // Close tab
    await globalTabHygiene.cleanupTab(tabId);
    
    console.log('✅ Tab creation and cleanup successful');
  }, 30000); // 30s timeout

  test('Can send message and get response', async () => {
    const tabId = await globalTabHygiene.createDedicatedTab({
      waitForLoad: true,
      injectContentScript: true
    });
    
    expect(tabId).toBeTruthy();
    
    try {
      // Send message
      await client.callTool('tab_send_message', {
        tabId: tabId,
        message: "What is 2 + 2?",
        waitForCompletion: true
      });
      
      // Get response
      const response = await client.callTool('tab_get_response', { tabId: tabId });
      expect(response.completed).toBe(true);
      expect(response.content).toContain('4');
      
      console.log('✅ Message send and response retrieval successful');
    } finally {
      // Ensure tab is cleaned up
      await globalTabHygiene.cleanupTab(tabId);
    }
  }, 45000); // 45s timeout
});