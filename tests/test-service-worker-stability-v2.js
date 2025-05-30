#!/usr/bin/env node

/**
 * Test Chrome service worker stability improvements
 * Version 2: Uses shared MCP client
 */

const sharedClient = require('./helpers/shared-client');
const TestLifecycle = require('./helpers/lifecycle');

async function testServiceWorkerStability() {
  console.log('🧪 Testing Chrome service worker stability...\n');
  
  const lifecycle = new TestLifecycle();
  let tabId = null;
  
  try {
    // Step 1: Create test tab
    console.log('1️⃣ Creating test Claude tab...');
    const spawnResult = await sharedClient.callTool('spawn_claude_tab', {});
    const tabInfo = JSON.parse(spawnResult.content[0].text);
    tabId = tabInfo.id;
    lifecycle.addTab(tabId);
    console.log(`✅ Created tab: ${tabId}\n`);
    
    // Step 2: Check initial health
    console.log('2️⃣ Checking initial connection health...');
    const health1 = await sharedClient.callTool('get_connection_health', {});
    const healthData1 = JSON.parse(health1.content[0].text);
    
    console.log('Initial health status:');
    console.log(`  - Status: ${healthData1.status}`);
    console.log(`  - Hub connected: ${healthData1.hubConnection.connected}`);
    console.log(`  - Chrome alarms: ${healthData1.chromeAlarms ? healthData1.chromeAlarms.length + ' active' : 'Not available'}`);
    console.log(`  - Uptime: ${Math.round(healthData1.uptime / 1000)}s\n`);
    
    // Step 3: Send message and wait
    console.log('3️⃣ Sending test message...');
    await sharedClient.callTool('send_message_to_claude_tab', {
      tabId: tabId,
      message: 'Testing service worker stability',
      waitForReady: true
    });
    console.log('✅ Message sent\n');
    
    // Step 4: Simulate extended wait
    console.log('4️⃣ Simulating extended wait period (20 seconds)...');
    console.log('   This tests if the connection remains stable...');
    
    for (let i = 0; i < 4; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      process.stdout.write(`   ${5 * (i + 1)}s...`);
      
      // Check if we can still communicate
      try {
        const tabs = await sharedClient.callTool('get_claude_tabs', {});
        const tabList = JSON.parse(tabs.content[0].text);
        const ourTab = tabList.find(t => t.id === tabId);
        if (ourTab) {
          process.stdout.write(' ✓ Connection active\n');
        } else {
          process.stdout.write(' ⚠️  Tab not found\n');
        }
      } catch (error) {
        process.stdout.write(` ❌ Error: ${error.message}\n`);
      }
    }
    
    console.log('\n5️⃣ Checking connection health after wait...');
    const health2 = await sharedClient.callTool('get_connection_health', {});
    const healthData2 = JSON.parse(health2.content[0].text);
    
    console.log('Post-wait health status:');
    console.log(`  - Status: ${healthData2.status}`);
    console.log(`  - Hub connected: ${healthData2.hubConnection.connected}`);
    console.log(`  - Connection stable: ${healthData2.hubConnection.connectionStable}`);
    console.log(`  - Reconnect count: ${healthData2.hubConnection.reconnectCount || 0}`);
    
    // Step 5: Test recovery from connection issues
    console.log('\n6️⃣ Testing message after extended wait...');
    const finalMessage = await sharedClient.callTool('send_message_to_claude_tab', {
      tabId: tabId,
      message: 'Connection still working after wait?',
      waitForReady: true
    });
    const finalResult = JSON.parse(finalMessage.content[0].text);
    
    if (finalResult.success) {
      console.log('✅ Message sent successfully - connection remained stable!\n');
    } else {
      console.log(`❌ Message failed: ${finalResult.error}\n`);
    }
    
    // Summary
    console.log('📊 Summary:');
    console.log('  - Chrome Alarms API prevents service worker suspension');
    console.log('  - Exponential backoff reconnection for better stability');
    console.log('  - Connection state persistence for recovery after restart');
    console.log('  - Check Chrome extension logs for detailed connection status');
    
    console.log('\n✅ Test completed');
    
    return { 
      success: finalResult.success,
      stability: healthData2.hubConnection.connected && !healthData2.hubConnection.reconnectCount
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await lifecycle.teardown();
  }
}

// Run the test
if (require.main === module) {
  testServiceWorkerStability()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = testServiceWorkerStability;