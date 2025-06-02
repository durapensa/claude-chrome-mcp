// Chrome Extension Background Service Worker - ES Module Entry Point
// This will be bundled by webpack for Manifest V3 compatibility

import { HubClient } from './modules/hub-client.js';
import { ContentScriptManager } from './modules/content-script-manager.js';
import { WEBSOCKET_PORT, MESSAGE_TYPES } from './modules/config.js';

// Register event listeners immediately for Manifest V3 service worker persistence
console.log('CCM: Registering critical event listeners at startup...');

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('CCM Extension: Service worker started');
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('CCM Extension: Installed/Updated');
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
});

self.addEventListener('activate', event => {
  console.log('CCM Extension: Service worker activated');
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
});

// Initialize main components
const hubClient = new HubClient();
const contentScriptManager = new ContentScriptManager();

// Make hubClient globally accessible for debugging
globalThis.ccmHubClient = hubClient;
globalThis.contentScriptManager = contentScriptManager;

// Handle alarms to keep service worker alive and check connection
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('CCM Extension: Keep-alive alarm triggered');
    
    // Check WebSocket connection status
    if (!hubClient.isConnected()) {
      console.log('CCM Extension: WebSocket not connected, attempting reconnection...');
      hubClient.connectToHub();
    } else {
      console.log('CCM Extension: WebSocket connection is healthy');
    }
    
    // Store connection state for recovery
    chrome.storage.local.set({
      lastAliveTime: Date.now(),
      connectionState: hubClient.isConnected() ? 'connected' : 'disconnected',
      connectedClients: hubClient.connectedClients.size,
      reconnectAttempts: hubClient.reconnectAttempts
    });
  }
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptManager.removeTab(tabId);
  hubClient.operationLock.releaseLock(tabId);
});

// Handle runtime messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle wake-up by ensuring WebSocket is connected
  if (!hubClient.isConnected()) {
    console.log('CCM Extension: Service worker wake-up detected, attempting reconnection...');
    hubClient.connectToHub();
  }
  
  // Handle content script injection requests
  if (request.type === MESSAGE_TYPES.MANUAL_INJECT && request.tabId) {
    console.log(`CCM: Manual injection requested for tab ${request.tabId}`);
    contentScriptManager.injectContentScript(request.tabId)
      .then(result => {
        console.log(`CCM: Manual injection completed for tab ${request.tabId}`);
        sendResponse(result);
      })
      .catch(error => {
        console.error(`CCM: Manual injection failed for tab ${request.tabId}:`, error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  }
  
  // Test ContentScriptManager directly
  if (request.type === MESSAGE_TYPES.TEST_CSM && request.tabId) {
    console.log(`CCM: Testing ContentScriptManager injection for tab ${request.tabId}`);
    // Force injection regardless of existing state
    contentScriptManager.injectedTabs.delete(request.tabId);
    contentScriptManager.injectContentScript(request.tabId)
      .then(result => {
        sendResponse({ success: true, message: 'ContentScriptManager injection completed', result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Handle MCP tool requests
  if (request.type === 'mcp_tool_request' && request.tool && request.params) {
    console.log(`CCM: MCP tool request: ${request.tool}`);
    hubClient.handleMCPToolRequest(request.tool, request.params)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  return false;
});

// Export for debugging
export { hubClient, contentScriptManager };

console.log('CCM Extension: Modular background service worker initialized');