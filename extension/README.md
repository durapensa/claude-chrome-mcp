# Claude Chrome MCP: Extension
## Chrome Extension Installation and Development

## Quick Navigation
**Related Documentation:**
- [CLAUDE.md](../CLAUDE.md) - Commands and workflows
- [Architecture](../docs/ARCHITECTURE.md) - System design
- [GitHub Issues](https://github.com/durapensa/claude-chrome-mcp/issues) - Active work

**Need Help?** See [Troubleshooting](../docs/TROUBLESHOOTING.md)

Chrome extension for Claude Chrome MCP. Uses native ES6 modules, no build required.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` directory

## Development

Edit source files directly in the extension directory. Reload extension in Chrome to see changes.

## Structure

```
extension/
├── background.js          # Service worker
├── content-script.js      # Page interaction script
├── offscreen.js          # Persistent WebSocket connection
├── popup.js              # Popup script
├── modules/              # Core modules
│   ├── relay-client.js   # WebSocket communication
│   ├── tab-operations.js # Tab management
│   ├── config.js         # Configuration constants
│   └── ...               # Other modules
├── utils/                # Utilities
├── manifest.json         # Extension manifest
├── popup.html           # Popup UI
└── package.json         # Package info
```