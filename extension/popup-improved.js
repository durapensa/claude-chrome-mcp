// Improved popup script for Claude Chrome MCP extension
class CCMPopup {
  constructor() {
    this.backgroundScript = null;
    this.init();
  }

  async init() {
    await this.connectToBackground();
    this.setupEventListeners();
    this.updateStatus(); // Initial update
    this.startStatusUpdates();
  }

  async connectToBackground() {
    // In Manifest V3 service workers, we use messaging instead of direct access
    this.useMessaging = true;
  }

  async getBackgroundStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getHubStatus' }, (response) => {
        resolve(response || {});
      });
    });
  }

  setupEventListeners() {
    // Add click handler for hub status to show more details
    document.querySelector('.hub-status').addEventListener('click', () => {
      this.toggleHubDetails();
    });
  }

  startStatusUpdates() {
    // Update status every 2 seconds
    setInterval(() => {
      this.updateStatus();
    }, 2000);
  }

  async updateStatus() {
    const status = await this.getBackgroundStatus();
    this.updateHubDisplay(status);
    await this.updateClaudeSessions();
  }

  updateHubDisplay(status) {
    const serverDot = document.getElementById('server-dot');
    const serverDetail = document.getElementById('server-detail');
    const clientsList = document.getElementById('clients-list');
    const clientsCount = document.getElementById('clients-count');
    const helpSection = document.getElementById('help-section');
    
    // Update hub connection status
    if (status.hubConnected) {
      serverDot.className = 'status-dot connected';
      serverDetail.innerHTML = `Connected to port <strong>${status.serverPort}</strong>`;
      helpSection.style.display = 'none';
    } else {
      serverDot.className = 'status-dot disconnected';
      serverDetail.textContent = 'Not connected';
      helpSection.style.display = 'block';
    }
    
    // Update clients list with better formatting
    this.updateClientsList(status.connectedClients || [], clientsList, clientsCount);
  }
  
  updateClientsList(clients, container, countElement) {
    container.innerHTML = '';
    
    // Filter and sort clients
    const validClients = (clients || [])
      .filter(client => 
        client && 
        client.name && 
        client.name !== 'Unknown Client' && 
        client.connected === true
      )
      .sort((a, b) => {
        // Sort by type, then by name
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        return a.name.localeCompare(b.name);
      });
    
    // Update count
    countElement.textContent = validClients.length;
    
    if (validClients.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔗</div>
          <div>No MCP clients connected</div>
        </div>
      `;
      return;
    }
    
    validClients.forEach(client => {
      const clientDiv = document.createElement('div');
      clientDiv.className = 'client-card';
      
      // Format timing
      const connectedTime = this.formatDuration(Date.now() - client.connectedAt);
      const lastActivityTime = this.formatDuration(Date.now() - client.lastActivity);
      
      // Determine badge color based on type
      const badgeClass = this.getClientBadgeClass(client.type);
      
      clientDiv.innerHTML = `
        <div class="client-header">
          <div class="client-info">
            <div class="client-name">${this.escapeHtml(client.name)}</div>
            <div class="client-id">${this.escapeHtml(client.id)}</div>
          </div>
          <span class="client-type-badge ${badgeClass}">${this.escapeHtml(client.type)}</span>
        </div>
        <div class="client-stats">
          <div class="stat-item">
            <div class="stat-label">Requests</div>
            <div class="stat-value">${client.requestCount || 0}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Connected</div>
            <div class="stat-value">${connectedTime}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Last active</div>
            <div class="stat-value">${lastActivityTime}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Status</div>
            <div class="stat-value" style="color: #27ae60;">Active</div>
          </div>
        </div>
      `;
      
      container.appendChild(clientDiv);
    });
  }

  getClientBadgeClass(type) {
    const typeMap = {
      'test-suite': 'test-suite',
      'claude-code': 'claude-code',
      'claude-desktop': 'claude-desktop',
      'mcp-server': 'mcp-server'
    };
    return typeMap[type] || '';
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async updateClaudeSessions() {
    try {
      // Query for Claude.ai tabs
      const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      const container = document.getElementById('sessions-container');
      const countElement = document.getElementById('sessions-count');
      
      // Update count
      countElement.textContent = tabs.length;
      
      if (tabs.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🌐</div>
            <div>No Claude.ai tabs found</div>
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      
      // Get debugger status for all tabs
      const debuggerStatus = await this.getDebuggerStatus();
      
      tabs.forEach(tab => {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'session-card';
        
        // Extract conversation ID from URL if present
        const urlMatch = tab.url.match(/\/chat\/([a-f0-9-]+)/);
        const conversationId = urlMatch ? urlMatch[1] : null;
        
        // Create badges HTML
        const badges = [];
        if (tab.active) {
          badges.push(`
            <span class="badge active">
              <span class="badge-icon"></span>
              Active
            </span>
          `);
        }
        if (debuggerStatus[tab.id]) {
          badges.push(`
            <span class="badge debugger">
              <span class="badge-icon"></span>
              Debugger
            </span>
          `);
        }
        
        // Format title
        const title = tab.title || 'Claude';
        const displayTitle = title.replace(' - Claude', '').substring(0, 40) + (title.length > 40 ? '...' : '');
        
        sessionDiv.innerHTML = `
          <div class="session-title" title="${this.escapeHtml(tab.title)}">${this.escapeHtml(displayTitle)}</div>
          <div class="session-url" title="${this.escapeHtml(tab.url)}">${this.escapeHtml(tab.url)}</div>
          ${badges.length > 0 ? `<div class="session-badges">${badges.join('')}</div>` : ''}
        `;
        
        // Add click handler to focus tab
        sessionDiv.addEventListener('click', () => {
          chrome.tabs.update(tab.id, { active: true });
          chrome.windows.update(tab.windowId, { focused: true });
        });
        
        container.appendChild(sessionDiv);
      });
    } catch (error) {
      console.error('Error updating Claude sessions:', error);
    }
  }

  async getDebuggerStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getDebuggerStatus' }, (response) => {
        resolve(response || {});
      });
    });
  }

  toggleHubDetails() {
    // Could show additional hub details in a modal or expanded view
    console.log('Hub details clicked');
  }

  retryConnection() {
    chrome.runtime.sendMessage({ type: 'retryConnection' });
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new CCMPopup();
});