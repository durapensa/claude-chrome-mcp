import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from '../lib/client';
import { globalClient } from '../index';

export function spawnCommand(program: Command): void {
  program
    .command('spawn')
    .description('Create a new Claude.ai tab')
    .argument('[url]', 'URL to navigate to', 'https://claude.ai')
    .option('-j, --json', 'Output as JSON')
    .option('-w, --wait <seconds>', 'Wait for tab to load', '5')
    .action(async (url, options) => {
      const client = globalClient;
      
      try {
        console.log(chalk.gray(`Creating new Claude tab: ${url}`));
        
        const result = await client.spawnClaudeTab(url);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(chalk.green('✓ Tab created successfully'));
        console.log(`${chalk.gray('Tab ID:')} ${chalk.cyan(result.id)}`);
        console.log(`${chalk.gray('URL:')} ${result.url || url}`);

        // Wait for tab to load if requested
        const waitSeconds = parseInt(options.wait);
        if (waitSeconds > 0) {
          console.log(chalk.gray(`Waiting ${waitSeconds} seconds for tab to load...`));
          
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
          
          // Check if tab is loaded by getting sessions
          const sessions = await client.getClaudeTabs();
          const newTab = sessions.find(s => s.id === result.id);
          
          if (newTab) {
            console.log(chalk.green('✓ Tab loaded'));
            console.log(`${chalk.gray('Title:')} ${newTab.title}`);
          } else {
            console.log(chalk.yellow('⚠ Tab may still be loading'));
          }
        }
      } catch (error) {
        console.error(chalk.red('Failed to create tab:'), (error as Error).message);
        process.exit(1);
      }
    });
}