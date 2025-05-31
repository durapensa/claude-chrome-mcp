#!/usr/bin/env node

/**
 * Production API Discovery Runner
 * 
 * Executes automated API discovery against real Claude.ai using the MCP server.
 * This script orchestrates the discovery process with real network capture.
 */

const { APIDiscovery } = require('../shared/discovery-framework');
const { UIDiscovery } = require('../shared/ui-discovery-framework');
const { API_DISCOVERY_SCENARIOS, UI_DISCOVERY_SCENARIOS } = require('../shared/discovery-scenarios');

// Import shared client for MCP connection
const { TestClientAdapter } = require('./helpers/test-client-adapter');

/**
 * Production MCP Tools Wrapper
 * Interfaces with the real MCP server for actual discovery
 */
class ProductionMCPTools {
  constructor(clientAdapter) {
    this.clientAdapter = clientAdapter;
  }

  async getClient() {
    if (this.clientAdapter.useSharedClient) {
      return await this.clientAdapter.getClient();
    }
    return this.clientAdapter;
  }

  async start_network_inspection({ tabId }) {
    const client = await this.getClient();
    return await client.callTool('start_network_inspection', { tabId });
  }

  async stop_network_inspection({ tabId }) {
    const client = await this.getClient();
    return await client.callTool('stop_network_inspection', { tabId });
  }

  async get_captured_requests({ tabId }) {
    const client = await this.getClient();
    return await client.callTool('get_captured_requests', { tabId });
  }

  async send_message_to_claude_dot_ai_tab({ tabId, message, waitForReady = true }) {
    const client = await this.getClient();
    return await client.callTool('send_message_to_claude_dot_ai_tab', {
      tabId,
      message,
      waitForReady
    });
  }

  async get_claude_conversations(params = {}) {
    const client = await this.getClient();
    return await client.callTool('get_claude_conversations', params);
  }

  async search_claude_conversations(criteria) {
    const client = await this.getClient();
    return await client.callTool('search_claude_conversations', criteria);
  }

  async open_claude_dot_ai_conversation_tab({ conversationId }) {
    const client = await this.getClient();
    return await client.callTool('open_claude_dot_ai_conversation_tab', { conversationId });
  }

  async delete_claude_conversation({ conversationId }) {
    const client = await this.getClient();
    return await client.callTool('delete_claude_conversation', { conversationId });
  }

  async get_claude_dot_ai_response({ tabId }) {
    const client = await this.getClient();
    return await client.callTool('get_claude_dot_ai_response', { tabId });
  }

  async execute_script({ tabId, script }) {
    const client = await this.getClient();
    return await client.callTool('execute_script', { tabId, script });
  }

  async get_claude_dot_ai_tabs() {
    const client = await this.getClient();
    return await client.callTool('get_claude_dot_ai_tabs', {});
  }

  async spawn_claude_dot_ai_tab() {
    const client = await this.getClient();
    return await client.callTool('spawn_claude_dot_ai_tab', {});
  }

  async close_claude_dot_ai_tab({ tabId }) {
    const client = await this.getClient();
    return await client.callTool('close_claude_dot_ai_tab', { tabId });
  }
}

/**
 * Setup test environment
 */
async function setupTestEnvironment(mcpTools) {
  console.log('🚀 Setting up test environment...');
  
  // Get or create Claude.ai tab
  let tabs = await mcpTools.get_claude_dot_ai_tabs();
  
  if (!tabs.tabs || tabs.tabs.length === 0) {
    console.log('   📱 Spawning new Claude.ai tab...');
    const newTab = await mcpTools.spawn_claude_dot_ai_tab();
    tabs = await mcpTools.get_claude_dot_ai_tabs();
  }
  
  const tab = tabs.tabs[0];
  console.log(`   ✅ Using tab: ${tab.id} (${tab.url})`);
  
  return tab.id;
}

/**
 * Run API discovery against real Claude.ai
 */
