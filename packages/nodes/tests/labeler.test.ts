import { describe, expect, it } from 'bun:test';

import {
  calculate_all_label_changes,
  calculate_label_changes,
  create_dry_run_result,
  create_mock_labeler,
  format_label_change,
  group_changes_by_node,
} from '../src/labeler.js';
import type { NodeListType, NodeType } from '../src/types.js';

describe('Labeler', () => {
  const create_node = (name: string, labels: Record<string, string | boolean> = {}): NodeType => ({
    name,
    role: 'worker',
    address: `${name}.local`,
    labels,
  });

  describe('calculate_label_changes', () => {
    it('should detect labels to add', () => {
      // Arrange
      const node = create_node('node-1', { storage: 'nvme', gpu: true });
      const current_labels: Record<string, string> = {};

      // Act
      const changes = calculate_label_changes(node, current_labels, 'myproject.io');

      // Assert
      expect(changes).toHaveLength(2);
      expect(changes.some((c) => c.operation === 'add' && c.key === 'myproject.io/storage')).toBe(
        true,
      );
      expect(changes.some((c) => c.operation === 'add' && c.key === 'myproject.io/gpu')).toBe(true);
    });

    it('should detect labels to update', () => {
      // Arrange
      const node = create_node('node-1', { storage: 'nvme' });
      const current_labels = { 'myproject.io/storage': 'ssd' };

      // Act
      const changes = calculate_label_changes(node, current_labels, 'myproject.io');

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        node: 'node-1',
        key: 'myproject.io/storage',
        value: 'nvme',
        operation: 'update',
      });
    });

    it('should detect labels to remove', () => {
      // Arrange
      const node = create_node('node-1', {});
      const current_labels = {
        'myproject.io/old-label': 'value',
        'other-prefix/keep': 'this',
      };

      // Act
      const changes = calculate_label_changes(node, current_labels, 'myproject.io');

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        node: 'node-1',
        key: 'myproject.io/old-label',
        operation: 'remove',
      });
    });

    it('should not change labels that match', () => {
      // Arrange
      const node = create_node('node-1', { storage: 'nvme' });
      const current_labels = { 'myproject.io/storage': 'nvme' };

      // Act
      const changes = calculate_label_changes(node, current_labels, 'myproject.io');

      // Assert
      expect(changes).toHaveLength(0);
    });
  });

  describe('calculate_all_label_changes', () => {
    it('should calculate changes for all nodes', () => {
      // Arrange
      const node_list: NodeListType = {
        cluster: 'test',
        label_prefix: 'test.io',
        nodes: [create_node('node-1', { role: 'api' }), create_node('node-2', { role: 'db' })],
      };
      const current_labels = new Map<string, Record<string, string>>();

      // Act
      const changes = calculate_all_label_changes(node_list, current_labels);

      // Assert
      expect(changes).toHaveLength(2);
      expect(changes.filter((c) => c.node === 'node-1')).toHaveLength(1);
      expect(changes.filter((c) => c.node === 'node-2')).toHaveLength(1);
    });

    it('should use default prefix when not specified', () => {
      // Arrange
      const node_list: NodeListType = {
        cluster: 'test',
        nodes: [create_node('node-1', { app: 'web' })],
      };
      const current_labels = new Map<string, Record<string, string>>();

      // Act
      const changes = calculate_all_label_changes(node_list, current_labels);

      // Assert
      expect(changes[0]?.key).toBe('kustodian.io/app');
    });
  });

  describe('format_label_change', () => {
    it('should format add operation', () => {
      // Act
      const result = format_label_change({
        node: 'node-1',
        key: 'myproject.io/storage',
        value: 'nvme',
        operation: 'add',
      });

      // Assert
      expect(result).toBe('[+] node-1: myproject.io/storage=nvme');
    });

    it('should format update operation', () => {
      // Act
      const result = format_label_change({
        node: 'node-1',
        key: 'myproject.io/storage',
        value: 'ssd',
        operation: 'update',
      });

      // Assert
      expect(result).toBe('[~] node-1: myproject.io/storage=ssd');
    });

    it('should format remove operation', () => {
      // Act
      const result = format_label_change({
        node: 'node-1',
        key: 'myproject.io/old-label',
        operation: 'remove',
      });

      // Assert
      expect(result).toBe('[-] node-1: myproject.io/old-label');
    });
  });

  describe('group_changes_by_node', () => {
    it('should group changes by node name', () => {
      // Arrange
      const changes = [
        { node: 'node-1', key: 'a', operation: 'add' as const },
        { node: 'node-2', key: 'b', operation: 'add' as const },
        { node: 'node-1', key: 'c', operation: 'add' as const },
      ];

      // Act
      const grouped = group_changes_by_node(changes);

      // Assert
      expect(grouped.size).toBe(2);
      expect(grouped.get('node-1')).toHaveLength(2);
      expect(grouped.get('node-2')).toHaveLength(1);
    });
  });

  describe('create_dry_run_result', () => {
    it('should create result with all changes skipped', () => {
      // Arrange
      const changes = [
        { node: 'node-1', key: 'a', operation: 'add' as const },
        { node: 'node-2', key: 'b', operation: 'add' as const },
      ];

      // Act
      const result = create_dry_run_result(changes);

      // Assert
      expect(result.changes).toEqual(changes);
      expect(result.applied).toBe(0);
      expect(result.skipped).toBe(2);
    });
  });

  describe('create_mock_labeler', () => {
    it('should return empty labels for unknown node', async () => {
      // Arrange
      const labeler = create_mock_labeler(new Map());

      // Act
      const result = await labeler.get_labels('unknown-node');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({});
      }
    });

    it('should return labels for known node', async () => {
      // Arrange
      const labels_map = new Map([['node-1', { 'test.io/role': 'api' }]]);
      const labeler = create_mock_labeler(labels_map);

      // Act
      const result = await labeler.get_labels('node-1');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ 'test.io/role': 'api' });
      }
    });

    it('should apply change successfully', async () => {
      // Arrange
      const labeler = create_mock_labeler(new Map());

      // Act
      const result = await labeler.apply_change({
        node: 'node-1',
        key: 'test.io/role',
        value: 'api',
        operation: 'add',
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should sync labels and return result', async () => {
      // Arrange
      const labeler = create_mock_labeler(new Map());
      const node_list: NodeListType = {
        cluster: 'test',
        label_prefix: 'test.io',
        nodes: [create_node('node-1', { role: 'api' })],
      };

      // Act
      const result = await labeler.sync_labels(node_list);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.changes).toHaveLength(1);
        expect(result.value.applied).toBe(1);
        expect(result.value.skipped).toBe(0);
      }
    });

    it('should handle dry run mode', async () => {
      // Arrange
      const labeler = create_mock_labeler(new Map());
      const node_list: NodeListType = {
        cluster: 'test',
        label_prefix: 'test.io',
        nodes: [create_node('node-1', { role: 'api' })],
      };

      // Act
      const result = await labeler.sync_labels(node_list, { dry_run: true });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.applied).toBe(0);
        expect(result.value.skipped).toBe(1);
      }
    });
  });
});
