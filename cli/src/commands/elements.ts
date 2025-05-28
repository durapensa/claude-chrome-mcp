import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from '../lib/client';
import { globalClient } from '../index';

export function elementsCommand(program: Command): void {
  program
    .command('elements')
    .alias('query')
    .description('Get DOM elements matching a CSS selector')
    .argument('<tabId>', 'Tab ID to query')
    .argument('<selector>', 'CSS selector to match elements')
    .option('-j, --json', 'Output as JSON')
    .option('-c, --count', 'Only show element count')
    .option('-t, --text', 'Only show text content')
    .option('-a, --attributes', 'Show element attributes')
    .action(async (tabId, selector, options) => {
      const client = globalClient;
      const tabIdNum = parseInt(tabId);
      
      if (isNaN(tabIdNum)) {
        console.error(chalk.red('Tab ID must be a number'));
        process.exit(1);
      }

      try {
        console.log(chalk.gray(`Querying elements in tab ${tabIdNum} with selector: ${selector}`));
        
        const elements = await client.getDOMElements(tabIdNum, selector);

        if (options.count) {
          console.log(elements.length);
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(elements, null, 2));
          return;
        }

        if (elements.length === 0) {
          console.log(chalk.yellow('No elements found'));
          return;
        }

        console.log(chalk.green(`✓ Found ${elements.length} element(s):`));
        console.log();

        elements.forEach((element, index) => {
          console.log(chalk.bold(`${index + 1}. ${element.tagName.toLowerCase()}`));
          
          if (element.id) {
            console.log(`   ${chalk.gray('ID:')} ${element.id}`);
          }
          
          if (element.className) {
            console.log(`   ${chalk.gray('Class:')} ${element.className}`);
          }

          if (options.text || !options.attributes) {
            if (element.textContent) {
              const text = element.textContent.trim();
              if (text) {
                console.log(`   ${chalk.gray('Text:')} ${text}`);
              }
            }
          }

          if (options.attributes && element.attributes) {
            console.log(`   ${chalk.gray('Attributes:')}`);
            Object.entries(element.attributes).forEach(([key, value]) => {
              console.log(`     ${key}: ${value}`);
            });
          }

          if (element.boundingRect && Object.keys(element.boundingRect).length > 0) {
            const rect = element.boundingRect;
            console.log(`   ${chalk.gray('Position:')} ${Math.round(rect.x)}, ${Math.round(rect.y)} (${Math.round(rect.width)}×${Math.round(rect.height)})`);
          }

          console.log();
        });
      } catch (error) {
        console.error(chalk.red('Failed to query elements:'), (error as Error).message);
        process.exit(1);
      }
    });
}