# Universal MCP CLI - Troubleshooting

## Common Issues

### Filesystem Server Not Discovering Tools
- **Symptom**: Server starts but shows "No tools available"
- **Solution**: Ensure MCP server supports stdio transport and proper initialization sequence
- **Debug**: Check daemon logs in `~/.mcp/logs/`

### Command Path Expansion Issues
- **Symptom**: NPM package commands incorrectly treated as file paths
- **Solution**: Use proper command parsing without path expansion for executables

## Architecture Notes
- Protocol: MCP 2024-11-05
- Transport: stdio pipes
- See [Main Architecture](../docs/ARCHITECTURE.md) for system overview