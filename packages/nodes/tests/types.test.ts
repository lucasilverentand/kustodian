import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_LABEL_PREFIX,
  format_label_key,
  format_label_value,
  format_node_labels,
  get_controllers,
  get_node_ssh_config,
  get_primary_controller,
  get_workers,
  is_controller,
  is_worker,
} from '../src/types.js';

describe('Node Types', () => {
  describe('format_label_key', () => {
    it('should prefix a simple key', () => {
      // Act
      const result = format_label_key('metallb');

      // Assert
      expect(result).toBe(`${DEFAULT_LABEL_PREFIX}/metallb`);
    });

    it('should use custom prefix', () => {
      // Act
      const result = format_label_key('storage', 'myorg.io');

      // Assert
      expect(result).toBe('myorg.io/storage');
    });

    it('should not prefix keys that already have a prefix', () => {
      // Act
      const result = format_label_key('kubernetes.io/arch');

      // Assert
      expect(result).toBe('kubernetes.io/arch');
    });
  });

  describe('format_label_value', () => {
    it('should convert boolean true to string', () => {
      // Act
      const result = format_label_value(true);

      // Assert
      expect(result).toBe('true');
    });

    it('should convert boolean false to string', () => {
      // Act
      const result = format_label_value(false);

      // Assert
      expect(result).toBe('false');
    });

    it('should convert number to string', () => {
      // Act
      const result = format_label_value(42);

      // Assert
      expect(result).toBe('42');
    });

    it('should pass through string values', () => {
      // Act
      const result = format_label_value('nvme');

      // Assert
      expect(result).toBe('nvme');
    });
  });

  describe('format_node_labels', () => {
    it('should format multiple labels with prefix', () => {
      // Arrange
      const labels = { metallb: true, storage: 'nvme' };

      // Act
      const result = format_node_labels(labels);

      // Assert
      expect(result).toEqual({
        'kustodian.io/metallb': 'true',
        'kustodian.io/storage': 'nvme',
      });
    });

    it('should return empty object for undefined labels', () => {
      // Act
      const result = format_node_labels(undefined);

      // Assert
      expect(result).toEqual({});
    });

    it('should use custom prefix', () => {
      // Arrange
      const labels = { gpu: true };

      // Act
      const result = format_node_labels(labels, 'myorg.io');

      // Assert
      expect(result).toEqual({ 'myorg.io/gpu': 'true' });
    });
  });

  describe('get_node_ssh_config', () => {
    it('should merge node SSH with defaults', () => {
      // Arrange
      const node = {
        name: 'node-1',
        role: 'worker' as const,
        address: '10.0.0.1',
        ssh: { user: 'custom' },
      };
      const defaults = { user: 'default', port: 22 };

      // Act
      const result = get_node_ssh_config(node, defaults);

      // Assert
      expect(result.user).toBe('custom');
      expect(result.port).toBe(22);
    });

    it('should work without defaults', () => {
      // Arrange
      const node = {
        name: 'node-1',
        role: 'worker' as const,
        address: '10.0.0.1',
        ssh: { user: 'admin' },
      };

      // Act
      const result = get_node_ssh_config(node);

      // Assert
      expect(result.user).toBe('admin');
    });
  });

  describe('is_controller', () => {
    it('should return true for controller role', () => {
      // Arrange
      const node = { name: 'n1', role: 'controller' as const, address: '10.0.0.1' };

      // Act & Assert
      expect(is_controller(node)).toBe(true);
    });

    it('should return true for controller+worker role', () => {
      // Arrange
      const node = { name: 'n1', role: 'controller+worker' as const, address: '10.0.0.1' };

      // Act & Assert
      expect(is_controller(node)).toBe(true);
    });

    it('should return false for worker role', () => {
      // Arrange
      const node = { name: 'n1', role: 'worker' as const, address: '10.0.0.1' };

      // Act & Assert
      expect(is_controller(node)).toBe(false);
    });
  });

  describe('is_worker', () => {
    it('should return true for worker role', () => {
      // Arrange
      const node = { name: 'n1', role: 'worker' as const, address: '10.0.0.1' };

      // Act & Assert
      expect(is_worker(node)).toBe(true);
    });

    it('should return true for controller+worker role', () => {
      // Arrange
      const node = { name: 'n1', role: 'controller+worker' as const, address: '10.0.0.1' };

      // Act & Assert
      expect(is_worker(node)).toBe(true);
    });

    it('should return false for controller role', () => {
      // Arrange
      const node = { name: 'n1', role: 'controller' as const, address: '10.0.0.1' };

      // Act & Assert
      expect(is_worker(node)).toBe(false);
    });
  });

  describe('get_controllers', () => {
    it('should return only controller nodes', () => {
      // Arrange
      const nodes = [
        { name: 'ctrl-1', role: 'controller' as const, address: '10.0.0.1' },
        { name: 'worker-1', role: 'worker' as const, address: '10.0.0.2' },
        { name: 'combo-1', role: 'controller+worker' as const, address: '10.0.0.3' },
      ];

      // Act
      const result = get_controllers(nodes);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.name)).toEqual(['ctrl-1', 'combo-1']);
    });
  });

  describe('get_workers', () => {
    it('should return only worker nodes', () => {
      // Arrange
      const nodes = [
        { name: 'ctrl-1', role: 'controller' as const, address: '10.0.0.1' },
        { name: 'worker-1', role: 'worker' as const, address: '10.0.0.2' },
        { name: 'combo-1', role: 'controller+worker' as const, address: '10.0.0.3' },
      ];

      // Act
      const result = get_workers(nodes);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.name)).toEqual(['worker-1', 'combo-1']);
    });
  });

  describe('get_primary_controller', () => {
    it('should return the first controller', () => {
      // Arrange
      const nodes = [
        { name: 'worker-1', role: 'worker' as const, address: '10.0.0.1' },
        { name: 'ctrl-1', role: 'controller' as const, address: '10.0.0.2' },
        { name: 'ctrl-2', role: 'controller' as const, address: '10.0.0.3' },
      ];

      // Act
      const result = get_primary_controller(nodes);

      // Assert
      expect(result?.name).toBe('ctrl-1');
    });

    it('should return undefined if no controllers', () => {
      // Arrange
      const nodes = [{ name: 'worker-1', role: 'worker' as const, address: '10.0.0.1' }];

      // Act
      const result = get_primary_controller(nodes);

      // Assert
      expect(result).toBeUndefined();
    });
  });
});
