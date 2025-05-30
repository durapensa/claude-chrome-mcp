#!/usr/bin/env node

/**
 * Comprehensive test runner for Claude Chrome MCP
 * 
 * This script runs all test suites to verify fixes for known issues
 * 
 * Usage: node run-all-tests.js
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Test configurations
const tests = [
  {
    name: 'Rapid Message Sending (Issue #2)',
    script: 'test-rapid-messages.js',
    description: 'Tests waitForReady parameter to prevent "Send button not found" errors'
  },
  {
    name: 'Service Worker Stability (Issue #3)',
    script: 'test-service-worker-stability.js',
    description: 'Tests Chrome Alarms API and reconnection improvements'
  },
  {
    name: 'Extract Elements Performance (Issue #4)',
    script: 'test-extract-elements.js',
    description: 'Tests batching and limits for large conversation extraction'
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

async function runTest(test) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}🧪 Running: ${test.name}${colors.reset}`);
  console.log(`   ${test.description}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  return new Promise((resolve, reject) => {
    const testProcess = spawn('node', [test.script], {
      stdio: 'inherit',
      cwd: __dirname
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

async function checkPrerequisites() {
  console.log(`${colors.yellow}📋 Checking prerequisites...${colors.reset}\n`);
  
  // Check if MCP server package.json exists
  try {
    await fs.access(path.join(__dirname, '..', 'mcp-server', 'package.json'));
    console.log('✅ MCP server found');
  } catch {
    console.log('❌ MCP server not found. Please ensure mcp-server directory exists.');
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
  
  console.log('\n✅ All prerequisites met\n');
  return true;
}

async function runAllTests() {
  console.log(`${colors.blue}🚀 Claude Chrome MCP - Comprehensive Test Suite${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  // Check prerequisites
  if (!await checkPrerequisites()) {
    console.log(`\n${colors.red}❌ Prerequisites check failed. Exiting.${colors.reset}`);
    process.exit(1);
  }
  
  // Run tests sequentially
  const results = [];
  for (const test of tests) {
    try {
      const result = await runTest(test);
      results.push(result);
    } catch (error) {
      results.push({ test: test.name, status: 'error', error: error.message });
    }
  }
  
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
  console.log(`${colors.cyan}───────────────────────────────────────────────────────${colors.reset}\n`);
  
  // Exit with appropriate code
  if (failed > 0 || errors > 0) {
    console.log(`${colors.red}⚠️  Some tests failed. Please check the output above.${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}🎉 All tests passed!${colors.reset}`);
    console.log(`\n${colors.yellow}📝 Note: These tests require:${colors.reset}`);
    console.log('   - Chrome extension loaded and connected');
    console.log('   - MCP server will be started by each test');
    console.log('   - Active internet connection');
    console.log('   - Chrome browser accessible\n');
  }
}

// Handle interruption
process.on('SIGINT', () => {
  console.log(`\n\n${colors.yellow}⚠️  Test suite interrupted${colors.reset}`);
  process.exit(130);
});

// Run the test suite
runAllTests().catch(error => {
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});