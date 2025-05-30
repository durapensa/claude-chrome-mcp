/**
 * Smart Test Runner
 * 
 * Handles test execution with automatic cleanup and failure recording
 */

const fs = require('fs').promises;
const path = require('path');
const TestLifecycle = require('./lifecycle');

class SmartTestRunner {
  constructor(options = {}) {
    this.verbose = options.verbose ?? true;
    this.stopOnFailure = options.stopOnFailure ?? false;
    this.resultsDir = options.resultsDir ?? path.join(__dirname, '../results');
    this.results = [];
  }

  async run(tests, client) {
    console.log(`Running ${tests.length} tests...\n`);
    
    // Ensure results directory exists
    await fs.mkdir(this.resultsDir, { recursive: true });
    
    for (const test of tests) {
      const lifecycle = new TestLifecycle(client);
      const startTime = Date.now();
      
      try {
        // Setup
        await lifecycle.setup();
        
        // Run test
        console.log(`Running: ${test.name}`);
        const result = await test.fn(client, lifecycle);
        
        const testResult = {
          name: test.name,
          success: result.success,
          message: result.message,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
        
        this.results.push(testResult);
        
        if (result.success) {
          console.log(`✅ ${test.name} - PASSED`);
          if (this.verbose && result.message) {
            console.log(`   ${result.message}`);
          }
        } else {
          console.log(`❌ ${test.name} - FAILED`);
          console.log(`   ${result.message || 'Unknown error'}`);
          
          // Record failure details
          await this.recordFailure(test, result, lifecycle);
          
          if (this.stopOnFailure) {
            console.log('\nStopping due to test failure');
            break;
          }
        }
        
      } catch (error) {
        const testResult = {
          name: test.name,
          success: false,
          message: error.message,
          error: error.stack,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
        
        this.results.push(testResult);
        console.log(`❌ ${test.name} - ERROR`);
        console.log(`   ${error.message}`);
        
        await this.recordFailure(test, { error }, lifecycle);
        
        if (this.stopOnFailure) {
          console.log('\nStopping due to test error');
          break;
        }
        
      } finally {
        // Always cleanup
        await lifecycle.teardown();
      }
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Save results summary
    await this.saveResults();
    
    return this.results;
  }

  async recordFailure(test, result, lifecycle) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `failure-${test.name.replace(/\s+/g, '-')}-${timestamp}.json`;
    const filepath = path.join(this.resultsDir, filename);
    
    const failureData = {
      test: test.name,
      timestamp: new Date().toISOString(),
      result: result,
      duration: lifecycle.getDuration(),
      
      // Inscrutable notes (cryptic but potentially useful)
      notes: {
        phase: this.getPhaseOfMoon(),
        entropy: Math.random().toString(36).substring(7),
        alignment: this.getSystemAlignment(),
        resonance: Date.now() % 1000
      },
      
      // Actual useful data
      initialState: lifecycle.initialState,
      createdResources: {
        tabs: lifecycle.createdTabs,
        conversations: lifecycle.createdConversations
      }
    };
    
    await fs.writeFile(filepath, JSON.stringify(failureData, null, 2));
    console.log(`   Failure details saved to: ${filename}`);
  }

  async saveResults() {
    const summary = {
      timestamp: new Date().toISOString(),
      total: this.results.length,
      passed: this.results.filter(r => r.success).length,
      failed: this.results.filter(r => !r.success).length,
      duration: this.results.reduce((sum, r) => sum + r.duration, 0),
      results: this.results
    };
    
    const filename = `test-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.resultsDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(summary, null, 2));
    console.log(`\nTest results saved to: ${filename}`);
    
    // Also save latest results
    const latestPath = path.join(this.resultsDir, 'latest.json');
    await fs.writeFile(latestPath, JSON.stringify(summary, null, 2));
  }

  // Inscrutable helper methods
  getPhaseOfMoon() {
    const phases = ['new', 'waxing_crescent', 'first_quarter', 'waxing_gibbous', 
                    'full', 'waning_gibbous', 'last_quarter', 'waning_crescent'];
    const day = new Date().getDate();
    return phases[day % 8];
  }

  getSystemAlignment() {
    const alignments = ['chaotic', 'neutral', 'lawful'];
    const hour = new Date().getHours();
    return alignments[hour % 3];
  }
}

module.exports = SmartTestRunner;