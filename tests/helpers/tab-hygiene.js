/**
 * Tab Hygiene Helper
 * 
 * Provides centralized tab management for tests to prevent tab leaks.
 * Features:
 * - Tracks all tabs created during tests
 * - Provides shared tabs for tests that don't need isolation
 * - Ensures cleanup runs even if tests fail
 * - Supports both shared and dedicated tab patterns
 */

const { MCPTestClient } = require('./mcp-test-client');

class TabHygiene {
  constructor() {
    this.createdTabs = new Set();
    this.sharedTabs = new Map(); // Key: purpose, Value: tabId
    this.client = null;
    this.isCleaningUp = false;
  }

  /**
   * Initialize the hygiene service with a client
   */
  async initialize(client) {
    this.client = client;
  }

  /**
   * Get or create a shared tab for a specific purpose
   * @param {string} purpose - The purpose of the tab (e.g., 'dom-operations', 'script-execution')
   * @param {boolean} injectContentScript - Whether to inject content script
   * @returns {number} Tab ID
   */
  async getSharedTab(purpose = 'default', injectContentScript = true) {
    // Check if we already have a shared tab for this purpose
    if (this.sharedTabs.has(purpose)) {
      const tabId = this.sharedTabs.get(purpose);
      
      // Verify the tab still exists
      try {
        const listResult = await this.client.callTool('tab_list');
        const tabExists = listResult.tabs.some(t => t.id === tabId);
        
        if (tabExists) {
          return tabId;
        } else {
          // Tab was closed externally, remove from tracking
          this.sharedTabs.delete(purpose);
          this.createdTabs.delete(tabId);
        }
      } catch (e) {
        console.log(`Warning: Failed to verify shared tab ${tabId}:`, e.message);
        this.sharedTabs.delete(purpose);
        this.createdTabs.delete(tabId);
      }
    }

    // Create a new shared tab
    try {
      const result = await this.client.callTool('tab_create', {
        injectContentScript,
        waitForLoad: true
      });
      
      const tabId = result.tabId;
      this.sharedTabs.set(purpose, tabId);
      this.createdTabs.add(tabId);
      
      console.log(`✅ Created shared tab ${tabId} for purpose: ${purpose}`);
      return tabId;
    } catch (error) {
      throw new Error(`Failed to create shared tab for ${purpose}: ${error.message}`);
    }
  }

  /**
   * Create a dedicated tab (for tests that need isolation)
   * @param {object} options - Tab creation options
   * @returns {number} Tab ID
   */
  async createDedicatedTab(options = {}) {
    const defaultOptions = {
      injectContentScript: true,
      waitForLoad: true
    };
    
    try {
      const result = await this.client.callTool('tab_create', {
        ...defaultOptions,
        ...options
      });
      
      const tabId = result.tabId;
      this.createdTabs.add(tabId);
      
      console.log(`✅ Created dedicated tab ${tabId}`);
      return tabId;
    } catch (error) {
      throw new Error(`Failed to create dedicated tab: ${error.message}`);
    }
  }

  /**
   * Track an externally created tab for cleanup
   * @param {number} tabId - Tab ID to track
   */
  trackTab(tabId) {
    this.createdTabs.add(tabId);
  }

  /**
   * Remove a tab from tracking (if cleaned up manually)
   * @param {number} tabId - Tab ID to untrack
   */
  untrackTab(tabId) {
    this.createdTabs.delete(tabId);
    
    // Also remove from shared tabs if present
    for (const [purpose, id] of this.sharedTabs.entries()) {
      if (id === tabId) {
        this.sharedTabs.delete(purpose);
        break;
      }
    }
  }

  /**
   * Clean up a specific tab
   * @param {number} tabId - Tab ID to close
   * @param {boolean} force - Whether to force close
   */
  async cleanupTab(tabId, force = true) {
    try {
      await this.client.callTool('tab_close', { tabId, force });
      this.untrackTab(tabId);
      console.log(`✅ Closed tab ${tabId}`);
    } catch (e) {
      console.log(`Warning: Failed to close tab ${tabId}:`, e.message);
      // Still remove from tracking to avoid repeated attempts
      this.untrackTab(tabId);
    }
  }

