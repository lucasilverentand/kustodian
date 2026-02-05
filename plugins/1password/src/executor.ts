import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { KustodianErrorType } from 'kustodian/core';
import { Errors, type ResultType, failure, success } from 'kustodian/core';

import { DEFAULT_TIMEOUT, type OnePasswordPluginOptionsType } from './types.js';

const exec_file_async = promisify(execFile);

/**
 * Result of a command execution.
 */
export interface CommandResultType {
  stdout: string;
  stderr: string;
  exit_code: number;
}

/**
 * Options for command execution.
 */
export interface ExecOptionsType {
  cwd?: string | undefined;
  timeout?: number | undefined;
  env?: Record<string, string> | undefined;
}

/**
 * Executes a command and returns the result.
 * Uses execFile instead of exec for security (no shell invocation).
 */
export async function exec_command(
  command: string,
  args: string[] = [],
  options: ExecOptionsType = {},
): Promise<ResultType<CommandResultType, KustodianErrorType>> {
  try {
    const { stdout, stderr } = await exec_file_async(command, args, {
      cwd: options.cwd,
      timeout: options.timeout,
      env: { ...process.env, ...options.env },
    });

    return success({
      stdout,
      stderr,
      exit_code: 0,
    });
  } catch (error) {
    if (is_exec_error(error)) {
      return success({
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        exit_code: error.code ?? 1,
      });
    }

    return failure(Errors.unknown(`Failed to execute command: ${command}`, error));
  }
}

/**
 * Type guard for exec errors.
 */
function is_exec_error(
  error: unknown,
): error is { stdout?: string; stderr?: string; code?: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('stdout' in error || 'stderr' in error || 'code' in error)
  );
}

/**
 * Gets environment variables for 1Password CLI authentication.
 */
function get_op_auth_env(options: OnePasswordPluginOptionsType): Record<string, string> {
  const env: Record<string, string> = {};

  const token = options.service_account_token ?? process.env['OP_SERVICE_ACCOUNT_TOKEN'];
  if (token) {
    env['OP_SERVICE_ACCOUNT_TOKEN'] = token;
  }

  return env;
}

/**
 * Checks if op CLI is available in the system PATH.
 */
export async function check_op_available(): Promise<ResultType<string, KustodianErrorType>> {
  const result = await exec_command('op', ['--version']);

  if (!result.success) {
    return result;
  }

  if (result.value.exit_code !== 0) {
    return failure(Errors.secret_cli_not_found('1Password', 'op'));
  }

  // Parse version from output (e.g., "2.30.0")
  const version = result.value.stdout.trim();
  return success(version);
}

/**
 * Reads a single secret from 1Password.
 */
export async function op_read(
  ref: string,
  options: OnePasswordPluginOptionsType = {},
): Promise<ResultType<string, KustodianErrorType>> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const env = get_op_auth_env(options);

  const result = await exec_command('op', ['read', ref], {
    timeout,
    env,
  });

  if (!result.success) {
    return result;
  }

  const { stdout, stderr, exit_code } = result.value;

  if (exit_code !== 0) {
    // Parse specific error types from stderr
    const stderr_lower = stderr.toLowerCase();

    if (
      stderr_lower.includes('not found') ||
      stderr_lower.includes("doesn't exist") ||
      stderr_lower.includes('no item')
    ) {
      return failure(Errors.secret_not_found('1Password', ref));
    }

    if (
      stderr_lower.includes('sign in') ||
      stderr_lower.includes('authentication') ||
      stderr_lower.includes('unauthorized') ||
      stderr_lower.includes('not signed in')
    ) {
      return failure(Errors.secret_auth_error('1Password', stderr));
    }

    if (stderr_lower.includes('timeout')) {
      return failure(Errors.secret_timeout('1Password', timeout));
    }

    return failure(Errors.unknown(`1Password error: ${stderr}`));
  }

  return success(stdout.trim());
}

/**
 * Reads multiple secrets from 1Password in batch.
 */
export async function op_read_batch(
  refs: string[],
  options: OnePasswordPluginOptionsType = {},
): Promise<ResultType<Record<string, string>, KustodianErrorType>> {
  if (refs.length === 0) {
    return success({});
  }

  const results: Record<string, string> = {};

  // Read secrets sequentially for now
  for (const ref of refs) {
    const result = await op_read(ref, options);

    if (!result.success) {
      if (options.fail_on_missing !== false) {
        return result;
      }
      // Skip missing secrets if fail_on_missing is false
      continue;
    }

    results[ref] = result.value;
  }

  return success(results);
}
