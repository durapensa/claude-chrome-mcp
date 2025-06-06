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
            choices: ['start', 'stop', 'restart', 'status']
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
   * Parse tool-specific arguments with enhanced comma-separated array support
   * Leverages yargs native parsing with custom coercion for arrays
   */
  private static parseToolArgs(toolArgs: string[], parsedArgs: any): Record<string, any> {
    const result: Record<string, any> = {};

    // Handle JSON string format as fallback: mcp tool '{"key": "value"}'
    for (const arg of toolArgs) {
      if (arg.startsWith('{') && arg.endsWith('}')) {
        try {
          Object.assign(result, JSON.parse(arg));
          break; // Only process first JSON string found
        } catch (error) {
          // Not valid JSON, ignore and continue with normal parsing
        }
      }
    }

    // Copy all yargs-parsed arguments (yargs already handles --key value, --flag, --no-flag)
    for (const [key, value] of Object.entries(parsedArgs)) {
      if (!['_', '$0', 'verbose', 'json', 'timeout', 'server', 'config', 'help', 'version'].includes(key)) {
        result[key] = this.processArgumentValue(key, value);
      }
    }

    // Handle positional arguments
    const positionalArgs = toolArgs.filter(arg => !arg.startsWith('--') && !arg.startsWith('{'));
    if (positionalArgs.length > 0) {
      result.args = positionalArgs;
    }

    return result;
  }

  /**
   * Process argument values with comma-separated array support and type coercion
   */
  private static processArgumentValue(key: string, value: any): any {
    // If it's already an array from yargs, keep it
    if (Array.isArray(value)) {
      return value;
    }

    // Handle comma-separated arrays for likely array parameters
    if (typeof value === 'string' && this.isLikelyArrayParameter(key) && value.includes(',')) {
      return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    // Apply type conversion
    return this.convertValue(value);
  }

  /**
   * Determine if a parameter name suggests it should be an array
   */
  private static isLikelyArrayParameter(key: string): boolean {
    // Check for common array parameter patterns
    const arrayPatterns = [
      /ids?$/i,          // conversationIds, tabIds, fileIds, etc.
      /list$/i,          // fileList, itemList, etc.
      /items?$/i,        // items, menuItems, etc.
      /files?$/i,        // files, sourceFiles, etc.
      /paths?$/i,        // paths, filePaths, etc.
      /names?$/i,        // names, fileNames, etc.
      /types?$/i,        // types, mimeTypes, etc.
      /tags?$/i,         // tags, categories, etc.
      /values?$/i,       // values, configValues, etc.
    ];

    return arrayPatterns.some(pattern => pattern.test(key));
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
    console.log(`  mcp ${toolName} --arrayParam val1,val2,val3`);
    console.log(`  mcp ${toolName} '{"param1": "value1", "arrayParam": ["val1", "val2"]}'`);
    
    console.log('\nArray Parameters:');
    console.log('  Use comma-separated values: --conversationIds id1,id2,id3');
    console.log('  Parameters ending in "Ids", "List", "Items", etc. support comma separation');
    
    console.log('\nBoolean Values:');
    console.log('  Use --flag for true, --no-flag for false');
    console.log('  Or: --flag true, --flag false, --flag yes, --flag no');
  }
}