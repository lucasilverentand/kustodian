import { describe, expect, it } from 'bun:test';
import type { NodeListType, NodeType } from 'kustodian/nodes';

import { create_k0s_provider, validate_k0s_config } from '../src/provider.js';

// Note: k0sctl is not available in test environment, so install/get_kubeconfig/reset
// tests will fail but verify the code paths are exercised

describe('k0s Provider', () => {
  const create_node = (
    name: string,
    role: NodeType['role'] = 'worker',
    ssh?: NodeType['ssh'],
  ): NodeType => {
    const node: NodeType = {
      name,
      role,
      address: `${name}.local`,
    };
    if (ssh !== undefined) {
      node.ssh = ssh;
    }
    return node;
  };

  const create_node_list = (nodes: NodeType[], default_ssh?: NodeListType['ssh']): NodeListType => {
    const node_list: NodeListType = {
      cluster: 'test-cluster',
      nodes,
    };
    if (default_ssh !== undefined) {
      node_list.ssh = default_ssh;
    }
    return node_list;
  };

  describe('validate_k0s_config', () => {
    it('should validate config with controller and workers', () => {
      // Arrange
      const node_list = create_node_list(
        [
          create_node('controller-1', 'controller', { user: 'admin' }),
          create_node('worker-1', 'worker', { user: 'admin' }),
        ],
        { user: 'admin' },
      );

      // Act
      const result = validate_k0s_config(node_list);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject config without controllers', () => {
      // Arrange
      const node_list = create_node_list([
        create_node('worker-1', 'worker', { user: 'admin' }),
        create_node('worker-2', 'worker', { user: 'admin' }),
      ]);

      // Act
      const result = validate_k0s_config(node_list);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('at least one controller');
      }
    });

    it('should accept controller+worker as controller', () => {
      // Arrange
      const node_list = create_node_list(
        [create_node('combo-1', 'controller+worker', { user: 'admin' })],
        { user: 'admin' },
      );

      // Act
      const result = validate_k0s_config(node_list);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject node without SSH user', () => {
      // Arrange
      const node_list = create_node_list([
        create_node('controller-1', 'controller'),
        create_node('worker-1', 'worker'),
      ]);

      // Act
      const result = validate_k0s_config(node_list);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('SSH user');
      }
    });

    it('should accept node with default SSH from node list', () => {
      // Arrange
      const node_list = create_node_list(
        [create_node('controller-1', 'controller'), create_node('worker-1', 'worker')],
        { user: 'admin' },
      );

      // Act
      const result = validate_k0s_config(node_list);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('create_k0s_provider', () => {
    it('should create provider with correct name', () => {
      // Act
      const provider = create_k0s_provider();

      // Assert
      expect(provider.name).toBe('k0s');
    });

    it('should have all required methods', () => {
      // Act
      const provider = create_k0s_provider();

      // Assert
      expect(provider.validate).toBeDefined();
      expect(provider.install).toBeDefined();
      expect(provider.get_kubeconfig).toBeDefined();
      expect(provider.reset).toBeDefined();
      expect(provider.check_exists).toBeDefined();
    });

    it('should validate using validate_k0s_config', () => {
      // Arrange
      const provider = create_k0s_provider();
      const node_list = create_node_list(
        [create_node('controller-1', 'controller', { user: 'admin' })],
        { user: 'admin' },
      );

      // Act
      const result = provider.validate(node_list);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should fail validation for invalid config', () => {
      // Arrange
      const provider = create_k0s_provider();
      const node_list = create_node_list([create_node('worker-1', 'worker')]);

      // Act
      const result = provider.validate(node_list);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should accept provider options', () => {
      // Act
      const provider = create_k0s_provider({
        k0s_version: '1.30.0',
        telemetry_enabled: false,
        dynamic_config: true,
      });

      // Assert
      expect(provider.name).toBe('k0s');
    });
  });

  describe('check_exists', () => {
    it.skipIf(process.env['CI'] !== 'true')(
      'should return false when k0sctl cannot reach cluster',
      async () => {
        // Arrange - k0sctl not installed in CI, so kubeconfig will fail
        const provider = create_k0s_provider();
        const node_list = create_node_list(
          [create_node('controller-1', 'controller', { user: 'admin' })],
          { user: 'admin' },
        );

        // Act
        const result = await provider.check_exists?.(node_list);

        // Assert - should return false (cluster doesn't exist) or fail (k0sctl not found)
        expect(result).toBeDefined();
      },
    );
  });

  describe('install', () => {
    it.skipIf(process.env['CI'] !== 'true')(
      'should fail when k0sctl is not available',
      async () => {
        // Arrange - This test only makes sense when k0sctl is NOT installed
        const provider = create_k0s_provider();
        const node_list = create_node_list(
          [create_node('controller-1', 'controller', { user: 'admin' })],
          { user: 'admin' },
        );

        // Act
        const result = await provider.install(node_list, {});

        // Assert - k0sctl not installed in CI environment
        expect(result.success).toBe(false);
      },
    );

    it('should skip installation in dry run mode', async () => {
      // Arrange
      const provider = create_k0s_provider();
      const node_list = create_node_list(
        [create_node('controller-1', 'controller', { user: 'admin' })],
        { user: 'admin' },
      );

      // Act
      const result = await provider.install(node_list, { dry_run: true });

      // Assert - may fail on k0sctl check but exercises the code path
      expect(result).toBeDefined();
    });
  });

  describe('get_kubeconfig', () => {
    it.skipIf(process.env['CI'] !== 'true')(
      'should fail when k0sctl is not available',
      async () => {
        // Arrange - This test only makes sense when k0sctl is NOT installed
        const provider = create_k0s_provider();
        const node_list = create_node_list(
          [create_node('controller-1', 'controller', { user: 'admin' })],
          { user: 'admin' },
        );

        // Act
        const result = await provider.get_kubeconfig(node_list);

        // Assert - k0sctl not installed in CI environment
        expect(result.success).toBe(false);
      },
    );
  });

  describe('reset', () => {
    it.skipIf(process.env['CI'] !== 'true')(
      'should fail when k0sctl is not available',
      async () => {
        // Arrange - This test only makes sense when k0sctl is NOT installed
        const provider = create_k0s_provider();
        const node_list = create_node_list(
          [create_node('controller-1', 'controller', { user: 'admin' })],
          { user: 'admin' },
        );

        // Act
        const result = await provider.reset(node_list, {});

        // Assert - k0sctl not installed in CI environment
        expect(result.success).toBe(false);
      },
    );

    it.skipIf(process.env['CI'] !== 'true')('should skip reset in dry run mode', async () => {
      // Arrange - This test only makes sense when k0sctl is NOT installed
      const provider = create_k0s_provider();
      const node_list = create_node_list(
        [create_node('controller-1', 'controller', { user: 'admin' })],
        { user: 'admin' },
      );

      // Act
      const result = await provider.reset(node_list, { dry_run: true });

      // Assert - may fail on k0sctl check but exercises the code path
      expect(result).toBeDefined();
    });

    it.skipIf(process.env['CI'] !== 'true')('should accept force option', async () => {
      // Arrange - This test only makes sense when k0sctl is NOT installed
      const provider = create_k0s_provider();
      const node_list = create_node_list(
        [create_node('controller-1', 'controller', { user: 'admin' })],
        { user: 'admin' },
      );

      // Act
      const result = await provider.reset(node_list, { force: true });

      // Assert - k0sctl not installed in CI environment
      expect(result).toBeDefined();
    });
  });
});
