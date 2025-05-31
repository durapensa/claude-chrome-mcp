#!/usr/bin/env node

/**
 * Event-Driven Completion Detection Test Suite
 * 
 * Tests the new async tools and event-driven completion system:
 * - send_message_async
 * - get_response_async  
 * - wait_for_operation
 * - Milestone detection
 * - MCP notifications
 */

const sharedClient = require('./helpers/shared-client');

// Simple test runner
class TestRunner {
    constructor(name) {
        this.name = name;
        this.tests = [];
        this.results = [];
    }
    
    log(message) {
        console.log(`[${this.name}] ${message}`);
    }
    
    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }
    
    test(name, testFn) {
        this.log(`Testing: ${name}`);
        return testFn();
    }
    
    success(message) {
        this.log(`✅ ${message}`);
    }
    
    error(message, error) {
        this.log(`❌ ${message}: ${error.message}`);
    }
    
    warn(message) {
        this.log(`⚠️  ${message}`);
    }
}

async function testEventDrivenCompletion() {
    const runner = new TestRunner('Event-Driven Completion Detection');
    let tabId;

    try {
        // Setup
        runner.log('Setting up shared MCP client...');
        await sharedClient.connect();
        
        runner.log('Spawning Claude tab for testing...');
        const spawnResult = await sharedClient.callTool('spawn_claude_dot_ai_tab', {});
        const spawnData = JSON.parse(spawnResult.content[0].text);
        tabId = spawnData.id;
        runner.assert(tabId, 'Should receive valid tab ID');

        // Test 1: Basic async message sending
        runner.test('send_message_async returns operation ID immediately', async () => {
            const result = await sharedClient.callTool('send_message_async', {
                tabId,
                message: 'Hello! This is a test message for event-driven completion detection.'
            });
            const data = JSON.parse(result.content[0].text);

            runner.assert(data.operationId, 'Should return operation ID');
            runner.assert(data.status === 'started', 'Should have started status');
            runner.assert(data.type === 'send_message', 'Should have correct operation type');
            runner.assert(data.timestamp, 'Should include timestamp');
            
            return data.operationId;
        });

        // Test 2: wait_for_operation with message sending
        runner.test('wait_for_operation detects message_sent milestone', async () => {
            const sendResult = await client.request({
                method: 'mcp__claude-chrome-mcp__send_message_async',
                params: {
                    tabId,
                    message: 'Test message for milestone detection.'
                }
            });

            const waitResult = await client.request({
                method: 'mcp__claude-chrome-mcp__wait_for_operation',
                params: {
                    operationId: sendResult.operationId,
                    timeoutMs: 10000
                }
            });

            runner.assert(waitResult.milestones, 'Should include milestones array');
            const messageSentMilestone = waitResult.milestones.find(m => m.milestone === 'message_sent');
            runner.assert(messageSentMilestone, 'Should detect message_sent milestone');
            runner.assert(messageSentMilestone.timestamp, 'Milestone should have timestamp');
        });

        // Test 3: Basic async response retrieval
        runner.test('get_response_async returns operation ID immediately', async () => {
            const result = await client.request({
                method: 'mcp__claude-chrome-mcp__get_response_async',
                params: { tabId }
            });

            runner.assert(result.operationId, 'Should return operation ID');
            runner.assert(result.status === 'started', 'Should have started status');
            runner.assert(result.type === 'get_response', 'Should have correct operation type');
            
            return result.operationId;
        });

        // Test 4: Complete response cycle with milestone detection
        runner.test('Complete async cycle: send + get_response with milestones', async () => {
            // Send message
            const sendResult = await client.request({
                method: 'mcp__claude-chrome-mcp__send_message_async',
                params: {
                    tabId,
                    message: 'Please respond with a simple "Acknowledged" message.'
                }
            });

            // Wait for message to be sent
            const sendWaitResult = await client.request({
                method: 'mcp__claude-chrome-mcp__wait_for_operation',
                params: {
                    operationId: sendResult.operationId,
                    timeoutMs: 10000
                }
            });

            const messageSent = sendWaitResult.milestones.find(m => m.milestone === 'message_sent');
            runner.assert(messageSent, 'Should detect message_sent milestone');

            // Get response asynchronously
            const responseResult = await client.request({
                method: 'mcp__claude-chrome-mcp__get_response_async',
                params: { tabId }
            });

            // Wait for response completion
            const responseWaitResult = await client.request({
                method: 'mcp__claude-chrome-mcp__wait_for_operation',
                params: {
                    operationId: responseResult.operationId,
                    timeoutMs: 15000
                }
            });

            runner.assert(responseWaitResult.status === 'completed', 'Response operation should complete');
            
            const responseCompleted = responseWaitResult.milestones.find(m => m.milestone === 'response_completed');
            runner.assert(responseCompleted, 'Should detect response_completed milestone');
            runner.assert(responseCompleted.data, 'Response milestone should include data');
            runner.assert(responseCompleted.data.response, 'Should include response object');
            runner.assert(responseCompleted.data.response.text, 'Should include response text');
            runner.assert(responseCompleted.data.response.isComplete, 'Response should be marked complete');
        });

        // Test 5: Complex response with code generation
        runner.test('Event-driven detection for complex responses (code generation)', async () => {
            // Send request for code generation
            const sendResult = await client.request({
                method: 'mcp__claude-chrome-mcp__send_message_async',
                params: {
                    tabId,
                    message: 'Write a simple JavaScript function that adds two numbers and returns the result.'
                }
            });

            // Wait for send completion
            await client.request({
                method: 'mcp__claude-chrome-mcp__wait_for_operation',
                params: {
                    operationId: sendResult.operationId,
                    timeoutMs: 10000
                }
            });

            // Get response
            const responseResult = await client.request({
                method: 'mcp__claude-chrome-mcp__get_response_async',
                params: { tabId }
            });

            // Wait for complex response completion
            const responseWaitResult = await client.request({
                method: 'mcp__claude-chrome-mcp__wait_for_operation',
                params: {
                    operationId: responseResult.operationId,
                    timeoutMs: 20000
                }
            });

            runner.assert(responseWaitResult.status === 'completed', 'Complex response should complete');
            
            const responseCompleted = responseWaitResult.milestones.find(m => m.milestone === 'response_completed');
            runner.assert(responseCompleted, 'Should detect completion of complex response');
            
            // Verify response contains code
            const responseText = responseCompleted.data.response.text;
            runner.assert(responseText.includes('function'), 'Response should contain function keyword');
            runner.assert(responseText.length > 50, 'Complex response should be substantial');
        });

        // Test 6: Operation timeout handling
        runner.test('Operation timeout handling', async () => {
            const sendResult = await client.request({
                method: 'mcp__claude-chrome-mcp__send_message_async',
                params: {
                    tabId,
                    message: 'Simple test message for timeout test.'
                }
            });

            // Use very short timeout to test timeout handling
            const waitResult = await client.request({
                method: 'mcp__claude-chrome-mcp__wait_for_operation',
                params: {
                    operationId: sendResult.operationId,
                    timeoutMs: 1000  // Very short timeout
                }
            });

            // Should either complete or timeout gracefully
            runner.assert(
                waitResult.status === 'completed' || waitResult.status === 'pending',
                'Operation should either complete or timeout gracefully'
            );

            if (waitResult.status === 'pending') {
                runner.assert(waitResult.error, 'Timeout should include error message');
                runner.assert(waitResult.failedAt, 'Should include failure timestamp');
            }
        });

        // Test 7: System health verification
        runner.test('System health with event-driven components', async () => {
            const health = await client.request({
                method: 'mcp__claude-chrome-mcp__get_connection_health'
            });

            runner.assert(health.success, 'Health check should succeed');
            runner.assert(health.health.status === 'healthy', 'System should be healthy');
            runner.assert(health.health.hub.connected, 'WebSocket hub should be connected');
            runner.assert(health.health.clients.total > 0, 'Should have active clients');
        });

        runner.success('All event-driven completion detection tests passed!');

    } catch (error) {
        runner.error('Test suite failed', error);
        throw error;
    } finally {
        // Cleanup
        if (tabId && client) {
            try {
                await client.request({
                    method: 'mcp__claude-chrome-mcp__close_claude_dot_ai_tab',
                    params: { tabId }
                });
                runner.log('Cleaned up test tab');
            } catch (cleanupError) {
                runner.warn('Failed to cleanup tab:', cleanupError.message);
            }
        }
    }
}

// Export for use in test suites
module.exports = { testEventDrivenCompletion };

// Run if called directly
if (require.main === module) {
    testEventDrivenCompletion()
        .then(() => {
            console.log('\n✅ Event-driven completion detection tests completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Event-driven completion detection tests failed:', error.message);
            process.exit(1);
        });
}