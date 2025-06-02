// Utility functions for Chrome Extension

export function updateBadge(status) {
  let text = '';
  let color = '#666666'; // Default gray
  
  switch (status) {
    case 'hub-connected':
      text = 'H';
      color = '#4CAF50'; // Green
      break;
    case 'mcp-connected':
      text = 'M';
      color = '#2196F3'; // Blue
      break;
    case 'hub-disconnected':
      text = '';
      color = '#F44336'; // Red
      break;
    default:
      text = '?';
      color = '#FF9800'; // Orange
  }
  
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

export function generateOperationId() {
  return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function isClaudeAiUrl(url) {
  return url && url.includes('claude.ai');
}

export async function getActiveClaudeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const claudeTab = tabs.find(tab => isClaudeAiUrl(tab.url));
  return claudeTab || null;
}

export async function getAllClaudeTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  return tabs;
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}