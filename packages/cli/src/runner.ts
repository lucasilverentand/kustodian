import { type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

import type { CommandType, HandlerType } from './command.js';
import type { ContainerType } from './container.js';
import {
  type ContextType,
  type MiddlewareType,
  create_context,
  create_pipeline,
} from './middleware.js';

/**
 * CLI configuration.
 */
export interface CLIConfigType {
  name: string;
  version: string;
  description?: string;
}

/**
 * CLI builder interface.
 */
export interface CLIType {
  command(cmd: CommandType): CLIType;
  use(middleware: MiddlewareType): CLIType;
  run(args: string[], container: ContainerType): Promise<ResultType<void, KustodianErrorType>>;
}

/**
 * Creates a new CLI instance.
 */
export function create_cli(_config: CLIConfigType): CLIType {
  const commands: CommandType[] = [];
  const global_middleware: MiddlewareType[] = [];

  const cli: CLIType = {
    command(cmd: CommandType): CLIType {
      commands.push(cmd);
      return cli;
    },

    use(middleware: MiddlewareType): CLIType {
      global_middleware.push(middleware);
      return cli;
    },

    async run(
      args: string[],
      container: ContainerType,
    ): Promise<ResultType<void, KustodianErrorType>> {
      // Parse command from args
      const [command_name, ...rest_args] = args;

      if (!command_name) {
        // Show help if no command specified
        return success(undefined);
      }

      const command = commands.find((c) => c.name === command_name);
      if (!command) {
        return failure({
          code: 'COMMAND_NOT_FOUND',
          message: `Unknown command: ${command_name}`,
        });
      }

      // Parse options and arguments
      const { options, positional_args } = parse_args(rest_args, command);

      // Create context
      const ctx = create_context(positional_args, options);

      // Combine middleware
      const command_middleware = command.middleware ?? [];
      const all_middleware = [...global_middleware, ...command_middleware];

      // Create handler middleware
      const handler_middleware = create_handler_middleware(command.handler, container);

      // Execute pipeline
      const pipeline = create_pipeline([...all_middleware, handler_middleware]);

      return pipeline(ctx, async () => success(undefined));
    },
  };

  return cli;
}

/**
 * Parses command line arguments.
 */
function parse_args(
  args: string[],
  command: CommandType,
): { options: Record<string, unknown>; positional_args: string[] } {
  const options: Record<string, unknown> = {};
  const positional_args: string[] = [];

  // Set default values
  for (const opt of command.options ?? []) {
    if (opt.default_value !== undefined) {
      options[opt.name] = opt.default_value;
    }
  }

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!arg) {
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (!key) {
        i++;
        continue;
      }

      const opt = command.options?.find((o) => o.name === key);
      if (opt) {
        if (opt.type === 'boolean') {
          options[key] = value !== 'false';
        } else if (value !== undefined) {
          options[key] = opt.type === 'number' ? Number(value) : value;
        } else {
          const next_arg = args[i + 1];
          const next_value = next_arg;
          if (next_value && !next_value.startsWith('-')) {
            options[key] = opt.type === 'number' ? Number(next_value) : next_value;
            i++;
          } else {
            options[key] = true;
          }
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const short = arg.slice(1);
      const opt = command.options?.find((o) => o.short === short);
      if (opt) {
        const next_arg = args[i + 1];
        const next_value = next_arg;
        if (opt.type === 'boolean') {
          options[opt.name] = true;
        } else if (next_value && !next_value.startsWith('-')) {
          options[opt.name] = opt.type === 'number' ? Number(next_value) : next_value;
          i++;
        }
      }
    } else {
      positional_args.push(arg);
    }

    i++;
  }

  return { options, positional_args };
}

/**
 * Creates a middleware that executes the command handler.
 */
function create_handler_middleware(
  handler: HandlerType | undefined,
  container: ContainerType,
): MiddlewareType {
  return async (ctx: ContextType, next) => {
    if (handler) {
      const result = await handler(ctx, container);
      if (!result.success) {
        return result;
      }
    }
    return next();
  };
}

/**
 * Gets CLI version info string.
 */
export function format_version(config: CLIConfigType): string {
  return `${config.name} v${config.version}`;
}

/**
 * Gets CLI help text.
 */
export function format_help(config: CLIConfigType, commands: CommandType[]): string {
  const lines: string[] = [];

  lines.push(config.description ?? config.name);
  lines.push('');
  lines.push('Usage:');
  lines.push(`  ${config.name} <command> [options]`);
  lines.push('');
  lines.push('Commands:');

  for (const cmd of commands) {
    lines.push(`  ${cmd.name.padEnd(20)} ${cmd.description}`);
  }

  lines.push('');
  lines.push('Options:');
  lines.push('  --help, -h          Show help');
  lines.push('  --version, -v       Show version');

  return lines.join('\n');
}
