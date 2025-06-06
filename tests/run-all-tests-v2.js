#!/usr/bin/env node

/**
 * Comprehensive test runner for Claude Chrome MCP
 * Version 2: Uses shared MCP client to avoid timeout issues
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const sharedClient = require('./helpers/shared-client');

// Test configurations
const tests = [
  {
    name: 'Event-Driven Completion Detection',
    script: 'test-event-driven-simple.js',
    description: 'Tests new async tools: send_message_async, get_response_async, wait_for_operation'
  },
  {
    name: 'Rapid Message Sending (Issue #2)',
    script: 'test-rapid-messages-v2.js',
    description: 'Tests waitForReady parameter to prevent "Send button not found" errors'
  },
  {
    name: 'Service Worker Stability (Issue #3)',
    script: 'test-service-worker-stability-v2.js',
    description: 'Tests Chrome Alarms API and reconnection improvements'
  },
  {
    name: 'Extract Elements Performance (Issue #4)',
    script: 'test-extract-elements-v2.js',
    description: 'Tests batching and limits for large conversation extraction'
  },
  {
    name: 'Comprehensive Regression Tests',
    script: 'regression-test-suite-v2.js',
    description: 'Full regression test suite covering all MCP tools'
  }
];

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function checkPrerequisites() {
  console.log(`${colors.yellow}📋 Checking prerequisites...${colors.reset}\n`);
  
  // Check if MCP server exists
  try {
    await fs.access(path.join(__dirname, '..', 'mcp-server', 'package.json'));
    console.log('✅ MCP server found');
  } catch {
    console.log('❌ MCP server not found');
    return false;
  }
  
  // Check if test scripts exist
  for (const test of tests) {
    try {
      await fs.access(path.join(__dirname, test.script));
      console.log(`✅ ${test.script} found`);
    } catch {
      console.log(`❌ ${test.script} not found`);
      return false;
    }
  }
  
  // Check Chrome extension
  console.log('\n⚠️  Please ensure:');
  console.log('   - Chrome extension is loaded');
  console.log('   - WebSocket hub is running');
  console.log('   - You have an active internet connection\n');
  
  return true;
}

async function connectSharedClient() {
  console.log(`${colors.yellow}🔌 Establishing shared MCP connection...${colors.reset}`);
  try {
    await sharedClient.connect();
    console.log(`${colors.green}✅ Connected to MCP server${colors.reset}\n`);
    
    // Test connection
    const health = await sharedClient.callTool('system_health', {});
    const healthData = JSON.parse(health.content[0].text);
    
    if (healthData.status !== 'healthy') {
      throw new Error('MCP server is not healthy');
    }
    
    console.log('Connection info:');
    console.log(`  - Client ID: ${sharedClient.clientId}`);
    console.log(`  - Hub connected: ${healthData.hubConnection.connected}`);
    console.log(`  - Chrome alarms: ${healthData.chromeAlarms ? 'Active' : 'Not available'}\n`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}❌ Failed to connect: ${error.message}${colors.reset}`);
    return false;
  }
}

async function runTest(test) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}🧪 Running: ${test.name}${colors.reset}`);
  console.log(`   ${test.description}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  return new Promise((resolve) => {
    const testProcess = spawn('node', [test.script], {
      stdio: 'inherit',
      cwd: __dirname,
      env: {
        ...process.env,
        // Ensure child processes know not to create new connections
        USE_SHARED_MCP_CLIENT: '1'
      }
    });
    
    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`\n${colors.green}✅ ${test.name} - PASSED${colors.reset}`);
        resolve({ test: test.name, status: 'passed' });
      } else {
        console.log(`\n${colors.red}❌ ${test.name} - FAILED (exit code: ${code})${colors.reset}`);
        resolve({ test: test.name, status: 'failed', code });
      }
    });
    
    testProcess.on('error', (error) => {
      console.log(`\n${colors.red}❌ ${test.name} - ERROR: ${error.message}${colors.reset}`);
      resolve({ test: test.name, status: 'error', error: error.message });
    });
  });
}

async function runAllTests() {
  console.log(`${colors.blue}🚀 Claude Chrome MCP - Test Suite v2${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  // Check prerequisites
  if (!await checkPrerequisites()) {
    console.log(`\n${colors.red}❌ Prerequisites check failed${colors.reset}`);
    process.exit(1);
  }
  
  // Connect shared client
  if (!await connectSharedClient()) {
    console.log(`\n${colors.red}❌ Failed to establish MCP connection${colors.reset}`);
    process.exit(1);
  }
  
  // Run tests sequentially
  const results = [];
  const startTime = Date.now();
  
  for (const test of tests) {
    try {
      const result = await runTest(test);
      results.push(result);
    } catch (error) {
      results.push({ test: test.name, status: 'error', error: error.message });
    }
  }
  
  const totalTime = Date.now() - startTime;
  
  // Disconnect shared client
  console.log(`\n${colors.yellow}🔌 Closing shared connection...${colors.reset}`);
  await sharedClient.close();
  
  // Print summary
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}📊 Test Summary${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const errors = results.filter(r => r.status === 'error').length;
  
  results.forEach(result => {
    const statusColor = result.status === 'passed' ? colors.green : colors.red;
    const statusSymbol = result.status === 'passed' ? '✅' : '❌';
    console.log(`${statusSymbol} ${result.test}: ${statusColor}${result.status.toUpperCase()}${colors.reset}`);
  });
  
  console.log(`\n${colors.cyan}───────────────────────────────────────────────────────${colors.reset}`);
  console.log(`Total: ${tests.length} | ${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset} | ${colors.yellow}Errors: ${errors}${colors.reset}`);
  console.log(`Time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`${colors.cyan}───────────────────────────────────────────────────────${colors.reset}\n`);
  
  // Save results
  const resultFile = path.join(__dirname, '..', 'docs', 'development', 'test-results', `${new Date().toISOString().split('T')[0]}-automated.json`);
  const resultData = {
    date: new Date().toISOString(),
    duration: totalTime,
    results: results,
    summary: { total: tests.length, passed, failed, errors }
  };
  
  try {
    await fs.writeFile(resultFile, JSON.stringify(resultData, null, 2));
    console.log(`📄 Results saved to: ${resultFile}`);
  } catch (error) {
    console.error(`⚠️  Failed to save results: ${error.message}`);
  }
  
  // Exit with appropriate code
  if (failed > 0 || errors > 0) {
    console.log(`\n${colors.red}⚠️  Some tests failed${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}🎉 All tests passed!${colors.reset}`);
    console.log('\n✨ The test suite timeout issues have been resolved by using a shared MCP connection.');
  }
}

// Handle interruption
process.on('SIGINT', async () => {
  console.log(`\n\n${colors.yellow}⚠️  Test suite interrupted${colors.reset}`);
  await sharedClient.close();
  process.exit(130);
});

// Run the test suite
runAllTests().catch(async (error) => {
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
  await sharedClient.close();
  process.exit(1);
});