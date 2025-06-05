// Extension Relay Client for Chrome Extension
// Uses WebSocket relay via offscreen document for persistent connection

import { 
  WEBSOCKET_PORT, 
  KEEPALIVE_INTERVAL, 
  RECONNECT_INTERVAL,
  MESSAGE_TYPES,
  OPERATION_TYPES,
  CLAUDE_AI_URL
} from './config.js';
import { MessageQueue } from './message-queue.js';
import { TabOperationLock } from './tab-operation-lock.js';
import { MCPClient } from './mcp-client.js';
import { tabOperationMethods } from './tab-operations.js';
import { createLogger } from '../utils/logger.js';
import { conversationOperationMethods } from './conversation-operations.js';
import { batchOperationMethods } from './batch-operations.js';
import { debugOperationMethods } from './debug-operations.js';
import { updateBadge } from '../utils/utils.js';

export class ExtensionRelayClient {
  constructor() {
    this.logger = createLogger('relay-client');
    this.connectedClients = new Map();
    this.debuggerSessions = new Map();
    this.requestCounter = 0;
    this.messageQueue = new MessageQueue();
    this.operationLock = new TabOperationLock();
    // ContentScriptManager will be passed in from background script
    this.contentScriptManager = null;
    
    // WebSocket relay configuration
    this.relayConnected = false;
    this.pendingRequests = new Map(); // Track requests awaiting responses
    
    // Track extension startup for reload confirmation
    this.startupTimestamp = Date.now();
    
    this.logger.info('WebSocket ExtensionRelayClient created', { startupTimestamp: this.startupTimestamp });
  }

  async init() {
    this.logger.info('Initializing WebSocket ExtensionRelayClient');
    
    // Setup listeners
    this.setupEventListeners();
    this.logger.info('WebSocket ExtensionRelayClient initialized');
  }

  isConnected() {
    return this.relayConnected;
  }

  async connectToRelay() {
    // Connection is handled by offscreen document
    this.logger.debug('WebSocket connection handled by offscreen document');
  }


