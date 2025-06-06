#!/usr/bin/env node

/**
 * Simple Event-Driven Completion Detection Test
 * 
 * Quick test of the new async tools and milestone detection
 */

const sharedClient = require('./helpers/shared-client');

async function testEventDriven() {
    console.log('🧪 Testing Event-Driven Completion Detection...\n');
    
    try {
        // Connect to MCP
        console.log('🔌 Connecting to MCP server...');
        await sharedClient.connect();
        console.log('✅ Connected to MCP server\n');
        
        // Test health
        console.log('🏥 Testing system health...');
        const healthResult = await sharedClient.callTool('system_health', {});
        const health = JSON.parse(healthResult.content[0].text);
        console.log(`✅ System status: ${health.health.status}\n`);
        
        // Spawn tab
        console.log('🌐 Spawning Claude tab...');
        const spawnResult = await sharedClient.callTool('spawn_claude_dot_ai_tab', {});
        const spawnData = JSON.parse(spawnResult.content[0].text);
        const tabId = spawnData.id;
        console.log(`✅ Tab spawned: ${tabId}\n`);
        
        // Test async send
        console.log('📤 Testing send_message_async...');
        const sendResult = await sharedClient.callTool('send_message_async', {
            tabId,
            message: 'Hello! Please respond with a simple confirmation.'
        });
        const sendData = JSON.parse(sendResult.content[0].text);
        console.log(`✅ Got operation ID: ${sendData.operationId}`);
        console.log(`   Status: ${sendData.status}, Type: ${sendData.type}\n`);
        
        // Test wait_for_operation
        console.log('⏳ Testing wait_for_operation...');
        const waitResult = await sharedClient.callTool('wait_for_operation', {
            operationId: sendData.operationId,
            timeoutMs: 15000
        });
        const waitData = JSON.parse(waitResult.content[0].text);
        console.log(`✅ Operation completed: ${waitData.status}`);
        
        if (waitData.milestones && waitData.milestones.length > 0) {
            console.log('   Milestones detected:');
            waitData.milestones.forEach(m => {
                console.log(`   - ${m.milestone} at ${new Date(m.timestamp).toLocaleTimeString()}`);
            });
        }
        console.log('');
        
        // Test async response
        console.log('📥 Testing get_response_async...');
        const responseResult = await sharedClient.callTool('get_response_async', {
            tabId
        });
        const responseData = JSON.parse(responseResult.content[0].text);
        console.log(`✅ Got response operation ID: ${responseData.operationId}\n`);
        
        // Wait for response completion
        console.log('⏳ Waiting for response completion...');
        const responseWaitResult = await sharedClient.callTool('wait_for_operation', {
            operationId: responseData.operationId,
            timeoutMs: 15000
        });
        const responseWaitData = JSON.parse(responseWaitResult.content[0].text);
        console.log(`✅ Response completed: ${responseWaitData.status}`);
        
        if (responseWaitData.milestones) {
            const responseCompleted = responseWaitData.milestones.find(m => m.milestone === 'response_completed');
            if (responseCompleted && responseCompleted.data && responseCompleted.data.response) {
                console.log(`   Response text: "${responseCompleted.data.response.text.substring(0, 50)}..."`);
                console.log(`   Complete: ${responseCompleted.data.response.isComplete}`);
            }
        }
        console.log('');
        
        // Cleanup
        console.log('🧹 Cleaning up...');
        await sharedClient.callTool('close_claude_dot_ai_tab', { tabId });
        console.log('✅ Tab closed\n');
        
        console.log('🎉 All event-driven tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        throw error;
    }
}

// Export for use in test suites
module.exports = { testEventDriven };

// Run if called directly
if (require.main === module) {
    testEventDriven()
        .then(() => {
            console.log('\n✅ Event-driven completion detection test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Event-driven completion detection test failed:', error.message);
            process.exit(1);
        });
}