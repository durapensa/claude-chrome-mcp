/**
 * Universal MCP CLI - Yargs Argument Parser
 * 
 * Handles complex command line argument parsing with dynamic tool discovery.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';

export interface ParsedArgs {
  command: string;
  subcommand?: string;
  toolArgs: Record<string, any>;
  globalOptions: {
    verbose?: boolean;
    json?: boolean;
    timeout?: string;
    server?: string;
    config?: string;
    help?: boolean;
    version?: boolean;
  };
}

export class YargsParser {
  /**
   * Parse command line arguments with Yargs
   */
  static async parse(argv: string[]): Promise<ParsedArgs> {
    const parser = yargs(argv) // argv is already sliced in main()
      .scriptName('mcp')
      .usage('$0 [OPTIONS] COMMAND [ARGS]')
      .version('2.0.0')
      .help('help')
      .alias('h', 'help')
      .alias('v', 'version')
      
      // Global options
      .option('verbose', {
        type: 'boolean',
        description: 'Verbose output',
        global: true
      })
      .option('json', {
        alias: 'j',
        type: 'boolean', 
        description: 'Output as JSON',
        global: true
      })
      .option('timeout', {
        type: 'string',
        description: 'Request timeout duration',
        global: true
      })
      .option('server', {
        type: 'string',
        description: 'Use specific server',
        global: true
      })
      .option('config', {
        type: 'string',
        description: 'Config file path',
        global: true
      })

      // Built-in commands
      .command('daemon <action>', 'Manage daemon', (yargs) => {
        return yargs
          .positional('action', {
            describe: 'Daemon action',
            choices: ['start', 'stop', 'status']
          });
      })
      .command('servers', 'List server status')
      .command('tools', 'List available tools')
      .command('help', 'Show help information')
      .command('version', 'Show version information')
      
      .strict(false) // Allow unknown commands (dynamic tools)
      .showHelpOnFail(false)
      .wrap(Math.min(100, process.stdout.columns || 100));

    const args = await parser.argv;
    
    // Determine command structure
    let command = 'help';
    let subcommand: string | undefined;
    let toolArgs: Record<string, any> = {};

    // Check for version or help flags first
    if (args.version) {
      command = 'version';
    } else if (args.help) {
      command = 'help';
    } else if (args._.length > 0) {
      command = args._[0] as string;
      
      if (command === 'daemon') {
        // For daemon command, action comes from yargs positional parsing
        subcommand = args.action as string || args._[1] as string;
      } else if (!['daemon', 'servers', 'tools', 'help', 'version'].includes(command)) {
        // This is a tool command
        toolArgs = this.parseToolArgs(args._.slice(1) as string[], args);
      }
    }

    return {
      command,
      subcommand,
      toolArgs,
      globalOptions: {
        verbose: args.verbose as boolean | undefined,
        json: args.json as boolean | undefined,
        timeout: args.timeout as string | undefined,
        server: args.server as string | undefined,
        config: args.config as string | undefined,
        help: args.help as boolean | undefined,
        version: args.version as boolean | undefined
      }
    };
  }

  /**
   * Parse tool-specific arguments with multiple format support
   */
  private static parseToolArgs(toolArgs: string[], parsedArgs: any): Record<string, any> {
    const result: Record<string, any> = {};

    // Handle different argument formats:
    // 1. JSON string: mcp tool '{"key": "value"}'
    // 2. Key-value pairs: mcp tool --key value
    // 3. Boolean flags: mcp tool --flag or --no-flag
    // 4. Positional args: mcp tool value1 value2

    for (let i = 0; i < toolArgs.length; i++) {
      const arg = toolArgs[i];
      
      // Try parsing as JSON first
      if (arg.startsWith('{') && arg.endsWith('}')) {
        try {
          Object.assign(result, JSON.parse(arg));
          continue;
        } catch (error) {
          // Not valid JSON, treat as positional
        }
      }

      // Handle key-value format --key value
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        
        // Handle --no-<flag> convention for false booleans
        if (key.startsWith('no-')) {
          const actualKey = key.slice(3);
          result[actualKey] = false;
          continue;
        }
        
        const value = toolArgs[i + 1];
        if (value && !value.startsWith('--')) {
          // Convert value to appropriate type
          result[key] = this.convertValue(value);
          i++; // Skip next arg since we consumed it
          continue;
        }
        result[key] = true; // Boolean flag
        continue;
      }

      // Positional arguments (tool schema will determine mapping)
      if (!result.args) result.args = [];
      result.args.push(arg);
    }

    // Also include any parsed flags from yargs
    for (const [key, value] of Object.entries(parsedArgs)) {
      if (!['_', '$0', 'verbose', 'json', 'timeout', 'server', 'config', 'help', 'version'].includes(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Convert string values to appropriate types following GNU conventions
   */
  private static convertValue(value: string): any {
    // Boolean values
    if (value === 'true' || value === 'yes' || value === 'on' || value === '1') {
      return true;
    }
    if (value === 'false' || value === 'no' || value === 'off' || value === '0') {
      return false;
    }
    
    // Numbers
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    // null/undefined
    if (value === 'null') {
      return null;
    }
    if (value === 'undefined') {
      return undefined;
    }
    
    // Otherwise return as string
    return value;
  }

  /**
   * Show tool-specific help with schema information
   */
  static showToolHelp(toolName: string, schema?: any): void {
    console.log(chalk.bold(`Tool: ${toolName}`));
    
    if (schema?.description) {
      console.log(chalk.gray(schema.description));
    }
    
    console.log('\nUsage:');
    console.log(`  mcp ${toolName} [OPTIONS]`);
    console.log(`  mcp ${toolName} '{"key": "value"}'`);
    
    if (schema?.properties) {
      console.log('\nParameters:');
      for (const [key, prop] of Object.entries(schema.properties)) {
        const required = schema.required?.includes(key);
        const propSchema = prop as any;
        const typeHint = propSchema.type === 'boolean' ? ' (boolean)' : '';
        console.log(`  --${key}${required ? ' (required)' : ''}${typeHint}  ${propSchema.description || ''}`);
        
        // Show --no-<flag> option for booleans
        if (propSchema.type === 'boolean') {
          console.log(`  --no-${key}         Set ${key} to false`);
        }
      }
    }
    
    console.log('\nExamples:');
    console.log(`  mcp ${toolName} --param1 value1 --param2 value2`);
    console.log(`  mcp ${toolName} '{"param1": "value1", "param2": "value2"}'`);
    
    console.log('\nBoolean Values:');
    console.log('  Use --flag for true, --no-flag for false');
    console.log('  Or: --flag true, --flag false, --flag yes, --flag no');
  }
}