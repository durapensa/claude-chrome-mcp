const { MCPTestClient } = require('../helpers/mcp-test-client');
const { expectValidResponse, expectTabInList } = require('../helpers/assertions');
const { waitForResponse } = require('../helpers/test-scenarios');

describe('Multi-Tab Coordination', () => {
  let client;
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    await client.cleanup();
    await client.disconnect();
  });

  test('Batch operations on multiple tabs', async () => {
    // Create 3 tabs
    const tabIds = [];
    for (let i = 0; i < 3; i++) {
      const { tabId } = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      });
      tabIds.push(tabId);
    }
    
    // Verify all tabs exist
    const tabs = await client.callTool('tab_list');
    for (const tabId of tabIds) {
      expectTabInList(tabs, tabId, true);
    }
    
    // Send messages to all tabs using batch operation
    const messages = tabIds.map((tabId, index) => ({
      tabId,
      message: `Calculate ${index + 1} * 10`
    }));
    
    const batchResult = await client.callTool('tab_batch_operations', {
      operation: 'send_messages',
      messages,
      sequential: false,
      waitForAll: true
    });
    
    expect(batchResult.results).toHaveLength(3);
    expect(batchResult.results.every(r => r.success)).toBe(true);
    
    // Get responses from all tabs
    const getResult = await client.callTool('tab_batch_operations', {
      operation: 'get_responses',
      tabIds,
      waitForAll: true
    });
    
    expect(getResult.results).toHaveLength(3);
    
    // Verify responses contain expected calculations
    expect(getResult.results[0].response.content).toContain('10');
    expect(getResult.results[1].response.content).toContain('20');
    expect(getResult.results[2].response.content).toContain('30');
  });

  test('Operation locking prevents concurrent operations on same tab', async () => {
    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Start first operation without waiting
    const firstOp = client.callTool('tab_send_message', {
      tabId,
      message: "Count slowly from 1 to 10",
      waitForCompletion: false
    });
    
    // Small delay to ensure first operation starts
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Try to send another message to same tab - should fail due to lock
    let secondOpFailed = false;
    try {
      await client.callTool('tab_send_message', {
        tabId,
        message: "Quick test",
        waitForCompletion: false
      });
    } catch (error) {
      secondOpFailed = true;
      expect(error.message).toContain('locked');
    }
    
    expect(secondOpFailed).toBe(true);
    
    // Wait for first operation to complete
    await firstOp;
    await waitForResponse(client, tabId);
    
    // Now second operation should work
    await client.callTool('tab_send_message', {
      tabId,
      message: "Quick test",
      waitForCompletion: true
    });
    
    const response = await client.callTool('tab_get_response', { tabId });
    expectValidResponse(response);
  });

  test('Forward responses between multiple tabs in chain', async () => {
    // Create 3 tabs for chain forwarding
    const tab1 = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    const tab2 = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    const tab3 = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Send initial message to tab1
    await client.callTool('tab_send_message', {
      tabId: tab1.tabId,
      message: "Generate a random number between 1 and 100",
      waitForCompletion: true
    });
    
    // Forward from tab1 to tab2
    await client.callTool('tab_forward_response', {
      sourceTabId: tab1.tabId,
      targetTabId: tab2.tabId,
      transformTemplate: "Double this number: {{response}}"
    });
    
    // Wait for tab2 to process
    await waitForResponse(client, tab2.tabId);
    
    // Forward from tab2 to tab3
    await client.callTool('tab_forward_response', {
      sourceTabId: tab2.tabId,
      targetTabId: tab3.tabId,
      transformTemplate: "Is this result even or odd? {{response}}"
    });
    
    // Get final response from tab3
    const finalResponse = await waitForResponse(client, tab3.tabId);
    expectValidResponse(finalResponse);
    expect(finalResponse.content.toLowerCase()).toMatch(/(even|odd)/);
  });
});