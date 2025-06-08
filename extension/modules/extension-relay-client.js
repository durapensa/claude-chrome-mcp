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
import { MessageRelayQueue } from './message-relay-queue.js';
import { TabOperationLock } from './tab-operation-lock.js';
import { MCPRelayClient } from './mcp-relay-client.js';
import { tabOperations } from './tab-operations.js';
import { createLogger, extensionLogger } from '../utils/logger.js';
import { conversationOperations } from './conversation-operations.js';
import { tabBatchOperations } from './tab-batch-operations.js';
import { chromeDebugOperations } from './chrome-debug-operations.js';
import { updateBadge } from '../utils/utils.js';

export class ExtensionRelayClient {
  constructor() {
    this.logger = createLogger('relay-client');
    this.connectedClients = new Map();
    this.debuggerSessions = new Map();
    this.requestCounter = 0;
    this.messageQueue = new MessageRelayQueue();
    this.operationLock = new TabOperationLock();
    // ExtensionScriptManager will be passed in from background script
    this.extensionScriptManager = null;
    
    // WebSocket relay configuration
    this.relayConnected = false;
    this.pendingRequests = new Map(); // Track requests awaiting responses
    
    // Connection health metrics from offscreen document
    this.connectionHealth = {
      connected: false,
      connectedAt: null,
      lastActivityAt: null,
      messagesReceived: 0,
      messagesSent: 0,
      reconnectCount: 0,
      queueLength: 0
    };
    
    // Track extension startup for reload confirmation
    this.startupTimestamp = Date.now();
    
    this.logger.info('WebSocket ExtensionRelayClient created', { startupTimestamp: this.startupTimestamp });
  }

