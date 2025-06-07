// Chrome Extension Background Service Worker - BALANCED VERSION
// Safe initialization but more aggressive connection attempts

import { MESSAGE_TYPES, VERSION } from './modules/config.js';
import { ExtensionRelayClient } from './modules/relay-client.js';
import { ContentScriptManager } from './modules/content-script-manager.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('background');
logger.info('Balanced background script starting');

// Global variables
let relayClient = null;
let contentScriptManager = null;
let initializationComplete = false;
let offscreenCreated = false;

// Register event listeners
logger.info('Registering event listeners');

// Event-driven extension with WebSocket relay
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Installed/Updated - WebSocket relay mode', { reason: details.reason });
  
  // Show reload notification
  if (details.reason === 'update' || details.reason === 'install' || details.reason === 'chrome_update') {
    // Show system notification
    const notificationId = `reload_${Date.now()}`;
    const message = details.reason === 'install' 
      ? 'Claude Chrome MCP installed' 
      : 'Claude Chrome MCP reloaded';
    
    logger.info('Attempting to show notification', { reason: details.reason, message });
    
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // 1x1 transparent PNG
      title: 'Claude Chrome MCP',
      message: message,
      priority: 1
    }, () => {
      if (chrome.runtime.lastError) {
        logger.error('Notification creation failed', { error: chrome.runtime.lastError.message });
      } else {
        logger.info('Notification created successfully', { notificationId });
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
          chrome.notifications.clear(notificationId);
        }, 4000);
      }
    });
  }
});

// Message queue for early messages
const messageQueue = [];

// Offscreen document management
async function ensureOffscreenDocument() {
  if (offscreenCreated) return;
  
  try {
    // Try to create offscreen document - it will fail if one already exists
    logger.info('Creating offscreen document for WebSocket connection');
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING'],
      justification: 'Maintain persistent WebSocket connection to relay server for Chrome automation'
    });
    offscreenCreated = true;
    logger.info('Offscreen document created successfully');
  } catch (error) {
    // If error is because document already exists, that's OK
    if (error.message && error.message.includes('already exists')) {
      logger.info('Offscreen document already exists');
      offscreenCreated = true;
    } else {
      logger.error('Failed to create offscreen document', { error: error.message });
      throw error;
    }
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle messages from offscreen document
  if (request.type === 'relay_connection_status') {
    logger.debug('Relay connection status', { status: request.status });
    // Forward status to relay client if available
    if (relayClient) {
      relayClient.handleRelayStatus(request);
    }
    return false;
  }
  
  if (request.type === 'relay_message') {
    logger.debug('Message from relay', { messageType: request.data.type });
    // Forward message to relay client
    if (relayClient) {
      relayClient.handleRelayMessage(request.data);
    }
    return false;
  }
  
  // Handle other relay messages that come directly (not wrapped)
  if (request.type === 'client_list_update' || request.type === 'relay_welcome') {
    logger.debug('Direct relay message', { messageType: request.type });
    // Forward to relay client
    if (relayClient) {
      relayClient.handleRelayMessage(request);
    }
    return false;
  }
  
  // Handle any message with _from field (messages from other relay clients)
  if (request._from) {
    logger.debug('Message from relay client', { 
      from: request._from, 
      messageType: request.type,
      hasId: !!request.id 
    });
    // Forward to relay client
    if (relayClient) {
      relayClient.handleRelayMessage(request);
    }
    return false;
  }
  
  if (request.type === 'offscreen_heartbeat') {
    // Acknowledge heartbeat from offscreen document
    return false;
  }
  
  if (request.type === 'offscreen_status') {
    logger.debug('Offscreen document status', { status: request.status });
    return false;
  }
  
  if (request.type === 'offscreen_get_config') {
    // Send config to offscreen document
    chrome.runtime.sendMessage({
      type: 'offscreen_config',
      version: VERSION
    });
    return false;
  }
  
  // Always handle health checks immediately, even during initialization
  if (request.type === 'mcp_tool_request' && request.tool === 'system_health') {
    const currentState = relayClient ? relayClient.getCurrentState() : {
      relayConnected: false,
      isReconnecting: false,
      connectedClients: [],
      extensionConnected: false,
      initialized: initializationComplete,
      timestamp: Date.now()
    };

    sendResponse({
      success: true,
      health: {
        ...currentState,
        operationLocks: relayClient ? relayClient.operationLock.getAllLocks() : [],
        messageQueueSize: relayClient ? relayClient.messageQueue.size() : 0,
        contentScriptTabs: contentScriptManager ? Array.from(contentScriptManager.injectedTabs) : [],
        initialized: initializationComplete
      }
    });
    return false;
  }
  
  if (!initializationComplete) {
    logger.debug('Queuing message - not initialized yet');
    messageQueue.push({ request, sender, sendResponse });
    return true;
  }
  
  return handleMessage(request, sender, sendResponse);
});

