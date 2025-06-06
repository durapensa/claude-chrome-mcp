const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Operation Latency Performance', () => {
  let client;
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    await client.cleanup();
    await client.disconnect();
  });

  test('Tab creation latency', async () => {
    const iterations = 5;
    const latencies = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      const { tabId } = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      });
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      latencies.push(latency);
      
      // Close tab before next iteration
      await client.callTool('tab_close', { tabId });
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    
    console.log(`Tab creation latency - Avg: ${avgLatency}ms, Max: ${maxLatency}ms`);
    
    // Performance assertions
    expect(avgLatency).toBeLessThan(5000); // Average should be under 5 seconds
    expect(maxLatency).toBeLessThan(8000); // Max should be under 8 seconds
  });

  test('Message send/receive round-trip time', async () => {
    const { tabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    const iterations = 3;
    const roundTripTimes = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      // Send message and wait for completion
      await client.callTool('tab_send_message', {
        tabId,
        message: `Quick test ${i + 1}`,
        waitForCompletion: true
      });
      
      // Get response
      const response = await client.callTool('tab_get_response', { tabId });
      
      const endTime = Date.now();
      const roundTripTime = endTime - startTime;
      roundTripTimes.push(roundTripTime);
      
      expect(response.completed).toBe(true);
      
      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const avgRoundTrip = roundTripTimes.reduce((a, b) => a + b, 0) / roundTripTimes.length;
    
    console.log(`Message round-trip times: ${roundTripTimes.join(', ')}ms`);
    console.log(`Average round-trip time: ${avgRoundTrip}ms`);
    
    // Performance assertion - simple messages should complete quickly
    expect(avgRoundTrip).toBeLessThan(10000); // Under 10 seconds average
  });

  test('Concurrent tab operations performance', async () => {
    const concurrentTabs = 3;
    const startTime = Date.now();
    
    // Create tabs concurrently
    const tabPromises = [];
    for (let i = 0; i < concurrentTabs; i++) {
      tabPromises.push(client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      }));
    }
    
    const tabs = await Promise.all(tabPromises);
    const creationTime = Date.now() - startTime;
    
    console.log(`Created ${concurrentTabs} tabs concurrently in ${creationTime}ms`);
    
    // Send messages concurrently
    const messageStartTime = Date.now();
    const messagePromises = tabs.map((tab, index) => 
      client.callTool('tab_send_message', {
        tabId: tab.tabId,
        message: `Concurrent test ${index + 1}`,
        waitForCompletion: false
      })
    );
    
    await Promise.all(messagePromises);
    const messageSendTime = Date.now() - messageStartTime;
    
    console.log(`Sent ${concurrentTabs} messages concurrently in ${messageSendTime}ms`);
    
    // Performance assertions
    expect(creationTime).toBeLessThan(10000); // Should handle concurrent creation efficiently
    expect(messageSendTime).toBeLessThan(2000); // Message sending should be fast
  });

  test('Resource cleanup performance', async () => {
    // Create multiple tabs
    const tabCount = 5;
    const tabIds = [];
    
    for (let i = 0; i < tabCount; i++) {
      const { tabId } = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      });
      tabIds.push(tabId);
    }
    
    // Measure cleanup time
    const cleanupStartTime = Date.now();
    
    for (const tabId of tabIds) {
      await client.callTool('tab_close', { tabId, force: true });
    }
    
    const cleanupTime = Date.now() - cleanupStartTime;
    const avgCleanupTime = cleanupTime / tabCount;
    
    console.log(`Cleaned up ${tabCount} tabs in ${cleanupTime}ms (avg: ${avgCleanupTime}ms per tab)`);
    
    // Verify all tabs are closed
    const remainingTabs = await client.callTool('tab_list');
    const openTestTabs = remainingTabs.filter(tab => tabIds.includes(tab.id));
    
    expect(openTestTabs).toHaveLength(0);
    expect(avgCleanupTime).toBeLessThan(1000); // Should close tabs quickly
  });
});