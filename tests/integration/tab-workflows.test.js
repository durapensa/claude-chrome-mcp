const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Tab Workflows (Requires Extension)', () => {
  let client;
  let extensionAvailable = false;
  
  beforeAll(async () => {
    // Check if extension is available before running any tests
    client = new MCPTestClient();
    await client.connect();
    
    try {
      const health = await Promise.race([
        client.callTool('system_health'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 5000)
        )
      ]);
      
      extensionAvailable = health.extension && 
                          !health.extension.error && 
                          health.extension.connectedClients && 
                          health.extension.connectedClients.length > 0;
                          
      if (extensionAvailable) {
        console.log('✅ Chrome extension detected - running integration tests');
      } else {
        console.log('⚠️ Chrome extension not available - skipping integration tests');
        console.log('To run these tests: ensure Chrome is running with extension loaded');
      }
    } catch (error) {
      console.log('⚠️ Could not check extension status - skipping integration tests');
    }
    
    await client.disconnect();
  });
  
  beforeEach(async () => {
    if (!extensionAvailable) {
      return; // Skip setup if extension not available
    }
    
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    if (client) {
      await client.cleanup();
      await client.disconnect();
    }
  });

  test('Complete tab lifecycle workflow', async () => {
    if (!extensionAvailable) {
      console.log('⏭️  Skipping tab lifecycle test (extension not available)');
      return;
    }

    // Create tab
    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    expect(tabId).toBeTruthy();
    
    // Verify tab exists
    const tabs = await client.callTool('tab_list');
    const createdTab = tabs.find(t => t.id === tabId);
    expect(createdTab).toBeTruthy();
    
    // Send message
    await client.callTool('tab_send_message', {
      tabId,
      message: "What is 3 + 4?",
      waitForCompletion: true
    });
    
    // Get response
    const response = await client.callTool('tab_get_response', { tabId });
    expect(response.completed).toBe(true);
    expect(response.content).toContain('7');
    
    // Close tab
    await client.callTool('tab_close', { tabId });
    
    // Verify cleanup
    const tabsAfter = await client.callTool('tab_list');
    expect(tabsAfter.find(t => t.id === tabId)).toBeFalsy();
    
    console.log('✅ Complete tab workflow successful');
  });

  test('Multiple tabs operate independently', async () => {
    if (!extensionAvailable) {
      console.log('⏭️  Skipping multi-tab test (extension not available)');
      return;
    }

    // Create two tabs
    const { tabId: tab1 } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    const { tabId: tab2 } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Send different messages
    await client.callTool('tab_send_message', {
      tabId: tab1,
      message: "What is 5 + 5?",
      waitForCompletion: true
    });
    
    await client.callTool('tab_send_message', {
      tabId: tab2,
      message: "What is 10 + 10?",
      waitForCompletion: true
    });
    
    // Get responses
    const response1 = await client.callTool('tab_get_response', { tabId: tab1 });
    const response2 = await client.callTool('tab_get_response', { tabId: tab2 });
    
    // Verify independence
    expect(response1.content).toContain('10');
    expect(response2.content).toContain('20');
    expect(response1.content).not.toContain('20');
    expect(response2.content).not.toContain('10');
    
    console.log('✅ Multi-tab independence verified');
  });

  test('Force close works during operations', async () => {
    if (!extensionAvailable) {
      console.log('⏭️  Skipping force close test (extension not available)');
      return;
    }

    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Start a long operation
    await client.callTool('tab_send_message', {
      tabId,
      message: "Write a very long essay about the history of computing",
      waitForCompletion: false
    });
    
    // Force close immediately
    await client.callTool('tab_close', { tabId, force: true });
    
    // Verify tab is gone
    const tabs = await client.callTool('tab_list');
    expect(tabs.find(t => t.id === tabId)).toBeFalsy();
    
    console.log('✅ Force close during operation successful');
  });
});