/**
 * Test Lifecycle Management
 * 
 * Handles setup/teardown and automatic cleanup of test resources
 */

class TestLifecycle {
  constructor(client) {
    this.client = client;
    this.cleanup = [];
    this.initialState = null;
    this.createdTabs = [];
    this.createdConversations = [];
  }

  async setup() {
    // Capture initial state
    try {
      const tabsResult = await this.client.callTool('get_claude_tabs', {});
      this.initialState = {
        tabs: JSON.parse(tabsResult.content[0].text),
        timestamp: Date.now()
      };
    } catch (error) {
      console.warn('Failed to capture initial state:', error.message);
      this.initialState = { tabs: [], timestamp: Date.now() };
    }
  }

  async teardown() {
    // Clean up in reverse order
    const cleanupTasks = this.cleanup.reverse();
    
    for (const task of cleanupTasks) {
      try {
        await task();
      } catch (error) {
        console.warn('Cleanup task failed:', error.message);
      }
    }

    // Clean up any tabs created during test
    try {
      const currentTabsResult = await this.client.callTool('get_claude_tabs', {});
      const currentTabs = JSON.parse(currentTabsResult.content[0].text);
      
      const testTabs = currentTabs.filter(tab => 
        this.createdTabs.includes(tab.id) ||
        !this.initialState.tabs.find(t => t.id === tab.id)
      );

      for (const tab of testTabs) {
        try {
          await this.client.callTool('close_claude_tab', {
            tabId: tab.id,
            force: true
          });
          console.log(`Cleaned up test tab ${tab.id}`);
        } catch (error) {
          console.warn(`Failed to close tab ${tab.id}:`, error.message);
        }
      }
    } catch (error) {
      console.warn('Tab cleanup failed:', error.message);
    }
  }

  // Track a tab for cleanup
  trackTab(tabId) {
    this.createdTabs.push(tabId);
    this.cleanup.push(async () => {
      await this.client.callTool('close_claude_tab', {
        tabId: tabId,
        force: true
      });
    });
  }

  // Track a conversation for cleanup (if delete is implemented)
  trackConversation(conversationId) {
    this.createdConversations.push(conversationId);
    // Note: Delete not tracked as it may be destructive
  }

  // Add custom cleanup task
  addCleanup(fn) {
    this.cleanup.push(fn);
  }

  // Get test duration
  getDuration() {
    return Date.now() - this.initialState.timestamp;
  }
}

module.exports = TestLifecycle;