async function runAPIDiscovery(options = {}) {
  console.log('🔍 Starting Production API Discovery...\n');
  
  const apiDiscovery = new APIDiscovery({
    outputDir: './discovery-data',
    version: new Date().toISOString().slice(0, 19).replace(/[-:]/g, ''),
    enableAPIDiscovery: true,
    changeDetection: true
  });
  
  await apiDiscovery.initialize();
  
  // Connect to MCP server
  const client = new TestClientAdapter();
  await client.getClient();
  
  const mcpTools = new ProductionMCPTools(client);
  
  try {
    // Setup environment
    const tabId = await setupTestEnvironment(mcpTools);
    
    // Select scenarios to run
    const scenariosToRun = options.scenarios || [
      'message_sending_workflow',
      'conversation_management_workflow',
      'conversation_navigation_workflow'
    ];
    
    const scenarios = API_DISCOVERY_SCENARIOS.filter(s => 
      scenariosToRun.includes(s.name)
    );
    
    console.log(`📋 Running ${scenarios.length} API discovery scenarios:\n`);
    scenarios.forEach(s => console.log(`   - ${s.name}: ${s.description}`));
    console.log('');
    
    // Start discovery session
    const session = await apiDiscovery.startDiscoverySession(
      `Production API Discovery - ${new Date().toLocaleDateString()}`,
      scenarios
    );
    
    console.log(`✅ Started session: ${session.name}\n`);
    
    // Execute scenarios
    let totalAPIs = 0;
    let totalChanges = 0;
    
    for (const scenario of scenarios) {
      console.log(`📊 Executing: ${scenario.name}`);
      console.log(`   ${scenario.description}`);
      
      try {
        const discovery = await apiDiscovery.executeScenario(scenario, tabId, mcpTools);
        
        totalAPIs += discovery.discoveredAPIs.length;
        totalChanges += discovery.analysis.changes.length;
        
        console.log(`   ✅ APIs found: ${discovery.discoveredAPIs.length}`);
        console.log(`   🔄 Changes: ${discovery.analysis.changes.length}`);
        console.log(`   ⏱️  Duration: ${Math.round(discovery.duration / 1000)}s\n`);
        
        // Show discovered API endpoints
        if (discovery.discoveredAPIs.length > 0) {
          console.log(`   📡 Discovered endpoints:`);
          for (const api of discovery.discoveredAPIs) {
            const status = api.isNew ? '🆕' : '✅';
            console.log(`      ${status} ${api.method} ${api.endpoint}`);
          }
          console.log('');
        }
        
        // Show detected changes
        if (discovery.analysis.changes.length > 0) {
          console.log(`   🔄 Detected changes:`);
          for (const change of discovery.analysis.changes) {
            console.log(`      - ${change.type}: ${change.description || change.apiId}`);
          }
          console.log('');
        }
        
      } catch (error) {
        console.error(`   ❌ Scenario failed: ${error.message}\n`);
      }
    }
    
    // Complete session and generate reports
    const completedSession = await apiDiscovery.completeSession();
    
    console.log('🎉 API Discovery Complete!\n');
    console.log('📊 Session Summary:');
    console.log(`   • Total APIs discovered: ${totalAPIs}`);
    console.log(`   • New APIs: ${totalAPIs > 0 ? 'See above' : '0'}`);
    console.log(`   • Changes detected: ${totalChanges}`);
    console.log(`   • Knowledge base size: ${apiDiscovery.knowledgeBase.apis.size} APIs`);
    console.log(`   • Session duration: ${Math.round(completedSession.duration / 1000)}s`);
    
    console.log('\n📁 Generated Reports:');
    console.log(`   • JSON: ./discovery-data/reports/api-discovery-${completedSession.id}.json`);
    console.log(`   • Summary: ./discovery-data/reports/api-discovery-${completedSession.id}-summary.md`);
    console.log(`   • Knowledge Base: ./discovery-data/knowledge-base.json`);
    
    return completedSession;
    
  } catch (error) {
    console.error('💥 API Discovery failed:', error);
    throw error;
  } finally {
    if (client.disconnect) {
      await client.disconnect();
    }
  }
}

