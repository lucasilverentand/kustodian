import type { KustodianErrorType } from '@kustodian/core';
import { type ResultType, success } from '@kustodian/core';

import type { ContainerType } from './container.js';
import type { ContextType, MiddlewareType } from './middleware.js';

/**
 * Option definition for a command.
 */
export interface OptionType {
  name: string;
  short?: string;
  description: string;
  required?: boolean;
  default_value?: unknown;
  type?: 'string' | 'boolean' | 'number';
}

/**
 * Argument definition for a command.
 */
export interface ArgumentType {
  name: string;
  description: string;
  required?: boolean;
  variadic?: boolean;
}

/**
 * Command handler function.
 */
export type HandlerType = (
  ctx: ContextType,
  container: ContainerType,
) => Promise<ResultType<void, KustodianErrorType>>;

/**
 * Command definition.
 */
export interface CommandType {
  name: string;
  description: string;
  options?: OptionType[];
  arguments?: ArgumentType[];
  subcommands?: CommandType[];
  middleware?: MiddlewareType[];
  handler?: HandlerType;
}

/**
 * Creates a command definition.
 */
export function define_command(config: CommandType): CommandType {
  return config;
}

/**
 * Creates a no-op handler that returns success.
 */
export function noop_handler(): HandlerType {
  return async () => success(undefined);
}

/**
 * Finds a subcommand by name.
 */
export function find_subcommand(command: CommandType, name: string): CommandType | undefined {
  return command.subcommands?.find((sub) => sub.name === name);
}

/**
 * Gets the full command path (e.g., "nodes label").
 */
export function get_command_path(commands: CommandType[]): string {
  return commands.map((c) => c.name).join(' ');
}
