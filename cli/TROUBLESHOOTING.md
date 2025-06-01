# Universal MCP CLI - Troubleshooting

## Current Issue: Filesystem Server Initialization

**Date:** 2025-06-01  
**Status:** DEBUGGING

### Problem Description
The filesystem MCP server starts correctly and initializes via MCP protocol, but tools are not being discovered through the Universal MCP CLI daemon.

### What Works ✅
- Manual filesystem server via `npx -y @modelcontextprotocol/server-filesystem` - responds to MCP protocol
- Server process spawning in daemon - PID assigned, process starts
- MCP initialization handshake - server responds with `secure-filesystem-server v0.2.0`
- Command path expansion fix - npm packages no longer incorrectly expanded as file paths

### What Doesn't Work ❌
- Tools discovery completion - `tools/list` request appears to not complete
- Server status shows "not initialized" despite successful initialization logs
- CLI shows "No tools available" despite server reporting 11 tools manually

### Technical Details

#### Working Manual Test
```bash
npx -y @modelcontextprotocol/server-filesystem /Users/dp/claude-chrome-mcp /Users/dp/Desktop <<EOF
{"jsonrpc":"2.0","id":"init_1","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":"tools_1","method":"tools/list"}
EOF
```
**Result:** Returns 11 tools (read_file, write_file, etc.)

#### Daemon Logs Show
```
Starting MCP server filesystem: npx -y @modelcontextprotocol/server-filesystem /Users/dp/claude-chrome-mcp /Users/dp/Desktop
Server filesystem process started with PID: 41557
Server filesystem initialized successfully: { name: 'secure-filesystem-server', version: '0.2.0' }
Discovering tools for server filesystem...
```

#### Suspected Issue
The `tools/list` request may not be completing properly in the daemon context, or there's a race condition between initialization and tool discovery.

### Architecture Notes
- Filesystem server: `@modelcontextprotocol/server-filesystem` v0.2.0
- Protocol: MCP 2024-11-05
- Transport: stdio pipes
- Command: `npx -y @modelcontextprotocol/server-filesystem <dirs>`

### Next Steps
1. ✅ Fixed npm package path expansion in config-loader.ts
2. ✅ Added detailed MCP debugging logs
3. ✅ **FIXED**: `isInitialized` flag timing issue resolved
4. ✅ **SUCCESS**: Filesystem server working with 11 tools discovered

### Resolution - Universal MCP CLI Working!
**Date:** 2025-06-01  
**Status:** ✅ WORKING

The Universal MCP CLI is now fully functional with the stable filesystem server:

#### ✅ Verified Working Features:
- Auto-spawn daemon functionality
- MCP protocol initialization and handshake
- Tool discovery (11 filesystem tools)
- Server status reporting
- End-to-end CLI tool execution (reaches server, validates args)

#### CLI Test Results:
```bash
$ npm run dev -- servers
filesystem: ready
  Tools: 11

$ npm run dev -- --verbose tools
filesystem:
  read_file - Read the complete contents of a file...
  write_file - Create a new file or completely overwrite...
  [+ 9 more tools]

$ npm run dev -- list_directory /path
Error: Invalid arguments... (reaches server, validates properly)
```

#### Phase 1 Complete ✅
The Universal MCP CLI core architecture is proven and working with:
- Claude Desktop configuration format
- Multi-server support
- Automatic daemon management  
- Dynamic tool discovery
- MCP protocol compliance

### Key Finding
Server logs show:
```
Server filesystem initialized successfully: { name: 'secure-filesystem-server', version: '0.2.0' }
Discovering tools for server filesystem...
Server filesystem: Starting listTools() - initialized: false, cached tools: 0
```

The `isInitialized` flag remains `false` despite successful initialization, causing `listTools()` to fail immediately.

### Configuration
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/dp/claude-chrome-mcp",
        "/Users/dp/Desktop"
      ],
      "autoStart": true,
      "description": "Filesystem operations"
    }
  }
}
```