  async init() {
    this.logger.info('Initializing WebSocket ExtensionRelayClient');
    
    // Setup listeners
    this.setupEventListeners();
    
    // Start periodic debugger cleanup (every 5 minutes)
    this.debuggerCleanupInterval = setInterval(() => {
      this.cleanupDebuggerSessions().catch(error => {
        this.logger.error('Periodic debugger cleanup failed', { error: error.message });
      });
    }, 5 * 60 * 1000);
    
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
        // System tools
        case 'system_health':
          result = await this.getConnectionHealth(command.params || {});
          break;
        case 'system_wait_operation':
          result = await this.waitForOperation(command.params || {});
          break;
        case 'system_get_extension_logs':
          result = await this.getExtensionLogs(command.params || {});
          break;
        case 'enable_debug_mode':
          result = await this.enableDebugMode(command.params || {});
          break;
        case 'disable_debug_mode':
          result = await this.disableDebugMode(command.params || {});
          break;
        case 'set_log_level':
          result = await this.setLogLevel(command.params || {});
          break;

        // Chrome tools
        case 'chrome_reload_extension':
          result = await this.reloadExtension(command.params || {});
          break;
        case 'chrome_debug_attach':
          result = await this.attachDebugger((command.params || {}).tabId);
          break;
        case 'chrome_debug_detach':
          result = await this.detachDebugger((command.params || {}).tabId);
          break;
        case 'chrome_debug_status':
          result = await this.getDebuggerStatus(command.params || {});
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
          result = await this.createTab(command.params || {});
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
            result = await this.sendTabMessage(command.params);
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
          result = await this.listConversations(command.params || {});
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
    
    // Clear debugger cleanup interval
    if (this.debuggerCleanupInterval) {
      clearInterval(this.debuggerCleanupInterval);
      this.debuggerCleanupInterval = null;
    }
    
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
      timestamp: Date.now(),
      connectionHealth: this.connectionHealth
    };
  }

  setupEventListeners() {
    // Listen for relay status updates from offscreen document
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'relay_connection_status') {
        this.handleRelayStatus(message);
      } else if (Object.keys(message).some(key => key.startsWith('_'))) {
        // Any message with underscore-prefixed fields is from relay
        this.handleRelayMessage(message);
      }
    });
    
    console.log('CCM Extension: Event listeners setup complete');
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
        contentScriptTabs: this.extensionScriptManager ? Array.from(this.extensionScriptManager.injectedTabs) : [],
        extensionStartup: {
          timestamp: this.startupTimestamp,
          uptime: Date.now() - this.startupTimestamp,
          startupTime: new Date(this.startupTimestamp).toISOString()
        },
        connectionHealth: this.connectionHealth
      }
    };
  }

  // Async message sending
  async sendMessageAsync(params) {
    console.log('CCM Extension: sendMessageAsync called with params:', JSON.stringify(params, null, 2));
    const { tabId, message, operationId } = params;
    
    if (!tabId || !message) {
      console.log('CCM Extension: Missing required parameters - tabId:', tabId, 'message:', message);
      return { success: false, error: 'Missing required parameters' };
    }
    
    try {
      // Use the synchronous send but don't wait for response
      const result = await this.sendTabMessage({
        tabId,
        message,
        waitForReady: true,
        operationId  // OPERATION ID UNIFICATION: Pass through server operation ID
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

    // Handle self-forwarding case
    if (sourceTabId === targetTabId) {
      return { 
        success: false, 
        error: 'Cannot forward response to the same tab (sourceTabId === targetTabId)',
        sourceTabId,
        targetTabId
      };
    }

    // Check if target tab has content script injected
    const hasContentScript = this.extensionScriptManager ? 
      this.extensionScriptManager.injectedTabs.has(targetTabId) : false;

    if (!hasContentScript && this.extensionScriptManager) {
      console.log(`CCM Extension: Content script not detected in target tab ${targetTabId}, attempting injection`);
      
      try {
        const injectionResult = await this.extensionScriptManager.injectContentScript(targetTabId);
        if (!injectionResult.success) {
          return { 
            success: false, 
            error: `Failed to inject content script into target tab: ${injectionResult.error}`,
            targetTabId,
            injectionResult
          };
        }
        console.log(`CCM Extension: Content script successfully injected into tab ${targetTabId}`);
      } catch (error) {
        return { 
          success: false, 
          error: `Content script injection failed: ${error.message}`,
          targetTabId
        };
      }
    }

    // Get response from source tab
    const sourceResponse = await this.getClaudeResponse({ tabId: sourceTabId });
    
    if (!sourceResponse.success) {
      return { success: false, error: 'Failed to get response from source tab', sourceTabId };
    }

    // Extract text from response object
    const responseText = sourceResponse.response?.text || sourceResponse.response || '';
    
    if (!responseText || responseText.trim() === '') {
      return { 
        success: false, 
        error: 'No response text available from source tab',
        sourceTabId,
        sourceResponse
      };
    }
    
    // Transform response if template provided
    let messageToSend = responseText;
    if (transformTemplate) {
      messageToSend = transformTemplate.replace('${response}', responseText);
    }

    // Send to target tab with enhanced error handling
    try {
      const sendResult = await this.sendMessageAsync({ tabId: targetTabId, message: messageToSend });
      
      return {
        success: sendResult.success,
        sourceResponse: responseText,
        transformedMessage: messageToSend,
        sendResult: sendResult,
        sourceTabId,
        targetTabId
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send message to target tab: ${error.message}`,
        sourceResponse: responseText,
        transformedMessage: messageToSend,
        sourceTabId,
        targetTabId
      };
    }
  }

  async attachDebugger(tabId) {
    // Check if already attached before attempting to attach
    if (this.debuggerSessions.has(tabId)) {
      this.logger.debug(`Debugger already tracked for tab ${tabId}`);
      return { success: true, alreadyAttached: true };
    }

    try {
      // Test if debugger is already working by sending a simple command
      await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: 'true',
          returnByValue: true
        }, (result) => {
          if (chrome.runtime.lastError) {
            // Not attached or not working, need to attach
            reject(new Error('Not attached'));
          } else {
            // Already working
            resolve(result);
          }
        });
      });
      
      // Debugger is already working, just track it
      this.debuggerSessions.set(tabId, { attached: Date.now(), source: 'existing' });
      this.logger.debug(`Debugger already attached to tab ${tabId}, tracking existing session`);
      return { success: true, alreadyAttached: true };
      
    } catch (testError) {
      // Debugger not working, try to attach
      return new Promise((resolve, reject) => {
        chrome.debugger.attach({ tabId }, '1.3', () => {
          if (chrome.runtime.lastError) {
            // Check if error is about already being attached
            if (chrome.runtime.lastError.message?.includes('already attached')) {
              // Another debugger is attached, track it but note we didn't create it
              this.debuggerSessions.set(tabId, { attached: Date.now(), source: 'external' });
              this.logger.warn(`External debugger detected on tab ${tabId}, tracking but not managing`);
              resolve({ success: true, alreadyAttached: true, external: true });
            } else {
              reject(new Error(chrome.runtime.lastError.message));
            }
          } else {
            this.debuggerSessions.set(tabId, { attached: Date.now(), source: 'self' });
            this.logger.debug(`Debugger attached to tab ${tabId}`);
            resolve({ success: true, alreadyAttached: false });
          }
        });
      });
    }
  }

  async detachDebugger(tabId) {
    if (!this.debuggerSessions.has(tabId)) {
      this.logger.debug(`No debugger session tracked for tab ${tabId}`);
      return { success: true, wasDetached: false };
    }

    const session = this.debuggerSessions.get(tabId);
    
    // Only detach if we created the session ourselves
    if (session.source === 'external') {
      this.logger.debug(`Not detaching external debugger from tab ${tabId}`);
      this.debuggerSessions.delete(tabId);
      return { success: true, wasDetached: false, reason: 'external' };
    }

    return new Promise((resolve) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          this.logger.warn(`Failed to detach debugger from tab ${tabId}: ${chrome.runtime.lastError.message}`);
          // Still remove from tracking even if detach failed
          this.debuggerSessions.delete(tabId);
          resolve({ success: true, wasDetached: false, error: chrome.runtime.lastError.message });
        } else {
          this.logger.debug(`Debugger detached from tab ${tabId}`);
          this.debuggerSessions.delete(tabId);
          resolve({ success: true, wasDetached: true });
        }
      });
    });
  }

  // Clean up debugger sessions for tabs that no longer exist
  async cleanupDebuggerSessions() {
    if (!this.debuggerSessions || this.debuggerSessions.size === 0) {
      return { cleaned: 0 };
    }

    try {
      const allTabs = await chrome.tabs.query({});
      const existingTabIds = new Set(allTabs.map(tab => tab.id));
      const sessionsToClean = [];

      for (const [tabId, session] of this.debuggerSessions) {
        if (!existingTabIds.has(tabId)) {
          sessionsToClean.push(tabId);
        }
      }

      this.logger.debug(`Cleaning up ${sessionsToClean.length} debugger sessions for closed tabs`);

      for (const tabId of sessionsToClean) {
        this.debuggerSessions.delete(tabId);
      }

      return { cleaned: sessionsToClean.length };

    } catch (error) {
      this.logger.error('Failed to cleanup debugger sessions', { error: error.message });
      return { cleaned: 0, error: error.message };
    }
  }

  async getDebuggerStatus(params = {}) {
    const { tabId } = params;

    try {
      if (tabId) {
        // Return status for specific tab
        const session = this.debuggerSessions.get(tabId);
        if (!session) {
          return {
            success: true,
            tabId: tabId,
            attached: false,
            session: null
          };
        }

        // Test if debugger is still functional
        let functional = false;
        try {
          await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
              expression: 'true',
              returnByValue: true
            }, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          });
          functional = true;
        } catch (error) {
          this.logger.warn(`Debugger on tab ${tabId} not functional: ${error.message}`);
        }

        return {
          success: true,
          tabId: tabId,
          attached: true,
          functional: functional,
          session: {
            attached: new Date(session.attached).toISOString(),
            source: session.source,
            age: Date.now() - session.attached
          }
        };
      } else {
        // Return status for all sessions
        const sessions = [];
        for (const [tabId, session] of this.debuggerSessions) {
          sessions.push({
            tabId: tabId,
            attached: new Date(session.attached).toISOString(),
            source: session.source,
            age: Date.now() - session.attached
          });
        }

        return {
          success: true,
          totalSessions: sessions.length,
          sessions: sessions
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
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
        
        // Use the improved attachDebugger method
        const result = await this.attachDebugger(tabId);
        if (result.success) {
          this.logger.debug(`Debugger ready for tab ${tabId}`);
          return;
        }
        
        throw new Error('Failed to attach debugger');
        
      } catch (error) {
        retries++;
        this.logger.warn(`Failed to attach debugger to tab ${tabId} (attempt ${retries}/${maxRetries}):`, error.message);
        
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


  // Offscreen WebSocket relay methods
  handleRelayStatus(message) {
    console.log('CCM ExtensionRelayClient: Relay status update:', message);
    
    // Update health metrics if provided
    if (message.health) {
      this.connectionHealth = { ...this.connectionHealth, ...message.health };
    }
    
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
    this.logger.debug(`Message from relay: ${message.type}`, message);
    
    // Track message received
    this.connectionHealth.messagesReceived++;
    this.connectionHealth.lastActivityAt = Date.now();
    
    const fromClient = message._from;
    
    // Check if this is an MCP tool request from an MCP server
    if (fromClient && message.id && message.type) {
        this.logger.debug(`MCP tool request: ${message.type}`, {
          toolType: message.type,
          hasParams: !!message.params,
          paramType: typeof message.params,
          paramKeys: message.params ? Object.keys(message.params) : null,
          fullParams: message.params,
          requestId: message.id,
          fromClient: fromClient
        });
        
        // Execute the command and send response back via relay
        this.executeCommand({
          type: message.type,
          params: message.params || {},
          requestId: message.id
        }).then(result => {
          // Send response back via relay
          this.sendToRelay({
            type: 'unicast',
            targetId: fromClient,
            data: {
              id: message.id,
              type: 'response',
              result: result,
              timestamp: Date.now()
            }
          });
        }).catch(error => {
          // Send error response back via relay
          this.sendToRelay({
            type: 'unicast',
            targetId: fromClient,
            data: {
              id: message.id,
              type: 'error',
              error: error.message || 'Command execution failed',
              timestamp: Date.now()
            }
          });
        });
      } else if (message.type === 'response' && message.id) {
        // Handle response for a pending request
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message.result);
          }
        }
      } else if (message.type === '_client_list_update') {
      console.log('CCM ExtensionRelayClient: Client list updated:', message._clients);
      // Update connected clients
      this.connectedClients.clear();
      if (message._clients && Array.isArray(message._clients)) {
        // Filter out self (extension) from the list
        const otherClients = message._clients.filter(client => client.type !== 'extension');
        for (const client of otherClients) {
          this.connectedClients.set(client.id, client);
        }
        
        // Update badge based on client count
        if (this.connectedClients.size > 0) {
          updateBadge('mcp-connected', this.connectedClients.size);
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
      
      // Track message sent
      this.connectionHealth.messagesSent++;
      this.connectionHealth.lastActivityAt = Date.now();
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
      // Use the statically imported extensionLogger (no dynamic import needed)
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

  // Enable debug mode for real-time log forwarding
  async enableDebugMode(params = {}) {
    try {
      const { components = [], errorOnly = false, batchIntervalMs = 2000 } = params;
      
      // Store debug mode settings
      await chrome.storage.local.set({
        'ccm-debug-mode-enabled': true,
        'ccm-debug-components': components,
        'ccm-debug-error-only': errorOnly,
        'ccm-debug-batch-interval': batchIntervalMs
      });

      // Update logger settings
      extensionLogger.setDebugMode(true, {
        components,
        errorOnly,
        batchIntervalMs,
        sendToMCP: (logEntry) => this.sendLogToMCP(logEntry)
      });

      this.logger.info('Extension debug mode enabled', params);
      
      return {
        success: true,
        message: 'Debug mode enabled',
        settings: { components, errorOnly, batchIntervalMs }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to enable debug mode: ${error.message}`
      };
    }
  }

  // Disable debug mode
  async disableDebugMode(params = {}) {
    try {
      // Clear debug mode settings
      await chrome.storage.local.set({
        'ccm-debug-mode-enabled': false
      });

      // Update logger settings
      extensionLogger.setDebugMode(false);

      this.logger.info('Extension debug mode disabled');
      
      return {
        success: true,
        message: 'Debug mode disabled'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to disable debug mode: ${error.message}`
      };
    }
  }

  // Set extension log level
  async setLogLevel(params = {}) {
    try {
      const { level } = params;
      
      if (!level) {
        return {
          success: false,
          error: 'Log level is required'
        };
      }

      // Update logger level
      extensionLogger.setLogLevel(level);

      this.logger.info('Extension log level updated', { level });
      
      return {
        success: true,
        message: `Log level set to ${level}`,
        level
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set log level: ${error.message}`
      };
    }
  }

  // Send log entry to MCP server via relay
  async sendLogToMCP(logEntry) {
    // Only send if connected to MCP client
    if (this.connectedClients.size === 0) {
      return;
    }

    try {
      // Get first connected MCP client
      const mcpClient = Array.from(this.connectedClients.values())[0];
      
      // Send log as notification via relay
      await this.sendToRelay({
        type: 'unicast',
        targetId: mcpClient.id,
        data: {
          type: 'log_notification',
          log: logEntry,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      // Silently fail - we don't want logging to break the extension
      this.logger.error('Failed to send log to MCP', { error: error.message });
    }
  }

  // Centralized tab resource cleanup with proper dependency ordering
  async cleanupTabResources(tabId, options = {}) {
    const { closeTab = false, reason = 'cleanup' } = options;
    const cleanupSteps = [];
    let errors = [];

    this.logger.debug(`Starting tab resource cleanup for tab ${tabId}`, { reason, closeTab });

    try {
      // Step 1: Stop network monitoring (if active)
      if (this.capturedRequests && this.capturedRequests.has(tabId)) {
        try {
          // Stop network monitoring by disabling Network events
          if (this.debuggerSessions.has(tabId)) {
            await new Promise((resolve, reject) => {
              chrome.debugger.sendCommand({ tabId }, 'Network.disable', {}, () => {
                if (chrome.runtime.lastError) {
                  // Non-critical error, continue cleanup
                  this.logger.warn(`Failed to disable network monitoring for tab ${tabId}: ${chrome.runtime.lastError.message}`);
                } else {
                  this.logger.debug(`Network monitoring stopped for tab ${tabId}`);
                }
                resolve();
              });
            });
          }
          
          // Clean up captured requests
          this.capturedRequests.delete(tabId);
          cleanupSteps.push('network_monitoring_stopped');
        } catch (error) {
          errors.push({ step: 'network_monitoring', error: error.message });
          this.logger.warn(`Network monitoring cleanup failed for tab ${tabId}`, { error: error.message });
        }
      }

      // Step 2: Wait for pending operations to complete
      if (this.operationLock) {
        try {
          const lockInfo = this.operationLock.getLockInfo(tabId);
          if (lockInfo) {
            this.logger.debug(`Waiting for operation to complete on tab ${tabId}`, { operation: lockInfo.operation });
            
            // Wait up to 5 seconds for operation to complete
            const timeout = 5000;
            const startTime = Date.now();
            
            while (this.operationLock.getLockInfo(tabId) && (Date.now() - startTime) < timeout) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (this.operationLock.getLockInfo(tabId)) {
              this.logger.warn(`Operation still pending after timeout on tab ${tabId}, force releasing lock`);
            }
          }
          cleanupSteps.push('operations_waited');
        } catch (error) {
          errors.push({ step: 'wait_operations', error: error.message });
          this.logger.warn(`Operation wait failed for tab ${tabId}`, { error: error.message });
        }
      }

      // Step 3: Detach debugger (must happen before tab closure)
      if (this.debuggerSessions && this.debuggerSessions.has(tabId)) {
        try {
          const result = await this.detachDebugger(tabId);
          if (result.wasDetached) {
            cleanupSteps.push('debugger_detached');
          } else {
            cleanupSteps.push('debugger_not_detached');
          }
        } catch (error) {
          errors.push({ step: 'debugger_detach', error: error.message });
          this.logger.error(`Debugger detach failed for tab ${tabId}`, { error: error.message });
        }
      }

      // Step 4: Release operation locks
      if (this.operationLock) {
        try {
          const wasLocked = this.operationLock.getLockInfo(tabId) !== null;
          this.operationLock.releaseLock(tabId);
          if (wasLocked) {
            cleanupSteps.push('lock_released');
          }
        } catch (error) {
          errors.push({ step: 'lock_release', error: error.message });
          this.logger.warn(`Lock release failed for tab ${tabId}`, { error: error.message });
        }
      }

      // Step 5: Remove content scripts
      if (this.extensionScriptManager) {
        try {
          const wasTracked = this.extensionScriptManager.injectedTabs.has(tabId);
          this.extensionScriptManager.removeTab(tabId);
          if (wasTracked) {
            cleanupSteps.push('content_scripts_removed');
          }
        } catch (error) {
          errors.push({ step: 'content_scripts', error: error.message });
          this.logger.warn(`Content script cleanup failed for tab ${tabId}`, { error: error.message });
        }
      }

      // Step 6: Close tab (only if requested)
      if (closeTab) {
        try {
          await chrome.tabs.remove(tabId);
          cleanupSteps.push('tab_closed');
        } catch (error) {
          errors.push({ step: 'tab_close', error: error.message });
          this.logger.error(`Tab closure failed for tab ${tabId}`, { error: error.message });
        }
      }

      this.logger.debug(`Tab resource cleanup completed for tab ${tabId}`, { 
        steps: cleanupSteps, 
        errors: errors.length,
        reason 
      });

      return {
        success: errors.length === 0,
        steps: cleanupSteps,
        errors: errors,
        tabId: tabId
      };

    } catch (error) {
      this.logger.error(`Tab resource cleanup failed for tab ${tabId}`, { 
        error: error.message, 
        reason,
        completedSteps: cleanupSteps 
      });
      
      return {
        success: false,
        steps: cleanupSteps,
        errors: [{ step: 'cleanup_process', error: error.message }],
        tabId: tabId
      };
    }
  }
}

// Mix in all operation methods
Object.assign(ExtensionRelayClient.prototype, tabOperations);
Object.assign(ExtensionRelayClient.prototype, conversationOperations);
Object.assign(ExtensionRelayClient.prototype, tabBatchOperations);
Object.assign(ExtensionRelayClient.prototype, chromeDebugOperations);
