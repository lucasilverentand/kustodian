import { describe, expect, it } from 'bun:test';

import { validate_node_list } from '../src/node-list.js';

describe('NodeList Schema', () => {
  describe('validate_node_list', () => {
    it('should validate a valid node list', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: {
          cluster: 'production',
        },
        spec: {
          label_prefix: 'myorg.io',
          ssh: {
            user: 'admin',
            key_path: '~/.ssh/cluster_key',
          },
          nodes: [
            {
              name: 'node-1',
              role: 'controller+worker',
              address: '10.0.0.11',
              labels: {
                metallb: true,
                storage: 'nvme',
              },
            },
          ],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.cluster).toBe('production');
        expect(result.data.spec.nodes).toHaveLength(1);
      }
    });

    it('should validate minimal node list', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: {
          cluster: 'local',
        },
        spec: {
          nodes: [
            {
              name: 'node-1',
              role: 'controller',
              address: 'localhost',
            },
          ],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate all node roles', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: { cluster: 'test' },
        spec: {
          nodes: [
            { name: 'ctrl-1', role: 'controller', address: '10.0.0.1' },
            { name: 'worker-1', role: 'worker', address: '10.0.0.2' },
            { name: 'combo-1', role: 'controller+worker', address: '10.0.0.3' },
          ],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate nodes with taints', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: { cluster: 'test' },
        spec: {
          nodes: [
            {
              name: 'gpu-node',
              role: 'worker',
              address: '10.0.0.10',
              taints: [
                { key: 'dedicated', value: 'gpu', effect: 'NoSchedule' },
                { key: 'nvidia.com/gpu', effect: 'NoSchedule' },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate SSH config with port', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: { cluster: 'test' },
        spec: {
          ssh: {
            user: 'root',
            port: 2222,
            key_path: '~/.ssh/id_rsa',
            known_hosts_path: '~/.ssh/known_hosts',
          },
          nodes: [{ name: 'n1', role: 'worker', address: '10.0.0.1' }],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: { cluster: 'test' },
        spec: {
          nodes: [{ name: 'n1', role: 'master', address: '10.0.0.1' }],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty nodes array', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: { cluster: 'test' },
        spec: { nodes: [] },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject missing cluster in metadata', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: {},
        spec: { nodes: [{ name: 'n1', role: 'worker', address: '10.0.0.1' }] },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject invalid taint effect', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: { cluster: 'test' },
        spec: {
          nodes: [
            {
              name: 'n1',
              role: 'worker',
              address: '10.0.0.1',
              taints: [{ key: 'test', effect: 'Invalid' }],
            },
          ],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject negative SSH port', () => {
      // Arrange
      const nodeList = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeList',
        metadata: { cluster: 'test' },
        spec: {
          ssh: { port: -1 },
          nodes: [{ name: 'n1', role: 'worker', address: '10.0.0.1' }],
        },
      };

      // Act
      const result = validate_node_list(nodeList);

      // Assert
      expect(result.success).toBe(false);
    });
  });
});
