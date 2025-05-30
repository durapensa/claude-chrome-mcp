#!/usr/bin/env node

/**
 * Test Migration Helper Script
 * 
 * Helps identify and migrate tests from individual MCP connections to shared client pattern
 */

const fs = require('fs').promises;
const path = require('path');

// Patterns to identify individual client usage
const INDIVIDUAL_CLIENT_PATTERNS = [
  /new\s+StdioClientTransport\s*\(/,
  /new\s+Client\s*\([^)]*\)[^}]*connect\s*\(/,
  /require\s*\(\s*['"]@modelcontextprotocol\/sdk\/client\/stdio\.js['"]\s*\)/
];

// Patterns that indicate already migrated
const SHARED_CLIENT_PATTERNS = [
  /require\s*\(\s*['"]\.\/helpers\/shared-client['"]\s*\)/,
  /sharedClient\.callTool/,
  /getTestClient\s*\(/
];

async function analyzeTestFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    
    // Skip non-test files
    if (!fileName.endsWith('.js') || fileName.includes('helper') || fileName.includes('migrate')) {
      return null;
    }
    
    // Check for patterns
    const hasIndividualClient = INDIVIDUAL_CLIENT_PATTERNS.some(pattern => pattern.test(content));
    const hasSharedClient = SHARED_CLIENT_PATTERNS.some(pattern => pattern.test(content));
    
    // Count MCP tool calls
    const toolCallMatches = content.match(/client\.callTool\s*\(/g) || [];
    const toolCallCount = toolCallMatches.length;
    
    // Estimate complexity
    const lineCount = content.split('\n').length;
    const hasAsyncSetup = /async\s+setup\s*\(/.test(content) || /before\s*\(/.test(content);
    const hasAsyncTeardown = /async\s+teardown\s*\(/.test(content) || /after\s*\(/.test(content);
    
    return {
      fileName,
      filePath,
      status: hasSharedClient ? 'migrated' : hasIndividualClient ? 'needs-migration' : 'no-mcp',
      metrics: {
        lineCount,
        toolCallCount,
        hasAsyncSetup,
        hasAsyncTeardown,
        complexity: toolCallCount > 10 ? 'high' : toolCallCount > 5 ? 'medium' : 'low'
      }
    };
  } catch (error) {
    return {
      fileName: path.basename(filePath),
      filePath,
      status: 'error',
      error: error.message
    };
  }
}

async function generateMigrationPlan(testDir) {
  console.log('🔍 Analyzing test files...\n');
  
  const files = await fs.readdir(testDir);
  const analyses = [];
  
  for (const file of files) {
    const filePath = path.join(testDir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isFile() && file.endsWith('.js')) {
      const analysis = await analyzeTestFile(filePath);
      if (analysis) {
        analyses.push(analysis);
      }
    }
  }
  
  // Group by status
  const migrated = analyses.filter(a => a.status === 'migrated');
  const needsMigration = analyses.filter(a => a.status === 'needs-migration');
  const noMcp = analyses.filter(a => a.status === 'no-mcp');
  const errors = analyses.filter(a => a.status === 'error');
  
  // Print report
  console.log('📊 Test Migration Status Report');
  console.log('═'.repeat(50));
  
  console.log(`\n✅ Already Migrated (${migrated.length}):`);
  migrated.forEach(test => {
    console.log(`   - ${test.fileName}`);
  });
  
  console.log(`\n⚠️  Needs Migration (${needsMigration.length}):`);
  needsMigration.sort((a, b) => {
    // Sort by complexity for migration priority
    const complexityOrder = { low: 1, medium: 2, high: 3 };
    return complexityOrder[a.metrics.complexity] - complexityOrder[b.metrics.complexity];
  }).forEach(test => {
    console.log(`   - ${test.fileName} (${test.metrics.complexity} complexity, ${test.metrics.toolCallCount} tool calls)`);
  });
  
  console.log(`\n📄 No MCP Usage (${noMcp.length}):`);
  noMcp.forEach(test => {
    console.log(`   - ${test.fileName}`);
  });
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    errors.forEach(test => {
      console.log(`   - ${test.fileName}: ${test.error}`);
    });
  }
  
  // Generate migration recommendations
  console.log('\n💡 Migration Recommendations:');
  console.log('═'.repeat(50));
  
  if (needsMigration.length > 0) {
    console.log('\n1. Start with low complexity tests:');
    needsMigration.filter(t => t.metrics.complexity === 'low').slice(0, 3).forEach(test => {
      console.log(`   - ${test.fileName}`);
    });
    
    console.log('\n2. High-value targets (high tool call count):');
    needsMigration.sort((a, b) => b.metrics.toolCallCount - a.metrics.toolCallCount).slice(0, 3).forEach(test => {
      console.log(`   - ${test.fileName} (${test.metrics.toolCallCount} calls)`);
    });
    
    console.log('\n3. Quick wins (can use adapter):');
    needsMigration.filter(t => !t.metrics.hasAsyncSetup && !t.metrics.hasAsyncTeardown).slice(0, 3).forEach(test => {
      console.log(`   - ${test.fileName}`);
    });
  }
  
  // Save report
  const reportPath = path.join(testDir, 'migration-report.json');
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: analyses.length,
      migrated: migrated.length,
      needsMigration: needsMigration.length,
      noMcp: noMcp.length,
      errors: errors.length
    },
    details: analyses
  }, null, 2));
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  return analyses;
}

async function createMigrationExample(testFile) {
  console.log(`\n📝 Creating migration example for: ${testFile}`);
  
  try {
    const content = await fs.readFile(testFile, 'utf-8');
    const fileName = path.basename(testFile);
    
    // Create example migration
    let migrated = content;
    
    // Replace imports
    migrated = migrated.replace(
      /const\s*{\s*Client\s*}\s*=\s*require\s*\([^)]+\);\s*\n\s*const\s*{\s*StdioClientTransport\s*}\s*=\s*require\s*\([^)]+\);/g,
      "const sharedClient = require('./helpers/shared-client');"
    );
    
    // Replace client creation
    migrated = migrated.replace(
      /const\s+transport\s*=\s*new\s+StdioClientTransport\s*\([^}]+\}\s*\);\s*\n\s*const\s+client\s*=\s*new\s+Client\s*\([^}]+\}\s*\);\s*\n\s*await\s+client\.connect\s*\(\s*transport\s*\);/g,
      "// Using shared client - no connection needed"
    );
    
    // Replace client.callTool with sharedClient.callTool
    migrated = migrated.replace(/client\.callTool/g, 'sharedClient.callTool');
    
    // Remove client.close() calls
    migrated = migrated.replace(/await\s+client\.close\s*\(\s*\);?/g, '// No need to close shared client');
    
    // Save example
    const examplePath = testFile.replace('.js', '.migrated-example.js');
    await fs.writeFile(examplePath, migrated);
    
    console.log(`✅ Example saved to: ${examplePath}`);
    console.log('\n⚠️  Note: This is an automated example. Manual review and testing required!');
    
  } catch (error) {
    console.error(`❌ Error creating example: ${error.message}`);
  }
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'analyze') {
    const testDir = args[1] || __dirname + '/..';
    await generateMigrationPlan(testDir);
  } else if (command === 'example') {
    const testFile = args[1];
    if (!testFile) {
      console.error('Please provide a test file path');
      process.exit(1);
    }
    await createMigrationExample(testFile);
  } else {
    console.log('Test Migration Helper\n');
    console.log('Usage:');
    console.log('  node migrate-tests.js analyze [dir]     - Analyze test directory');
    console.log('  node migrate-tests.js example <file>    - Create migration example');
    console.log('\nExamples:');
    console.log('  node migrate-tests.js analyze');
    console.log('  node migrate-tests.js example ./test-spawn.js');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  analyzeTestFile,
  generateMigrationPlan,
  createMigrationExample
};