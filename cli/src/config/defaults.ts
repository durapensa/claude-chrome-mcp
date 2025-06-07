/**
 * Central defaults and configuration for MCP CLI
 * 
 * This file provides centralized configuration values with environment variable overrides.
 * Should be imported early to ensure consistent configuration across the CLI.
 * 
 * Version Policy: Bump minor version frequently. Components should check versions
 * to quickly identify problems from version mismatches.
 */

import * as fs from 'fs';
import * as path from 'path';

// Read version from central VERSION file
function getVersion(): string {
  try {
    const versionFile = path.join(__dirname, '../../../VERSION');
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch (error) {
    console.error('Warning: Could not read VERSION file:', (error as Error).message);
    return '0.0.0'; // Fallback version
  }
}

// Central configuration with environment overrides
export const CLI_CONFIG = {
  // Component version
  VERSION: getVersion(),
  COMPONENT_NAME: 'mcp-cli',
  
  // Shared network settings (for reference/compatibility checks)
  WEBSOCKET_PORT: parseInt(process.env.MCP_WEBSOCKET_PORT || '54321', 10),
  CLAUDE_URL: process.env.MCP_CLAUDE_URL || 'https://claude.ai',
  
  // CLI-specific settings
  DEFAULT_TIMEOUT: process.env.MCP_CLI_TIMEOUT || '30s',
  DEFAULT_OUTPUT: process.env.MCP_CLI_OUTPUT || 'human',
  DEFAULT_COLOR: process.env.MCP_CLI_COLOR || 'auto',
  
  // Debug settings
  DEBUG_MODE: process.env.MCP_DEBUG_MODE === 'true',
  LOG_LEVEL: process.env.MCP_LOG_LEVEL || 'info',
  
  // Version checking utilities
  parseVersion(version: string): { major: number; minor: number; patch: number } {
    const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
    return { major, minor, patch };
  },
  
  compareVersions(v1: string, v2: string): number {
    const parts1 = this.parseVersion(v1);
    const parts2 = this.parseVersion(v2);
    
    if (parts1.major !== parts2.major) return parts1.major - parts2.major;
    if (parts1.minor !== parts2.minor) return parts1.minor - parts2.minor;
    return parts1.patch - parts2.patch;
  },
  
  isVersionCompatible(otherVersion: string, options: { requireExact?: boolean; requireMinor?: boolean } = {}): boolean {
    const { requireExact = false, requireMinor = false } = options;
    
    if (!otherVersion) return false;
    
    const current = this.parseVersion(this.VERSION);
    const other = this.parseVersion(otherVersion);
    
    if (requireExact) {
      return this.VERSION === otherVersion;
    }
    
    if (requireMinor) {
      // Require same major and minor version
      return current.major === other.major && current.minor === other.minor;
    }
    
    // Default: just check major version compatibility
    return current.major === other.major;
  },
  
  // Version mismatch message helper
  getVersionMismatchMessage(componentName: string, theirVersion: string): string {
    const current = this.parseVersion(this.VERSION);
    const other = this.parseVersion(theirVersion);
    
    if (current.major !== other.major) {
      return `Major version mismatch with ${componentName}: ${this.VERSION} vs ${theirVersion}. Please update all components.`;
    } else if (current.minor !== other.minor) {
      return `Minor version difference with ${componentName}: ${this.VERSION} vs ${theirVersion}. Consider updating for best compatibility.`;
    } else {
      return `Patch version difference with ${componentName}: ${this.VERSION} vs ${theirVersion}. Should be compatible.`;
    }
  }
} as const;

// Log config on startup if debug mode
if (CLI_CONFIG.DEBUG_MODE) {
  console.error('MCP CLI Config loaded:', {
    version: CLI_CONFIG.VERSION,
    websocketPort: CLI_CONFIG.WEBSOCKET_PORT,
    environment: process.env.NODE_ENV || 'production'
  });
}

// Export individual values for convenience
export const { VERSION, COMPONENT_NAME } = CLI_CONFIG;