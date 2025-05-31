#!/usr/bin/env node

/**
 * Event-Driven System Test Suite
 * 
 * Comprehensive testing of async tools and milestone detection:
 * - send_message_async, get_response_async, wait_for_operation
 * - Real-time milestone detection via DOM events
 * - MCP notification streaming
 * - Operation state persistence and recovery
 */

const sharedClient = require('../helpers/shared-client');

class TestRunner {
    constructor(name) {
        this.name = name;
        this.tests = 0;
        this.passed = 0;
        this.failed = 0;
        this.startTime = Date.now();
    }
    
    log(message) {
        console.log(`[${this.name}] ${message}`);
    }
    
    assert(condition, message) {
        this.tests++;
        if (condition) {
            this.passed++;
            console.log(`  ✅ ${message}`);
        } else {
            this.failed++;
            console.log(`  ❌ ${message}`);
            throw new Error(`Assertion failed: ${message}`);
        }
    }
    
    test(name, testFn) {
        console.log(`\n🧪 Testing: ${name}`);
        return testFn();
    }
    
    summary() {
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        console.log(`\n📊 Summary: ${this.passed}/${this.tests} passed in ${duration}s`);
        if (this.failed > 0) {
            throw new Error(`${this.failed} tests failed`);
        }
    }
}

