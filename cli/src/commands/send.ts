import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from '../lib/client';
import { globalClient } from '../index';

export function sendCommand(program: Command): void {
  program
    .command('send')
    .description('Send a message to a Claude session')
    .argument('<tabId>', 'Tab ID of the Claude session')
    .argument('<message>', 'Message to send')
    .option('-j, --json', 'Output as JSON')
    .option('-w, --wait', 'Wait for response after sending')
    .option('-t, --timeout <seconds>', 'Timeout for waiting response', '30')
    .action(async (tabId, message, options) => {
      const client = globalClient;
      const tabIdNum = parseInt(tabId);
      
      if (isNaN(tabIdNum)) {
        console.error(chalk.red('Tab ID must be a number'));
        process.exit(1);
      }

      try {
        console.log(chalk.gray(`Sending message to tab ${tabIdNum}...`));
        
        const result = await client.sendMessage(tabIdNum, message);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success) {
          console.log(chalk.green('✓ Message sent successfully'));
          if (result.message) {
            console.log(chalk.gray(result.message));
          }
        } else {
          console.error(chalk.red('Failed to send message:'), result.error);
          process.exit(1);
        }

        // Wait for response if requested
        if (options.wait) {
          const timeout = parseInt(options.timeout) * 1000;
          console.log(chalk.gray(`Waiting for response (timeout: ${options.timeout}s)...`));
          
          const startTime = Date.now();
          let lastMessageCount = 0;

          // Get initial message count
          try {
            const initialResponse = await client.getLatestResponse(tabIdNum);
            if (initialResponse.totalMessages) {
              lastMessageCount = initialResponse.totalMessages;
            }
          } catch (error) {
            console.log(chalk.yellow('Could not get initial message count'));
          }

          // Poll for new response
          while (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
              const response = await client.getLatestResponse(tabIdNum);
              
              if (response.totalMessages && response.totalMessages > lastMessageCount) {
                if (response.isAssistant) {
                  console.log(chalk.green('✓ Received response:'));
                  console.log(chalk.white(response.text));
                  return;
                }
              }
            } catch (error) {
              // Continue polling
            }
          }

          console.log(chalk.yellow('⚠ Timeout waiting for response'));
        }
      } catch (error) {
        console.error(chalk.red('Failed to send message:'), (error as Error).message);
        process.exit(1);
      }
    });
}