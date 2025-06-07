const { MCPTestClient } = require('./helpers/mcp-test-client');
const { PreFlightCheck } = require('./helpers/pre-flight-check');

async function debugExtensionConnection() {
  console.log('🔍 DEBUGGING EXTENSION CONNECTION');
  console.log('=' .repeat(50));
  
  const client = new MCPTestClient();
  
  try {
    console.log('1. Testing direct MCP connection...');
    await client.connect();
    console.log('✅ MCP client connected successfully');
    
    console.log('\n2. Testing simple tool that should always work...');
    try {
      const tools = await client.client.listTools();
      console.log(`✅ listTools works: ${tools.tools.length} tools available`);
    } catch (error) {
      console.log(`❌ listTools failed: ${error.message}`);
      return;
    }
    
    console.log('\n3. Testing tab_list (simpler extension tool) with 10s timeout...');
    try {
      const tabsStart = Date.now();
      const tabs = await Promise.race([
        client.callTool('tab_list'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TAB_LIST_TIMEOUT')), 10000)
        )
      ]);
      const tabsTime = Date.now() - tabsStart;
      console.log(`✅ tab_list completed in ${tabsTime}ms: ${Array.isArray(tabs) ? tabs.length : 'invalid'} tabs`);
    } catch (tabListError) {
      console.log(`❌ tab_list failed: ${tabListError.message}`);
    }
    
    console.log('\n4. Testing system_health call (30s timeout)...');
    const healthStart = Date.now();
    
    try {
      const health = await Promise.race([
        client.callTool('system_health'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_30S')), 30000)
        )
      ]);
      
      const healthTime = Date.now() - healthStart;
      console.log(`✅ system_health completed in ${healthTime}ms`);
      
      console.log('\n5. Analyzing extension status...');
      console.log('Extension object:', JSON.stringify(health.extension, null, 2));
      console.log('Relay object:', JSON.stringify(health.relay?.metrics?.clientList, null, 2));
      
      // Test the actual detection logic
      const extensionConnected = 
        health.extension && 
        health.extension.relayConnected === true &&
        (
          (health.extension.connectedClients && health.extension.connectedClients.length > 0) ||
          (health.relay && 
           health.relay.status === 'healthy' && 
           health.relay.metrics && 
           health.relay.metrics.clientList &&
           health.relay.metrics.clientList.some(client => client.type === 'extension'))
        );
      
      console.log(`Extension detection result: ${extensionConnected}`);
      
      if (extensionConnected) {
        console.log('\n4. Testing actual tab creation...');
        const tabStart = Date.now();
        
        try {
          const tabResult = await Promise.race([
            client.callTool('tab_create', { waitForLoad: true, injectContentScript: true }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('TAB_TIMEOUT')), 15000)
            )
          ]);
          
          const tabTime = Date.now() - tabStart;
          console.log(`✅ Tab creation succeeded in ${tabTime}ms`);
          console.log('Tab result:', tabResult);
          
          if (tabResult.tabId) {
            console.log('\n5. Testing tab cleanup...');
            await client.callTool('tab_close', { tabId: tabResult.tabId, force: true });
            console.log('✅ Tab closed successfully');
          }
        } catch (tabError) {
          console.log(`❌ Tab creation failed: ${tabError.message}`);
        }
      } else {
        console.log('❌ Extension not detected - integration tests would be skipped');
      }
      
    } catch (healthError) {
      console.log(`❌ system_health failed: ${healthError.message}`);
    }
    
    console.log('\n6. Testing PreFlightCheck...');
    const preFlightCheck = new PreFlightCheck({
      systemHealth: 10000  // 10s timeout
    });
    
    try {
      const result = await preFlightCheck.forIntegrationTests();
      console.log('✅ PreFlightCheck passed:', result.message);
    } catch (preFlightError) {
      console.log(`❌ PreFlightCheck failed: ${preFlightError.message}`);
    }
    
  } catch (error) {
    console.log(`❌ Debug script failed: ${error.message}`);
  } finally {
    try {
      await client.disconnect();
      console.log('\n🏁 Debug complete');
    } catch {}
  }
}

// Run the debug
debugExtensionConnection().catch(console.error);