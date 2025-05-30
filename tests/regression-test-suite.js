#!/usr/bin/env node

/**
 * Automated Regression Test Suite for Claude Chrome MCP
 * 
 * This script runs a comprehensive set of tests to verify all tools are working correctly
 * 
 * Usage: node regression-test-suite.js
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

// Test configuration
const TEST_CONFIG = {
  skipDestructive: false,  // Set to true to skip tests that delete conversations
  verbose: true,           // Detailed logging
  timeout: 30000          // Default timeout for operations
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test result tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message, color = 'reset') {
  if (TEST_CONFIG.verbose) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

function logTest(name, result, details = '') {
  const symbol = result === 'pass' ? '✅' : result === 'fail' ? '❌' : '⏭️';
  const color = result === 'pass' ? 'green' : result === 'fail' ? 'red' : 'yellow';
  console.log(`${symbol} ${colors[color]}${name}${colors.reset} ${details}`);
  
  if (result === 'pass') testResults.passed++;
  else if (result === 'fail') {
    testResults.failed++;
    if (details) testResults.errors.push(`${name}: ${details}`);
  }
  else if (result === 'skip') testResults.skipped++;
}

async function runTest(name, testFn) {
  try {
    log(`\nRunning: ${name}`, 'cyan');
    const result = await testFn();
    logTest(name, result.success ? 'pass' : 'fail', result.message);
    return result;
  } catch (error) {
    logTest(name, 'fail', error.message);
    return { success: false, error: error.message };
  }
}

async function createTestClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../mcp-server/src/server.js']
  });
  
  const client = new Client({
    name: 'regression-test',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  return client;
}

// Test Functions
const tests = {
  // 1. Connection Health
  async testConnectionHealth(client) {
    const result = await client.callTool('get_connection_health', {});
    const health = result.content[0].text;
    
    // Parse the health response
    const isHealthy = health.includes('"status": "healthy"');
    const hasAlarms = health.includes('keepAlive');
    
    return {
      success: isHealthy && hasAlarms,
      message: isHealthy ? 'Connection healthy with alarms active' : 'Connection unhealthy'
    };
  },

  // 2. Tab Management
  async testTabManagement(client) {
    // List tabs
    const listResult = await client.callTool('get_claude_tabs', {});
    
    // Create tab
    const spawnResult = await client.callTool('spawn_claude_tab', {});
    const tabIdMatch = spawnResult.content[0].text.match(/Tab ID: (\d+)/);
    const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
    
    if (!tabId) {
      return { success: false, message: 'Failed to create tab' };
    }
    
    await sleep(5000); // Wait for tab to load
    
    // Close tab
    const closeResult = await client.callTool('close_claude_tab', {
      tabId: tabId,
      force: false
    });
    
    const closeSuccess = closeResult.content[0].text.includes('"success": true');
    
    return {
      success: closeSuccess,
      message: `Created and closed tab ${tabId}`
    };
  },

  // 3. Message Sending with Retry
  async testMessageSendingWithRetry(client) {
    // Create a test tab
    const spawnResult = await client.callTool('spawn_claude_tab', {});
    const tabIdMatch = spawnResult.content[0].text.match(/Tab ID: (\d+)/);
    const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
    
    if (!tabId) {
      return { success: false, message: 'Failed to create test tab' };
    }
    
    await sleep(5000);
    
    try {
      // Send message with retry
      const sendResult = await client.callTool('send_message_to_claude_tab', {
        tabId: tabId,
        message: 'Hello! Please respond with just "OK"',
        waitForReady: true,
        maxRetries: 3
      });
      
      const sendSuccess = sendResult.content[0].text.includes('"success": true');
      
      if (sendSuccess) {
        // Get response
        await sleep(3000);
        const responseResult = await client.callTool('get_claude_response', {
          tabId: tabId,
          waitForCompletion: true,
          timeoutMs: 10000
        });
        
        const hasResponse = responseResult.content[0].text.includes('"text":');
        
        // Clean up
        await client.callTool('close_claude_tab', { tabId: tabId, force: true });
        
        return {
          success: hasResponse,
          message: hasResponse ? 'Message sent and response received' : 'No response received'
        };
      }
      
      // Clean up on failure
      await client.callTool('close_claude_tab', { tabId: tabId, force: true });
      
      return { success: false, message: 'Failed to send message' };
      
    } catch (error) {
      // Clean up on error
      try {
        await client.callTool('close_claude_tab', { tabId: tabId, force: true });
      } catch (e) {}
      throw error;
    }
  },

  // 4. Metadata Extraction
  async testMetadataExtraction(client) {
    // Use an existing tab or create one
    const tabsResult = await client.callTool('get_claude_tabs', {});
    const tabs = JSON.parse(tabsResult.content[0].text);
    
    if (tabs.length === 0) {
      return { success: false, message: 'No Claude tabs available for testing' };
    }
    
    const tabId = tabs[0].id;
    
    const metadataResult = await client.callTool('get_conversation_metadata', {
      tabId: tabId,
      includeMessages: false
    });
    
    const metadata = metadataResult.content[0].text;
    const hasUrl = metadata.includes('"url":');
    const hasTitle = metadata.includes('"title":');
    
    return {
      success: hasUrl && hasTitle,
      message: hasUrl && hasTitle ? 'Metadata extracted successfully' : 'Incomplete metadata'
    };
  },

  // 5. Export Functionality
  async testExportFunctionality(client) {
    const tabsResult = await client.callTool('get_claude_tabs', {});
    const tabs = JSON.parse(tabsResult.content[0].text);
    
    if (tabs.length === 0) {
      return { success: false, message: 'No Claude tabs available for testing' };
    }
    
    const tabId = tabs[0].id;
    
    // Test markdown export
    const exportResult = await client.callTool('export_conversation_transcript', {
      tabId: tabId,
      format: 'markdown'
    });
    
    const exportText = exportResult.content[0].text;
    const hasContent = exportText.includes('"success": true') && 
                      exportText.includes('"format": "markdown"');
    
    return {
      success: hasContent,
      message: hasContent ? 'Export successful' : 'Export failed'
    };
  },

  // 6. Batch Operations
  async testBatchOperations(client) {
    const tabsResult = await client.callTool('get_claude_tabs', {});
    const tabs = JSON.parse(tabsResult.content[0].text);
    
    if (tabs.length < 2) {
      return { success: false, message: 'Need at least 2 tabs for batch testing' };
    }
    
    // Test batch send
    const messages = tabs.slice(0, 2).map((tab, i) => ({
      tabId: tab.id,
      message: `Batch test message ${i + 1}`
    }));
    
    const batchResult = await client.callTool('batch_send_messages', {
      messages: messages,
      sequential: false
    });
    
    const batchText = batchResult.content[0].text;
    const successCount = (batchText.match(/"successful": (\d+)/)?.[1] || '0');
    
    return {
      success: parseInt(successCount) === messages.length,
      message: `Sent ${successCount}/${messages.length} messages`
    };
  },

  // 7. Element Extraction
  async testElementExtraction(client) {
    const tabsResult = await client.callTool('get_claude_tabs', {});
    const tabs = JSON.parse(tabsResult.content[0].text);
    
    if (tabs.length === 0) {
      return { success: false, message: 'No Claude tabs available for testing' };
    }
    
    const tabId = tabs[0].id;
    
    const extractResult = await client.callTool('extract_conversation_elements', {
      tabId: tabId,
      batchSize: 10,
      maxElements: 50
    });
    
    const extractText = extractResult.content[0].text;
    const hasData = extractText.includes('"success": true') && 
                   extractText.includes('"data":');
    
    return {
      success: hasData,
      message: hasData ? 'Elements extracted' : 'Extraction failed'
    };
  },

  // 8. Response Status Monitoring
  async testResponseStatus(client) {
    const tabsResult = await client.callTool('get_claude_tabs', {});
    const tabs = JSON.parse(tabsResult.content[0].text);
    
    if (tabs.length === 0) {
      return { success: false, message: 'No Claude tabs available for testing' };
    }
    
    const tabId = tabs[0].id;
    
    const statusResult = await client.callTool('get_claude_response_status', {
      tabId: tabId
    });
    
    const statusText = statusResult.content[0].text;
    const hasStatus = statusText.includes('"status":') && 
                     statusText.includes('"success": true');
    
    return {
      success: hasStatus,
      message: hasStatus ? 'Status retrieved' : 'Status check failed'
    };
  },

  // 9. Conversation List
  async testConversationList(client) {
    const convResult = await client.callTool('get_claude_conversations', {});
    const convText = convResult.content[0].text;
    
    // Check if it's an array (even if empty)
    const isArray = convText.trim().startsWith('[');
    
    return {
      success: isArray,
      message: isArray ? 'Conversation list retrieved' : 'Failed to get conversations'
    };
  }
};

// Main test runner
async function runRegressionTests() {
  console.log(`${colors.blue}🔧 Claude Chrome MCP - Regression Test Suite${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════${colors.reset}\n`);
  
  let client;
  
  try {
    // Create test client
    log('Creating MCP client...', 'yellow');
    client = await createTestClient();
    log('✅ Connected to MCP server\n', 'green');
    
    // Run all tests
    await runTest('Connection Health Check', () => tests.testConnectionHealth(client));
    await runTest('Tab Management', () => tests.testTabManagement(client));
    await runTest('Message Sending with Retry', () => tests.testMessageSendingWithRetry(client));
    await runTest('Metadata Extraction', () => tests.testMetadataExtraction(client));
    await runTest('Export Functionality', () => tests.testExportFunctionality(client));
    await runTest('Batch Operations', () => tests.testBatchOperations(client));
    await runTest('Element Extraction', () => tests.testElementExtraction(client));
    await runTest('Response Status Monitoring', () => tests.testResponseStatus(client));
    await runTest('Conversation List', () => tests.testConversationList(client));
    
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    testResults.failed++;
  } finally {
    if (client) {
      await client.close();
    }
  }
  
  // Print summary
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}📊 Test Summary${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════${colors.reset}\n`);
  
  console.log(`${colors.green}Passed: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testResults.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped: ${testResults.skipped}${colors.reset}`);
  
  if (testResults.errors.length > 0) {
    console.log(`\n${colors.red}Errors:${colors.reset}`);
    testResults.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  const allPassed = testResults.failed === 0 && testResults.errors.length === 0;
  console.log(`\n${allPassed ? colors.green : colors.red}${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}${colors.reset}\n`);
  
  process.exit(allPassed ? 0 : 1);
}

// Handle interruption
process.on('SIGINT', () => {
  console.log(`\n\n${colors.yellow}⚠️  Test suite interrupted${colors.reset}`);
  process.exit(130);
});

// Run the tests
runRegressionTests().catch(error => {
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});