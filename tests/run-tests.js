#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Claude Chrome MCP Test Suite v3\n');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'all';

const testCommands = {
  'all': ['npm', ['test']],
  'integration': ['npm', ['run', 'test:integration']],
  'performance': ['npm', ['run', 'test:performance']],
  'resilience': ['npm', ['run', 'test:resilience']],
  'watch': ['npm', ['run', 'test:watch']],
  'verbose': ['npm', ['run', 'test:verbose']]
};

if (command === 'help' || !testCommands[command]) {
  console.log('Usage: node run-tests.js [command]\n');
  console.log('Commands:');
  console.log('  all         - Run all tests (default)');
  console.log('  integration - Run integration tests only');
  console.log('  performance - Run performance tests only');
  console.log('  resilience  - Run resilience tests only');
  console.log('  watch       - Run tests in watch mode');
  console.log('  verbose     - Run tests with verbose output');
  console.log('  help        - Show this help message');
  process.exit(0);
}

// Check if extension is running
console.log('⚡ Pre-flight checks...');
console.log('  - Ensure Chrome extension is loaded');
console.log('  - Ensure MCP server is accessible');
console.log('  - Close any existing Claude.ai tabs\n');

// Run the selected test command
const [cmd, cmdArgs] = testCommands[command];
console.log(`Running: ${cmd} ${cmdArgs.join(' ')}\n`);

const child = spawn(cmd, cmdArgs, {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log('\n✅ Tests completed successfully!');
  } else {
    console.log(`\n❌ Tests failed with exit code ${code}`);
  }
  process.exit(code);
});