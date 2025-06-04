// Chrome Extension Background Service Worker - BALANCED VERSION
// Safe initialization but more aggressive connection attempts

import { MESSAGE_TYPES } from './modules/config.js';
import { ExtensionRelayClient } from './modules/relay-client.js';
import { ContentScriptManager } from './modules/content-script-manager.js';

console.log('CCM: Balanced background script starting...');

// Global variables
let relayClient = null;
let contentScriptManager = null;
let initializationComplete = false;
let offscreenCreated = false;

// Register event listeners
console.log('CCM: Registering event listeners...');

// Event-driven extension with WebSocket relay
chrome.runtime.onInstalled.addListener(() => {
  console.log('CCM Extension: Installed/Updated - WebSocket relay mode');
});

// Message queue for early messages
const messageQueue = [];

// Offscreen document management
async function ensureOffscreenDocument() {
  if (offscreenCreated) return;
  
  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (existingContexts.length === 0) {
      console.log('CCM: Creating offscreen document for WebSocket connection...');
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_SCRAPING'],
        justification: 'Maintain persistent WebSocket connection to relay server for Chrome automation'
      });
      offscreenCreated = true;
      console.log('CCM: Offscreen document created successfully');
    } else {
      console.log('CCM: Offscreen document already exists');
      offscreenCreated = true;
    }
  } catch (error) {
    console.error('CCM: Failed to create offscreen document:', error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle messages from offscreen document
  if (request.type === 'relay_connection_status') {
    console.log('CCM: Relay connection status:', request.status);
    // Forward status to relay client if available
    if (relayClient) {
      relayClient.handleRelayStatus(request);
    }
    return false;
  }
  
  if (request.type === 'relay_message') {
    console.log('CCM: Message from relay:', request.data.type);
    // Forward message to relay client
    if (relayClient) {
      relayClient.handleRelayMessage(request.data);
    }
    return false;
  }
  
  // Handle other relay messages that come directly (not wrapped)
  if (request.type === 'client_list_update' || request.type === 'relay_welcome') {
    console.log('CCM: Direct relay message:', request.type);
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
    console.log('CCM: Offscreen document status:', request.status);
    return false;
  }
  
  // Always handle health checks immediately, even during initialization
  if (request.type === 'mcp_tool_request' && request.tool === 'get_connection_health') {
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
    console.log('CCM Extension: Queuing message - not initialized yet');
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
    console.log(`CCM: MCP tool request: ${request.tool}`);
    relayClient.handleMCPToolRequest(request.tool, request.params)
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
    console.log('CCM Extension: Force reconnect requested from popup');
    relayClient.connectToRelay().then(() => {
      console.log('CCM Extension: Force reconnect succeeded');
      sendResponse({ success: true });
    }).catch(error => {
      console.error('CCM Extension: Force reconnect failed:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  return false;
}

// Initialization with shorter delay
setTimeout(async () => {
  console.log('CCM Extension: Starting initialization...');
  
  try {
    // Create ExtensionRelayClient first (no DOM dependencies)
    relayClient = new ExtensionRelayClient();
    
    // Create ContentScriptManager
    contentScriptManager = new ContentScriptManager();
    console.log('CCM Extension: ContentScriptManager created');
    
    // Create offscreen document for WebSocket connection
    await ensureOffscreenDocument();
    
    // Set the content script manager reference
    relayClient.contentScriptManager = contentScriptManager;
    await relayClient.init();
    
    // Make globally accessible
    globalThis.ccmRelayClient = relayClient;
    globalThis.contentScriptManager = contentScriptManager;
    
    initializationComplete = true;
    console.log('CCM Extension: Initialization complete');
    
    // Process queued messages
    while (messageQueue.length > 0) {
      const { request, sender, sendResponse } = messageQueue.shift();
      handleMessage(request, sender, sendResponse);
    }
    
    // Try connecting immediately after initialization
    console.log('CCM Extension: Attempting immediate WebSocket connection...');
    relayClient.connectToRelay().catch(err => {
      console.log('CCM Extension: Initial connection failed, will retry via alarms:', err.message);
    });
    
  } catch (error) {
    console.error('CCM Extension: Initialization failed:', error);
    initializationComplete = false;
  }
}, 100); // Minimal delay for service worker stability

// Handle tab cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  if (contentScriptManager) {
    contentScriptManager.removeTab(tabId);
  }
  if (relayClient && relayClient.operationLock) {
    relayClient.operationLock.releaseLock(tabId);
  }
});

// Also try to connect when popup is opened (backup activation method)
chrome.action.onClicked.addListener(() => {
  console.log('CCM Extension: Extension icon clicked - activating service worker');
  if (!initializationComplete) {
    console.log('CCM Extension: Icon click triggered initialization');
  } else if (relayClient && !relayClient.isConnected()) {
    console.log('CCM Extension: Icon click triggered connection attempt');
    relayClient.connectToRelay().catch(err => {
      console.error('CCM Extension: Icon-triggered connection failed:', err);
    });
  }
});

// Try immediate connection on service worker startup
console.log('CCM Extension: Service worker starting - attempting immediate connection');

console.log('CCM Extension: Balanced background script loaded');