import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from '../lib/client';
import { globalClient } from '../index';

export function attachCommand(program: Command): void {
  program
    .command('attach')
    .description('Attach or detach Chrome debugger to/from a tab')
    .argument('<tabId>', 'Tab ID to attach debugger to')
    .option('-d, --detach', 'Detach debugger instead of attaching')
    .option('-j, --json', 'Output as JSON')
    .action(async (tabId, options) => {
      const client = globalClient;
      const tabIdNum = parseInt(tabId);
      
      if (isNaN(tabIdNum)) {
        console.error(chalk.red('Tab ID must be a number'));
        process.exit(1);
      }

      try {
        if (options.detach) {
          console.log(chalk.gray(`Detaching debugger from tab ${tabIdNum}...`));
          const result = await client.detachDebugger(tabIdNum);

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else if (result.detached) {
            console.log(chalk.green('✓ Debugger detached successfully'));
          } else {
            console.log(chalk.yellow('Debugger was not attached'));
          }
        } else {
          console.log(chalk.gray(`Attaching debugger to tab ${tabIdNum}...`));
          const result = await client.attachDebugger(tabIdNum);

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else if (result.attached) {
            console.log(chalk.green('✓ Debugger attached successfully'));
          } else {
            console.log(chalk.yellow('Debugger was already attached'));
          }
        }
      } catch (error) {
        const action = options.detach ? 'detach' : 'attach';
        console.error(chalk.red(`Failed to ${action} debugger:`), (error as Error).message);
        process.exit(1);
      }
    });
}