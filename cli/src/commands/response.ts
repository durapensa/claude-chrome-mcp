import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from '../lib/client';
import { globalClient } from '../index';

export function responseCommand(program: Command): void {
  program
    .command('response')
    .alias('get')
    .description('Get the latest response from a Claude session')
    .argument('<tabId>', 'Tab ID of the Claude session')
    .option('-j, --json', 'Output as JSON')
    .option('-r, --raw', 'Output raw text only')
    .option('-a, --all', 'Show all message details')
    .action(async (tabId, options) => {
      const client = globalClient;
      const tabIdNum = parseInt(tabId);
      
      if (isNaN(tabIdNum)) {
        console.error(chalk.red('Tab ID must be a number'));
        process.exit(1);
      }

      try {
        const response = await client.getLatestResponse(tabIdNum);

        if (response.error) {
          console.error(chalk.red('Error getting response:'), response.error);
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(response, null, 2));
          return;
        }

        if (options.raw) {
          console.log(response.text);
          return;
        }

        // Format the output
        const messageType = response.isUser ? 'User' : 'Claude';
        const typeColor = response.isUser ? chalk.blue : chalk.green;
        
        console.log(typeColor(`${messageType} message:`));
        console.log(chalk.white(response.text));

        if (options.all) {
          console.log();
          console.log(chalk.gray('Details:'));
          console.log(`${chalk.gray('Type:')} ${messageType}`);
          console.log(`${chalk.gray('Timestamp:')} ${new Date(response.timestamp).toLocaleString()}`);
          if (response.totalMessages) {
            console.log(`${chalk.gray('Total messages:')} ${response.totalMessages}`);
          }
        }
      } catch (error) {
        console.error(chalk.red('Failed to get response:'), (error as Error).message);
        process.exit(1);
      }
    });
}