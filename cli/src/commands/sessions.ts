import { Command } from 'commander';
import chalk from 'chalk';
import { CCMClient } from '../lib/client';
import { globalClient } from '../index';

export function sessionsCommand(program: Command): void {
  program
    .command('sessions')
    .alias('ls')
    .description('List all active Claude.ai tabs and sessions')
    .option('-j, --json', 'Output as JSON')
    .option('-q, --quiet', 'Only show tab IDs')
    .action(async (options) => {
      const client = globalClient;
      
      try {
        const sessions = await client.getClaudeSessions();

        if (options.quiet) {
          sessions.forEach(session => console.log(session.id));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(sessions, null, 2));
          return;
        }

        if (sessions.length === 0) {
          console.log(chalk.yellow('No Claude.ai tabs found'));
          return;
        }

        console.log(chalk.bold(`Found ${sessions.length} Claude.ai session(s):\n`));

        sessions.forEach((session, index) => {
          const status: string[] = [];
          if (session.active) status.push(chalk.green('active'));
          if (session.debuggerAttached) status.push(chalk.blue('debugger'));

          console.log(
            `${chalk.bold(index + 1)}. ${chalk.cyan(`Tab ${session.id}`)} ${status.length ? `[${status.join(', ')}]` : ''}`
          );
          console.log(`   ${chalk.gray('Title:')} ${session.title}`);
          console.log(`   ${chalk.gray('URL:')} ${session.url}`);
          console.log();
        });
      } catch (error) {
        console.error(chalk.red('Failed to get sessions:'), (error as Error).message);
        process.exit(1);
      }
    });
}