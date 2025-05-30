# Claude Session Instructions

## Startup Sequence

When beginning work on this project:

1. **Load CLAUDE.md** - MCP server configuration and quick reference
2. **Check development/ISSUES.md** - Current bugs and their status  
3. **Review ROADMAP.md** - Planned features and priorities
4. **Follow development/TESTING.md** - When testing changes

## Working Principles

- **Testing**: Never declare an issue fix complete until thorough testing has succeeded
- **MCP Changes**: Request a Claude Code reset when testing MCP server changes
- **Verification**: Always use available tools to verify changes (don't assume)
- **Documentation**: Update relevant MD files as you learn new information
- **Tool Usage**: Always test thoroughly, verifying every tool call when possible

## Key Reminders

- The default for `waitForReady` is now `true` for safer message sending
- Chrome extension needs manual reload after crashes
- MCP server changes require Claude Code restart
- Test scripts are available in the root directory:
  - `test-rapid-messages.js`
  - `test-service-worker-stability.js`
  - `test-extract-elements.js`
  - `run-all-tests.js`

## Development Workflow

1. Review the issue or feature to implement
2. Make changes to the appropriate files
3. Test using available tools and test scripts
4. Update documentation as needed
5. Commit changes only after successful testing