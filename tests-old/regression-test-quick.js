#!/usr/bin/env node

/**
 * Quick Regression Test Suite for Claude Chrome MCP
 * 
 * A faster version of the regression test that avoids MCP timeout issues
 * by testing only essential functionality quickly
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

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
  errors: []
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logTest(name, result, details = '') {
  const symbol = result === 'pass' ? '✅' : '❌';
  const color = result === 'pass' ? 'green' : 'red';
  console.log(`${symbol} ${colors[color]}${name}${colors.reset} ${details}`);
  
  if (result === 'pass') testResults.passed++;
  else {
    testResults.failed++;
    if (details) testResults.errors.push(`${name}: ${details}`);
  }
}

async function runTest(name, testFn, timeout = 10000) {
  try {
    console.log(`\n${colors.cyan}Running: ${name}${colors.reset}`);
    
    // Wrap test with timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
    );
    
    const result = await Promise.race([testFn(), timeoutPromise]);
    
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
    name: 'quick-regression-test',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  return client;
}

// Quick test functions
const quickTests = {
  // 1. Basic connection test
  async testConnection(client) {
    try {
      // Just try to list tabs as a connectivity test
      const result = await client.callTool('get_claude_tabs', {});
      const isArray = result.content[0].text.trim().startsWith('[');
      
      return {
        success: isArray,
        message: isArray ? 'Connection working' : 'Invalid response'
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  // 2. Health check
  async testHealth(client) {
    try {
      const result = await client.callTool('system_health', {});
      const health = result.content[0].text;
      const isHealthy = health.includes('"status": "healthy"');
      
      return {
        success: isHealthy,
        message: isHealthy ? 'System healthy' : 'System unhealthy'
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  // 3. List conversations
  async testConversations(client) {
    try {
      const result = await client.callTool('get_claude_conversations', {});
      const isArray = result.content[0].text.trim().startsWith('[');
      
      return {
        success: isArray,
        message: isArray ? 'Retrieved conversations' : 'Invalid response'
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  // 4. Tab creation test (quick)
  async testTabCreation(client) {
    try {
      const result = await client.callTool('spawn_claude_tab', {});
      const tabIdMatch = result.content[0].text.match(/Tab ID: (\d+)/);
      const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
      
      if (!tabId) {
        return { success: false, message: 'Failed to extract tab ID' };
      }
      
      // Wait briefly for tab to stabilize
      await sleep(3000);
      
      // Close it immediately
      await client.callTool('close_claude_tab', {
        tabId: tabId,
        force: true
      });
      
      return {
        success: true,
        message: `Created and closed tab ${tabId}`
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
};

// Main test runner
async function runQuickRegression() {
  console.log(`${colors.blue}🚀 Claude Chrome MCP - Quick Regression Test${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════${colors.reset}\n`);
  
  let client;
  
  try {
    // Create test client
    console.log(`${colors.yellow}Creating MCP client...${colors.reset}`);
    client = await createTestClient();
    console.log(`${colors.green}✅ Connected to MCP server${colors.reset}\n`);
    
    // Run quick tests with individual timeouts
    await runTest('Basic Connection', () => quickTests.testConnection(client), 5000);
    await runTest('Health Check', () => quickTests.testHealth(client), 5000);
    await runTest('List Conversations', () => quickTests.testConversations(client), 5000);
    await runTest('Tab Creation', () => quickTests.testTabCreation(client), 15000);
    
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
  
  if (testResults.errors.length > 0) {
    console.log(`\n${colors.red}Errors:${colors.reset}`);
    testResults.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  const allPassed = testResults.failed === 0;
  console.log(`\n${allPassed ? colors.green : colors.red}${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}${colors.reset}\n`);
  
  process.exit(allPassed ? 0 : 1);
}

// Handle interruption
process.on('SIGINT', () => {
  console.log(`\n\n${colors.yellow}⚠️  Test suite interrupted${colors.reset}`);
  process.exit(130);
});

// Run the tests
runQuickRegression().catch(error => {
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});