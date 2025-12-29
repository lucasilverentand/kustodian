import * as child_process from 'node:child_process';
import * as util from 'node:util';

import { Errors, type ResultType, failure, success } from '@kustodian/core';
import type { KustodianErrorType } from '@kustodian/core';

const exec_async = util.promisify(child_process.exec);

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
 * Executes a shell command and returns the result.
 */
export async function exec_command(
  command: string,
  args: string[] = [],
  options: ExecOptionsType = {},
): Promise<ResultType<CommandResultType, KustodianErrorType>> {
  const full_command = [command, ...args].join(' ');

  try {
    const { stdout, stderr } = await exec_async(full_command, {
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

    return failure(Errors.unknown(`Failed to execute command: ${full_command}`, error));
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
 * Checks if k0sctl is available in the system PATH.
 */
export async function check_k0sctl_available(): Promise<ResultType<string, KustodianErrorType>> {
  const result = await exec_command('k0sctl', ['version']);

  if (!result.success) {
    return result;
  }

  if (result.value.exit_code !== 0) {
    return failure(
      Errors.bootstrap_error(
        'k0sctl not found. Please install k0sctl: https://github.com/k0sproject/k0sctl',
      ),
    );
  }

  // Parse version from output (e.g., "version: v0.19.4")
  const version_match = result.value.stdout.match(/version:\s*v?([\d.]+)/);
  const version = version_match?.[1] ?? 'unknown';

  return success(version);
}

/**
 * Runs k0sctl apply with the given config file.
 */
export async function k0sctl_apply(
  config_path: string,
  options: ExecOptionsType = {},
): Promise<ResultType<CommandResultType, KustodianErrorType>> {
  const result = await exec_command('k0sctl', ['apply', '--config', config_path], options);

  if (!result.success) {
    return result;
  }

  if (result.value.exit_code !== 0) {
    return failure(Errors.bootstrap_error(`k0sctl apply failed: ${result.value.stderr}`));
  }

  return result;
}

/**
 * Runs k0sctl kubeconfig to get the cluster kubeconfig.
 */
export async function k0sctl_kubeconfig(
  config_path: string,
  options: ExecOptionsType = {},
): Promise<ResultType<string, KustodianErrorType>> {
  const result = await exec_command('k0sctl', ['kubeconfig', '--config', config_path], options);

  if (!result.success) {
    return result;
  }

  if (result.value.exit_code !== 0) {
    return failure(Errors.bootstrap_error(`k0sctl kubeconfig failed: ${result.value.stderr}`));
  }

  return success(result.value.stdout);
}

/**
 * Runs k0sctl reset to tear down the cluster.
 */
export async function k0sctl_reset(
  config_path: string,
  force = false,
  options: ExecOptionsType = {},
): Promise<ResultType<CommandResultType, KustodianErrorType>> {
  const args = ['reset', '--config', config_path];
  if (force) {
    args.push('--force');
  }

  const result = await exec_command('k0sctl', args, options);

  if (!result.success) {
    return result;
  }

  if (result.value.exit_code !== 0) {
    return failure(Errors.bootstrap_error(`k0sctl reset failed: ${result.value.stderr}`));
  }

  return result;
}