async function testEventDrivenSystem() {
    const runner = new TestRunner('Event-Driven System');
    let tabId;

    try {
        // Setup
        runner.log('🔌 Connecting to MCP server...');
        await sharedClient.connect();
        runner.log('✅ Connected to MCP server\n');

        // Test 1: System Health
        await runner.test('System Health Check', async () => {
            const healthResult = await sharedClient.callTool('get_connection_health', {});
            const health = JSON.parse(healthResult.content[0].text);
            
            runner.assert(health.success, 'Health check should succeed');
            runner.assert(health.health.status === 'healthy', 'System should be healthy');
            runner.assert(health.health.hub.connected, 'WebSocket hub should be connected');
            
            runner.log(`  Hub: ${health.health.hub.connected ? 'Connected' : 'Disconnected'}`);
            runner.log(`  Clients: ${health.health.clients.total}`);
        });

        // Test 2: Tab Management
        await runner.test('Tab Spawn and Management', async () => {
            const spawnResult = await sharedClient.callTool('spawn_claude_dot_ai_tab', {});
            const spawnData = JSON.parse(spawnResult.content[0].text);
            tabId = spawnData.id;
            
            runner.assert(tabId && typeof tabId === 'number', 'Should receive valid numeric tab ID');
            runner.log(`  Tab spawned: ${tabId}`);
        });

        // Test 3: Async Message Sending
        await runner.test('Async Message Sending', async () => {
            const sendResult = await sharedClient.callTool('send_message_async', {
                tabId,
                message: 'Test message for event-driven completion detection. Please respond briefly.'
            });
            const sendData = JSON.parse(sendResult.content[0].text);
            
            runner.assert(sendData.operationId, 'Should return operation ID');
            runner.assert(sendData.status === 'started', 'Should have started status');
            runner.assert(sendData.type === 'send_message', 'Should have correct operation type');
            runner.assert(sendData.timestamp, 'Should include timestamp');
            
            runner.log(`  Operation ID: ${sendData.operationId}`);
            runner.log(`  Status: ${sendData.status}`);
            
            return sendData.operationId;
        });

        // Test 4: Wait for Operation (Message Sending)
        await runner.test('Message Sending Milestone Detection', async () => {
            const sendResult = await sharedClient.callTool('send_message_async', {
                tabId,
                message: 'Another test message to verify milestone detection.'
            });
            const sendData = JSON.parse(sendResult.content[0].text);
            
            const waitResult = await sharedClient.callTool('wait_for_operation', {
                operationId: sendData.operationId,
                timeoutMs: 10000
            });
            const waitData = JSON.parse(waitResult.content[0].text);
            
            runner.assert(waitData.milestones, 'Should include milestones array');
            
            const messageSent = waitData.milestones.find(m => m.milestone === 'message_sent');
            runner.assert(messageSent, 'Should detect message_sent milestone');
            runner.assert(messageSent.timestamp, 'Milestone should have timestamp');
            
            runner.log(`  Milestone: ${messageSent.milestone}`);
            runner.log(`  Detected at: ${new Date(messageSent.timestamp).toLocaleTimeString()}`);
        });

        // Test 5: Async Response Retrieval
        await runner.test('Async Response Retrieval', async () => {
            const responseResult = await sharedClient.callTool('get_response_async', {
                tabId
            });
            const responseData = JSON.parse(responseResult.content[0].text);
            
            runner.assert(responseData.operationId, 'Should return operation ID');
            runner.assert(responseData.status === 'started', 'Should have started status');
            runner.assert(responseData.type === 'get_response', 'Should have correct operation type');
            
            runner.log(`  Response operation ID: ${responseData.operationId}`);
            
            return responseData.operationId;
        });

        // Test 6: Response Completion Detection
        await runner.test('Response Completion Milestone Detection', async () => {
            const responseResult = await sharedClient.callTool('get_response_async', {
                tabId
            });
            const responseData = JSON.parse(responseResult.content[0].text);
            
            const waitResult = await sharedClient.callTool('wait_for_operation', {
                operationId: responseData.operationId,
                timeoutMs: 20000
            });
            const waitData = JSON.parse(waitResult.content[0].text);
            
            runner.assert(waitData.status === 'completed', 'Response operation should complete');
            
            const responseCompleted = waitData.milestones.find(m => m.milestone === 'response_completed');
            runner.assert(responseCompleted, 'Should detect response_completed milestone');
            runner.assert(responseCompleted.data, 'Response milestone should include data');
            runner.assert(responseCompleted.data.response, 'Should include response object');
            runner.assert(responseCompleted.data.response.text, 'Should include response text');
            runner.assert(responseCompleted.data.response.isComplete, 'Response should be marked complete');
            
            const responseText = responseCompleted.data.response.text;
            runner.log(`  Response: "${responseText.substring(0, 50)}..."`);
            runner.log(`  Complete: ${responseCompleted.data.response.isComplete}`);
            runner.log(`  Total messages: ${responseCompleted.data.response.totalMessages}`);
        });

        // Test 7: Complex Response Handling
        await runner.test('Complex Response (Code Generation)', async () => {
            const sendResult = await sharedClient.callTool('send_message_async', {
                tabId,
                message: 'Write a simple Python function that calculates fibonacci numbers.'
            });
            const sendData = JSON.parse(sendResult.content[0].text);
            
            // Wait for send completion
            await sharedClient.callTool('wait_for_operation', {
                operationId: sendData.operationId,
                timeoutMs: 10000
            });
            
            // Get response
            const responseResult = await sharedClient.callTool('get_response_async', {
                tabId
            });
            const responseData = JSON.parse(responseResult.content[0].text);
            
            // Wait for complex response completion
            const responseWaitResult = await sharedClient.callTool('wait_for_operation', {
                operationId: responseData.operationId,
                timeoutMs: 25000
            });
            const responseWaitData = JSON.parse(responseWaitResult.content[0].text);
            
            runner.assert(responseWaitData.status === 'completed', 'Complex response should complete');
            
            const responseCompleted = responseWaitData.milestones.find(m => m.milestone === 'response_completed');
            runner.assert(responseCompleted, 'Should detect completion of complex response');
            
            const responseText = responseCompleted.data.response.text;
            runner.assert(responseText.includes('def '), 'Response should contain Python function definition');
            runner.assert(responseText.length > 100, 'Complex response should be substantial');
            
            runner.log(`  Function detected: ${responseText.includes('def ')}`);
            runner.log(`  Response length: ${responseText.length} chars`);
        });

        // Test 8: Operation Timeout Handling
        await runner.test('Operation Timeout Handling', async () => {
            const sendResult = await sharedClient.callTool('send_message_async', {
                tabId,
                message: 'Simple timeout test message.'
            });
            const sendData = JSON.parse(sendResult.content[0].text);
            
            // Use very short timeout to test timeout handling
            const waitResult = await sharedClient.callTool('wait_for_operation', {
                operationId: sendData.operationId,
                timeoutMs: 2000  // Very short timeout
            });
            const waitData = JSON.parse(waitResult.content[0].text);
            
            // Should either complete or timeout gracefully
            const validStates = ['completed', 'pending'];
            runner.assert(
                validStates.includes(waitData.status),
                'Operation should either complete or timeout gracefully'
            );
            
            if (waitData.status === 'pending') {
                runner.assert(waitData.error, 'Timeout should include error message');
                runner.assert(waitData.failedAt, 'Should include failure timestamp');
                runner.log(`  Timeout handled gracefully: ${waitData.error}`);
            } else {
                runner.log(`  Operation completed within timeout`);
            }
        });

        runner.summary();
        runner.log('🎉 All event-driven system tests passed!');

    } catch (error) {
        runner.log(`❌ Test suite failed: ${error.message}`);
        throw error;
    } finally {
        // Cleanup
        if (tabId) {
            try {
                await sharedClient.callTool('close_claude_dot_ai_tab', { tabId });
                runner.log('🧹 Cleaned up test tab');
            } catch (cleanupError) {
                runner.log(`⚠️  Failed to cleanup tab: ${cleanupError.message}`);
            }
        }
    }
}

// Export for use in test suites
module.exports = { testEventDrivenSystem };

// Run if called directly
if (require.main === module) {
    testEventDrivenSystem()
        .then(() => {
            console.log('\n✅ Event-driven system tests completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Event-driven system tests failed:', error.message);
            process.exit(1);
        });
}