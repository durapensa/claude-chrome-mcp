// Extension Popup Script - Event-Driven Version

async function getInitialState() {
  console.log('CCM Popup: Getting initial state...');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'mcp_tool_request',
      tool: 'get_connection_health',
      params: {}
    });
    
    if (response && response.success) {
      updatePopupUI(response.health);
    } else {
      showError(response?.error || 'Failed to get connection status');
    }
  } catch (error) {
    console.error('CCM Popup: Error getting initial state:', error);
    showError('Extension connection error');
  }
}

// Listen for real-time events from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'relay_event_update') {
    console.log(`CCM Popup: Received real-time event '${message.eventType}'`);
    updatePopupUI(message.relayInfo);
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  console.log('CCM Popup: Initializing event-driven popup...');
  
  // Get initial state once
  await getInitialState();
  
  // Set up button handlers  
  setupButtonHandlers();
});

function updatePopupUI(health) {
  // Update relay status
  const statusDot = document.getElementById('server-dot');
  const statusDetail = document.getElementById('server-detail');
  const helpSection = document.getElementById('help-section');
  
  if (health.relayConnected) {
    if (statusDot) {
      statusDot.className = 'status-dot connected';
    }
    if (statusDetail) {
      statusDetail.textContent = 'Connected to WebSocket Relay';
    }
    if (helpSection) {
      helpSection.style.display = 'none';
    }
  } else if (health.isReconnecting) {
    if (statusDot) {
      statusDot.className = 'status-dot connecting';
    }
    if (statusDetail) {
      statusDetail.textContent = 'Reconnecting to relay...';
    }
    if (helpSection) {
      helpSection.style.display = 'none';
    }
  } else {
    if (statusDot) {
      statusDot.className = 'status-dot disconnected';
    }
    if (statusDetail) {
      statusDetail.textContent = 'Not connected to relay';
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
      clientsList.innerHTML = health.connectedClients.map(client => {
        // Use client-provided name directly from MCP protocol
        const displayName = client.name || 'Unknown Client';
        const icon = '🔌'; // Default icon for all MCP clients
        
        return `
        <div class="client-card">
          <div class="client-header">
            <div class="client-info">
              <div class="client-icon">${icon}</div>
              <div>
                <div class="client-name" title="${displayName}">${displayName}</div>
                <div class="client-id">${client.id}</div>
              </div>
            </div>
            <div class="client-type-badge ${client.type}">${client.type || 'unknown'}</div>
          </div>
          <div class="client-stats">
            <div class="stat-item">
              <div class="stat-label">Connected</div>
              <div class="stat-value">${formatDuration(Date.now() - client.connectedAt)}</div>
            </div>
          </div>
        </div>
      `}).join('');
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
      
      // Refresh status after a moment
      setTimeout(async () => {
        await getInitialState();
        reconnectBtn.disabled = false;
        reconnectBtn.textContent = 'Reconnect';
      }, 1500);
    });
  }
  
  // Event-driven popup - no polling needed
}