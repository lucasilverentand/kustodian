import { describe, expect, it } from 'bun:test';

import { to_k0sctl_role, to_k0sctl_ssh_config } from '../src/types.js';

describe('k0s Types', () => {
  describe('to_k0sctl_ssh_config', () => {
    it('should convert SSH config with all fields', () => {
      // Arrange
      const ssh = {
        user: 'admin',
        key_path: '/home/admin/.ssh/id_rsa',
        port: 2222,
      };

      // Act
      const result = to_k0sctl_ssh_config('node-1.local', ssh);

      // Assert
      expect(result.address).toBe('node-1.local');
      expect(result.user).toBe('admin');
      expect(result.keyPath).toBe('/home/admin/.ssh/id_rsa');
      expect(result.port).toBe(2222);
    });

    it('should use default user when not specified', () => {
      // Act
      const result = to_k0sctl_ssh_config('node-1.local');

      // Assert
      expect(result.user).toBe('root');
    });

    it('should handle partial SSH config', () => {
      // Arrange
      const ssh = { user: 'ubuntu' };

      // Act
      const result = to_k0sctl_ssh_config('node-1.local', ssh);

      // Assert
      expect(result.address).toBe('node-1.local');
      expect(result.user).toBe('ubuntu');
      expect(result.keyPath).toBeUndefined();
      expect(result.port).toBeUndefined();
    });
  });

  describe('to_k0sctl_role', () => {
    it('should convert controller role', () => {
      expect(to_k0sctl_role('controller')).toBe('controller');
    });

    it('should convert worker role', () => {
      expect(to_k0sctl_role('worker')).toBe('worker');
    });

    it('should convert controller+worker role', () => {
      expect(to_k0sctl_role('controller+worker')).toBe('controller+worker');
    });

    it('should default to worker for unknown roles', () => {
      expect(to_k0sctl_role('unknown')).toBe('worker');
    });
  });
});
