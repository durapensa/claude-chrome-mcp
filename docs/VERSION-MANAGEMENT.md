# Version Management Guide

This document describes the version management process for the Claude Chrome MCP project.

## Version Policy

- **Bump minor versions frequently** (e.g., 2.6.0 → 2.7.0)
- All components share the same version number
- Single source of truth: `VERSION` file at project root

## Version Bump Process

To bump the version (e.g., from 2.6.0 to 2.6.1):

1. **Update VERSION file**
   ```bash
   echo "2.6.1" > VERSION
   ```

2. **Run update-versions script**
   ```bash
   npm run update-versions
   ```
   This script:
   - Updates all package.json files
   - Updates extension/manifest.json
   - Validates configuration consistency
   - Shows results for each file

3. **Verify changes**
   ```bash
   npm run config:validate
   ```

4. **Commit changes**
   ```bash
   git add .
   git commit -m "chore: bump version to 2.6.1

   - Updated VERSION file
   - Updated all package.json files
   - Updated extension manifest
   - Configuration validation passed"
   ```

5. **Push to GitHub**
   ```bash
   git push origin main
   ```

## Files Updated During Version Bump

The `update-versions` script automatically updates:
- `/VERSION` - Central version file
- `/package.json` - Root package
- `/mcp-server/package.json` - MCP server package
- `/cli/package.json` - CLI package
- `/extension/manifest.json` - Chrome extension manifest

## Configuration Files

Each component has its own configuration:
- `/mcp-server/src/config.js` - Central MCP server config (reads VERSION file, contains all Claude URL templates and validation)
- `/cli/src/config/defaults.ts` - Central CLI config (reads VERSION file)
- `/extension/modules/config.js` - Extension config (reads from manifest.json)
- `/extension/offscreen.js` - Gets version dynamically from background

## Version Checking

Components check version compatibility when connecting:
- Major version differences: Warning logged
- Minor version differences: Info logged
- Patch versions: Always compatible

## Environment Variables

Version can be checked at runtime:
```bash
# Check CLI version
mcp --version

# Check server version (in logs)
MCP_DEBUG_MODE=true npm start

# Check all versions
npm run config:validate
```

## Troubleshooting

If version inconsistencies occur:
1. Run `npm run config:validate` to identify issues
2. Run `npm run update-versions` to fix them
3. Rebuild CLI if needed: `npm run build`
4. Reload extension at chrome://extensions/
