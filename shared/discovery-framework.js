/**
 * Claude.ai API and UI Discovery Framework
 * 
 * Automated discovery system for Claude.ai internal APIs and web UI elements.
 * Built for continuous monitoring of changes made by Anthropic to the platform.
 * 
 * Features:
 * - API endpoint discovery through network traffic analysis
 * - UI element discovery through DOM analysis  
 * - Change detection across versions
 * - Knowledge base maintenance
 * - Automated documentation generation
 */

const fs = require('fs').promises;
const path = require('path');

class DiscoveryFramework {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './discovery-data',
      version: options.version || this.getCurrentVersion(),
      enableAPIDiscovery: options.enableAPIDiscovery !== false,
      enableUIDiscovery: options.enableUIDiscovery !== false,
      changeDetection: options.changeDetection !== false,
      ...options
    };
    
    this.knowledgeBase = {
      apis: new Map(),
      uiElements: new Map(),
      metadata: {
        lastDiscovery: null,
        version: this.options.version,
        discoveryCount: 0
      }
    };
    
    this.discoveryHistory = [];
  }

  /**
   * Get current version timestamp for discovery versioning
   */
  getCurrentVersion() {
    return new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
  }

  /**
   * Initialize discovery framework
   */
  async initialize() {
    await this.ensureOutputDirectory();
    await this.loadExistingKnowledgeBase();
    console.log(`Discovery Framework initialized - Version ${this.options.version}`);
  }

  /**
   * Ensure output directory structure exists
   */
  async ensureOutputDirectory() {
    const dirs = [
      this.options.outputDir,
      path.join(this.options.outputDir, 'apis'),
      path.join(this.options.outputDir, 'ui-elements'), 
      path.join(this.options.outputDir, 'versions'),
      path.join(this.options.outputDir, 'changes'),
      path.join(this.options.outputDir, 'reports')
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }

  /**
   * Load existing knowledge base from storage
   */
  async loadExistingKnowledgeBase() {
    try {
      const kbPath = path.join(this.options.outputDir, 'knowledge-base.json');
      const data = await fs.readFile(kbPath, 'utf8');
      const kb = JSON.parse(data);
      
      // Convert arrays back to Maps
      this.knowledgeBase.apis = new Map(kb.apis || []);
      this.knowledgeBase.uiElements = new Map(kb.uiElements || []);
      this.knowledgeBase.metadata = kb.metadata || this.knowledgeBase.metadata;
      
      console.log(`Loaded existing knowledge base: ${this.knowledgeBase.apis.size} APIs, ${this.knowledgeBase.uiElements.size} UI elements`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load existing knowledge base:', error.message);
      }
    }
  }

  /**
   * Save knowledge base to storage
   */
  async saveKnowledgeBase() {
    const kbPath = path.join(this.options.outputDir, 'knowledge-base.json');
    const data = {
      apis: Array.from(this.knowledgeBase.apis.entries()),
      uiElements: Array.from(this.knowledgeBase.uiElements.entries()),
      metadata: this.knowledgeBase.metadata
    };
    
    await fs.writeFile(kbPath, JSON.stringify(data, null, 2));
    
    // Also save version-specific snapshot
    const versionPath = path.join(this.options.outputDir, 'versions', `kb-${this.options.version}.json`);
    await fs.writeFile(versionPath, JSON.stringify(data, null, 2));
  }
}

/**
 * API Discovery System
 */
class APIDiscovery extends DiscoveryFramework {
  constructor(options = {}) {
    super(options);
    this.networkCapture = null;
    this.activeDiscoverySession = null;
  }

  /**
   * Start automated API discovery session
   */
  async startDiscoverySession(sessionName, scenarios = []) {
    const session = {
      id: `api-discovery-${Date.now()}`,
      name: sessionName,
      version: this.options.version,
      startTime: new Date().toISOString(),
      scenarios: scenarios,
      discoveries: [],
      networkCaptures: []
    };

    this.activeDiscoverySession = session;
    console.log(`Started API discovery session: ${sessionName}`);
    
    return session;
  }

