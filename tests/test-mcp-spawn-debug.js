#!/usr/bin/env node

/**
 * Debug test for MCP server spawning issues
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

async function debugMcpSpawn() {
  console.log('🔍 Debugging MCP Server Spawn\n');
  
  // Test 1: Check if we can spawn the server directly
  console.log('1️⃣ Testing direct server spawn...');
  
  const serverProcess = spawn('node', ['../mcp-server/src/server.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  serverProcess.stdout.on('data', (data) => {
    console.log(`[SERVER STDOUT]: ${data.toString().trim()}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.log(`[SERVER STDERR]: ${data.toString().trim()}`);
  });
  
  serverProcess.on('error', (error) => {
    console.error('[SPAWN ERROR]:', error);
  });
  
  serverProcess.on('exit', (code, signal) => {
    console.log(`[SERVER EXIT]: code=${code}, signal=${signal}`);
  });
  
  // Give server time to start
  console.log('⏳ Waiting for server to initialize...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 2: Try MCP SDK connection
  console.log('\n2️⃣ Testing MCP SDK connection...');
  
  try {
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['../mcp-server/src/server.js'],
      env: {
        ...process.env,
        DEBUG_MCP: 'true'
      }
    });
    
    const client = new Client({
      name: 'debug-test',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log('📡 Attempting to connect...');
    
    // Set a shorter timeout for testing
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connect timeout')), 10000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    
    console.log('✅ Connected successfully!');
    
    // Try a simple tool call
    console.log('\n3️⃣ Testing tool call...');
    const result = await client.callTool('get_claude_dot_ai_tabs', {});
    console.log('Tool result:', result.content[0].text);
    
    await client.close();
    
  } catch (error) {
    console.error('❌ MCP connection failed:', error.message);
    console.error('Stack:', error.stack);
  }
  
  // Clean up
  serverProcess.kill();
  
  console.log('\n✅ Debug test completed');
}

// Run debug
debugMcpSpawn().catch(console.error);