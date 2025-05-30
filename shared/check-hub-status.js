#!/usr/bin/env node

/**
 * Diagnostic script to check WebSocket hub status
 */

const WebSocket = require('ws');
const net = require('net');

const HUB_PORT = 54321;

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false); // Port is free
    });
    
    server.listen(port);
  });
}

async function tryWebSocketConnection() {
  return new Promise((resolve) => {
    console.log(`\n${colors.cyan}Attempting WebSocket connection to ws://localhost:${HUB_PORT}...${colors.reset}`);
    
    const ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ connected: false, error: 'Connection timeout' });
    }, 5000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      console.log(`${colors.green}✓ WebSocket connection successful!${colors.reset}`);
      
      // Try to send a test message
      ws.send(JSON.stringify({
        type: 'hub_status_check',
        timestamp: Date.now()
      }));
      
      // Listen for response
      ws.on('message', (data) => {
        console.log(`${colors.green}✓ Received response:${colors.reset}`, data.toString());
      });
      
      setTimeout(() => {
        ws.close();
        resolve({ connected: true });
      }, 1000);
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`${colors.red}✗ WebSocket error:${colors.reset}`, error.message);
      resolve({ connected: false, error: error.message });
    });
  });
}

async function checkHubStatus() {
  console.log(`${colors.blue}🔍 WebSocket Hub Status Check${colors.reset}`);
  console.log('=' .repeat(50));
  
  // 1. Check if port is in use
  console.log(`\n${colors.cyan}Checking port ${HUB_PORT}...${colors.reset}`);
  const portInUse = await checkPort(HUB_PORT);
  
  if (portInUse) {
    console.log(`${colors.green}✓ Port ${HUB_PORT} is in use${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ Port ${HUB_PORT} is free (no hub running)${colors.reset}`);
  }
  
  // 2. Try WebSocket connection
  if (portInUse) {
    const result = await tryWebSocketConnection();
    
    if (result.connected) {
      console.log(`\n${colors.green}✅ Hub is running and accepting connections${colors.reset}`);
    } else {
      console.log(`\n${colors.yellow}⚠️  Port is in use but WebSocket connection failed${colors.reset}`);
      console.log(`   This might indicate a non-WebSocket service on port ${HUB_PORT}`);
    }
  } else {
    console.log(`\n${colors.red}❌ No hub is running on port ${HUB_PORT}${colors.reset}`);
  }
  
  // 3. Check running processes
  console.log(`\n${colors.cyan}Checking for MCP server processes...${colors.reset}`);
  const { exec } = require('child_process');
  
  exec('ps aux | grep -E "mcp-server|claude-chrome" | grep -v grep', (error, stdout) => {
    if (stdout) {
      console.log(`${colors.green}✓ Found related processes:${colors.reset}`);
      const lines = stdout.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        const parts = line.split(/\s+/);
        const pid = parts[1];
        const command = parts.slice(10).join(' ');
        console.log(`  PID ${pid}: ${command}`);
      });
    } else {
      console.log(`${colors.yellow}⚠️  No MCP server processes found${colors.reset}`);
    }
    
    // 4. Provide diagnostics
    console.log('\n' + '=' .repeat(50));
    console.log(`${colors.blue}📊 Diagnostic Summary${colors.reset}`);
    console.log('=' .repeat(50));
    
    if (!portInUse) {
      console.log(`\n${colors.red}Problem:${colors.reset} WebSocket hub is not running`);
      console.log(`\n${colors.yellow}Possible causes:${colors.reset}`);
      console.log('1. MCP server failed to start the hub');
      console.log('2. Hub crashed after starting');
      console.log('3. Port conflict prevented hub from starting');
      console.log('4. MCP server connected to phantom hub');
      
      console.log(`\n${colors.green}Solutions:${colors.reset}`);
      console.log('1. Restart Claude Code');
      console.log('2. Manually start MCP server: node mcp-server/src/server.js');
      console.log('3. Check for port conflicts: lsof -i :54321');
      console.log('4. Kill any orphaned processes and restart');
    } else {
      console.log(`\n${colors.green}Status:${colors.reset} Hub appears to be running`);
      console.log('\nIf extension still shows disconnected:');
      console.log('1. Reload the Chrome extension');
      console.log('2. Check extension console for errors');
      console.log('3. Try manual reconnect in extension popup');
    }
  });
}

// Run the check
checkHubStatus().catch(console.error);