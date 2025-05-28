import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from '../lib/client';
import { globalClient } from '../index';

export function scriptCommand(program: Command): void {
  program
    .command('script')
    .alias('exec')
    .description('Execute JavaScript in a Claude tab')
    .argument('<tabId>', 'Tab ID to execute script in')
    .argument('<script>', 'JavaScript code to execute')
    .option('-j, --json', 'Output as JSON')
    .option('-r, --raw', 'Output raw result only')
    .option('-f, --file <path>', 'Read script from file instead of argument')
    .action(async (tabId, script, options) => {
      const client = globalClient;
      const tabIdNum = parseInt(tabId);
      
      if (isNaN(tabIdNum)) {
        console.error(chalk.red('Tab ID must be a number'));
        process.exit(1);
      }

      let scriptCode = script;

      // Read from file if specified
      if (options.file) {
        try {
          const fs = require('fs');
          scriptCode = fs.readFileSync(options.file, 'utf8');
        } catch (error) {
          console.error(chalk.red('Failed to read script file:'), (error as Error).message);
          process.exit(1);
        }
      }

      try {
        console.log(chalk.gray(`Executing script in tab ${tabIdNum}...`));
        
        const result = await client.executeScript(tabIdNum, scriptCode);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (options.raw) {
          const scriptResult = result.result || result;
          console.log(scriptResult.value);
          return;
        }

        console.log(chalk.green('✓ Script executed successfully'));
        
        // Handle the nested result structure
        const scriptResult = result.result || result;
        
        if (scriptResult.value !== undefined) {
          console.log(chalk.gray('Result:'));
          
          // Pretty print the result
          if (typeof scriptResult.value === 'object') {
            console.log(JSON.stringify(scriptResult.value, null, 2));
          } else {
            console.log(scriptResult.value);
          }
        }

        if (scriptResult.type) {
          console.log(chalk.gray(`Type: ${scriptResult.type}`));
        }
      } catch (error) {
        console.error(chalk.red('Script execution failed:'), (error as Error).message);
        process.exit(1);
      }
    });
}