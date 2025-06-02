# Chrome Extension - Modular Architecture

This Chrome extension has been refactored into a modular architecture that works with Manifest V3.

## Directory Structure

```
extension/
├── src/                    # Source files (ES modules)
│   ├── background.js       # Main entry point
│   ├── modules/           # Core modules
│   │   ├── config.js      # Configuration constants
│   │   ├── hub-client.js  # WebSocket hub client
│   │   ├── content-script-manager.js
│   │   ├── message-queue.js
│   │   ├── tab-operation-lock.js
│   │   ├── tab-operations.js
│   │   └── mcp-client.js
│   └── utils/             # Utility functions
│       └── utils.js
├── dist/                  # Built extension (created by build process)
├── manifest.json          # Chrome extension manifest (v3)
├── popup.html            # Extension popup
├── popup.js              # Popup script
├── package.json          # Node dependencies for build tools
├── webpack.config.js     # Webpack configuration
└── build.sh             # Quick build script

```

## Building the Extension

### Option 1: Using Webpack (Recommended)
```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Watch for changes during development
npm run watch
```

### Option 2: Quick Build (Temporary)
```bash
# Run the build script
./build.sh
```

## Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` directory

## Modular Architecture Benefits

- **Separation of Concerns**: Each module handles a specific functionality
- **Maintainability**: Easier to update and debug individual components
- **Reusability**: Modules can be reused across different parts of the extension
- **Type Safety**: Can add TypeScript support easily
- **Modern JavaScript**: Uses ES modules and modern syntax

## Key Modules

- **HubClient**: Manages WebSocket connection to MCP server
- **ContentScriptManager**: Handles content script injection
- **TabOperationLock**: Prevents concurrent operations on tabs
- **MessageQueue**: Ensures reliable message delivery
- **Config**: Centralized configuration

## Manifest V3 Compatibility

This extension is fully compatible with Chrome's Manifest V3:
- Uses service workers instead of background pages
- Implements proper event listener registration
- Follows security best practices
- Uses declarative permissions