/**
 * Run UI discovery against real Claude.ai
 */
async function runUIDiscovery(options = {}) {
  console.log('🎨 Starting Production UI Discovery...\n');
  
  const uiDiscovery = new UIDiscovery({
    outputDir: './discovery-data',
    version: new Date().toISOString().slice(0, 19).replace(/[-:]/g, ''),
    enableUIDiscovery: true,
    changeDetection: true
  });
  
  await uiDiscovery.initialize();
  
  // Connect to MCP server
  const client = new TestClientAdapter();
  await client.getClient();
  
  const mcpTools = new ProductionMCPTools(client);
  
  try {
    // Setup environment
    const tabId = await setupTestEnvironment(mcpTools);
    
    // Select scenarios to run
    const scenariosToRun = options.scenarios || [
      'message_interface_elements',
      'conversation_list_elements',
      'response_elements'
    ];
    
    const scenarios = UI_DISCOVERY_SCENARIOS.filter(s => 
      scenariosToRun.includes(s.name)
    );
    
    console.log(`🔍 Running ${scenarios.length} UI discovery scenarios:\n`);
    scenarios.forEach(s => console.log(`   - ${s.name}: ${s.description}`));
    console.log('');
    
    // Start discovery session
    const session = await uiDiscovery.startUIDiscoverySession(
      `Production UI Discovery - ${new Date().toLocaleDateString()}`,
      scenarios
    );
    
    console.log(`✅ Started session: ${session.name}\n`);
    
    // Execute scenarios
    let totalElements = 0;
    let totalChanges = 0;
    let totalReliability = 0;
    let reliabilityCount = 0;
    
    for (const scenario of scenarios) {
      console.log(`🎨 Executing: ${scenario.name}`);
      console.log(`   ${scenario.description}`);
      
      try {
        const discovery = await uiDiscovery.executeUIScenario(scenario, tabId, mcpTools);
        
        totalElements += discovery.discoveredElements.length;
        totalChanges += discovery.analysis.changes.length;
        
        // Calculate average reliability for this scenario
        if (discovery.reliabilityTests.length > 0) {
          const avgReliability = discovery.reliabilityTests.reduce((sum, t) => sum + t.reliability, 0) / discovery.reliabilityTests.length;
          totalReliability += avgReliability;
          reliabilityCount++;
          
          console.log(`   ✅ Elements found: ${discovery.discoveredElements.length}`);
          console.log(`   🎯 Reliability: ${Math.round(avgReliability)}%`);
          console.log(`   🔄 Changes: ${discovery.analysis.changes.length}`);
          console.log(`   ⏱️  Duration: ${Math.round(discovery.duration / 1000)}s\n`);
        }
        
        // Show best selectors
        if (discovery.elementDiscoveries.length > 0) {
          console.log(`   🎯 Best selectors found:`);
          for (const group of discovery.elementDiscoveries) {
            if (group.bestSelector) {
              console.log(`      • ${group.name}: ${group.bestSelector} (${group.reliability}%)`);
            }
          }
          console.log('');
        }
        
        // Show detected changes
        if (discovery.analysis.changes.length > 0) {
          console.log(`   🔄 UI changes detected:`);
          for (const change of discovery.analysis.changes) {
            console.log(`      - ${change.type}: ${change.groupName || change.description}`);
          }
          console.log('');
        }
        
      } catch (error) {
        console.error(`   ❌ Scenario failed: ${error.message}\n`);
      }
    }
    
    // Complete session and generate reports
    const completedSession = await uiDiscovery.completeUISession();
    
    const avgReliability = reliabilityCount > 0 ? Math.round(totalReliability / reliabilityCount) : 0;
    
    console.log('🎉 UI Discovery Complete!\n');
    console.log('📊 Session Summary:');
    console.log(`   • Total elements discovered: ${totalElements}`);
    console.log(`   • Average reliability: ${avgReliability}%`);
    console.log(`   • Changes detected: ${totalChanges}`);
    console.log(`   • Knowledge base size: ${uiDiscovery.knowledgeBase.uiElements.size} element groups`);
    console.log(`   • Session duration: ${Math.round(completedSession.duration / 1000)}s`);
    
    console.log('\n📁 Generated Reports:');
    console.log(`   • JSON: ./discovery-data/reports/ui-discovery-${completedSession.id}.json`);
    console.log(`   • Summary: ./discovery-data/reports/ui-discovery-${completedSession.id}-summary.md`);
    console.log(`   • Knowledge Base: ./discovery-data/knowledge-base.json`);
    
    return completedSession;
    
  } catch (error) {
    console.error('💥 UI Discovery failed:', error);
    throw error;
  } finally {
    if (client.disconnect) {
      await client.disconnect();
    }
  }
}

