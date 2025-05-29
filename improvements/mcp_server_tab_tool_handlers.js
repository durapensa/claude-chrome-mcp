// Additional tool handlers to add to the MCP server's setupToolHandlers() method

setupToolHandlers() {
  // List available tools (add new tools to existing list)
  this.server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // ... existing tools ...
        {
          name: 'close_claude_tab',
          description: 'Close a specific Claude.ai tab by tab ID',
          inputSchema: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'The Chrome tab ID to close'
              },
              force: {
                type: 'boolean',
                description: 'Force close even if there are unsaved changes',
                default: false
              }
            },
            required: ['tabId'],
            additionalProperties: false
          }
        },
        {
          name: 'open_claude_conversation_tab',
          description: 'Open a specific Claude conversation in a new tab using conversation ID',
          inputSchema: {
            type: 'object',
            properties: {
              conversationId: {
                type: 'string',
                description: 'The Claude conversation ID (UUID format) to open'
              },
              activate: {
                type: 'boolean', 
                description: 'Whether to activate the new tab',
                default: true
              },
              waitForLoad: {
                type: 'boolean',
                description: 'Whether to wait for the page to load completely',
                default: true
              },
              loadTimeoutMs: {
                type: 'number',
                description: 'Maximum time to wait for page load in milliseconds',
                default: 10000
              }
            },
            required: ['conversationId'],
            additionalProperties: false
          }
        },
        {
          name: 'start_network_inspection',
          description: 'Start network request monitoring on a tab',
          inputSchema: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'The tab ID to monitor network requests'
              }
            },
            required: ['tabId'],
            additionalProperties: false
          }
        },
        {
          name: 'stop_network_inspection',
          description: 'Stop network request monitoring on a tab',
          inputSchema: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'The tab ID to stop monitoring'
              }
            },
            required: ['tabId'],
            additionalProperties: false
          }
        },
        {
          name: 'get_captured_requests',
          description: 'Get captured network requests from monitoring',
          inputSchema: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'The tab ID to get captured requests for'
              }
            },
            required: ['tabId'],
            additionalProperties: false
          }
        }
      ]
    };
  });

  // Handle tool calls (add new cases to existing switch statement)
  this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;
      
      switch (name) {
        // ... existing cases ...
        
        case 'close_claude_tab':
          result = await this.hubClient.sendRequest('close_claude_tab', args);
          break;
          
        case 'open_claude_conversation_tab':
          result = await this.hubClient.sendRequest('open_claude_conversation_tab', args);
          break;
          
        case 'start_network_inspection':
          result = await this.hubClient.sendRequest('start_network_inspection', args);
          break;
          
        case 'stop_network_inspection':
          result = await this.hubClient.sendRequest('stop_network_inspection', args);
          break;
          
        case 'get_captured_requests':
          result = await this.hubClient.sendRequest('get_captured_requests', args);
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text', 
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });
}

// Additional extension background.js handlers to add to handleMCPClientRequest switch statement

switch (type) {
  // ... existing cases ...
  
  case 'close_claude_tab':
    result = await this.closeClaudeTab(message.params);
    break;
    
  case 'open_claude_conversation_tab':
    result = await this.openClaudeConversationTab(message.params);
    break;
    
  case 'start_network_inspection':
    result = await this.startNetworkInspection(message.params);
    break;
    
  case 'stop_network_inspection':
    result = await this.stopNetworkInspection(message.params);
    break;
    
  case 'get_captured_requests':
    result = await this.getCapturedRequests(message.params);
    break;
    
  // ... rest of existing cases ...
}

// Network monitoring functions for the Chrome extension
class CCMExtensionHub {
  constructor() {
    // ... existing constructor code ...
    this.networkInspectors = new Map(); // tabId -> { inspector, requests }
  }

  /**
   * Start network request monitoring on a specific tab
   */
  async startNetworkInspection(params) {
    const { tabId } = params;
    
    if (!tabId || typeof tabId !== 'number') {
      throw new Error('tabId is required and must be a number');
    }

    try {
      // Check if already monitoring this tab
      if (this.networkInspectors.has(tabId)) {
        return {
          success: true,
          message: 'Network inspection already active for this tab',
          tabId: tabId
        };
      }

      // Ensure debugger is attached
      await this.ensureDebuggerAttached(tabId);

      // Enable network domain
      await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

      // Set up request capture
      const capturedRequests = [];
      const inspector = {
        tabId,
        startTime: Date.now(),
        requests: capturedRequests
      };

      // Listen for network events
      const networkEventHandler = (source, method, params) => {
        if (source.tabId === tabId) {
          switch (method) {
            case 'Network.requestWillBeSent':
              capturedRequests.push({
                type: 'request',
                requestId: params.requestId,
                url: params.request.url,
                method: params.request.method,
                headers: params.request.headers,
                timestamp: params.timestamp,
                wallTime: params.wallTime
              });
              break;
              
            case 'Network.responseReceived':
              const existingRequest = capturedRequests.find(r => r.requestId === params.requestId);
              if (existingRequest) {
                existingRequest.response = {
                  status: params.response.status,
                  statusText: params.response.statusText,
                  headers: params.response.headers,
                  mimeType: params.response.mimeType,
                  timestamp: params.timestamp
                };
              }
              break;
              
            case 'Network.loadingFailed':
              const failedRequest = capturedRequests.find(r => r.requestId === params.requestId);
              if (failedRequest) {
                failedRequest.failed = true;
                failedRequest.errorText = params.errorText;
                failedRequest.timestamp = params.timestamp;
              }
              break;
          }
        }
      };

      chrome.debugger.onEvent.addListener(networkEventHandler);
      inspector.eventHandler = networkEventHandler;

      this.networkInspectors.set(tabId, inspector);

      console.log(`CCM Extension: Started network inspection for tab ${tabId}`);
      
      return {
        success: true,
        tabId: tabId,
        startTime: inspector.startTime,
        message: 'Network inspection started successfully'
      };

    } catch (error) {
      console.error(`CCM Extension: Error starting network inspection for tab ${tabId}:`, error);
      throw new Error(`Failed to start network inspection: ${error.message}`);
    }
  }

