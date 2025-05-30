// Enhanced popup script with hub reconnection fix
class CCMPopup {
  constructor() {
    this.backgroundScript = null;
    this.lastHubCheckTime = 0;
    this.hubCheckInterval = 5000; // Check every 5 seconds
    this.init();
  }

  async init() {
    await this.connectToBackground();
    this.setupEventListeners();
    
    // Force immediate hub check and reconnection attempt
    await this.forceHubReconnection();
    
    this.updateStatus(); // Initial update
    this.startStatusUpdates();
  }

  async connectToBackground() {
    // In Manifest V3 service workers, we use messaging instead of direct access
    this.useMessaging = true;
  }

  async forceHubReconnection() {
    console.log('Popup: Requesting hub reconnection check...');
    
    // Send message to background to check and reconnect if needed
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        type: 'forceHubReconnection',
        source: 'popup'
      }, (response) => {
        console.log('Popup: Hub reconnection response:', response);
        resolve(response || {});
      });
    });
  }

  async getBackgroundStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getHubStatus' }, (response) => {
        // If no response, background might be inactive
        if (!response) {
          console.log('Popup: No response from background, triggering reconnection...');
          this.forceHubReconnection();
        }
        resolve(response || {});
      });
    });
  }

  setupEventListeners() {
    // Add click handler for hub status to show more details
    document.querySelector('.hub-status').addEventListener('click', () => {
      this.toggleHubDetails();
    });
    
    // Add manual reconnect button if hub is disconnected
    const reconnectBtn = document.getElementById('reconnect-btn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', async () => {
        console.log('Popup: Manual reconnection requested');
        reconnectBtn.disabled = true;
        reconnectBtn.textContent = 'Reconnecting...';
        
        await this.forceHubReconnection();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.updateStatus();
        
        reconnectBtn.disabled = false;
        reconnectBtn.textContent = 'Reconnect';
      });
    }
  }

  startStatusUpdates() {
    // Update status every 2 seconds
    setInterval(() => {
      this.updateStatus();
    }, 2000);
    
    // Check hub connection less frequently but more thoroughly
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastHubCheckTime > this.hubCheckInterval) {
        this.lastHubCheckTime = now;
        this.checkHubHealth();
      }
    }, 1000);
  }

  async checkHubHealth() {
    const status = await this.getBackgroundStatus();
    
    // If hub shows as disconnected but we know MCP server should be running
    if (!status.hubConnected && status.serverPort) {
      console.log('Popup: Hub disconnected but should be available, requesting reconnection...');
      await this.forceHubReconnection();
    }
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
      
      // Hide reconnect button
      const reconnectBtn = document.getElementById('reconnect-btn');
      if (reconnectBtn) {
        reconnectBtn.style.display = 'none';
      }
    } else {
      serverDot.className = 'status-dot disconnected';
      serverDetail.textContent = 'Not connected';
      helpSection.style.display = 'block';
      
      // Show reconnect button
      const reconnectBtn = document.getElementById('reconnect-btn');
      if (reconnectBtn) {
        reconnectBtn.style.display = 'inline-block';
      }
      
      // Add last connection attempt info if available
      if (status.lastConnectionAttempt) {
        const timeSince = Date.now() - status.lastConnectionAttempt;
        const seconds = Math.floor(timeSince / 1000);
        serverDetail.textContent = `Not connected (last attempt: ${seconds}s ago)`;
      }
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
    
    // Group clients by type
    const clientsByType = validClients.reduce((acc, client) => {
      const type = client.type || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(client);
      return acc;
    }, {});
    
    // Render grouped clients
    Object.entries(clientsByType).forEach(([type, typeClients]) => {
      typeClients.forEach(client => {
        const clientCard = this.createClientCard(client);
        container.appendChild(clientCard);
      });
    });
  }
  
  createClientCard(client) {
    const card = document.createElement('div');
    card.className = 'client-card';
    
    const typeClass = this.getClientTypeClass(client.type);
    const lastActiveText = this.formatLastActive(client.lastActivity);
    
    card.innerHTML = `
      <div class="client-header">
        <h3 class="client-name">${this.escapeHtml(client.name)}</h3>
        <span class="client-type ${typeClass}">${this.formatClientType(client.type)}</span>
      </div>
      <p class="client-id">${this.escapeHtml(client.id)}</p>
      <div class="client-stats">
        <div class="stat">
          <span class="stat-label">Requests</span>
          <span class="stat-value">${client.requestCount || 0}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Connected</span>
          <span class="stat-value">${this.formatDuration(client.connectedAt)}</span>
        </div>
      </div>
      <div class="client-footer">
        <span class="last-active">Last active <strong>${lastActiveText}</strong></span>
        <span class="status-indicator ${client.connected ? 'active' : 'inactive'}">
          ${client.connected ? 'Active' : 'Inactive'}
        </span>
      </div>
    `;
    
    return card;
  }
  
  // ... rest of the helper methods remain the same ...
  
  formatDuration(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 0) return '0s';
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  formatLastActive(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 0) return 'Just now';
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else if (seconds > 5) {
      return `${seconds}s ago`;
    } else {
      return 'Just now';
    }
  }
  
  // ... rest of the implementation ...
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new CCMPopup();
});