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

// Run pre-flight checks first
console.log('⚡ Running pre-flight checks...\n');

const preFlightChild = spawn('node', ['helpers/pre-flight-check.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

preFlightChild.on('exit', (code) => {
  if (code !== 0) {
    console.log('\n❌ Pre-flight checks failed. Please fix the issues above before running tests.');
    process.exit(1);
  }
  
  // Pre-flight passed, run the selected test command
  const [cmd, cmdArgs] = testCommands[command];
  console.log(`Running: ${cmd} ${cmdArgs.join(' ')}\n`);
  
  // Use timeout command to prevent hanging
  const timeoutCmd = process.platform === 'darwin' ? 'gtimeout' : 'timeout';
  const hasTimeout = spawn('which', [timeoutCmd], { stdio: 'ignore' }).on('close', (code) => {
    const finalCmd = code === 0 ? timeoutCmd : cmd;
    const finalArgs = code === 0 ? ['120', cmd, ...cmdArgs] : cmdArgs;
    
    const child = spawn(finalCmd, finalArgs, {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });
    
    child.on('exit', (code) => {
      if (code === 124) {
        console.log('\n❌ Tests timed out after 2 minutes');
        process.exit(1);
      } else if (code === 0) {
        console.log('\n✅ Tests completed successfully!');
      } else {
        console.log(`\n❌ Tests failed with exit code ${code}`);
      }
      process.exit(code);
    });
  });
});