// Chrome Extension Background Service Worker - BALANCED VERSION
// Safe initialization but more aggressive connection attempts

import { MESSAGE_TYPES } from './modules/config.js';
// Import HubClient directly - ContentScriptManager will be loaded lazily
import { HubClient } from './modules/hub-client-fixed.js';

console.log('CCM: Balanced background script starting...');

// Global variables
let hubClient = null;
let contentScriptManager = null;
let initializationComplete = false;

// Register event listeners
console.log('CCM: Registering event listeners...');

// Create periodic check alarm
chrome.runtime.onInstalled.addListener(() => {
  console.log('CCM Extension: Installed/Updated');
  chrome.alarms.create('periodicCheck', { periodInMinutes: 0.5 }); // Check every 30 seconds
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodicCheck') {
    if (initializationComplete && hubClient && !hubClient.isConnected()) {
      console.log('CCM Extension: Periodic connection check - attempting to connect');
      hubClient.connectToHub().catch(err => {
        console.error('CCM Extension: Periodic connection failed:', err);
      });
    }
  }
});

// Message queue for early messages
const messageQueue = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!initializationComplete) {
    console.log('CCM Extension: Queuing message - not initialized yet');
    messageQueue.push({ request, sender, sendResponse });
    return true;
  }
  
  return handleMessage(request, sender, sendResponse);
});

function handleMessage(request, sender, sendResponse) {
  // Handle connection health check immediately
  if (request.type === 'mcp_tool_request' && request.tool === 'get_connection_health') {
    sendResponse({
      success: true,
      health: {
        hubConnected: hubClient ? hubClient.isConnected() : false,
        connectedClients: hubClient ? Array.from(hubClient.connectedClients.values()) : [],
        operationLocks: hubClient ? hubClient.operationLock.getAllLocks() : [],
        messageQueueSize: hubClient ? hubClient.messageQueue.size() : 0,
        contentScriptTabs: contentScriptManager ? Array.from(contentScriptManager.injectedTabs) : [],
        initialized: initializationComplete
      }
    });
    return false;
  }
  
  if (!hubClient || !contentScriptManager) {
    sendResponse({ success: false, error: 'Extension not fully initialized' });
    return false;
  }
  
  // Handle MCP tool requests
  if (request.type === 'mcp_tool_request' && request.tool && request.params) {
    console.log(`CCM: MCP tool request: ${request.tool}`);
    hubClient.handleMCPToolRequest(request.tool, request.params)
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
  
  return false;
}

// Initialization with shorter delay
setTimeout(async () => {
  console.log('CCM Extension: Starting initialization...');
  
  try {
    // Create HubClient first (no DOM dependencies)
    hubClient = new HubClient();
    
    // Dynamically import ContentScriptManager only when needed
    const { ContentScriptManager } = await import('./modules/content-script-manager.js');
    
    // Create ContentScriptManager
    contentScriptManager = new ContentScriptManager();
    console.log('CCM Extension: ContentScriptManager created');
    
    // Set the content script manager reference
    hubClient.contentScriptManager = contentScriptManager;
    await hubClient.init();
    
    // Make globally accessible
    globalThis.ccmHubClient = hubClient;
    globalThis.contentScriptManager = contentScriptManager;
    
    // Start keepalive
    hubClient.startKeepalive();
    
    initializationComplete = true;
    console.log('CCM Extension: Initialization complete');
    
    // Process queued messages
    while (messageQueue.length > 0) {
      const { request, sender, sendResponse } = messageQueue.shift();
      handleMessage(request, sender, sendResponse);
    }
    
    // Try connecting immediately
    console.log('CCM Extension: Attempting initial connection...');
    hubClient.connectToHub().then(() => {
      console.log('CCM Extension: Initial connection succeeded');
    }).catch(err => {
      console.error('CCM Extension: Initial connection failed:', err);
      // Schedule retry sooner
      setTimeout(() => {
        console.log('CCM Extension: Retrying connection...');
        hubClient.connectToHub().catch(e => console.error('Retry failed:', e));
      }, 2000);
    });
    
  } catch (error) {
    console.error('CCM Extension: Initialization failed:', error);
    initializationComplete = false;
  }
}, 1000); // Only 1 second delay

// Handle tab cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  if (contentScriptManager) {
    contentScriptManager.removeTab(tabId);
  }
  if (hubClient && hubClient.operationLock) {
    hubClient.operationLock.releaseLock(tabId);
  }
});

// Also try to connect when popup is opened
chrome.action.onClicked.addListener(() => {
  if (hubClient && !hubClient.isConnected()) {
    console.log('CCM Extension: Popup clicked - attempting connection');
    hubClient.connectToHub().catch(err => {
      console.error('CCM Extension: Popup-triggered connection failed:', err);
    });
  }
});

console.log('CCM Extension: Balanced background script loaded');