  /**
   * Execute discovery scenario with network capture
   */
  async executeScenario(scenario, tabId, mcpTools) {
    if (!this.activeDiscoverySession) {
      throw new Error('No active discovery session. Call startDiscoverySession() first.');
    }

    console.log(`Executing scenario: ${scenario.name}`);
    
    try {
      // Start network capture
      await mcpTools.start_network_inspection({ tabId });
      
      // Wait for network monitoring to initialize
      await this.delay(1000);
      
      // Execute scenario operations
      const startTime = Date.now();
      const operationResults = await this.executeScenarioOperations(scenario, tabId, mcpTools);
      const endTime = Date.now();
      
      // Capture network requests
      const capturedRequests = await mcpTools.get_captured_requests({ tabId });
      
      // Stop network capture
      await mcpTools.stop_network_inspection({ tabId });
      
      // Analyze captured data
      const analysis = this.analyzeNetworkCapture(capturedRequests, scenario);
      
      // Store discovery results
      const discovery = {
        scenarioName: scenario.name,
        timestamp: new Date().toISOString(),
        duration: endTime - startTime,
        operations: operationResults,
        networkCapture: capturedRequests,
        analysis: analysis,
        discoveredAPIs: analysis.apis || []
      };
      
      this.activeDiscoverySession.discoveries.push(discovery);
      this.updateKnowledgeBase(analysis);
      
      console.log(`Scenario complete: ${scenario.name} - Discovered ${analysis.apis?.length || 0} API patterns`);
      
      return discovery;
      
    } catch (error) {
      console.error(`Scenario failed: ${scenario.name}`, error);
      throw error;
    }
  }

