import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, failure, success } from '../core/index.js';

import type { ArgumentType, CommandType, HandlerType } from './command.js';
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

interface ResolvedCommandType {
  command: CommandType;
  remaining_args: string[];
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

      const resolved = resolve_command(commands, command_name, rest_args);
      if (!resolved.success) {
        return resolved;
      }
      const { command, remaining_args } = resolved.value;

      // Parse options and arguments
      const { options, positional_args } = parse_args(remaining_args, command);

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

function resolve_command(
  commands: CommandType[],
  command_name: string,
  rest_args: string[],
): ResultType<ResolvedCommandType, KustodianErrorType> {
  const root_command = commands.find((c) => c.name === command_name);
  if (!root_command) {
    return failure({
      code: 'COMMAND_NOT_FOUND',
      message: `Unknown command: ${command_name}`,
    });
  }

  let current = root_command;
  const path_parts = [command_name];
  let index = 0;

  while (current.subcommands && index < rest_args.length) {
    const token = rest_args[index];
    if (!token || token.startsWith('-')) {
      break;
    }

    const subcommand = current.subcommands.find((sub) => sub.name === token);
    if (!subcommand) {
      return failure({
        code: 'COMMAND_NOT_FOUND',
        message: `Unknown command: ${[...path_parts, token].join(' ')}`,
      });
    }

    current = subcommand;
    path_parts.push(token);
    index++;
  }

  return success({
    command: current,
    remaining_args: rest_args.slice(index),
  });
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
 * Gets CLI top-level help text.
 */
export function format_help(config: CLIConfigType, commands: CommandType[]): string {
  const lines: string[] = [];

  lines.push(`${config.name} v${config.version}`);
  lines.push(config.description ?? '');
  lines.push('');
  lines.push('Usage:');
  lines.push(`  ${config.name} <command> [options]`);
  lines.push('');
  lines.push('Commands:');

  for (const cmd of commands) {
    const args_str = format_arguments_inline(cmd.arguments);
    const name_col = `${cmd.name}${args_str}`;
    lines.push(`  ${name_col.padEnd(22)} ${cmd.description}`);

    // Show subcommands inline
    if (cmd.subcommands) {
      for (const sub of cmd.subcommands) {
        const sub_args_str = format_arguments_inline(sub.arguments);
        const sub_name = `  ${cmd.name} ${sub.name}${sub_args_str}`;
        lines.push(`  ${sub_name.padEnd(22)} ${sub.description}`);

        // Show nested subcommands (e.g., sources cache info)
        if (sub.subcommands) {
          for (const nested of sub.subcommands) {
            const nested_name = `  ${cmd.name} ${sub.name} ${nested.name}`;
            lines.push(`  ${nested_name.padEnd(22)} ${nested.description}`);
          }
        }
      }
    }
  }

  lines.push('');
  lines.push('Options:');
  lines.push('  --help, -h            Show help');
  lines.push('  --version, -v         Show version');
  lines.push('');
  lines.push('Examples:');
  lines.push(`  ${config.name} init my-project`);
  lines.push(`  ${config.name} validate`);
  lines.push(`  ${config.name} validate --cluster production`);
  lines.push(`  ${config.name} apply --dry-run`);
  lines.push(`  ${config.name} apply --cluster production`);
  lines.push(`  ${config.name} kubeconfig --cluster production`);
  lines.push(`  ${config.name} update --dry-run`);
  lines.push(`  ${config.name} update --cluster production`);
  lines.push(`  ${config.name} sources fetch`);

  return lines.join('\n');
}

/**
 * Gets per-command help text.
 */
export function format_command_help(
  cli_name: string,
  command: CommandType,
  parent_name?: string,
): string {
  const lines: string[] = [];
  const full_name = parent_name ? `${parent_name} ${command.name}` : command.name;
  const args_str = format_arguments_inline(command.arguments);

  lines.push(command.description);
  lines.push('');
  lines.push('Usage:');
  lines.push(`  ${cli_name} ${full_name}${args_str} [options]`);

  // Subcommands
  if (command.subcommands && command.subcommands.length > 0) {
    lines.push('');
    lines.push('Commands:');
    for (const sub of command.subcommands) {
      const sub_args_str = format_arguments_inline(sub.arguments);
      const sub_name = `${sub.name}${sub_args_str}`;
      lines.push(`  ${sub_name.padEnd(22)} ${sub.description}`);

      if (sub.subcommands) {
        for (const nested of sub.subcommands) {
          const nested_name = `  ${sub.name} ${nested.name}`;
          lines.push(`  ${nested_name.padEnd(22)} ${nested.description}`);
        }
      }
    }
  }

  // Arguments
  if (command.arguments && command.arguments.length > 0) {
    lines.push('');
    lines.push('Arguments:');
    for (const arg of command.arguments) {
      const required_str = arg.required ? ' (required)' : '';
      lines.push(`  ${arg.name.padEnd(22)} ${arg.description}${required_str}`);
    }
  }

  // Options
  if (command.options && command.options.length > 0) {
    lines.push('');
    lines.push('Options:');
    for (const opt of command.options) {
      const short_str = opt.short ? `-${opt.short}, ` : '    ';
      const name_str = `${short_str}--${opt.name}`;
      const default_str =
        opt.default_value !== undefined && opt.default_value !== false
          ? ` (default: ${String(opt.default_value)})`
          : '';
      const required_str = opt.required ? ' (required)' : '';
      lines.push(`  ${name_str.padEnd(22)} ${opt.description}${default_str}${required_str}`);
    }
  }

  lines.push(`  ${'--help, -h'.padEnd(22)} Show help`);

  return lines.join('\n');
}

/**
 * Formats argument list for usage line.
 */
function format_arguments_inline(args?: ArgumentType[]): string {
  if (!args || args.length === 0) return '';
  return ` ${args
    .map((a) => {
      const name = a.variadic ? `${a.name}...` : a.name;
      return a.required ? `<${name}>` : `[${name}]`;
    })
    .join(' ')}`;
}
