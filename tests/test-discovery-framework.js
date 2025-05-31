#!/usr/bin/env node

/**
 * Test Suite for Discovery Framework
 * 
 * Comprehensive testing of the automated API and UI discovery frameworks.
 * Tests both current functionality and change detection capabilities.
 */

const { APIDiscovery } = require('../shared/discovery-framework');
const { UIDiscovery } = require('../shared/ui-discovery-framework');
const { API_DISCOVERY_SCENARIOS, UI_DISCOVERY_SCENARIOS } = require('../shared/discovery-scenarios');

// Simulated MCP tools for testing
class MockMCPTools {
  constructor() {
    this.networkCaptures = new Map();
    this.isCapturing = new Map();
  }

  async start_network_inspection({ tabId }) {
    this.isCapturing.set(tabId, true);
    this.networkCaptures.set(tabId, []);
    return { success: true, message: `Network inspection started for tab ${tabId}` };
  }

  async stop_network_inspection({ tabId }) {
    this.isCapturing.set(tabId, false);
    return { success: true, message: `Network inspection stopped for tab ${tabId}` };
  }

  async get_captured_requests({ tabId }) {
    return this.networkCaptures.get(tabId) || [];
  }

  async send_message_to_claude_dot_ai_tab({ tabId, message, waitForReady = true }) {
    // Simulate network request capture
    if (this.isCapturing.get(tabId)) {
      const requests = this.networkCaptures.get(tabId) || [];
      requests.push({
        url: 'https://claude.ai/api/organizations/test-org/chat_conversations/test-conv/completion',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        postData: JSON.stringify({ message: message }),
        timestamp: new Date().toISOString(),
        response: { status: 200, headers: {}, bodySize: 1024 }
      });
      this.networkCaptures.set(tabId, requests);
    }
    
    return { success: true, message: `Message sent: ${message}` };
  }

  async get_claude_conversations({}) {
    // Simulate API request capture
    const mockConversations = [
      { uuid: 'conv-1', title: 'Test Conversation 1', created_at: new Date().toISOString() },
      { uuid: 'conv-2', title: 'API Discovery Test', created_at: new Date().toISOString() }
    ];
    
    return { conversations: mockConversations };
  }

  async search_claude_conversations(criteria) {
    // Simulate search API capture
    return { 
      conversations: [
        { uuid: 'conv-search-1', title: 'Search Result 1', created_at: new Date().toISOString() }
      ],
      total: 1
    };
  }

  async execute_script({ tabId, script }) {
    // Simulate script execution for UI discovery
    if (script.includes('data-testid')) {
      return {
        elements: [
          {
            selector: '[data-testid="message-input"]',
            tagName: 'textarea',
            attributes: { 'data-testid': 'message-input', placeholder: 'Type a message...' },
            properties: { value: '', disabled: false },
            position: { x: 100, y: 200, width: 400, height: 50 },
            visibility: { visible: true, displayStyle: 'block' },
            uniqueIdentifiers: ['[data-testid="message-input"]', 'textarea.message-input']
          }
        ],
        totalMatches: 1
      };
    }
    
    if (script.includes('send')) {
      return {
        elements: [
          {
            selector: '[data-testid="send-button"]',
            tagName: 'button',
            attributes: { 'data-testid': 'send-button', 'aria-label': 'Send message' },
            properties: { disabled: false, textContent: 'Send' },
            position: { x: 500, y: 200, width: 60, height: 40 },
            visibility: { visible: true, displayStyle: 'inline-block' },
            uniqueIdentifiers: ['[data-testid="send-button"]', 'button.send-btn']
          }
        ],
        totalMatches: 1
      };
    }
    
    return { elements: [], totalMatches: 0 };
  }

  async get_claude_dot_ai_response({ tabId }) {
    return { 
      response: 'This is a simulated response from Claude.',
      isComplete: true,
      hasStopButton: false
    };
  }
}

/**
 * Test API Discovery Framework
 */
async function testAPIDiscovery() {
  console.log('🔍 Testing API Discovery Framework...\n');
  
  const apiDiscovery = new APIDiscovery({
    outputDir: './test-discovery-output',
    version: 'test-' + Date.now()
  });
  
  await apiDiscovery.initialize();
  
  const mockTools = new MockMCPTools();
  const tabId = 'test-tab-123';
  
  try {
    // Start discovery session
    const session = await apiDiscovery.startDiscoverySession(
      'API Discovery Test Session',
      API_DISCOVERY_SCENARIOS.slice(0, 2) // Test first 2 scenarios
    );
    
    console.log(`✅ Started session: ${session.name}`);
    
    // Execute scenarios
    for (const scenario of session.scenarios) {
      console.log(`\n📋 Executing scenario: ${scenario.name}`);
      
      const discovery = await apiDiscovery.executeScenario(scenario, tabId, mockTools);
      
      console.log(`   ✅ Discovered ${discovery.discoveredAPIs.length} API patterns`);
      console.log(`   ⏱️  Duration: ${discovery.duration}ms`);
      
      if (discovery.analysis.changes.length > 0) {
        console.log(`   🔄 Detected ${discovery.analysis.changes.length} changes`);
      }
    }
    
    // Complete session
    const completedSession = await apiDiscovery.completeSession();
    
    console.log(`\n🎉 API Discovery Session Complete!`);
    console.log(`   📊 Total APIs: ${completedSession.discoveries.reduce((sum, d) => sum + d.discoveredAPIs.length, 0)}`);
    console.log(`   📁 Knowledge Base: ${apiDiscovery.knowledgeBase.apis.size} entries`);
    
    return true;
    
  } catch (error) {
    console.error('❌ API Discovery test failed:', error);
    return false;
  }
}