  /**
   * Execute individual scenario operations
   */
  async executeScenarioOperations(scenario, tabId, mcpTools) {
    const results = [];
    
    for (const operation of scenario.operations) {
      try {
        console.log(`  Executing operation: ${operation.type}`);
        
        const startTime = Date.now();
        let result;
        
        switch (operation.type) {
          case 'send_message':
            result = await mcpTools.send_message_to_claude_dot_ai_tab({
              tabId,
              message: operation.message,
              waitForReady: true
            });
            break;
            
          case 'get_conversations':
            result = await mcpTools.get_claude_conversations({});
            break;
            
          case 'search_conversations':
            result = await mcpTools.search_claude_conversations(operation.searchCriteria || {});
            break;
            
          case 'open_conversation':
            result = await mcpTools.open_claude_dot_ai_conversation_tab({
              conversationId: operation.conversationId
            });
            break;
            
          case 'delete_conversation':
            result = await mcpTools.delete_claude_conversation({
              conversationId: operation.conversationId
            });
            break;
            
          case 'get_response':
            result = await mcpTools.get_claude_dot_ai_response({ tabId });
            break;
            
          case 'custom_script':
            result = await mcpTools.execute_script({
              tabId,
              script: operation.script
            });
            break;
            
          case 'delay':
            await this.delay(operation.duration || 1000);
            result = { type: 'delay', duration: operation.duration };
            break;
            
          default:
            console.warn(`Unknown operation type: ${operation.type}`);
            continue;
        }
        
        const endTime = Date.now();
        
        results.push({
          operation: operation.type,
          duration: endTime - startTime,
          success: true,
          result: result,
          timestamp: new Date().toISOString()
        });
        
        // Small delay between operations to avoid rate limiting
        await this.delay(operation.delay || 500);
        
      } catch (error) {
        console.error(`Operation failed: ${operation.type}`, error);
        results.push({
          operation: operation.type,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return results;
  }

  /**
   * Analyze network capture for API patterns
   */
  analyzeNetworkCapture(capturedRequests, scenario) {
    const analysis = {
      scenario: scenario.name,
      timestamp: new Date().toISOString(),
      totalRequests: capturedRequests.length,
      apis: [],
      patterns: [],
      changes: []
    };

    // Filter for Claude.ai API requests
    const claudeRequests = capturedRequests.filter(req => 
      req.url?.includes('claude.ai/api') || 
      req.url?.includes('anthropic.com/api')
    );

    // Analyze each API request
    for (const request of claudeRequests) {
      const apiInfo = this.extractAPIInfo(request);
      if (apiInfo) {
        analysis.apis.push(apiInfo);
        
        // Check for changes from known APIs
        const changes = this.detectAPIChanges(apiInfo);
        if (changes.length > 0) {
          analysis.changes.push(...changes);
        }
      }
    }

    // Identify patterns
    analysis.patterns = this.identifyAPIPatterns(analysis.apis);

    return analysis;
  }

  /**
   * Extract API information from network request
   */
  extractAPIInfo(request) {
    try {
      const url = new URL(request.url);
      
      const apiInfo = {
        id: this.generateAPIId(request),
        endpoint: url.pathname,
        fullURL: request.url,
        method: request.method,
        baseURL: url.origin,
        queryParams: Object.fromEntries(url.searchParams),
        headers: request.headers || {},
        timestamp: request.timestamp || new Date().toISOString(),
        scenario: this.activeDiscoverySession?.name,
        
        // Request details
        requestBody: request.postData,
        requestSize: request.postData?.length || 0,
        
        // Response details (if available)
        responseStatus: request.response?.status,
        responseHeaders: request.response?.headers || {},
        responseSize: request.response?.bodySize || 0,
        responseTime: request.response?.timing?.total || 0,
        
        // Classification
        category: this.classifyAPI(url.pathname, request.method),
        isNew: !this.knowledgeBase.apis.has(this.generateAPIId(request))
      };

      return apiInfo;
    } catch (error) {
      console.warn('Failed to extract API info from request:', error);
      return null;
    }
  }

  /**
   * Generate unique API identifier
   */
  generateAPIId(request) {
    const url = new URL(request.url);
    // Create stable ID based on endpoint pattern and method
    const pathPattern = url.pathname.replace(/\/[a-f0-9-]{36}/g, '/{id}'); // Replace UUIDs
    return `${request.method}:${pathPattern}`;
  }

  /**
   * Classify API endpoint by purpose
   */
  classifyAPI(pathname, method) {
    const path = pathname.toLowerCase();
    
    if (path.includes('chat_conversations')) {
      if (method === 'GET') return 'conversation_list';
      if (method === 'POST') return 'conversation_create';
      if (method === 'DELETE') return 'conversation_delete';
      if (method === 'PUT' || method === 'PATCH') return 'conversation_update';
    }
    
    if (path.includes('completion')) return 'message_completion';
    if (path.includes('messages')) return 'message_operations';
    if (path.includes('files')) return 'file_operations';
    if (path.includes('organizations')) return 'organization_operations';
    if (path.includes('auth')) return 'authentication';
    
    return 'unknown';
  }

  /**
   * Detect changes from known APIs
   */
  detectAPIChanges(apiInfo) {
    const changes = [];
    const existingAPI = this.knowledgeBase.apis.get(apiInfo.id);
    
    if (!existingAPI) {
      changes.push({
        type: 'new_api',
        apiId: apiInfo.id,
        description: `New API discovered: ${apiInfo.method} ${apiInfo.endpoint}`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Check for changes in existing API
      if (JSON.stringify(existingAPI.queryParams) !== JSON.stringify(apiInfo.queryParams)) {
        changes.push({
          type: 'query_params_changed',
          apiId: apiInfo.id,
          old: existingAPI.queryParams,
          new: apiInfo.queryParams,
          timestamp: new Date().toISOString()
        });
      }
      
      if (JSON.stringify(existingAPI.headers) !== JSON.stringify(apiInfo.headers)) {
        changes.push({
          type: 'headers_changed',
          apiId: apiInfo.id,
          description: 'Request headers modified',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return changes;
  }

  /**
   * Identify patterns in discovered APIs
   */
  identifyAPIPatterns(apis) {
    const patterns = [];
    
    // Group by category
    const categories = apis.reduce((acc, api) => {
      acc[api.category] = acc[api.category] || [];
      acc[api.category].push(api);
      return acc;
    }, {});
    
    // Analyze patterns within categories
    for (const [category, categoryAPIs] of Object.entries(categories)) {
      if (categoryAPIs.length > 1) {
        patterns.push({
          type: 'category_pattern',
          category: category,
          count: categoryAPIs.length,
          endpoints: categoryAPIs.map(api => api.endpoint),
          commonPath: this.findCommonPath(categoryAPIs.map(api => api.endpoint))
        });
      }
    }
    
    return patterns;
  }

  /**
   * Find common path in endpoints
   */
  findCommonPath(endpoints) {
    if (endpoints.length === 0) return '';
    
    const segments = endpoints[0].split('/');
    let commonPath = '';
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (endpoints.every(endpoint => endpoint.split('/')[i] === segment)) {
        commonPath += (commonPath ? '/' : '') + segment;
      } else {
        break;
      }
    }
    
    return commonPath;
  }

  /**
   * Update knowledge base with new discoveries
   */
  updateKnowledgeBase(analysis) {
    for (const api of analysis.apis) {
      this.knowledgeBase.apis.set(api.id, {
        ...api,
        lastSeen: new Date().toISOString(),
        discoveryCount: (this.knowledgeBase.apis.get(api.id)?.discoveryCount || 0) + 1
      });
    }
    
    this.knowledgeBase.metadata.lastDiscovery = new Date().toISOString();
    this.knowledgeBase.metadata.discoveryCount += 1;
  }

  /**
   * Complete discovery session and generate reports
   */
  async completeSession() {
    if (!this.activeDiscoverySession) {
      throw new Error('No active discovery session');
    }

    const session = this.activeDiscoverySession;
    session.endTime = new Date().toISOString();
    session.duration = new Date(session.endTime) - new Date(session.startTime);
    
    // Generate session report
    await this.generateSessionReport(session);
    
    // Save knowledge base
    await this.saveKnowledgeBase();
    
    // Add to history
    this.discoveryHistory.push(session);
    
    console.log(`Discovery session completed: ${session.name}`);
    console.log(`Total discoveries: ${session.discoveries.length}`);
    console.log(`Total APIs found: ${session.discoveries.reduce((sum, d) => sum + (d.discoveredAPIs?.length || 0), 0)}`);
    
    this.activeDiscoverySession = null;
    return session;
  }

  /**
   * Generate detailed session report
   */
  async generateSessionReport(session) {
    const reportData = {
      session: {
        id: session.id,
        name: session.name,
        version: session.version,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration
      },
      summary: {
        totalScenarios: session.scenarios.length,
        totalDiscoveries: session.discoveries.length,
        totalAPIs: session.discoveries.reduce((sum, d) => sum + (d.discoveredAPIs?.length || 0), 0),
        newAPIs: session.discoveries.reduce((sum, d) => sum + (d.discoveredAPIs?.filter(api => api.isNew).length || 0), 0)
      },
      discoveries: session.discoveries,
      knowledgeBaseStats: {
        totalAPIs: this.knowledgeBase.apis.size,
        lastDiscovery: this.knowledgeBase.metadata.lastDiscovery,
        discoveryCount: this.knowledgeBase.metadata.discoveryCount
      }
    };

    const reportPath = path.join(this.options.outputDir, 'reports', `api-discovery-${session.id}.json`);
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    
    // Generate human-readable summary
    const summaryPath = path.join(this.options.outputDir, 'reports', `api-discovery-${session.id}-summary.md`);
    const summary = this.generateMarkdownSummary(reportData);
    await fs.writeFile(summaryPath, summary);
  }

  /**
   * Generate markdown summary of discovery session
   */
  generateMarkdownSummary(reportData) {
    const { session, summary, discoveries } = reportData;
    
    let markdown = `# API Discovery Report: ${session.name}\n\n`;
    markdown += `**Session ID**: ${session.id}\n`;
    markdown += `**Version**: ${session.version}\n`;
    markdown += `**Duration**: ${Math.round(session.duration / 1000)}s\n`;
    markdown += `**Date**: ${new Date(session.startTime).toLocaleDateString()}\n\n`;
    
    markdown += `## Summary\n\n`;
    markdown += `- **Total Scenarios**: ${summary.totalScenarios}\n`;
    markdown += `- **Total APIs Discovered**: ${summary.totalAPIs}\n`;
    markdown += `- **New APIs**: ${summary.newAPIs}\n\n`;
    
    markdown += `## Discovered APIs\n\n`;
    
    const allAPIs = discoveries.flatMap(d => d.discoveredAPIs || []);
    const apisByCategory = allAPIs.reduce((acc, api) => {
      acc[api.category] = acc[api.category] || [];
      acc[api.category].push(api);
      return acc;
    }, {});
    
    for (const [category, apis] of Object.entries(apisByCategory)) {
      markdown += `### ${category.replace(/_/g, ' ').toUpperCase()}\n\n`;
      
      for (const api of apis) {
        markdown += `- **${api.method} ${api.endpoint}**${api.isNew ? ' *(NEW)*' : ''}\n`;
        if (Object.keys(api.queryParams).length > 0) {
          markdown += `  - Query params: ${Object.keys(api.queryParams).join(', ')}\n`;
        }
        markdown += `  - Status: ${api.responseStatus || 'Unknown'}\n`;
        markdown += `  - Response time: ${api.responseTime || 'Unknown'}ms\n\n`;
      }
    }
    
    return markdown;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = {
  DiscoveryFramework,
  APIDiscovery
};