  async executeCommand(command) {
    this.logger.debug('Executing command', { commandType: command.type });
    
    try {
      // Route to appropriate handler based on command type
      let result;
      
      switch (command.type) {
        case 'spawn_claude_dot_ai_tab':
          result = await this.spawnClaudeTab(command.params || {});
          break;
        case 'send_message_async':
          result = await this.sendMessageAsync(command.params || {});
          break;
        case 'get_claude_dot_ai_response':
          result = await this.getClaudeResponse(command.params || {});
          break;
        case 'start_network_inspection':
          result = await this.startNetworkInspection(command.params || {});
          break;
        case 'stop_network_inspection':
          result = await this.stopNetworkInspection(command.params || {});
          break;
        case 'get_captured_requests':
          result = await this.getCapturedRequests(command.params || {});
          break;
        case 'forward_response_to_claude_dot_ai_tab':
          result = await this.forwardResponseToClaudeTab(command.params || {});
          break;
        case 'reload_extension':
          result = await this.reloadExtension(command.params || {});
          break;
        case 'get_claude_dot_ai_tabs':
          result = await this.getClaudeTabs(command.params || {});
          break;
        case 'close_claude_dot_ai_tab':
          result = await this.closeClaudeTab(command.params || {});
          break;
        case 'open_claude_dot_ai_conversation_tab':
          result = await this.openClaudeConversationTab(command.params || {});
          break;
        case 'send_message_to_claude_dot_ai_tab':
          result = await this.sendMessageToClaudeTab(command.params || {});
          break;
        case 'batch_send_messages':
          result = await this.batchSendMessages(command.params || {});
          break;
        case 'batch_get_responses':
          result = await this.batchGetResponses(command.params || {});
          break;
        case 'get_claude_dot_ai_response_status':
          result = await this.getClaudeResponseStatus(command.params || {});
          break;
        case 'extract_conversation_elements':
          result = await this.extractConversationElements(command.params || {});
          break;
        case 'export_conversation_transcript':
          result = await this.exportConversationTranscript(command.params || {});
          break;
        case 'get_claude_conversations':
          result = await this.getClaudeConversations(command.params || {});
          break;
        case 'get_conversation_metadata':
          result = await this.getConversationMetadata(command.params || {});
          break;
        case 'delete_claude_conversation':
          result = await this.deleteClaudeConversation(command.params || {});
          break;
        case 'search_claude_conversations':
          result = await this.searchClaudeConversations(command.params || {});
          break;
        case 'bulk_delete_conversations':
          result = await this.bulkDeleteConversations(command.params || {});
          break;
        case 'debug_attach':
          result = await this.attachDebugger((command.params || {}).tabId);
          break;
        case 'execute_script':
          result = await this.executeScript(command.params || {});
          break;
        case 'get_dom_elements':
          result = await this.getDomElements(command.params || {});
          break;
        case 'debug_claude_dot_ai_page':
          result = await this.debugClaudePage(command.params || {});
          break;
        case 'wait_for_operation':
          result = await this.waitForOperation(command.params || {});
          break;
        case 'get_connection_health':
          result = await this.getConnectionHealth(command.params || {});
          break;
        case 'get_extension_logs':
          result = await this.getExtensionLogs(command.params || {});
          break;

        // NEW REORGANIZED TOOL NAMES (backward compatibility routing)
        // System tools
        case 'system_health':
          result = await this.getConnectionHealth(command.params || {});
          break;
        case 'system_wait_operation':
          result = await this.waitForOperation(command.params || {});
          break;
        case 'system_get_logs':
          result = await this.getExtensionLogs(command.params || {});
          break;

        // Chrome tools
        case 'chrome_reload_extension':
          result = await this.reloadExtension(command.params || {});
          break;
        case 'chrome_debug_attach':
          result = await this.attachDebugger((command.params || {}).tabId);
          break;
        case 'chrome_execute_script':
          result = await this.executeScript(command.params || {});
          break;
        case 'chrome_get_dom_elements':
          result = await this.getDomElements(command.params || {});
          break;
        case 'chrome_start_network_monitoring':
          result = await this.startNetworkInspection(command.params || {});
          break;
        case 'chrome_stop_network_monitoring':
          result = await this.stopNetworkInspection(command.params || {});
          break;
        case 'chrome_get_network_requests':
          result = await this.getCapturedRequests(command.params || {});
          break;

        // Tab tools
        case 'tab_create':
          result = await this.spawnClaudeTab(command.params || {});
          break;
        case 'tab_list':
          result = await this.getClaudeTabs(command.params || {});
          break;
        case 'tab_close':
          result = await this.closeClaudeTab(command.params || {});
          break;
        case 'tab_send_message':
          // Route based on waitForCompletion parameter
          if (command.params && command.params.waitForCompletion) {
            result = await this.sendMessageToClaudeTab(command.params);
          } else {
            result = await this.sendMessageAsync(command.params || {});
          }
          break;
        case 'tab_get_response':
          result = await this.getClaudeResponse(command.params || {});
          break;
        case 'tab_get_response_status':
          result = await this.getClaudeResponseStatus(command.params || {});
          break;
        case 'tab_forward_response':
          result = await this.forwardResponseToClaudeTab(command.params || {});
          break;
        case 'tab_extract_elements':
          result = await this.extractConversationElements(command.params || {});
          break;
        case 'tab_export_conversation':
          result = await this.exportConversationTranscript(command.params || {});
          break;
        case 'tab_debug_page':
          result = await this.debugClaudePage(command.params || {});
          break;
        case 'tab_batch_operations':
          result = await this.handleTabBatchOperations(command.params || {});
          break;

        // API tools
        case 'api_list_conversations':
          result = await this.getClaudeConversations(command.params || {});
          break;
        case 'api_search_conversations':
          result = await this.searchClaudeConversations(command.params || {});
          break;
        case 'api_get_conversation_metadata':
          result = await this.getConversationMetadata(command.params || {});
          break;
        case 'api_get_conversation_url':
          result = await this.getConversationUrl(command.params || {});
          break;
        case 'api_delete_conversations':
          result = await this.handleApiDeleteConversations(command.params || {});
          break;

        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
      
      // Return the result - caller will handle how to send it
      return result;
      
    } catch (error) {
      console.error(`CCM Extension: Command execution failed:`, error);
      throw error; // Let the caller handle error response
    }
  }


  disconnect() {
    console.log('CCM Extension: Disconnecting WebSocket relay...');
    
    this.relayConnected = false;
    this.messageQueue.setConnected(false);
    updateBadge('relay-disconnected');
    
    // Clear any pending requests
    for (const [requestId, { reject }] of this.pendingRequests) {
      reject(new Error('Connection disconnected'));
    }
    this.pendingRequests.clear();
    
    console.log('CCM Extension: WebSocket relay disconnected');
  }

  clearAllClients() {
    // Clear connected clients map
    const previousCount = this.connectedClients.size;
    this.connectedClients.clear();
    
    console.log(`CCM Extension: Cleared ${previousCount} client connections`);
  }

  // State management
  getCurrentState() {
    return {
      relayConnected: this.relayConnected,
      connectedClients: Array.from(this.connectedClients.values()),
      extensionConnected: this.relayConnected,
      timestamp: Date.now()
    };
  }

  setupEventListeners() {
    // Listen for relay status updates from offscreen document
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'relay_connection_status') {
        this.handleRelayStatus(message);
      } else if (message.type === 'relay_message') {
        this.handleRelayMessage(message);
      }
    });
    
    console.log('CCM Extension: Event listeners setup complete');
  }

  // Handle MCP tool requests
  async handleMCPToolRequest(tool, params) {
    console.log(`CCM Extension: Handling MCP tool request: ${tool}`, params);
    
    // Map tool names to methods
    const toolHandlers = {
      'spawn_claude_dot_ai_tab': () => this.spawnClaudeTab(params),
      'close_claude_dot_ai_tab': () => this.closeClaudeTab(params),
      'get_claude_dot_ai_tabs': () => this.getClaudeTabs(params),
      'focus_claude_dot_ai_tab': () => this.focusClaudeTab(params),
      'send_message_to_claude_dot_ai_tab': () => this.sendMessageToClaudeTab(params),
      'send_message_async': () => this.sendMessageAsync(params),
      'get_claude_dot_ai_response': () => this.getClaudeResponse(params),
      'get_connection_health': () => this.getConnectionHealth(params),
      'extract_conversation_elements': () => this.extractConversationElements(params),
      'export_conversation_transcript': () => this.exportConversationTranscript(params),
      'get_claude_conversations': () => this.getClaudeConversations(params),
      'get_conversation_metadata': () => this.getConversationMetadata(params),
      'delete_claude_conversation': () => this.deleteClaudeConversation(params),
      'search_claude_conversations': () => this.searchClaudeConversations(params),
      'bulk_delete_conversations': () => this.bulkDeleteConversations(params),
      'open_claude_dot_ai_conversation_tab': () => this.openClaudeConversationTab(params),
      'batch_send_messages': () => this.batchSendMessages(params),
      'batch_get_responses': () => this.batchGetResponses(params),
      'get_claude_dot_ai_response_status': () => this.getClaudeResponseStatus(params),
      'debug_attach': () => this.attachDebugger(params.tabId),
      'get_dom_elements': () => this.getDomElements(params),
      'debug_claude_dot_ai_page': () => this.debugClaudePage(params),
      'start_network_inspection': () => this.startNetworkInspection(params),
      'stop_network_inspection': () => this.stopNetworkInspection(params),
      'get_captured_requests': () => this.getCapturedRequests(params),
      'forward_response_to_claude_dot_ai_tab': () => this.forwardResponseToClaudeTab(params),
      'reload_extension': () => this.reloadExtension(params)
    };
    
    const handler = toolHandlers[tool];
    if (handler) {
      return await handler();
    } else {
      throw new Error(`Unknown tool: ${tool}`);
    }
  }

  // Connection health check
  async getConnectionHealth() {
    return {
      success: true,
      health: {
        relayConnected: this.isConnected(),
        connectedClients: Array.from(this.connectedClients.entries()).map(([id, info]) => ({
          id,
          ...info
        })),
        operationLocks: this.operationLock.getAllLocks(),
        messageQueueSize: this.messageQueue.size(),
        contentScriptTabs: this.contentScriptManager ? Array.from(this.contentScriptManager.injectedTabs) : [],
        extensionStartup: {
          timestamp: this.startupTimestamp,
          uptime: Date.now() - this.startupTimestamp,
          startupTime: new Date(this.startupTimestamp).toISOString()
        }
      }
    };
  }

  // Async message sending
  async sendMessageAsync(params) {
    console.log('CCM Extension: sendMessageAsync called with params:', JSON.stringify(params, null, 2));
    const { tabId, message } = params;
    
    if (!tabId || !message) {
      console.log('CCM Extension: Missing required parameters - tabId:', tabId, 'message:', message);
      return { success: false, error: 'Missing required parameters' };
    }
    
    try {
      // Use the synchronous send but don't wait for response
      const result = await this.sendMessageToClaudeTab({
        tabId,
        message,
        waitForReady: true
      });
      
      if (result.success) {
        return {
          success: true,
          operationId: result.operationId,
          message: 'Message sent asynchronously'
        };
      } else {
        return result;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Network inspection methods
  async startNetworkInspection(params) {
    const { tabId } = params;
    
    if (!tabId) {
      return { success: false, error: 'Missing required parameter: tabId' };
    }

    if (!this.debuggerSessions) {
      this.debuggerSessions = new Map();
    }

    if (!this.debuggerSessions.has(tabId)) {
      await this.attachDebugger(tabId);
    }

    // Store captured requests for this tab
    if (!this.capturedRequests) {
      this.capturedRequests = new Map();
    }
    this.capturedRequests.set(tabId, []);

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ success: true, message: 'Network inspection started with event capture' });
        }
      });
    });
  }

  async stopNetworkInspection(params) {
    const { tabId } = params;
    
    if (!tabId) {
      return { success: false, error: 'Missing required parameter: tabId' };
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Network.disable', {}, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ success: true, message: 'Network inspection stopped' });
        }
      });
    });
  }

  async getCapturedRequests(params) {
    const { tabId } = params;
    
    if (!tabId) {
      return { success: false, error: 'Missing required parameter: tabId' };
    }

    const requests = this.capturedRequests?.get(tabId) || [];
    
    return {
      success: true,
      requests: requests,
      count: requests.length
    };
  }

  async forwardResponseToClaudeTab(params) {
    const { sourceTabId, targetTabId, transformTemplate } = params;
    
    if (!sourceTabId || !targetTabId) {
      return { success: false, error: 'Missing required parameters: sourceTabId, targetTabId' };
    }

    // Get response from source tab
    const sourceResponse = await this.getClaudeResponse({ tabId: sourceTabId });
    
    if (!sourceResponse.success) {
      return { success: false, error: 'Failed to get response from source tab' };
    }

    // Extract text from response object
    const responseText = sourceResponse.response?.text || sourceResponse.response || '';
    
    // Transform response if template provided
    let messageToSend = responseText;
    if (transformTemplate) {
      messageToSend = transformTemplate.replace('${response}', responseText);
    }

    // Send to target tab
    const sendResult = await this.sendMessageAsync({ tabId: targetTabId, message: messageToSend });
    
    return {
      success: sendResult.success,
      sourceResponse: responseText,
      transformedMessage: messageToSend,
      sendResult: sendResult
    };
  }

  async attachDebugger(tabId) {
    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.debuggerSessions.set(tabId, true);
          resolve();
        }
      });
    });
  }

  async reloadExtension(params = {}) {
    console.log('CCM Extension: Reloading extension as requested');
    
    try {
      // Schedule reload after a brief delay to allow response to be sent
      setTimeout(() => {
        console.log('CCM Extension: Executing delayed reload...');
        chrome.runtime.reload();
      }, 100);
      
      // Return success immediately - the reload will happen after response is sent
      return {
        success: true,
        message: 'Extension reload scheduled'
      };
    } catch (error) {
      console.error('CCM Extension: Failed to schedule extension reload:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async ensureDebuggerAttached(tabId) {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // Check if debugger is already attached
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => t.id === tabId);
        
        if (!tab) {
          throw new Error(`Tab ${tabId} not found`);
        }
        
        // First test if debugger is already working
        try {
          await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
              expression: 'true',
              returnByValue: true
            }, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(result);
            });
          });
          console.log(`Debugger already working on tab ${tabId}`);
          this.debuggerSessions.set(tabId, { attached: Date.now() });
          return; // Success - debugger is already functional
        } catch (testError) {
          // Debugger not working, try to attach
        }
        
        // Try to attach debugger
        await new Promise((resolve, reject) => {
          chrome.debugger.attach({ tabId }, '1.0', () => {
            if (chrome.runtime.lastError) {
              // Already attached is not an error if it's working
              if (chrome.runtime.lastError.message?.includes('already attached')) {
                resolve();
                return;
              }
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          });
        });
        
        console.log(`Debugger attached to tab ${tabId}`);
        this.debuggerSessions.set(tabId, { attached: Date.now() });
        return;
        
      } catch (error) {
        retries++;
        console.log(`Failed to attach debugger to tab ${tabId} (attempt ${retries}/${maxRetries}):`, error.message);
        
        if (retries >= maxRetries) {
          throw new Error(`Failed to attach debugger after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async executeScript(params) {
    const { tabId, script } = params;
    
    if (!this.debuggerSessions.has(tabId)) {
      await this.ensureDebuggerAttached(tabId);
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: script,
        returnByValue: true,
        awaitPromise: true
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  async extractConversationElements(params) {
    const { tabId } = params;
    
    try {
      await this.ensureDebuggerAttached(tabId);
      
      const script = `
        (function() {
          const artifacts = [];
          const codeBlocks = [];
          const toolUsage = [];
          
          // Extract artifacts with multiple selector strategies
          const artifactSelectors = [
            'iframe[title*="artifact"]',
            'iframe[src*="artifact"]', 
            '[data-testid*="artifact"]',
            '.artifact',
            '[class*="artifact"]',
            'iframe[sandbox]',
            '[data-component*="artifact"]'
          ];
          
          artifactSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((element, index) => {
              let content = '';
              let type = 'unknown';
              
              if (element.tagName === 'IFRAME') {
                try {
                  // Try to access iframe content if same-origin
                  content = element.contentDocument?.documentElement?.outerHTML || 
                           element.outerHTML;
                  type = 'html';
                } catch (e) {
                  // Cross-origin iframe, get what we can
                  content = element.outerHTML;
                  type = 'iframe';
                }
              } else {
                content = element.outerHTML;
                type = element.dataset.type || 'unknown';
              }
              
              // Avoid duplicates
              const isDuplicate = artifacts.some(a => 
                a.content === content || 
                (element.id && a.id === element.id)
              );
              
              if (!isDuplicate) {
                artifacts.push({
                  id: element.id || 'artifact_' + artifacts.length,
                  selector: selector,
                  type: type,
                  title: element.title || element.getAttribute('aria-label') || 'Untitled',
                  content: content.substring(0, 2000), // Limit size
                  elementType: element.tagName.toLowerCase(),
                  attributes: Object.fromEntries(
                    Array.from(element.attributes).map(attr => [attr.name, attr.value])
                  )
                });
              }
            });
          });
          
          // Extract code blocks
          const codeSelectors = [
            'pre code',
            '.highlight',
            '[class*="code-block"]',
            '[data-language]'
          ];
          
          codeSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((element, index) => {
              const content = element.textContent;
              
              // Avoid duplicates
              const isDuplicate = codeBlocks.some(cb => cb.content === content);
              
              if (!isDuplicate && content && content.trim()) {
                codeBlocks.push({
                  id: 'code_' + codeBlocks.length,
                  language: element.className.match(/language-(\\w+)/)?.[1] || 
                           element.dataset.language || 'text',
                  content: content,
                  html: element.outerHTML.substring(0, 500) // Truncate HTML
                });
              }
            });
          });
          
          // Extract tool usage indicators
          const toolIndicators = document.querySelectorAll(
            '[data-testid*="search"], [class*="search"], ' +
            '[data-testid*="repl"], [class*="repl"], ' + 
            '[data-testid*="tool"], [class*="tool-usage"]'
          );
          
          toolIndicators.forEach((element, index) => {
            const content = element.textContent?.trim();
            if (content) {
              toolUsage.push({
                id: 'tool_' + toolUsage.length,
                type: element.dataset.testid || element.className,
                content: content.substring(0, 500),
                html: element.outerHTML.substring(0, 500)
              });
            }
          });
          
          return {
            artifacts,
            codeBlocks,
            toolUsage,
            extractedAt: new Date().toISOString(),
            totalElements: artifacts.length + codeBlocks.length + toolUsage.length
          };
        })()
      `;
      
      const result = await this.executeScript({ tabId, script });
      
      return {
        success: true,
        data: result.result?.value || { artifacts: [], codeBlocks: [], toolUsage: [] },
        tabId: tabId
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tabId: tabId
      };
    }
  }

  // Helper method for createClaudeTab used by conversation operations
  async createClaudeTab() {
    const tab = await chrome.tabs.create({ 
      url: 'https://claude.ai/new',
      active: false
    });
    return tab;
  }

  // Offscreen WebSocket relay methods
  handleRelayStatus(message) {
    console.log('CCM ExtensionRelayClient: Relay status update:', message);
    if (message.status === 'connected') {
      console.log('CCM ExtensionRelayClient: WebSocket relay connected');
      this.relayConnected = true;
      this.messageQueue.setConnected(true);
      updateBadge('relay-connected');
    } else if (message.status === 'disconnected') {
      console.log('CCM ExtensionRelayClient: WebSocket relay disconnected');
      this.relayConnected = false;
      this.messageQueue.setConnected(false);
      updateBadge('relay-disconnected');
      
      // Clear pending requests on disconnect
      for (const [requestId, { reject }] of this.pendingRequests) {
        reject(new Error('Relay disconnected'));
      }
      this.pendingRequests.clear();
    }
  }

  handleRelayMessage(message) {
    // Use proper logger instead of console.log
    this.logMessage('relay-message', `Message from relay: ${message.type}`, message);
    
    // Handle different relay message types
    if (message.type === 'relay_message' && message.data) {
      const data = message.data;
      
      // Check if this is an MCP tool request from an MCP server
      if (data.from && data.id && data.type) {
        this.logMessage('mcp-tool-request', `MCP tool request: ${data.type}`, {
          toolType: data.type,
          hasParams: !!data.params,
          paramType: typeof data.params,
          paramKeys: data.params ? Object.keys(data.params) : null,
          fullParams: data.params,
          requestId: data.id,
          fromClient: data.from
        });
        
        // Execute the command and send response back via relay
        this.executeCommand({
          type: data.type,
          params: data.params || {},
          requestId: data.id
        }).then(result => {
          // Send response back via relay
          this.sendToRelay({
            type: 'unicast',
            targetId: data.from,
            data: {
              id: data.id,
              type: 'response',
              result: result,
              timestamp: Date.now()
            }
          });
        }).catch(error => {
          // Send error response back via relay
          this.sendToRelay({
            type: 'unicast',
            targetId: data.from,
            data: {
              id: data.id,
              type: 'error',
              error: error.message || 'Command execution failed',
              timestamp: Date.now()
            }
          });
        });
      } else if (data.type === 'response' && data.id) {
        // Handle response for a pending request
        const pending = this.pendingRequests.get(data.id);
        if (pending) {
          this.pendingRequests.delete(data.id);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.result);
          }
        }
      }
    } else if (message.type === 'client_list_update') {
      console.log('CCM ExtensionRelayClient: Client list updated:', message.clients);
      // Update connected clients
      this.connectedClients.clear();
      if (message.clients && Array.isArray(message.clients)) {
        // Filter out self (extension) from the list
        const otherClients = message.clients.filter(client => client.type !== 'extension');
        for (const client of otherClients) {
          this.connectedClients.set(client.id, client);
        }
        
        // Update badge based on client count
        if (this.connectedClients.size > 0) {
          updateBadge('mcp-connected');
        } else if (this.relayConnected) {
          updateBadge('relay-connected');
        }
      }
    }
  }

  // Send message via offscreen WebSocket relay
  async sendToRelay(message) {
    if (!this.relayConnected) {
      throw new Error('WebSocket relay not connected');
    }
    
    try {
      await chrome.runtime.sendMessage({
        type: 'send_to_relay',
        data: message
      });
    } catch (error) {
      console.error('CCM ExtensionRelayClient: Failed to send to relay:', error);
      throw error;
    }
  }
  
  // Send request and wait for response via relay
  async sendRequestViaRelay(targetId, type, params) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 30000);
      
      // Send request via relay
      this.sendToRelay({
        type: 'unicast',
        targetId: targetId,
        data: {
          id: requestId,
          type: type,
          params: params,
          timestamp: Date.now()
        }
      }).catch(error => {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  // Get extension logs with filtering
  async getExtensionLogs(params = {}) {
    try {
      // Import the existing logger system
      const { extensionLogger } = await import('../utils/logger.js');
      
      const { level, component, since, limit = 100, format = 'text' } = params;
      
      // Get logs from the existing logger buffer
      const logData = extensionLogger.exportLogs();
      let logs = logData.logs || [];
      
      // Apply filters
      if (level) {
        logs = logs.filter(log => log.level === level);
      }
      
      if (component) {
        logs = logs.filter(log => log.component === component);
      }
      
      if (since) {
        logs = logs.filter(log => new Date(log.timestamp).getTime() >= since);
      }
      
      // Limit results
      logs = logs.slice(-limit);
      
      if (format === 'json') {
        return {
          success: true,
          logs,
          count: logs.length,
          filters: { level, component, since, limit },
          config: logData.config
        };
      } else {
        // Format as readable text
        const formattedLogs = logs.map(log => {
          const dataStr = log.data && Object.keys(log.data).length > 0 ? ` ${JSON.stringify(log.data)}` : '';
          return `[${log.timestamp}] ${log.level} ${log.component}: ${log.message}${dataStr}`;
        }).join('\n');
        
        return {
          success: true,
          logs: formattedLogs,
          count: logs.length,
          filters: { level, component, since, limit }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to get extension logs: ${error.message}`
      };
    }
  }
}

// Mix in all operation methods
Object.assign(ExtensionRelayClient.prototype, tabOperationMethods);
Object.assign(ExtensionRelayClient.prototype, conversationOperationMethods);
Object.assign(ExtensionRelayClient.prototype, batchOperationMethods);
Object.assign(ExtensionRelayClient.prototype, debugOperationMethods);
