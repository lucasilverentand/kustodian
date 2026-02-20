import { type ExecFileException, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, failure, success } from '../core/index.js';

import type { ExecResultType } from './types.js';

const execFileAsync = promisify(execFile);

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
  const timeout = options.timeout ?? 60000;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
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
    const err = error as ExecFileException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
      message?: string;
    };

    // Command not found should be treated as a command execution result with non-zero exit.
    if (err.code === 'ENOENT') {
      return success({
        exit_code: 127,
        stdout: '',
        stderr: `${command}: command not found`,
      });
    }

    // Command executed but returned non-zero exit code
    if (err.stdout !== undefined || err.stderr !== undefined) {
      return success({
        exit_code: typeof err.code === 'number' ? err.code : 1,
        stdout: String(err.stdout ?? '').trim(),
        stderr: String(err.stderr ?? '').trim(),
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
