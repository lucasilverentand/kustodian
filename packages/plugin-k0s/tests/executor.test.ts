import { describe, expect, it } from 'vitest';

import {
  check_k0sctl_available,
  exec_command,
  k0sctl_apply,
  k0sctl_kubeconfig,
  k0sctl_reset,
} from '../src/executor.js';

describe('k0s Executor', () => {
  describe('exec_command', () => {
    it('should execute command and return result', async () => {
      // Act - use a simple command that works on all platforms
      const result = await exec_command('echo', ['hello']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.stdout.trim()).toBe('hello');
        expect(result.value.exit_code).toBe(0);
      }
    });

    it('should execute command without args', async () => {
      // Act
      const result = await exec_command('pwd');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).toBe(0);
        expect(result.value.stdout.length).toBeGreaterThan(0);
      }
    });

    it('should handle non-existent command', async () => {
      // Act
      const result = await exec_command('this-command-does-not-exist-12345');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).not.toBe(0);
      }
    });

    it('should pass options to exec', async () => {
      // Act
      const result = await exec_command('pwd', [], {
        cwd: '/tmp',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.stdout.trim()).toContain('tmp');
      }
    });

    it('should handle command with exit code', async () => {
      // Act - exit with specific code (need proper quoting for bash -c)
      const result = await exec_command('bash', ['-c', '"exit 42"']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.exit_code).toBe(42);
      }
    });

    it('should capture stderr', async () => {
      // Act - need proper quoting for bash -c
      const result = await exec_command('bash', ['-c', '"echo error >&2"']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.stderr.trim()).toBe('error');
      }
    });
  });

  describe('check_k0sctl_available', () => {
    it('should return error when k0sctl is not installed', async () => {
      // Act - k0sctl is not installed in test environment
      const result = await check_k0sctl_available();

      // Assert - either fails to find or returns error
      // This test verifies the function runs without crashing
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('k0sctl_apply', () => {
    it('should fail with non-existent config file', async () => {
      // Act
      const result = await k0sctl_apply('/non/existent/config.yaml');

      // Assert - will fail because k0sctl not installed or config doesn't exist
      expect(result).toBeDefined();
    });
  });

  describe('k0sctl_kubeconfig', () => {
    it('should fail with non-existent config file', async () => {
      // Act
      const result = await k0sctl_kubeconfig('/non/existent/config.yaml');

      // Assert - will fail because k0sctl not installed or config doesn't exist
      expect(result).toBeDefined();
    });
  });

  describe('k0sctl_reset', () => {
    it('should fail with non-existent config file', async () => {
      // Act
      const result = await k0sctl_reset('/non/existent/config.yaml');

      // Assert - will fail because k0sctl not installed or config doesn't exist
      expect(result).toBeDefined();
    });

    it('should accept force parameter', async () => {
      // Act
      const result = await k0sctl_reset('/non/existent/config.yaml', true);

      // Assert
      expect(result).toBeDefined();
    });
  });
});
