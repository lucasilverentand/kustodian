import { describe, expect, it } from 'bun:test';
import type { NodeListType, NodeType } from 'kustodian/nodes';

import {
  generate_k0sctl_config,
  node_to_k0sctl_host,
  serialize_k0sctl_config,
} from '../src/config.js';

describe('k0s Config', () => {
  const create_node = (
    name: string,
    role: NodeType['role'] = 'worker',
    address?: string,
  ): NodeType => ({
    name,
    role,
    address: address ?? `${name}.local`,
  });

  const create_node_list = (nodes: NodeType[] = []): NodeListType => ({
    cluster: 'test-cluster',
    ssh: { user: 'admin', key_path: '~/.ssh/cluster_key' },
    nodes,
  });

  describe('node_to_k0sctl_host', () => {
    it('should convert worker node', () => {
      // Arrange
      const node = create_node('worker-1', 'worker');
      const default_ssh = { user: 'admin', key_path: '~/.ssh/key' };

      // Act
      const result = node_to_k0sctl_host(node, default_ssh);

      // Assert
      expect(result.role).toBe('worker');
      expect(result.hostname).toBe('worker-1');
      expect(result.noTaints).toBeUndefined();
      expect(result.openSSH.address).toBe('worker-1.local');
      expect(result.openSSH.user).toBe('admin');
    });

    it('should convert controller node', () => {
      // Arrange
      const node = create_node('controller-1', 'controller');

      // Act
      const result = node_to_k0sctl_host(node);

      // Assert
      expect(result.role).toBe('controller');
      expect(result.hostname).toBe('controller-1');
      expect(result.noTaints).toBeUndefined();
    });

    it('should convert controller+worker node with noTaints', () => {
      // Arrange
      const node = create_node('combo-1', 'controller+worker');

      // Act
      const result = node_to_k0sctl_host(node);

      // Assert
      expect(result.role).toBe('controller+worker');
      expect(result.noTaints).toBe(true);
    });

    it('should use node-specific SSH config over default', () => {
      // Arrange
      const node: NodeType = {
        ...create_node('node-1', 'worker'),
        ssh: { user: 'ubuntu', key_path: '~/.ssh/node_key' },
      };
      const default_ssh = { user: 'admin', key_path: '~/.ssh/default_key' };

      // Act
      const result = node_to_k0sctl_host(node, default_ssh);

      // Assert
      expect(result.openSSH.user).toBe('ubuntu');
      expect(result.openSSH.keyPath).toBe('~/.ssh/node_key');
    });
  });

  describe('generate_k0sctl_config', () => {
    it('should generate minimal config', () => {
      // Arrange
      const node_list = create_node_list([
        create_node('controller-1', 'controller'),
        create_node('worker-1', 'worker'),
      ]);

      // Act
      const result = generate_k0sctl_config(node_list);

      // Assert
      expect(result.apiVersion).toBe('k0sctl.k0sproject.io/v1beta1');
      expect(result.kind).toBe('Cluster');
      expect(result.metadata.name).toBe('test-cluster');
      expect(result.spec.hosts).toHaveLength(2);
    });

    it('should set external address from primary controller', () => {
      // Arrange
      const node_list = create_node_list([
        create_node('controller-1', 'controller', '10.0.0.1'),
        create_node('controller-2', 'controller', '10.0.0.2'),
      ]);

      // Act
      const result = generate_k0sctl_config(node_list);

      // Assert
      expect(result.spec.k0s?.config?.spec?.api?.externalAddress).toBe('10.0.0.1');
    });

    it('should apply provider options', () => {
      // Arrange
      const node_list = create_node_list([create_node('controller-1', 'controller')]);
      const options = {
        k0s_version: '1.30.0',
        telemetry_enabled: true,
        dynamic_config: true,
      };

      // Act
      const result = generate_k0sctl_config(node_list, options);

      // Assert
      expect(result.spec.k0s?.version).toBe('1.30.0');
      expect(result.spec.k0s?.dynamicConfig).toBe(true);
      expect(result.spec.k0s?.config?.spec?.telemetry?.enabled).toBe(true);
    });

    it('should disable telemetry by default', () => {
      // Arrange
      const node_list = create_node_list([create_node('controller-1', 'controller')]);

      // Act
      const result = generate_k0sctl_config(node_list);

      // Assert
      expect(result.spec.k0s?.config?.spec?.telemetry?.enabled).toBe(false);
    });

    it('should use default SSH from provider options', () => {
      // Arrange
      const node_list: NodeListType = {
        cluster: 'test-cluster',
        nodes: [create_node('worker-1', 'worker')],
      };
      const options = {
        default_ssh: { user: 'custom', key_path: '~/.ssh/custom' },
      };

      // Act
      const result = generate_k0sctl_config(node_list, options);

      // Assert
      expect(result.spec.hosts[0]?.openSSH.user).toBe('custom');
      expect(result.spec.hosts[0]?.openSSH.keyPath).toBe('~/.ssh/custom');
    });
  });

  describe('serialize_k0sctl_config', () => {
    it('should remove undefined values', () => {
      // Arrange
      const node_list = create_node_list([create_node('controller-1', 'controller')]);
      const config = generate_k0sctl_config(node_list);

      // Act
      const result = serialize_k0sctl_config(config);

      // Assert
      expect(JSON.stringify(result)).not.toContain('undefined');
    });

    it('should preserve defined values', () => {
      // Arrange
      const node_list = create_node_list([create_node('controller-1', 'controller')]);
      const config = generate_k0sctl_config(node_list, { k0s_version: '1.30.0' });

      // Act
      const result = serialize_k0sctl_config(config) as Record<string, unknown>;

      // Assert
      expect(result['apiVersion']).toBe('k0sctl.k0sproject.io/v1beta1');
      expect(result['metadata']).toEqual({ name: 'test-cluster' });
    });
  });
});
