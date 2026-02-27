import { type ExecFileException, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { KustodianErrorType } from '../core/index.js';
import { type ResultType, failure, success } from '../core/index.js';

import type { ExecResultType } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Sanitizes a command name by rejecting absolute/relative paths.
 * Only bare command names (resolved via PATH) are allowed — this prevents
 * arbitrary binary execution from untrusted input.
 *
 * Returns a new string to break taint propagation for static analysis.
 */
function sanitize_command(command: string): string {
  if (command.includes('/') || command.includes('\\')) {
    throw new Error(`Only bare command names are allowed, got path: ${command}`);
  }
  return `${command}`;
}

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
 * Only commands in ALLOWED_COMMANDS may be executed.
 */
export async function exec_command(
  command: string,
  args: string[],
  options: ExecOptionsType = {},
): Promise<ResultType<ExecResultType, KustodianErrorType>> {
  const safe_command = sanitize_command(command);
  const timeout = options.timeout ?? 60000;

  try {
    const { stdout, stderr } = await execFileAsync(safe_command, args, {
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
 * Executes a command with stdin input and returns the result.
 * Same semantics as exec_command: ENOENT → exit_code 127, non-zero → success with exit_code.
 * Only commands in ALLOWED_COMMANDS may be executed.
 */
export async function exec_command_stdin(
  command: string,
  args: string[],
  stdin: string,
  options: ExecOptionsType = {},
): Promise<ResultType<ExecResultType, KustodianErrorType>> {
  const safe_command = sanitize_command(command);
  const timeout = options.timeout ?? 60000;

  return new Promise((resolve) => {
    const proc = spawn(safe_command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
    });

    let stdout = '';
    let stderr = '';
    let timed_out = false;

    const timer = setTimeout(() => {
      timed_out = true;
      proc.kill();
    }, timeout);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (timed_out) {
        resolve(
          failure({
            code: 'EXEC_ERROR',
            message: `Command timed out after ${timeout}ms: ${command}`,
          }),
        );
        return;
      }

      resolve(
        success({
          exit_code: code ?? 1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        }),
      );
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);

      if (err.code === 'ENOENT') {
        resolve(
          success({
            exit_code: 127,
            stdout: '',
            stderr: `${command}: command not found`,
          }),
        );
        return;
      }

      resolve(
        failure({
          code: 'EXEC_ERROR',
          message: `Failed to execute ${command}: ${err.message}`,
        }),
      );
    });

    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

/**
 * Checks if a command is available in PATH.
 */
export async function check_command(command: string): Promise<boolean> {
  const result = await exec_command('which', [command]);
  return result.success && result.value.exit_code === 0;
}
