// Chrome Tools
// Browser control tools for extension management, debugging, and DOM operations

const { z } = require('zod');
const { createForwardingTool, createResourceSyncTool, extractToolsAndHandlers } = require('../utils/tool-factory');

/**
 * Resource state sync handlers for chrome tools
 */
const resourceSyncHandlers = {
  debuggerAttach: (response, server, params) => {
    const { tabId } = params;
    const source = response.alreadyAttached ? 'existing' : 'self';
    server.resourceStateManager.attachDebuggerSession(tabId, source, 'chrome_debug_attach');
    server.debug.debug(`ResourceState: Debugger session registered`, { tabId, source });
  },

  debuggerDetach: (response, server, params) => {
    const { tabId } = params;
    if (response.wasDetached) {
      server.resourceStateManager.detachDebuggerSession(tabId);
      server.debug.debug(`ResourceState: Debugger session unregistered`, { tabId });
    }
  },

  networkMonitoringStart: (response, server, params) => {
    const { tabId } = params;
    server.resourceStateManager.startNetworkMonitoring(tabId, `session_${tabId}_${Date.now()}`);
    server.debug.debug(`ResourceState: Network monitoring registered`, { tabId });
  },

  networkMonitoringStop: (response, server, params) => {
    const { tabId } = params;
    server.resourceStateManager.stopNetworkMonitoring(tabId);
    server.debug.debug(`ResourceState: Network monitoring unregistered`, { tabId });
  }
};

/**
 * Create tools using factory patterns to reduce code duplication
 */

// Simple forwarding tools (no resource management needed)
const forwardingToolResults = [
  createForwardingTool('chrome_reload_extension', 'Reload the Chrome extension to apply code changes', {}),
  createForwardingTool('chrome_debug_status', 'Get debugger attachment status for tabs', {
    tabId: z.number().optional().describe('Specific tab ID to check (optional - if not provided, returns all debugger sessions)')
  }),
  createForwardingTool('chrome_execute_script', 'Execute JavaScript in a specific tab', {
    tabId: z.number().describe('The tab ID to execute script in'),
    script: z.string().describe('The JavaScript code to execute')
  }),
  createForwardingTool('chrome_get_dom_elements', 'Query DOM elements in a specific tab', {
    tabId: z.number().describe('The tab ID to query elements in'),
    selector: z.string().describe('CSS selector to find elements')
  }),
  createForwardingTool('chrome_get_network_requests', 'Get captured network requests from monitoring', {
    tabId: z.number().describe('The tab ID to get captured requests for')
  })
];

// Resource sync tools (require resource state management)
const resourceSyncToolResults = [
  createResourceSyncTool('chrome_debug_attach', 'Attach Chrome debugger to a tab for advanced operations', {
    tabId: z.number().describe('The tab ID to attach debugger to')
  }, resourceSyncHandlers.debuggerAttach),
  
  createResourceSyncTool('chrome_debug_detach', 'Detach Chrome debugger from a tab', {
    tabId: z.number().describe('The tab ID to detach debugger from')
  }, resourceSyncHandlers.debuggerDetach),
  
  createResourceSyncTool('chrome_start_network_monitoring', 'Start network request monitoring on a tab', {
    tabId: z.number().describe('The tab ID to monitor network requests')
  }, resourceSyncHandlers.networkMonitoringStart),
  
  createResourceSyncTool('chrome_stop_network_monitoring', 'Stop network request monitoring on a tab', {
    tabId: z.number().describe('The tab ID to stop monitoring')
  }, resourceSyncHandlers.networkMonitoringStop)
];

// Extract tools and handlers from factory results
const forwardingTools = extractToolsAndHandlers(forwardingToolResults);
const resourceSyncTools = extractToolsAndHandlers(resourceSyncToolResults);

// Combine all tools and handlers
const chromeTools = [...forwardingTools.tools, ...resourceSyncTools.tools];
const chromeHandlers = { ...forwardingTools.handlers, ...resourceSyncTools.handlers };

module.exports = {
  chromeTools,
  chromeHandlers
};