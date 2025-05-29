#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from './lib/client';
import { attachCommand } from './commands/attach';
import { sessionsCommand } from './commands/sessions';
import { sendCommand } from './commands/send';
import { responseCommand } from './commands/response';
import { spawnCommand } from './commands/spawn';
import { scriptCommand } from './commands/script';
import { elementsCommand } from './commands/elements';
import { deleteCommand } from './commands/delete';

const program = new Command();

program
  .name('ccm')
  .description('Claude Chrome MCP CLI - Control Claude.ai from the command line')
  .version('1.0.0')
  .option('-s, --server <url>', 'WebSocket server URL', 'ws://localhost:54322')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--no-color', 'Disable colored output');

// Global error handler
program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str)),
});

// Global client instance
export let globalClient: CCMClient;

program.hook('preAction', async (thisCommand) => {
  const options = thisCommand.opts();
  
  if (options.noColor) {
    chalk.level = 0;
  }
  
  globalClient = new CCMClient(options.server, options.verbose);
  
  try {
    await globalClient.connect();
  } catch (error) {
    console.error(chalk.red('Failed to connect to MCP server:'), (error as Error).message);
    console.error(chalk.yellow('Make sure the Chrome extension is loaded and the MCP server is running.'));
    process.exit(1);
  }
});

program.hook('postAction', async () => {
  if (globalClient) {
    await globalClient.disconnect();
  }
});

// Add commands
attachCommand(program);
sessionsCommand(program);
sendCommand(program);
responseCommand(program);
spawnCommand(program);
scriptCommand(program);
elementsCommand(program);
deleteCommand(program);

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('Invalid command:'), program.args.join(' '));
  console.log(chalk.yellow('See --help for a list of available commands.'));
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}