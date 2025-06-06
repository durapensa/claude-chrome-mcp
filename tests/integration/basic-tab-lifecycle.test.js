const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Basic Tab Lifecycle', () => {
  let client;
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    await client.cleanup();
    await client.disconnect();
  });

  test('Create tab, send message, get response, close tab', async () => {
    // Create tab with content script injection
    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Verify tab is ready and listed
    const tabs = await client.callTool('tab_list');
    expect(tabs.find(t => t.id === tabId)).toBeTruthy();
    
    // Send message and wait for completion
    await client.callTool('tab_send_message', {
      tabId,
      message: "What is the capital of France?",
      waitForCompletion: true
    });
    
    // Get response and verify content
    const response = await client.callTool('tab_get_response', { tabId });
    expect(response.content).toContain('Paris');
    expect(response.completed).toBe(true);
    
    // Clean up tab
    await client.callTool('tab_close', { tabId });
    
    // Verify cleanup
    const tabsAfter = await client.callTool('tab_list');
    expect(tabsAfter.find(t => t.id === tabId)).toBeFalsy();
  });

  test('Create multiple tabs and verify isolation', async () => {
    // Create two tabs
    const { tabId: tab1 } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    const { tabId: tab2 } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Verify both tabs exist
    const tabs = await client.callTool('tab_list');
    expect(tabs.find(t => t.id === tab1)).toBeTruthy();
    expect(tabs.find(t => t.id === tab2)).toBeTruthy();
    
    // Send different messages to each tab
    await client.callTool('tab_send_message', {
      tabId: tab1,
      message: "What is 2 + 2?",
      waitForCompletion: false
    });
    
    await client.callTool('tab_send_message', {
      tabId: tab2,
      message: "What is the largest planet?",
      waitForCompletion: false
    });
    
    // Wait for both to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get responses and verify they're different
    const response1 = await client.callTool('tab_get_response', { tabId: tab1 });
    const response2 = await client.callTool('tab_get_response', { tabId: tab2 });
    
    expect(response1.content).toContain('4');
    expect(response2.content).toContain('Jupiter');
    
    // Clean up both tabs
    await client.callTool('tab_close', { tabId: tab1 });
    await client.callTool('tab_close', { tabId: tab2 });
  });

  test('Handle tab close with force flag', async () => {
    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Start a message but don't wait
    await client.callTool('tab_send_message', {
      tabId,
      message: "Tell me a long story about...",
      waitForCompletion: false
    });
    
    // Force close should work even with pending operation
    await client.callTool('tab_close', { tabId, force: true });
    
    // Verify tab is gone
    const tabs = await client.callTool('tab_list');
    expect(tabs.find(t => t.id === tabId)).toBeFalsy();
  });
});