  /**
   * Clean up all tracked tabs
   * @param {boolean} preserveShared - Whether to preserve shared tabs
   */
  async cleanupAll(preserveShared = false) {
    if (this.isCleaningUp) {
      console.log('⚠️ Cleanup already in progress, skipping...');
      return;
    }

    this.isCleaningUp = true;
    const tabsToClean = [];

    try {
      // Collect tabs to clean
      for (const tabId of this.createdTabs) {
        if (preserveShared && Array.from(this.sharedTabs.values()).includes(tabId)) {
          continue; // Skip shared tabs if preserving
        }
        tabsToClean.push(tabId);
      }

      if (tabsToClean.length === 0) {
        console.log('✅ No tabs to clean up');
        return;
      }

      console.log(`🧹 Cleaning up ${tabsToClean.length} tabs...`);

      // Clean up tabs one by one to ensure each gets attempted
      for (const tabId of tabsToClean) {
        await this.cleanupTab(tabId);
      }

      // Clear shared tabs mapping if not preserving
      if (!preserveShared) {
        this.sharedTabs.clear();
      }

    } catch (error) {
      console.error('Error during tab cleanup:', error);
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Get statistics about tracked tabs
   */
  getStats() {
    return {
      totalTracked: this.createdTabs.size,
      sharedTabs: this.sharedTabs.size,
      dedicatedTabs: this.createdTabs.size - this.sharedTabs.size
    };
  }
}

/**
 * Global tab hygiene service for all tests
 */
const globalTabHygiene = new TabHygiene();

/**
 * Setup function to be called in beforeAll hooks
 * @param {MCPTestClient} client - The test client to use
 */
async function setupTabHygiene(client) {
  await globalTabHygiene.initialize(client);
}

/**
 * Cleanup function to be called in afterAll hooks
 * @param {boolean} preserveShared - Whether to preserve shared tabs for next test file
 */
async function cleanupAllTabs(preserveShared = false) {
  // Create a temporary client for cleanup if needed
  if (!globalTabHygiene.client) {
    const tempClient = new MCPTestClient();
    try {
      await tempClient.connect();
      await globalTabHygiene.initialize(tempClient);
      await globalTabHygiene.cleanupAll(preserveShared);
      await tempClient.disconnect();
    } catch (e) {
      console.error('Failed to cleanup tabs with temporary client:', e);
    }
  } else {
    await globalTabHygiene.cleanupAll(preserveShared);
  }
}

/**
 * Final cleanup to be called at the very end of test runs
 * This ensures no tabs are left open even if individual test cleanup fails
 */
async function finalTabCleanup() {
  console.log('\n🧹 Running final tab cleanup...');
  
  const tempClient = new MCPTestClient();
  try {
    await tempClient.connect();
    
    // Get all Claude tabs
    const listResult = await tempClient.callTool('tab_list');
    const allTabs = listResult.tabs || [];
    
    if (allTabs.length === 0) {
      console.log('✅ No tabs found, cleanup complete');
      return;
    }

    console.log(`Found ${allTabs.length} tabs to clean...`);
    
    // Close all tabs except one (to avoid Chrome closing)
    const tabsToClose = allTabs.slice(0, -1);
    
    for (const tab of tabsToClose) {
      try {
        await tempClient.callTool('tab_close', { tabId: tab.id, force: true });
        console.log(`✅ Closed tab ${tab.id}`);
      } catch (e) {
        console.log(`Warning: Failed to close tab ${tab.id}:`, e.message);
      }
    }
    
    console.log(`✅ Final cleanup complete. Kept 1 tab open.`);
    
  } catch (error) {
    console.error('Final cleanup failed:', error);
  } finally {
    await tempClient.disconnect();
  }
}

// Register final cleanup to run when all tests complete
if (typeof afterAll === 'function') {
  // Jest environment - register global cleanup
  afterAll(async () => {
    await finalTabCleanup();
  }, 30000);
}

// Handle process exit to ensure cleanup
process.on('exit', () => {
  console.log('Process exiting, ensuring tab cleanup...');
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  try {
    await finalTabCleanup();
  } catch (cleanupError) {
    console.error('Failed to cleanup during exception:', cleanupError);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  try {
    await finalTabCleanup();
  } catch (cleanupError) {
    console.error('Failed to cleanup during rejection:', cleanupError);
  }
  process.exit(1);
});

module.exports = {
  TabHygiene,
  globalTabHygiene,
  setupTabHygiene,
  cleanupAllTabs,
  finalTabCleanup
};