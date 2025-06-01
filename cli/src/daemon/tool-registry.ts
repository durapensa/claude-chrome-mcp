/**
 * Universal MCP CLI - Tool Registry
 * 
 * Manages tool discovery, namespace resolution, and collision handling.
 */

import { QualifiedTool, ToolNamespace } from '../types/daemon';
import { MCPServer } from '../types/daemon';

export class ToolRegistry {
  private namespace: ToolNamespace = {
    tools: new Map(),
    collisions: new Map(),
    byServer: new Map()
  };

  /**
   * Register tools from a server
   */
  registerServerTools(server: MCPServer): void {
    const serverId = server.id;
    const serverTools: QualifiedTool[] = [];

    // Remove existing tools for this server
    this.unregisterServerTools(serverId);

    // Register new tools
    for (const tool of server.tools) {
      const qualifiedTool: QualifiedTool = {
        name: tool.name,
        server_id: serverId,
        schema: tool.schema,
        canonical: false, // Will be determined by priority
        description: tool.description
      };

      serverTools.push(qualifiedTool);
    }

    // Store tools by server
    this.namespace.byServer.set(serverId, serverTools);

    // Rebuild the global namespace
    this.rebuildNamespace();
  }

  /**
   * Unregister all tools from a server
   */
  unregisterServerTools(serverId: string): void {
    this.namespace.byServer.delete(serverId);
    this.rebuildNamespace();
  }

  /**
   * Rebuild the global namespace with collision detection
   */
  private rebuildNamespace(): void {
    const newTools = new Map<string, QualifiedTool>();
    const newCollisions = new Map<string, string[]>();

    // Get all servers sorted by priority (lower priority number = higher precedence)
    const serverPriorities = new Map<string, number>();
    
    // Collect server priorities (assuming they're available from config)
    // For now, we'll use registration order as priority
    let defaultPriority = 1;
    for (const [serverId, tools] of this.namespace.byServer) {
      serverPriorities.set(serverId, defaultPriority++);
    }

    // Sort servers by priority
    const sortedServers = Array.from(this.namespace.byServer.entries())
      .sort(([aId], [bId]) => {
        const aPriority = serverPriorities.get(aId) || 999;
        const bPriority = serverPriorities.get(bId) || 999;
        return aPriority - bPriority;
      });

    // Process tools in priority order
    for (const [serverId, tools] of sortedServers) {
      for (const tool of tools) {
        const toolName = tool.name;

        if (newTools.has(toolName)) {
          // Collision detected
          const existingTool = newTools.get(toolName)!;
          
          if (!newCollisions.has(toolName)) {
            newCollisions.set(toolName, [existingTool.server_id]);
          }
          newCollisions.get(toolName)!.push(serverId);
          
        } else {
          // First occurrence - becomes canonical
          const canonicalTool: QualifiedTool = {
            ...tool,
            canonical: true
          };
          newTools.set(toolName, canonicalTool);
        }
      }
    }

    // Update namespace
    this.namespace.tools = newTools;
    this.namespace.collisions = newCollisions;
  }

  /**
   * Resolve a tool name to a qualified tool
   */
  resolveTool(toolName: string, serverId?: string): QualifiedTool | null {
    if (serverId) {
      // Explicit server specified
      const serverTools = this.namespace.byServer.get(serverId);
      if (!serverTools) {
        return null;
      }
      return serverTools.find(tool => tool.name === toolName) || null;
    }

    // Use canonical (first-defined) tool
    return this.namespace.tools.get(toolName) || null;
  }

  /**
   * Get all available tools
   */
  getAllTools(): QualifiedTool[] {
    return Array.from(this.namespace.tools.values());
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverId: string): QualifiedTool[] {
    return this.namespace.byServer.get(serverId) || [];
  }

  /**
   * Get tool collisions
   */
  getCollisions(): Map<string, string[]> {
    return new Map(this.namespace.collisions);
  }

  /**
   * Check if a tool name has collisions
   */
  hasCollision(toolName: string): boolean {
    return this.namespace.collisions.has(toolName);
  }

  /**
   * Get collision information for a tool
   */
  getCollisionInfo(toolName: string): string[] {
    return this.namespace.collisions.get(toolName) || [];
  }

  /**
   * Find tools by pattern
   */
  findTools(pattern: string): QualifiedTool[] {
    const regex = new RegExp(pattern, 'i');
    const results: QualifiedTool[] = [];

    for (const tools of this.namespace.byServer.values()) {
      for (const tool of tools) {
        if (regex.test(tool.name) || regex.test(tool.description)) {
          results.push(tool);
        }
      }
    }

    return results;
  }

  /**
   * Get namespace statistics
   */
  getStats() {
    const totalTools = Array.from(this.namespace.byServer.values())
      .reduce((sum, tools) => sum + tools.length, 0);

    return {
      total_tools: totalTools,
      canonical_tools: this.namespace.tools.size,
      servers_with_tools: this.namespace.byServer.size,
      collisions: this.namespace.collisions.size,
      collision_details: Array.from(this.namespace.collisions.entries()).map(([name, servers]) => ({
        tool_name: name,
        servers: servers
      }))
    };
  }

  /**
   * Generate help text for available tools
   */
  generateToolsHelp(): string {
    const lines: string[] = [];
    
    lines.push('Available tools:');
    lines.push('');

    // Group tools by server
    const serverGroups = new Map<string, QualifiedTool[]>();
    
    for (const tool of this.getAllTools()) {
      if (!serverGroups.has(tool.server_id)) {
        serverGroups.set(tool.server_id, []);
      }
      serverGroups.get(tool.server_id)!.push(tool);
    }

    // Display tools by server
    for (const [serverId, tools] of serverGroups) {
      lines.push(`${serverId}:`);
      
      for (const tool of tools.sort((a, b) => a.name.localeCompare(b.name))) {
        const collision = this.hasCollision(tool.name) ? ' ⚠️' : '';
        const canonical = tool.canonical ? ' (default)' : '';
        lines.push(`  ${tool.name}${collision}${canonical} - ${tool.description}`);
      }
      
      lines.push('');
    }

    // Show collision information
    if (this.namespace.collisions.size > 0) {
      lines.push('Tool name collisions:');
      for (const [toolName, servers] of this.namespace.collisions) {
        lines.push(`  ${toolName}: available in ${servers.join(', ')}`);
        lines.push(`    Use @server:${toolName} for explicit selection`);
      }
      lines.push('');
    }

    lines.push('Usage:');
    lines.push('  mcp TOOL [OPTIONS]           # Use default server');
    lines.push('  mcp @server:TOOL [OPTIONS]   # Use specific server');
    lines.push('  mcp @server TOOL [OPTIONS]   # Alternative syntax');

    return lines.join('\n');
  }

  /**
   * Update server priorities and rebuild namespace
   */
  updateServerPriorities(priorities: Map<string, number>): void {
    // Store priorities for future rebuilds
    // This would typically be integrated with server configuration
    this.rebuildNamespace();
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.namespace.tools.clear();
    this.namespace.collisions.clear();
    this.namespace.byServer.clear();
  }
}