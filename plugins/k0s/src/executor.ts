import * as child_process from 'node:child_process';
import * as util from 'node:util';
import type { KustodianErrorType } from 'kustodian/core';
import { Errors, type ResultType, failure, success } from 'kustodian/core';

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
  retries?: number | undefined;
  retry_delay_ms?: number | undefined;
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
  const result = await exec_command('k0sctl', ['version'], { timeout: 5000 });

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
 * Default number of retries for k0sctl apply.
 */
const K0SCTL_APPLY_MAX_RETRIES = 3;

/**
 * Delay between retries in milliseconds (30 seconds).
 */
const K0SCTL_APPLY_RETRY_DELAY_MS = 30_000;

/**
 * Runs a single k0sctl apply attempt.
 * Streams output to the console in real-time.
 */
function k0sctl_apply_once(
  config_path: string,
  options: ExecOptionsType = {},
): Promise<ResultType<CommandResultType, KustodianErrorType>> {
  const args = ['apply', '--config', config_path];

  return new Promise((resolve) => {
    const proc = child_process.spawn('k0sctl', args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data: Buffer) => {
      process.stderr.write(data);
    });

    const timeout_id = options.timeout
      ? setTimeout(() => {
          proc.kill();
          resolve(failure(Errors.bootstrap_error('k0sctl apply timed out')));
        }, options.timeout)
      : undefined;

    proc.on('close', (code) => {
      if (timeout_id) clearTimeout(timeout_id);

      if (code !== 0) {
        // Extract the fatal message from stdout (k0sctl logs errors to stdout)
        const fatal_match = stdout.match(/level=fatal msg="(.+)"/);
        const error_msg = fatal_match?.[1] ?? `k0sctl exited with code ${code ?? 1}`;
        resolve(failure(Errors.bootstrap_error(error_msg)));
      } else {
        resolve(success({ stdout, stderr: '', exit_code: 0 }));
      }
    });

    proc.on('error', (error) => {
      if (timeout_id) clearTimeout(timeout_id);
      resolve(failure(Errors.unknown('Failed to execute k0sctl apply', error)));
    });
  });
}

/**
 * Runs k0sctl apply with the given config file.
 * Retries up to K0SCTL_APPLY_MAX_RETRIES times on failure since k0sctl apply is idempotent.
 */
export async function k0sctl_apply(
  config_path: string,
  options: ExecOptionsType = {},
): Promise<ResultType<CommandResultType, KustodianErrorType>> {
  const max_retries = options.retries ?? K0SCTL_APPLY_MAX_RETRIES;
  const retry_delay = options.retry_delay_ms ?? K0SCTL_APPLY_RETRY_DELAY_MS;
  let last_result: ResultType<CommandResultType, KustodianErrorType> = failure(
    Errors.unknown('k0sctl apply failed: no attempts made'),
  );

  for (let attempt = 1; attempt <= max_retries; attempt++) {
    last_result = await k0sctl_apply_once(config_path, options);

    if (last_result.success) {
      return last_result;
    }

    if (attempt < max_retries) {
      const delay_seconds = retry_delay / 1000;
      console.log(
        `\n  ⚠ Attempt ${attempt}/${max_retries} failed, retrying in ${delay_seconds}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retry_delay));
    }
  }

  return last_result;
}

/**
 * Runs k0sctl kubeconfig to get the cluster kubeconfig.
 */
export async function k0sctl_kubeconfig(
  config_path: string,
  options: ExecOptionsType = {},
): Promise<ResultType<string, KustodianErrorType>> {
  const result = await exec_command('k0sctl', ['kubeconfig', '--config', config_path], {
    timeout: 30000,
    ...options,
  });

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

  const result = await exec_command('k0sctl', args, {
    timeout: 60000,
    ...options,
  });

  if (!result.success) {
    return result;
  }

  if (result.value.exit_code !== 0) {
    return failure(Errors.bootstrap_error(`k0sctl reset failed: ${result.value.stderr}`));
  }

  return result;
}
