/**
 * MCP Client Detector
 * Detects which MCP host spawned this server (Claude Code, Claude Desktop, VS Code, etc.)
 */

const fs = require('fs');
const path = require('path');

// Load client names and detection patterns
let clientConfig = null;
try {
  const configPath = path.join(__dirname, '../../../shared/mcp-client-names.json');
  clientConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error('CCM: Warning - could not load mcp-client-names.json, using defaults');
}

class MCPClientDetector {
  static getClientInfo(clientId) {
    if (clientConfig && clientConfig.clientNames && clientConfig.clientNames[clientId]) {
      const clientData = clientConfig.clientNames[clientId];
      return {
        id: clientId,
        name: clientData.shortName,
        longName: clientData.longName,
        type: clientId,
        icon: clientData.icon,
        color: clientData.color
      };
    }
    
    // Fallback for unknown clients
    return {
      id: clientId,
      name: clientId.charAt(0).toUpperCase() + clientId.slice(1).replace(/-/g, ' '),
      type: clientId
    };
  }

  static detectClientInfo() {
    const processName = process.title || process.argv[0] || '';
    const parentProcess = process.env._ || '';
    const execPath = process.execPath || '';
    const argv = process.argv.join(' ');
    const cwd = process.cwd();
    const parentPid = process.ppid;
    
    // Debug logging (can be enabled with CCM_DEBUG_DETECTION=1)
    if (process.env.CCM_DEBUG_DETECTION) {
      console.error('CCM Detection Debug:');
      console.error('  processName:', processName);
      console.error('  parentProcess:', parentProcess);
      console.error('  execPath:', execPath);
      console.error('  argv:', argv);
      console.error('  cwd:', cwd);
      console.error('  parentPid:', parentPid);
      console.error('  CLAUDE_DESKTOP_APP:', process.env.CLAUDE_DESKTOP_APP);
      console.error('  CLAUDE_DESKTOP:', process.env.CLAUDE_DESKTOP);
      console.error('  _:', process.env._);
    }
    
    // Try to detect Claude Desktop FIRST (more specific patterns)
    // Check for explicit Claude Desktop environment variables first
    if (process.env.CLAUDE_DESKTOP_APP || process.env.CLAUDE_DESKTOP) {
      return MCPClientDetector.getClientInfo('claude-desktop');
    }
    
    // Check parent process via ps command to see if it's Claude Desktop
    try {
      const { execSync } = require('child_process');
      const parentInfo = execSync(`ps -p ${parentPid} -o comm=`, { encoding: 'utf8' }).trim();
      if (parentInfo.toLowerCase().includes('claude') && !parentInfo.toLowerCase().includes('claude-code')) {
        return MCPClientDetector.getClientInfo('claude-desktop');
      }
    } catch (e) {
      // ps command failed, continue with other detection methods
    }
    
    // Check for Claude Desktop specific patterns
    if (argv.toLowerCase().includes('claude.app') ||
        execPath.toLowerCase().includes('claude.app') ||
        parentProcess.toLowerCase().includes('claude.app') ||
        (parentProcess.toLowerCase().includes('claude') && 
         !parentProcess.toLowerCase().includes('claude-code') && 
         !parentProcess.toLowerCase().includes('/bin/claude'))) {
      return MCPClientDetector.getClientInfo('claude-desktop');
    }
    
    // Try to detect Claude Code (more specific detection)
    if (process.env.CLAUDE_CODE_SESSION || 
        process.env.CLAUDE_CODE || 
        argv.includes('/bin/claude') ||
        argv.includes('claude-code') ||
        parentProcess.toLowerCase().includes('/bin/claude') ||
        (argv.toLowerCase().includes('claude') && !argv.toLowerCase().includes('claude.app'))) {
      return MCPClientDetector.getClientInfo('claude-code');
    }
    
    // Try to detect VS Code
    if (parentProcess.toLowerCase().includes('vscode') ||
        processName.toLowerCase().includes('vscode') ||
        process.env.VSCODE_PID) {
      return MCPClientDetector.getClientInfo('vscode');
    }
    
    // Try to detect Cursor
    if (parentProcess.toLowerCase().includes('cursor') ||
        processName.toLowerCase().includes('cursor') ||
        process.env.CURSOR_PID) {
      return MCPClientDetector.getClientInfo('cursor');
    }
    
    // Generic detection from process title/path
    const cleanName = processName.replace(/\.exe$/, '').replace(/^.*[/\\]/, '');
    if (cleanName && cleanName !== 'node') {
      return {
        id: cleanName.toLowerCase(),
        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        type: 'auto-detected'
      };
    }
    
    // Fallback
    return MCPClientDetector.getClientInfo('mcp-client');
  }

  static mergeClientInfo(clientInfo = {}) {
    const autoDetected = MCPClientDetector.detectClientInfo();
    const finalInfo = {
      id: process.env.CCM_CLIENT_ID || clientInfo.id || autoDetected.id,
      name: process.env.CCM_CLIENT_NAME || clientInfo.name || autoDetected.name,
      type: process.env.CCM_CLIENT_TYPE || clientInfo.type || autoDetected.type,
      capabilities: ['chrome_tabs', 'debugger', 'claude_automation'],
      ...clientInfo
    };
    
    console.error(`CCM: Detected client: ${finalInfo.name} (${finalInfo.type})`);
    console.error(`CCM: Auto-detected info:`, JSON.stringify(autoDetected, null, 2));
    console.error(`CCM: Final client info:`, JSON.stringify(finalInfo, null, 2));
    return finalInfo;
  }
}

module.exports = { MCPClientDetector };