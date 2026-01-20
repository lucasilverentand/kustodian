import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { KustodianErrorType } from '@kustodian/core';
import { type ResultType, failure, success } from '@kustodian/core';

import type { ExecResultType } from './types.js';

const execAsync = promisify(exec);

/**
 * Options for command execution.
 */
export interface ExecOptionsType {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Executes a command and returns the result.
 */
export async function exec_command(
  command: string,
  args: string[],
  options: ExecOptionsType = {},
): Promise<ResultType<ExecResultType, KustodianErrorType>> {
  const full_command = [command, ...args].join(' ');
  const timeout = options.timeout ?? 60000;

  try {
    const { stdout, stderr } = await execAsync(full_command, {
      timeout,
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
    });

    return success({
      exit_code: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };

    // Command executed but returned non-zero exit code
    if (err.stdout !== undefined || err.stderr !== undefined) {
      return success({
        exit_code: err.code ?? 1,
        stdout: (err.stdout ?? '').trim(),
        stderr: (err.stderr ?? '').trim(),
      });
    }

    // Command failed to execute
    return failure({
      code: 'EXEC_ERROR',
      message: `Failed to execute ${command}: ${err.message}`,
    });
  }
}

/**
 * Checks if a command is available in PATH.
 */
export async function check_command(command: string): Promise<boolean> {
  const result = await exec_command('which', [command]);
  return result.success && result.value.exit_code === 0;
}
