import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { KustodianErrorType } from '@kustodian/core';
import { Errors, type ResultType, failure, success } from '@kustodian/core';

import { DEFAULT_TIMEOUT, type DopplerPluginOptionsType } from './types.js';

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
 * Uses execFile for security (no shell invocation).
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
 * Gets environment variables for Doppler CLI authentication.
 */
function get_doppler_auth_env(options: DopplerPluginOptionsType): Record<string, string> {
  const env: Record<string, string> = {};

  const token = options.token ?? process.env['DOPPLER_TOKEN'];
  if (token) {
    env['DOPPLER_TOKEN'] = token;
  }

  return env;
}

/**
 * Checks if doppler CLI is available in the system PATH.
 */
export async function check_doppler_available(): Promise<ResultType<string, KustodianErrorType>> {
  const result = await exec_command('doppler', ['--version']);

  if (!result.success) {
    return result;
  }

  if (result.value.exit_code !== 0) {
    return failure(Errors.secret_cli_not_found('Doppler', 'doppler'));
  }

  // Parse version from output (e.g., "v3.68.0")
  const version = result.value.stdout.trim();
  return success(version);
}

/**
 * Fetches all secrets for a project/config combination.
 * Returns a JSON object of all secrets.
 */
export async function doppler_secrets_download(
  project: string,
  config: string,
  options: DopplerPluginOptionsType = {},
): Promise<ResultType<Record<string, string>, KustodianErrorType>> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const env = get_doppler_auth_env(options);

  const result = await exec_command(
    'doppler',
    [
      'secrets',
      'download',
      '--project',
      project,
      '--config',
      config,
      '--format',
      'json',
      '--no-file',
    ],
    {
      timeout,
      env,
    },
  );

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
      stderr_lower.includes('no project') ||
      stderr_lower.includes('no config')
    ) {
      return failure(Errors.secret_not_found('Doppler', `${project}/${config}`));
    }

    if (
      stderr_lower.includes('unauthorized') ||
      stderr_lower.includes('authentication') ||
      stderr_lower.includes('invalid token') ||
      stderr_lower.includes('access denied')
    ) {
      return failure(Errors.secret_auth_error('Doppler', stderr));
    }

    if (stderr_lower.includes('timeout')) {
      return failure(Errors.secret_timeout('Doppler', timeout));
    }

    return failure(Errors.unknown(`Doppler error: ${stderr}`));
  }

  try {
    const secrets = JSON.parse(stdout) as Record<string, string>;
    return success(secrets);
  } catch (error) {
    return failure(Errors.unknown('Failed to parse Doppler secrets output', error));
  }
}

/**
 * Fetches a single secret value from Doppler.
 */
export async function doppler_secret_get(
  project: string,
  config: string,
  secret_name: string,
  options: DopplerPluginOptionsType = {},
): Promise<ResultType<string, KustodianErrorType>> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const env = get_doppler_auth_env(options);

  const result = await exec_command(
    'doppler',
    ['secrets', 'get', secret_name, '--project', project, '--config', config, '--plain'],
    {
      timeout,
      env,
    },
  );

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
      stderr_lower.includes('no secret')
    ) {
      return failure(Errors.secret_not_found('Doppler', `${project}/${config}/${secret_name}`));
    }

    if (
      stderr_lower.includes('unauthorized') ||
      stderr_lower.includes('authentication') ||
      stderr_lower.includes('invalid token')
    ) {
      return failure(Errors.secret_auth_error('Doppler', stderr));
    }

    if (stderr_lower.includes('timeout')) {
      return failure(Errors.secret_timeout('Doppler', timeout));
    }

    return failure(Errors.unknown(`Doppler error: ${stderr}`));
  }

  return success(stdout.trim());
}
