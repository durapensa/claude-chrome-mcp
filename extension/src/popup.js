// Extension Popup Script - Modular Version

document.addEventListener('DOMContentLoaded', async () => {
  console.log('CCM Popup: Initializing...');
  
  // Get connection health
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'mcp_tool_request',
      tool: 'get_connection_health',
      params: {}
    });
    
    if (response && response.success) {
      updatePopupUI(response.health);
    } else {
      showError('Failed to get connection status');
    }
  } catch (error) {
    console.error('CCM Popup: Error getting health:', error);
    showError('Extension not connected');
  }
  
  // Set up button handlers
  setupButtonHandlers();
});

function updatePopupUI(health) {
  // Update hub status
  const statusDot = document.getElementById('server-dot');
  const statusDetail = document.getElementById('server-detail');
  const helpSection = document.getElementById('help-section');
  
  if (health.hubConnected) {
    if (statusDot) {
      statusDot.className = 'status-dot connected';
    }
    if (statusDetail) {
      statusDetail.textContent = 'Connected to WebSocket Hub';
    }
    if (helpSection) {
      helpSection.style.display = 'none';
    }
  } else {
    if (statusDot) {
      statusDot.className = 'status-dot disconnected';
    }
    if (statusDetail) {
      statusDetail.textContent = 'Not connected to hub';
    }
    if (helpSection) {
      helpSection.style.display = 'block';
    }
  }
  
  // Update connected clients count
  const clientsCount = document.getElementById('clients-count');
  const clientsList = document.getElementById('clients-list');
  
  if (clientsCount) {
    clientsCount.textContent = health.connectedClients.length;
  }
  
  if (clientsList) {
    if (health.connectedClients.length > 0) {
      clientsList.innerHTML = health.connectedClients.map(client => `
        <div class="client-card">
          <div class="client-header">
            <div class="client-info">
              <div class="client-name">${client.name || 'Unknown Client'}</div>
              <div class="client-id">${client.id}</div>
            </div>
            <div class="client-type-badge ${client.type}">${client.type || 'unknown'}</div>
          </div>
          <div class="client-stats">
            <div class="stat-item">
              <div class="stat-label">Connected</div>
              <div class="stat-value">${formatDuration(Date.now() - client.connectedAt)}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Messages</div>
              <div class="stat-value">${client.messageCount || 0}</div>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      clientsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔗</div>
          <div>No MCP clients connected</div>
        </div>
      `;
    }
  }
  
  // Update Claude sessions
  const sessionsCount = document.getElementById('sessions-count');
  const sessionsContainer = document.getElementById('sessions-container');
  
  if (sessionsCount) {
    sessionsCount.textContent = health.contentScriptTabs.length;
  }
  
  if (sessionsContainer && health.contentScriptTabs.length > 0) {
    // Get tab info for content script tabs
    chrome.tabs.query({}, (tabs) => {
      const claudeTabs = tabs.filter(tab => health.contentScriptTabs.includes(tab.id));
      
      if (claudeTabs.length > 0) {
        sessionsContainer.innerHTML = claudeTabs.map(tab => `
          <div class="session-card">
            <div class="session-title">${tab.title}</div>
            <div class="session-url">${tab.url}</div>
            <div class="session-badges">
              ${tab.active ? '<div class="badge active"><div class="badge-icon"></div>ACTIVE</div>' : ''}
              <div class="badge debugger"><div class="badge-icon"></div>CONTENT SCRIPT</div>
            </div>
          </div>
        `).join('');
      } else {
        sessionsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🌐</div>
            <div>No Claude.ai tabs found</div>
          </div>
        `;
      }
    });
  } else if (sessionsContainer) {
    sessionsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌐</div>
        <div>No Claude.ai tabs found</div>
      </div>
    `;
  }
}

function showError(message) {
  const statusDetail = document.getElementById('server-detail');
  const statusDot = document.getElementById('server-dot');
  
  if (statusDetail) {
    statusDetail.textContent = message;
  }
  if (statusDot) {
    statusDot.className = 'status-dot disconnected';
  }
}

function formatDuration(ms) {
  if (ms < 1000) return 'just now';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

function setupButtonHandlers() {
  // Reconnect button
  const reconnectBtn = document.getElementById('reconnect-btn');
  if (reconnectBtn) {
    reconnectBtn.style.display = 'inline-block';
    reconnectBtn.addEventListener('click', async () => {
      reconnectBtn.disabled = true;
      reconnectBtn.textContent = 'Reconnecting...';
      
      // Send message to background to attempt reconnection
      chrome.runtime.sendMessage({ type: 'force_reconnect' });
      
      // Reload popup after a moment
      setTimeout(() => {
        location.reload();
      }, 1500);
    });
  }
  
  // Refresh on popup open
  // Get fresh data every time popup opens
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'mcp_tool_request',
      tool: 'get_connection_health',
      params: {}
    }).then(response => {
      if (response && response.success) {
        updatePopupUI(response.health);
      }
    }).catch(err => {
      console.error('CCM Popup: Refresh error:', err);
    });
  }, 500);
}