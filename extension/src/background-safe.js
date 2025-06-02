// Chrome Extension Background Service Worker - SAFE VERSION
// Prevents Chrome freezing with careful initialization and connection management

import { MESSAGE_TYPES } from './modules/config.js';
import { ContentScriptManager } from './modules/content-script-manager.js';

// IMPORTANT: Do NOT import or create HubClient immediately
// This prevents WebSocket connection attempts during Chrome startup

console.log('CCM: Safe background script starting...');

// Global variables - initialized later
let hubClient = null;
let contentScriptManager = null;
let initializationComplete = false;

// Register minimal event listeners
console.log('CCM: Registering minimal event listeners...');

// Create a single alarm for periodic checks
chrome.runtime.onInstalled.addListener(() => {
  console.log('CCM Extension: Installed/Updated');
  // Create alarm but don't do anything else
  chrome.alarms.create('periodicCheck', { periodInMinutes: 2 });
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodicCheck') {
    console.log('CCM Extension: Periodic check');
    
    // Only try to connect if we're initialized and not connected
    if (initializationComplete && hubClient && !hubClient.isConnected()) {
      console.log('CCM Extension: Attempting connection...');
      hubClient.connectToHub().catch(err => {
        console.error('CCM Extension: Connection failed:', err);
      });
    }
  }
});

// Handle messages - queue them if not ready
const messageQueue = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!initializationComplete) {
    console.log('CCM Extension: Not initialized, queuing message');
    messageQueue.push({ request, sender, sendResponse });
    // Return true to indicate async response
    return true;
  }
  
  return handleMessage(request, sender, sendResponse);
});

function handleMessage(request, sender, sendResponse) {
  // Handle MCP tool requests
  if (request.type === 'mcp_tool_request' && request.tool && request.params) {
    if (request.tool === 'get_connection_health') {
      // Special case - always respond even if not connected
      sendResponse({
        success: true,
        health: {
          hubConnected: hubClient ? hubClient.isConnected() : false,
          connectedClients: [],
          operationLocks: [],
          messageQueueSize: 0,
          contentScriptTabs: [],
          initialized: initializationComplete
        }
      });
      return false;
    }
    
    if (!hubClient) {
      sendResponse({ success: false, error: 'Extension not initialized' });
      return false;
    }
    
    console.log(`CCM: MCP tool request: ${request.tool}`);
    hubClient.handleMCPToolRequest(request.tool, request.params)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // Handle content script injection
  if (request.type === MESSAGE_TYPES.MANUAL_INJECT && request.tabId && contentScriptManager) {
    contentScriptManager.injectContentScript(request.tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  return false;
}

// Delayed initialization - wait for Chrome to fully start
setTimeout(async () => {
  console.log('CCM Extension: Starting delayed initialization...');
  
  try {
    // First create ContentScriptManager (safe, no external connections)
    contentScriptManager = new ContentScriptManager();
    console.log('CCM Extension: ContentScriptManager created');
    
    // Import HubClient only when ready to use it
    const { HubClient } = await import('./modules/hub-client-fixed.js');
    
    // Create HubClient but don't connect yet
    hubClient = new HubClient();
    await hubClient.init();
    
    // Make globally accessible for debugging
    globalThis.ccmHubClient = hubClient;
    globalThis.contentScriptManager = contentScriptManager;
    
    // Start keepalive
    hubClient.startKeepalive();
    
    initializationComplete = true;
    console.log('CCM Extension: Initialization complete');
    
    // Process any queued messages
    while (messageQueue.length > 0) {
      const { request, sender, sendResponse } = messageQueue.shift();
      handleMessage(request, sender, sendResponse);
    }
    
    // Try initial connection after a delay
    setTimeout(() => {
      console.log('CCM Extension: Attempting initial connection...');
      hubClient.connectToHub().catch(err => {
        console.error('CCM Extension: Initial connection failed:', err);
      });
    }, 3000);
    
  } catch (error) {
    console.error('CCM Extension: Initialization failed:', error);
    initializationComplete = false;
  }
}, 5000); // 5 second delay before initialization

// Handle tab cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  if (contentScriptManager) {
    contentScriptManager.removeTab(tabId);
  }
  if (hubClient && hubClient.operationLock) {
    hubClient.operationLock.releaseLock(tabId);
  }
});

console.log('CCM Extension: Safe background script loaded');