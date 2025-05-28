// Popup script for Claude Chrome MCP extension
class CCMPopup {
  constructor() {
    this.backgroundScript = null;
    this.init();
  }

  async init() {
    await this.connectToBackground();
    this.setupEventListeners();
    this.startStatusUpdates();
    this.refreshData();
  }

  async connectToBackground() {
    // In Manifest V3 service workers, we use messaging instead of direct access
    this.useMessaging = true;
  }

  async getBackgroundStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
        resolve(response || {});
      });
    });
  }

  setupEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.refreshData();
    });

    document.getElementById('new-tab-btn').addEventListener('click', () => {
      this.createNewClaudeTab();
    });

    // Add click handler for server status to retry connection
    document.getElementById('server-status').addEventListener('click', () => {
      this.retryConnection();
    });
  }

  startStatusUpdates() {
    // Update status every 2 seconds
    setInterval(() => {
      this.updateServerStatus();
    }, 2000);
  }

  async updateServerStatus() {
    try {
      const status = await this.getBackgroundStatus();
      
      if (!status.connectionState) {
        this.setServerStatus('disconnected', 'Background script not available');
        this.showHelp(true);
        return;
      }

      const connectionState = status.connectionState;
      const websocketState = status.websocketState;
      const attempts = status.reconnectAttempts || 0;
      const maxAttempts = status.maxReconnectAttempts || 10;
      const lastError = status.lastError;

      if (connectionState === 'connecting') {
        this.setServerStatus('connecting', 'Connecting to MCP server...');
        this.showHelp(false);
      } else if (connectionState === 'connected') {
        this.setServerStatus('connected', 'Connected to MCP server');
        this.showHelp(false);
      } else {
        // Disconnected state
        if (attempts >= maxAttempts) {
          const errorMsg = lastError === 'MCP server not running' ? 
            'MCP server not running' : 'Connection failed (max retries exceeded)';
          this.setServerStatus('disconnected', errorMsg);
          this.showHelp(true);
        } else if (attempts > 0) {
          this.setServerStatus('connecting', `Reconnecting... (${attempts}/${maxAttempts})`);
          this.showHelp(false);
        } else {
          const errorMsg = lastError === 'MCP server not running' ? 
            'MCP server not running' : 'Disconnected from MCP server';
          this.setServerStatus('disconnected', errorMsg);
          this.showHelp(lastError === 'MCP server not running');
        }
      }
    } catch (error) {
      console.error('Failed to get background status:', error);
      this.setServerStatus('disconnected', 'Failed to get status');
      this.showHelp(true);
    }
  }

  showHelp(show) {
    const helpSection = document.getElementById('help-section');
    helpSection.style.display = show ? 'block' : 'none';
  }

  setServerStatus(status, detail) {
    const serverDot = document.getElementById('server-dot');
    const serverDetail = document.getElementById('server-detail');
    const serverStatus = document.getElementById('server-status');
    
    serverDot.className = `status-dot ${status}`;
    serverDetail.textContent = detail;
    
    // Add clickable styling for disconnected states
    if (status === 'disconnected') {
      serverStatus.style.cursor = 'pointer';
      serverStatus.title = 'Click to retry connection';
      if (!detail.includes('Click to retry')) {
        serverDetail.textContent = detail + ' (Click to retry)';
      }
    } else {
      serverStatus.style.cursor = 'default';
      serverStatus.title = '';
    }
  }

  retryConnection() {
    chrome.runtime.sendMessage({ type: 'retryConnection' }, (response) => {
      if (response?.success) {
        console.log('Retry connection requested');
      }
    });
  }

  async refreshData() {
    await this.updateClaudeSessions();
  }

  async updateClaudeSessions() {
    try {
      const tabs = await this.queryClaudeTabs();
      this.renderSessions(tabs);
    } catch (error) {
      console.error('Failed to get Claude tabs:', error);
      this.renderSessions([]);
    }
  }

  async queryClaudeTabs() {
    return new Promise((resolve) => {
      chrome.tabs.query({ url: 'https://claude.ai/*' }, async (tabs) => {
        // Get debugger sessions from background
        const status = await this.getBackgroundStatus().catch(() => ({}));
        const debuggerSessions = new Set(status.debuggerSessions || []);
        
        const claudeTabs = tabs.map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
          debuggerAttached: debuggerSessions.has(tab.id)
        }));
        
        resolve(claudeTabs);
      });
    });
  }

  renderSessions(sessions) {
    const container = document.getElementById('sessions-container');
    
    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty-state">No Claude.ai tabs found</div>';
      return;
    }

    container.innerHTML = sessions.map(session => `
      <div class="session-item">
        <div class="session-title">${this.escapeHtml(session.title)}</div>
        <div class="session-url">${this.escapeHtml(session.url)}</div>
        <div class="session-badges">
          ${session.active ? '<span class="badge active">Active</span>' : ''}
          ${session.debuggerAttached ? '<span class="badge debugger">Debugger</span>' : ''}
        </div>
      </div>
    `).join('');
  }

  async createNewClaudeTab() {
    try {
      chrome.tabs.create({ url: 'https://claude.ai' });
      // Refresh after a short delay to show the new tab
      setTimeout(() => this.refreshData(), 1000);
    } catch (error) {
      console.error('Failed to create new Claude tab:', error);
    }
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new CCMPopup();
});