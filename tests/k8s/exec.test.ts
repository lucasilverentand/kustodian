import { describe, expect, it } from 'bun:test';

import { check_command, exec_command, exec_command_stdin } from '../../src/k8s/exec.js';

describe('exec', () => {
  describe('exec_command', () => {
    it('should execute a successful command', async () => {
      const result = await exec_command('echo', ['hello']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).toBe(0);
        expect(result.value.stdout).toBe('hello');
      }
    });

    it('should capture stderr', async () => {
      const result = await exec_command('ls', ['nonexistent-file-xyz']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).not.toBe(0);
        expect(result.value.stderr).toContain('No such file');
      }
    });

    it('should return non-zero exit code for command not found', async () => {
      const result = await exec_command('nonexistent-command-xyz', []);

      // Shell execution succeeds but command returns non-zero exit code
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).not.toBe(0);
        expect(result.value.stderr).toContain('not found');
      }
    });
  });

  describe('exec_command_stdin', () => {
    it('should pipe stdin and capture stdout', async () => {
      const result = await exec_command_stdin('cat', [], 'hello from stdin');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).toBe(0);
        expect(result.value.stdout).toBe('hello from stdin');
      }
    });

    it('should return exit_code 127 for missing command', async () => {
      const result = await exec_command_stdin('nonexistent-command-xyz', [], 'input');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).toBe(127);
        expect(result.value.stderr).toContain('not found');
      }
    });

    it('should handle non-zero exit codes', async () => {
      const result = await exec_command_stdin('bash', ['-c', 'exit 42'], '');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).toBe(42);
      }
    });

    it('should capture stderr from stdin commands', async () => {
      const result = await exec_command_stdin('bash', ['-c', 'echo err >&2; exit 1'], '');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).toBe(1);
        expect(result.value.stderr).toBe('err');
      }
    });
  });

  describe('check_command', () => {
    it('should return true for existing commands', async () => {
      const exists = await check_command('echo');
      expect(exists).toBe(true);
    });

    it('should return false for non-existing commands', async () => {
      const exists = await check_command('nonexistent-command-xyz');
      expect(exists).toBe(false);
    });
  });
});