  /**
   * Stop network request monitoring on a specific tab
   */
  async stopNetworkInspection(params) {
    const { tabId } = params;
    
    if (!tabId || typeof tabId !== 'number') {
      throw new Error('tabId is required and must be a number');
    }

    try {
      const inspector = this.networkInspectors.get(tabId);
      
      if (!inspector) {
        return {
          success: true,
          message: 'Network inspection was not active for this tab',
          tabId: tabId
        };
      }

      // Remove event listener
      if (inspector.eventHandler) {
        chrome.debugger.onEvent.removeListener(inspector.eventHandler);
      }

      // Disable network domain
      try {
        await new Promise((resolve, reject) => {
          chrome.debugger.sendCommand({ tabId }, 'Network.disable', {}, (result) => {
            if (chrome.runtime.lastError) {
              // Non-fatal error if tab is already closed
              console.warn(`CCM Extension: Error disabling network for tab ${tabId}:`, chrome.runtime.lastError.message);
            }
            resolve(result);
          });
        });
      } catch (error) {
        // Non-fatal
        console.warn(`CCM Extension: Could not disable network domain for tab ${tabId}:`, error.message);
      }

      const requestCount = inspector.requests.length;
      const duration = Date.now() - inspector.startTime;

      // Remove from tracking
      this.networkInspectors.delete(tabId);

      console.log(`CCM Extension: Stopped network inspection for tab ${tabId}, captured ${requestCount} requests`);
      
      return {
        success: true,
        tabId: tabId,
        duration: duration,
        requestCount: requestCount,
        message: 'Network inspection stopped successfully'
      };

    } catch (error) {
      console.error(`CCM Extension: Error stopping network inspection for tab ${tabId}:`, error);
      throw new Error(`Failed to stop network inspection: ${error.message}`);
    }
  }

  /**
   * Get captured network requests for a specific tab
   */
  async getCapturedRequests(params) {
    const { tabId } = params;
    
    if (!tabId || typeof tabId !== 'number') {
      throw new Error('tabId is required and must be a number');
    }

    try {
      const inspector = this.networkInspectors.get(tabId);
      
      if (!inspector) {
        return {
          success: false,
          message: 'Network inspection is not active for this tab',
          tabId: tabId,
          requests: []
        };
      }

      // Filter and format requests for better usability
      const formattedRequests = inspector.requests.map(request => ({
        requestId: request.requestId,
        url: request.url,
        method: request.method,
        status: request.response?.status,
        statusText: request.response?.statusText,
        mimeType: request.response?.mimeType,
        failed: request.failed || false,
        errorText: request.errorText,
        timestamp: request.timestamp,
        wallTime: request.wallTime,
        // Include headers only if specifically requested to avoid large payloads
        hasHeaders: !!(request.headers || request.response?.headers)
      }));

      // Group requests by domain for easier analysis
      const requestsByDomain = {};
      formattedRequests.forEach(req => {
        try {
          const domain = new URL(req.url).hostname;
          if (!requestsByDomain[domain]) {
            requestsByDomain[domain] = [];
          }
          requestsByDomain[domain].push(req);
        } catch (e) {
          // Invalid URL, group under 'unknown'
          if (!requestsByDomain['unknown']) {
            requestsByDomain['unknown'] = [];
          }
          requestsByDomain['unknown'].push(req);
        }
      });

      // Calculate some basic statistics
      const stats = {
        totalRequests: formattedRequests.length,
        successfulRequests: formattedRequests.filter(r => r.status && r.status >= 200 && r.status < 400).length,
        failedRequests: formattedRequests.filter(r => r.failed || (r.status && r.status >= 400)).length,
        domains: Object.keys(requestsByDomain).length,
        monitoringDuration: Date.now() - inspector.startTime
      };

      console.log(`CCM Extension: Retrieved ${formattedRequests.length} network requests for tab ${tabId}`);
      
      return {
        success: true,
        tabId: tabId,
        requests: formattedRequests,
        requestsByDomain: requestsByDomain,
        stats: stats,
        inspectionStartTime: inspector.startTime,
        retrievedAt: Date.now()
      };

    } catch (error) {
      console.error(`CCM Extension: Error getting captured requests for tab ${tabId}:`, error);
      throw new Error(`Failed to get captured requests: ${error.message}`);
    }
  }

  // Clean up network inspectors when tabs are closed
  setupTabCleanup() {
    // Add to existing setupEventListeners() method
    chrome.tabs.onRemoved.addListener((tabId) => {
      // Clean up debugger sessions
      if (this.debuggerSessions.has(tabId)) {
        this.debuggerSessions.delete(tabId);
      }
      
      // Clean up network inspectors
      if (this.networkInspectors.has(tabId)) {
        const inspector = this.networkInspectors.get(tabId);
        if (inspector.eventHandler) {
          chrome.debugger.onEvent.removeListener(inspector.eventHandler);
        }
        this.networkInspectors.delete(tabId);
        console.log(`CCM Extension: Cleaned up network inspector for closed tab ${tabId}`);
      }
    });
  }
}
    
    