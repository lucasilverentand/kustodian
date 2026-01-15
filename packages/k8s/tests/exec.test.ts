import { describe, expect, it } from 'bun:test';

import { check_command, exec_command } from '../src/exec.js';

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
