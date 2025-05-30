#!/usr/bin/env node

/**
 * Debug StdioClientTransport timeout issue
 */

const { spawn } = require('child_process');

async function debugStdioConnection() {
  console.log('🔍 Debugging Stdio Transport Timeout\n');
  
  // Spawn MCP server process directly
  const serverProcess = spawn('node', ['../mcp-server/src/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CCM_CLIENT_ID: 'debug-client',
      CCM_CLIENT_NAME: 'Debug Client',
      CCM_CLIENT_TYPE: 'debug',
      CCM_NO_STDIN_MONITOR: '1',
      CCM_MAX_IDLE_TIME: '0',
      CCM_DEBUG: '1',
      DEBUG: '*'
    }
  });

  console.log('📤 Spawned MCP server process');
  
  // Log all output
  serverProcess.stdout.on('data', (data) => {
    console.log(`[STDOUT]: ${data.toString().trim()}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.log(`[STDERR]: ${data.toString().trim()}`);
  });
  
  serverProcess.on('error', (error) => {
    console.error('[SPAWN ERROR]:', error);
  });
  
  serverProcess.on('exit', (code, signal) => {
    console.log(`[EXIT]: code=${code}, signal=${signal}`);
  });
  
  // Send MCP initialization message
  console.log('\n📨 Sending MCP initialize request...');
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {}
      },
      clientInfo: {
        name: 'debug-client',
        version: '1.0.0'
      }
    },
    id: 1
  };
  
  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
  
  // Wait for response
  let responseBuffer = '';
  let initialized = false;
  
  serverProcess.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    
    // Try to parse JSON-RPC messages
    const lines = responseBuffer.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const message = JSON.parse(line);
          console.log('\n📥 Received:', JSON.stringify(message, null, 2));
          
          if (message.id === 1 && message.result) {
            console.log('\n✅ Initialize response received!');
            initialized = true;
            
            // Send notifications/initialized
            const notificationRequest = {
              jsonrpc: '2.0',
              method: 'notifications/initialized',
              params: {}
            };
            
            console.log('\n📨 Sending initialized notification...');
            serverProcess.stdin.write(JSON.stringify(notificationRequest) + '\n');
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    }
    
    // Keep the last incomplete line
    responseBuffer = lines[lines.length - 1];
  });
  
  // Test tool listing after initialization
  setTimeout(() => {
    if (initialized) {
      console.log('\n📨 Sending tools/list request...');
      const toolsRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      };
      
      serverProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');
    }
  }, 2000);
  
  // Keep process alive for testing
  setTimeout(() => {
    console.log('\n🔌 Closing connection...');
    serverProcess.kill();
  }, 10000);
}

// Run debug
debugStdioConnection().catch(console.error);