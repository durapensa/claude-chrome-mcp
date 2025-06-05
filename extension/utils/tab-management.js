// Shared Tab Management Utilities
// Centralized logic for finding/creating Claude.ai tabs

/**
 * Ensures a Claude.ai tab exists for API operations
 * Returns an existing Claude.ai tab or creates a new one at /new
 * @param {Object} tabOperations - Tab operations methods (from tab-operations.js)
 * @param {Object} options - Optional configuration
 * @param {number} options.waitMs - Milliseconds to wait for page load (default: 2000)
 * @returns {Promise<Object>} - { success: boolean, tab: Object, wasCreated: boolean }
 */
export async function ensureClaudeTabForApi(tabOperations, options = {}) {
  const { waitMs = 2000 } = options;
  
  try {
    // First try to find an existing Claude.ai tab
    const claudeTabsResult = await tabOperations.getClaudeTabs();
    const claudeTabs = claudeTabsResult.tabs || [];
    
    // Find any Claude.ai tab for authentication context
    let claudeTab = claudeTabs.find(tab => tab.url?.includes('claude.ai'));
    
    if (claudeTab) {
      return {
        success: true,
        tab: claudeTab,
        wasCreated: false
      };
    }
    
    // No Claude tab exists, create one at /new
    const newTab = await chrome.tabs.create({ 
      url: 'https://claude.ai/new',
      active: false
    });
    
    // Wait for page to load
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    
    return {
      success: true,
      tab: newTab,
      wasCreated: true
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tab: null,
      wasCreated: false
    };
  }
}

/**
 * Ensures a specific conversation tab exists
 * Returns existing conversation tab or creates a new one
 * @param {Object} tabOperations - Tab operations methods (from tab-operations.js)
 * @param {string} conversationId - UUID of the conversation
 * @param {Object} options - Optional configuration
 * @param {boolean} options.activate - Whether to activate the tab (default: false)
 * @param {boolean} options.waitForLoad - Whether to wait for page load (default: true)
 * @param {number} options.loadTimeoutMs - Load timeout in milliseconds (default: 10000)
 * @returns {Promise<Object>} - { success: boolean, tabId: number, conversationId: string, wasExisting: boolean, ... }
 */
export async function ensureConversationTab(tabOperations, conversationId, options = {}) {
  const { 
    activate = false, 
    waitForLoad = true, 
    loadTimeoutMs = 10000 
  } = options;
  
  // Validate conversation ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(conversationId)) {
    return {
      success: false,
      error: 'conversationId must be a valid UUID format'
    };
  }
  
  try {
    // Check if conversation is already open in an existing tab
    const existingTabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: `https://claude.ai/chat/${conversationId}` }, resolve);
    });

    if (existingTabs.length > 0) {
      const existingTab = existingTabs[0];
      
      // Activate the existing tab if requested
      if (activate) {
        await new Promise((resolve, reject) => {
          chrome.tabs.update(existingTab.id, { active: true }, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tab);
            }
          });
        });
      }

      return {
        success: true,
        tabId: existingTab.id,
        conversationId: conversationId,
        url: existingTab.url,
        title: existingTab.title,
        wasExisting: true,
        activated: activate
      };
    }

    // Create new tab with conversation URL
    const conversationUrl = `https://claude.ai/chat/${conversationId}`;
    const newTab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ 
        url: conversationUrl, 
        active: activate 
      }, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(tab);
        }
      });
    });

    let loadVerified = false;
    let loadTimeMs = 0;

    // Wait for page to load if requested
    if (waitForLoad) {
      const loadStartTime = Date.now();
      
      try {
        // Wait for tab to finish loading
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Load timeout after ${loadTimeoutMs}ms`));
          }, loadTimeoutMs);

          const checkLoading = () => {
            chrome.tabs.get(newTab.id, (tab) => {
              if (chrome.runtime.lastError) {
                clearTimeout(timeout);
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              if (tab.status === 'complete') {
                clearTimeout(timeout);
                resolve();
              } else {
                setTimeout(checkLoading, 500);
              }
            });
          };

          checkLoading();
        });

        loadTimeMs = Date.now() - loadStartTime;
        loadVerified = true;
        
      } catch (loadError) {
        console.warn(`Tab load verification failed for conversation ${conversationId}:`, loadError.message);
        // Non-fatal error - tab was created successfully
      }
    }

    return {
      success: true,
      tabId: newTab.id,
      conversationId: conversationId,
      url: conversationUrl,
      title: newTab.title,
      wasExisting: false,
      activated: activate,
      loadVerified: loadVerified,
      loadTimeMs: loadTimeMs
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      conversationId: conversationId
    };
  }
}

/**
 * Finds Claude.ai tabs with conversation ID mapping
 * Returns tabs with conversation IDs extracted from URLs
 * @param {Object} tabOperations - Tab operations methods (from tab-operations.js)
 * @returns {Promise<Object>} - { success: boolean, tabs: Array, tabsByConversationId: Map }
 */
export async function getClaudeTabsWithConversations(tabOperations) {
  try {
    const claudeTabsResult = await tabOperations.getClaudeTabs();
    const claudeTabs = claudeTabsResult.tabs || [];
    const tabsByConversationId = new Map();
    
    claudeTabs.forEach(tab => {
      // Extract conversation ID from URL if available
      const urlMatch = tab.url?.match(/\/chat\/([a-f0-9-]+)/);
      if (urlMatch) {
        tabsByConversationId.set(urlMatch[1], tab.id);
      }
    });

    return {
      success: true,
      tabs: claudeTabs,
      tabsByConversationId: tabsByConversationId
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tabs: [],
      tabsByConversationId: new Map()
    };
  }
}