/**
 * Run complete discovery suite
 */
async function runCompleteDiscovery(options = {}) {
  console.log('🚀 Starting Complete Claude.ai Discovery Suite\n');
  console.log('='.repeat(60));
  
  const results = {
    apiDiscovery: null,
    uiDiscovery: null,
    success: false,
    startTime: new Date(),
    endTime: null,
    duration: 0
  };
  
  try {
    // Run API discovery first
    if (options.skipAPI !== true) {
      results.apiDiscovery = await runAPIDiscovery(options);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Run UI discovery second
    if (options.skipUI !== true) {
      results.uiDiscovery = await runUIDiscovery(options);
    }
    
    results.endTime = new Date();
    results.duration = results.endTime - results.startTime;
    results.success = true;
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 Complete Discovery Suite Summary');
    console.log('='.repeat(60));
    
    if (results.apiDiscovery) {
      const apiCount = results.apiDiscovery.discoveries.reduce((sum, d) => sum + (d.discoveredAPIs?.length || 0), 0);
      console.log(`📡 API Discovery: ${apiCount} endpoints discovered`);
    }
    
    if (results.uiDiscovery) {
      const elementCount = results.uiDiscovery.discoveries.reduce((sum, d) => sum + (d.discoveredElements?.length || 0), 0);
      console.log(`🎨 UI Discovery: ${elementCount} elements discovered`);
    }
    
    console.log(`⏱️  Total Duration: ${Math.round(results.duration / 1000)}s`);
    console.log(`📁 Data Location: ./discovery-data/`);
    
    console.log('\n🎉 Discovery suite completed successfully!');
    console.log('Knowledge base updated with latest Claude.ai structure and APIs.');
    
    return results;
    
  } catch (error) {
    results.endTime = new Date();
    results.duration = results.endTime - results.startTime;
    
    console.error('\n💥 Discovery suite failed:', error);
    console.log(`⏱️  Duration before failure: ${Math.round(results.duration / 1000)}s`);
    
    throw error;
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'complete';
  
  const options = {
    scenarios: args.includes('--quick') ? ['message_sending_workflow'] : undefined,
    skipAPI: args.includes('--ui-only'),
    skipUI: args.includes('--api-only')
  };
  
  let runFunction;
  
  switch (command) {
    case 'api':
      runFunction = () => runAPIDiscovery(options);
      break;
    case 'ui':
      runFunction = () => runUIDiscovery(options);
      break;
    case 'complete':
    default:
      runFunction = () => runCompleteDiscovery(options);
      break;
  }
  
  runFunction()
    .then(() => {
      console.log('\n✅ Discovery completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Discovery failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  runAPIDiscovery,
  runUIDiscovery,
  runCompleteDiscovery,
  ProductionMCPTools
};