function handleMessage(request, sender, sendResponse) {
  // Health checks are now handled at the top level
  
  if (!relayClient || !contentScriptManager) {
    sendResponse({ success: false, error: 'Extension not fully initialized' });
    return false;
  }
  
  // Handle MCP tool requests
  if (request.type === 'mcp_tool_request' && request.tool && request.params) {
    logger.debug('MCP tool request', { tool: request.tool });
    relayClient.executeCommand({ type: request.tool, params: request.params })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // Handle content script injection
  if (request.type === MESSAGE_TYPES.MANUAL_INJECT && request.tabId) {
    contentScriptManager.injectContentScript(request.tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // Handle force reconnect from popup
  if (request.type === 'force_reconnect') {
    logger.info('Force reconnect requested from popup');
    relayClient.connectToRelay().then(() => {
      logger.info('Force reconnect succeeded');
      sendResponse({ success: true });
    }).catch(error => {
      logger.error('Force reconnect failed', { error: error.message });
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  // Handle LOG_ERROR from extension logger
  if (request.type === 'LOG_ERROR' && request.data) {
    // Forward error logs to MCP if debug mode is enabled
    if (relayClient && relayClient.sendLogToMCP) {
      relayClient.sendLogToMCP(request.data);
    }
    // No response needed
    return false;
  }
  
  return false;
}

// Initialization with shorter delay
setTimeout(async () => {
  logger.info('Starting initialization');
  
  try {
    // Create ExtensionRelayClient first (no DOM dependencies)
    relayClient = new ExtensionRelayClient();
    
    // Create ContentScriptManager
    contentScriptManager = new ContentScriptManager();
    logger.info('ContentScriptManager created');
    
    // Create offscreen document for WebSocket connection
    await ensureOffscreenDocument();
    
    // Set the content script manager reference
    relayClient.contentScriptManager = contentScriptManager;
    await relayClient.init();
    
    // Make globally accessible
    globalThis.ccmRelayClient = relayClient;
    globalThis.contentScriptManager = contentScriptManager;
    
    initializationComplete = true;
    logger.info('Initialization complete');
    
    // Process queued messages
    while (messageQueue.length > 0) {
      const { request, sender, sendResponse } = messageQueue.shift();
      handleMessage(request, sender, sendResponse);
    }
    
    // Try connecting immediately after initialization
    logger.info('Attempting immediate WebSocket connection');
    relayClient.connectToRelay().catch(err => {
      logger.warn('Initial connection failed, will retry via alarms', { error: err.message });
    });
    
  } catch (error) {
    logger.error('Initialization failed', { error: error.message });
    initializationComplete = false;
  }
}, 100); // Minimal delay for service worker stability

// Handle tab cleanup
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (contentScriptManager) {
    contentScriptManager.removeTab(tabId);
  }
  if (relayClient && relayClient.operationLock) {
    relayClient.operationLock.releaseLock(tabId);
  }
  // Clean up debugger session if exists
  if (relayClient && relayClient.debuggerSessions && relayClient.debuggerSessions.has(tabId)) {
    await relayClient.detachDebugger(tabId);
  }
});

// Handle debugger detach events
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (relayClient && relayClient.debuggerSessions && relayClient.debuggerSessions.has(tabId)) {
    logger.debug(`Debugger detached from tab ${tabId}, reason: ${reason}`);
    relayClient.debuggerSessions.delete(tabId);
  }
});

// Handle debugger events for network monitoring
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  
  if (method === 'Network.responseReceived' && relayClient && relayClient.capturedRequests) {
    const capturedRequests = relayClient.capturedRequests.get(tabId);
    if (capturedRequests) {
      capturedRequests.push({
        method: method,
        params: params,
        timestamp: Date.now()
      });
    }
  }
});

// Handle tab navigation/reload - content scripts are lost during navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only clear content script tracking for actual navigation (not initial loads during tab creation)
  if (changeInfo.url && contentScriptManager) {
    // Check if this is a significant URL change (not just claude.ai -> claude.ai/new during creation)
    const isSignificantNavigation = !changeInfo.url.includes('claude.ai') || 
                                   (tab.url && !tab.url.includes('claude.ai'));
    
    if (isSignificantNavigation) {
      logger.debug('Significant navigation detected, clearing content script tracking', { 
        tabId, 
        oldUrl: changeInfo.url, 
        newUrl: tab.url 
      });
      contentScriptManager.removeTab(tabId);
    }
  }
});

// Handle web navigation events for page reloads and navigations
chrome.webNavigation.onCommitted.addListener((details) => {
  // Clear content script tracking for navigation that could lose content scripts
  if (details.frameId === 0 && contentScriptManager && 
      contentScriptManager.shouldClearOnNavigation(details.tabId)) {
    logger.debug('Navigation event detected, clearing content script tracking', { 
      tabId: details.tabId, 
      url: details.url,
      transitionType: details.transitionType
    });
    contentScriptManager.removeTab(details.tabId);
  }
}, { url: [{ hostContains: 'claude.ai' }] });

// Also try to connect when popup is opened (backup activation method)
chrome.action.onClicked.addListener(() => {
  logger.info('Extension icon clicked - activating service worker');
  if (!initializationComplete) {
    logger.info('Icon click triggered initialization');
  } else if (relayClient && !relayClient.isConnected()) {
    logger.info('Icon click triggered connection attempt');
    relayClient.connectToRelay().catch(err => {
      logger.error('Icon-triggered connection failed', { error: err.message });
    });
  }
});

// Try immediate connection on service worker startup
logger.info('Service worker starting - attempting immediate connection');

logger.info('Balanced background script loaded');