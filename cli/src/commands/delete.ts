import { Command } from 'commander';
import chalk from 'chalk';
import { globalClient } from '../index';

export function deleteCommand(program: Command): void {
  program
    .command('delete')
    .alias('del')
    .description('Delete a Claude.ai conversation')
    .argument('<tabId>', 'Tab ID of the Claude session containing the conversation to delete')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('-j, --json', 'Output as JSON')
    .action(async (tabId: string, options) => {
      const client = globalClient;
      const tabIdNum = parseInt(tabId);
      
      if (isNaN(tabIdNum)) {
        console.error(chalk.red('Error: Tab ID must be a number'));
        process.exit(1);
      }

      try {
        // Get current sessions to validate tab exists and show conversation title
        const sessions = await client.getClaudeTabs();
        const targetSession = sessions.find(s => s.id === tabIdNum);
        
        if (!targetSession) {
          console.error(chalk.red(`Error: No Claude.ai tab found with ID ${tabIdNum}`));
          console.log(chalk.yellow('Use "ccm sessions" to see available tabs'));
          process.exit(1);
        }

        if (!options.yes) {
          // Simple confirmation without inquirer dependency
          const readline = require('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise<string>((resolve) => {
            rl.question(`Delete conversation in "${targetSession.title}"? (y/N): `, resolve);
          });
          
          rl.close();
          
          if (!answer.toLowerCase().startsWith('y')) {
            console.log(chalk.yellow('Deletion cancelled'));
            return;
          }
        }

        console.log(chalk.blue(`Deleting conversation in tab ${tabIdNum}...`));
        
        const result = await client.deleteConversation(tabIdNum);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.success) {
          console.log(chalk.green('✅ Conversation deleted successfully'));
          console.log(`   ${chalk.gray('Title:')} ${result.conversationTitle}`);
          console.log(`   ${chalk.gray('Redirected:')} ${result.wasRedirected ? chalk.green('Yes') : chalk.yellow('No')}`);
          console.log(`   ${chalk.gray('New URL:')} ${result.newUrl}`);
        } else {
          console.error(chalk.red('❌ Failed to delete conversation'));
          console.error(`   ${chalk.gray('Reason:')} ${result.reason || result.error || 'Unknown error'}`);
          process.exit(1);
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
        } else {
          console.error(chalk.red('❌ Error:'), (error as Error).message);
        }
        process.exit(1);
      }
    });
}