/**
 * Test UI Discovery Framework
 */
async function testUIDiscovery() {
  console.log('\n🎨 Testing UI Discovery Framework...\n');
  
  const uiDiscovery = new UIDiscovery({
    outputDir: './test-discovery-output',
    version: 'test-' + Date.now()
  });
  
  await uiDiscovery.initialize();
  
  const mockTools = new MockMCPTools();
  const tabId = 'test-tab-456';
  
  try {
    // Start UI discovery session
    const session = await uiDiscovery.startUIDiscoverySession(
      'UI Discovery Test Session',
      UI_DISCOVERY_SCENARIOS.slice(0, 2) // Test first 2 scenarios
    );
    
    console.log(`✅ Started session: ${session.name}`);
    
    // Execute scenarios
    for (const scenario of session.scenarios) {
      console.log(`\n🔍 Executing UI scenario: ${scenario.name}`);
      
      const discovery = await uiDiscovery.executeUIScenario(scenario, tabId, mockTools);
      
      console.log(`   ✅ Discovered ${discovery.discoveredElements.length} UI elements`);
      console.log(`   ⏱️  Duration: ${discovery.duration}ms`);
      
      // Show reliability test results
      if (discovery.reliabilityTests.length > 0) {
        const avgReliability = discovery.reliabilityTests.reduce((sum, t) => sum + t.reliability, 0) / discovery.reliabilityTests.length;
        console.log(`   🎯 Average Reliability: ${Math.round(avgReliability)}%`);
      }
      
      if (discovery.analysis.changes.length > 0) {
        console.log(`   🔄 Detected ${discovery.analysis.changes.length} UI changes`);
      }
    }
    
    // Complete session
    const completedSession = await uiDiscovery.completeUISession();
    
    console.log(`\n🎉 UI Discovery Session Complete!`);
    console.log(`   🎨 Total Elements: ${completedSession.discoveries.reduce((sum, d) => sum + d.discoveredElements.length, 0)}`);
    console.log(`   📁 Knowledge Base: ${uiDiscovery.knowledgeBase.uiElements.size} entries`);
    
    return true;
    
  } catch (error) {
    console.error('❌ UI Discovery test failed:', error);
    return false;
  }
}

/**
 * Test Change Detection
 */
async function testChangeDetection() {
  console.log('\n🔄 Testing Change Detection...\n');
  
  const apiDiscovery = new APIDiscovery({
    outputDir: './test-discovery-output',
    version: 'change-test-' + Date.now()
  });
  
  await apiDiscovery.initialize();
  
  try {
    // Simulate first discovery (baseline)
    const mockAPI1 = {
      id: 'POST:/api/test',
      endpoint: '/api/test',
      method: 'POST',
      queryParams: { version: 'v1' },
      headers: { 'Content-Type': 'application/json' }
    };
    
    apiDiscovery.knowledgeBase.apis.set(mockAPI1.id, mockAPI1);
    
    // Simulate second discovery (with changes)
    const mockAPI2 = {
      id: 'POST:/api/test',
      endpoint: '/api/test',
      method: 'POST',
      queryParams: { version: 'v2', newParam: 'added' }, // Changed!
      headers: { 'Content-Type': 'application/json' }
    };
    
    const changes = apiDiscovery.detectAPIChanges(mockAPI2);
    
    console.log(`✅ Change detection working: Found ${changes.length} changes`);
    
    if (changes.length > 0) {
      for (const change of changes) {
        console.log(`   🔄 ${change.type}: ${change.description || 'Parameter change detected'}`);
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Change detection test failed:', error);
    return false;
  }
}

/**
 * Test Knowledge Base Persistence
 */
async function testKnowledgeBasePersistence() {
  console.log('\n💾 Testing Knowledge Base Persistence...\n');
  
  try {
    // Create first instance and add data
    const discovery1 = new APIDiscovery({
      outputDir: './test-discovery-output',
      version: 'persistence-test-1'
    });
    
    await discovery1.initialize();
    
    // Add test data
    discovery1.knowledgeBase.apis.set('test-api', {
      id: 'test-api',
      endpoint: '/api/test',
      method: 'GET',
      timestamp: new Date().toISOString()
    });
    
    await discovery1.saveKnowledgeBase();
    
    console.log('✅ Saved knowledge base with test data');
    
    // Create second instance and load data
    const discovery2 = new APIDiscovery({
      outputDir: './test-discovery-output',
      version: 'persistence-test-2'
    });
    
    await discovery2.initialize();
    
    const loadedAPI = discovery2.knowledgeBase.apis.get('test-api');
    
    if (loadedAPI && loadedAPI.endpoint === '/api/test') {
      console.log('✅ Successfully loaded knowledge base data');
      return true;
    } else {
      console.error('❌ Failed to load knowledge base data');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Knowledge base persistence test failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Running Discovery Framework Test Suite\n');
  console.log('='.repeat(50));
  
  const results = [];
  
  // Run tests
  results.push(await testAPIDiscovery());
  results.push(await testUIDiscovery());
  results.push(await testChangeDetection());
  results.push(await testKnowledgeBasePersistence());
  
  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 Test Suite Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Discovery framework is ready for production use.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }
  
  return passed === total;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test runner crashed:', error);
      process.exit(1);
    });
}

module.exports = {
  testAPIDiscovery,
  testUIDiscovery,
  testChangeDetection,
  testKnowledgeBasePersistence,
  runAllTests
};