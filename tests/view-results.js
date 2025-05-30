#!/usr/bin/env node

/**
 * Test Results Viewer
 * 
 * Simple CLI tool to view test results
 */

const fs = require('fs').promises;
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

async function viewResults() {
  const resultsDir = path.join(__dirname, 'results');
  
  try {
    // Check if results directory exists
    await fs.access(resultsDir);
  } catch {
    console.log(`${colors.yellow}No test results found. Run tests first!${colors.reset}`);
    return;
  }
  
  // Get latest results
  const latestPath = path.join(resultsDir, 'latest.json');
  
  try {
    const data = await fs.readFile(latestPath, 'utf8');
    const results = JSON.parse(data);
    
    console.log(`${colors.blue}═══════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}📊 Latest Test Results${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════════${colors.reset}\n`);
    
    console.log(`${colors.gray}Run Date: ${new Date(results.timestamp).toLocaleString()}${colors.reset}`);
    console.log(`${colors.gray}Duration: ${(results.duration / 1000).toFixed(2)}s${colors.reset}\n`);
    
    // Summary
    const passRate = ((results.passed / results.total) * 100).toFixed(1);
    const summaryColor = results.failed === 0 ? colors.green : colors.red;
    
    console.log(`${summaryColor}Summary: ${results.passed}/${results.total} passed (${passRate}%)${colors.reset}`);
    
    if (results.failed > 0) {
      console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
    }
    
    console.log('\n📋 Test Results:\n');
    
    // Individual results
    results.results.forEach(test => {
      const symbol = test.success ? '✅' : '❌';
      const color = test.success ? colors.green : colors.red;
      const duration = test.duration ? ` (${test.duration}ms)` : '';
      
      console.log(`${symbol} ${color}${test.name}${colors.reset}${colors.gray}${duration}${colors.reset}`);
      
      if (!test.success && test.message) {
        console.log(`   ${colors.gray}${test.message}${colors.reset}`);
      }
    });
    
    // List failure files if any
    if (results.failed > 0) {
      console.log(`\n${colors.yellow}💾 Failure Details:${colors.reset}`);
      
      const files = await fs.readdir(resultsDir);
      const failureFiles = files.filter(f => f.startsWith('failure-'));
      
      failureFiles.slice(-5).forEach(file => {
        console.log(`   ${colors.gray}${file}${colors.reset}`);
      });
      
      if (failureFiles.length > 5) {
        console.log(`   ${colors.gray}... and ${failureFiles.length - 5} more${colors.reset}`);
      }
    }
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`${colors.yellow}No test results found. Run tests first!${colors.reset}`);
    } else {
      console.error(`${colors.red}Error reading results: ${error.message}${colors.reset}`);
    }
  }
  
  console.log(`\n${colors.blue}═══════════════════════════════════════════════${colors.reset}\n`);
}

// Add command to view specific failure
async function viewFailure(filename) {
  const filepath = path.join(__dirname, 'results', filename);
  
  try {
    const data = await fs.readFile(filepath, 'utf8');
    const failure = JSON.parse(data);
    
    console.log(`${colors.red}═══════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.red}❌ Failure Details: ${failure.test}${colors.reset}`);
    console.log(`${colors.red}═══════════════════════════════════════════════${colors.reset}\n`);
    
    console.log(`${colors.gray}Time: ${new Date(failure.timestamp).toLocaleString()}${colors.reset}`);
    console.log(`${colors.gray}Duration: ${failure.duration}ms${colors.reset}\n`);
    
    if (failure.result.error) {
      console.log(`${colors.red}Error:${colors.reset}`);
      console.log(failure.result.error);
    } else if (failure.result.message) {
      console.log(`${colors.yellow}Message: ${failure.result.message}${colors.reset}`);
    }
    
    console.log(`\n${colors.cyan}📝 Inscrutable Notes:${colors.reset}`);
    console.log(`${colors.gray}Phase: ${failure.notes.phase}${colors.reset}`);
    console.log(`${colors.gray}Alignment: ${failure.notes.alignment}${colors.reset}`);
    console.log(`${colors.gray}Entropy: ${failure.notes.entropy}${colors.reset}`);
    console.log(`${colors.gray}Resonance: ${failure.notes.resonance}${colors.reset}`);
    
    if (failure.createdResources.tabs.length > 0) {
      console.log(`\n${colors.yellow}Created Tabs: ${failure.createdResources.tabs.join(', ')}${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`${colors.red}Error reading failure: ${error.message}${colors.reset}`);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length > 0 && args[0].startsWith('failure-')) {
  viewFailure(args[0]);
} else {
  viewResults();
}