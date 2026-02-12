import { describe, expect, it } from 'bun:test';

import { failure, success } from '../../src/core/index.js';
import type { KubectlClientType } from '../../src/k8s/index.js';
import { create_kubectl_labeler } from '../../src/nodes/kubectl-labeler.js';
import type { NodeListType, NodeType } from '../../src/nodes/types.js';

function create_node(name: string, labels: Record<string, string | boolean> = {}): NodeType {
  return {
    name,
    role: 'worker',
    address: `${name}.local`,
    labels,
  };
}

interface MockKubectl extends KubectlClientType {
  applied_label_calls: Map<string, Record<string, string>[]>;
}

function create_mock_kubectl(
  node_labels: Map<string, Record<string, string>>,
  options: { fail_get?: string[]; fail_label?: string[] } = {},
): MockKubectl {
  const applied_labels = new Map<string, Record<string, string>[]>();

  return {
    async get(resource) {
      if (resource.kind === 'Node' && options.fail_get?.includes(resource.name)) {
        return failure({
          code: 'KUBECTL_ERROR',
          message: `node "${resource.name}" not found`,
        });
      }

      const labels = node_labels.get(resource.name) ?? {};
      // biome-ignore lint/suspicious/noExplicitAny: mock object for testing
      return success([{ metadata: { name: resource.name, labels }, kind: 'Node' }] as any);
    },

    async label(node, labels) {
      if (options.fail_label?.includes(node)) {
        return failure({
          code: 'KUBECTL_ERROR',
          message: `failed to label node ${node}`,
        });
      }

      const calls = applied_labels.get(node) ?? [];
      calls.push(labels);
      applied_labels.set(node, calls);
      return success(undefined);
    },

    get applied_label_calls() {
      return applied_labels;
    },

    // Stubs for unused methods
    async delete_resource() {
      return success(undefined);
    },
    async annotate() {
      return success(undefined);
    },
    async wait() {
      return success(undefined);
    },
    async logs() {
      return success('');
    },
    async apply_stdin() {
      return success('');
    },
    async check() {
      return success(true);
    },
  } as MockKubectl;
}

describe('KubectlLabeler', () => {
  describe('sync_labels', () => {
    it('should batch add/update labels in a single kubectl call per node', async () => {
      // Arrange
      const kubectl = create_mock_kubectl(new Map());
      const labeler = create_kubectl_labeler(kubectl);
      const node_list: NodeListType = {
        cluster: 'test',
        label_prefix: 'test.io',
        nodes: [create_node('node-1', { role: 'api', tier: 'frontend' })],
      };

      // Act
      const result = await labeler.sync_labels(node_list);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.applied).toBe(2);
        expect(result.value.skipped).toBe(0);
      }

      // Verify batching: should be 1 kubectl label call (not 2 separate ones)
      const calls = kubectl.applied_label_calls;
      expect(calls.get('node-1')).toHaveLength(1);
      expect(calls.get('node-1')?.[0]).toEqual({
        'test.io/role': 'api',
        'test.io/tier': 'frontend',
      });
    });

    it('should handle removals in a separate batch call', async () => {
      // Arrange
      const existing_labels = new Map([
        ['node-1', { 'test.io/old': 'value', 'test.io/keep': 'same' }],
      ]);
      const kubectl = create_mock_kubectl(existing_labels);
      const labeler = create_kubectl_labeler(kubectl);
      const node_list: NodeListType = {
        cluster: 'test',
        label_prefix: 'test.io',
        nodes: [create_node('node-1', { keep: 'same', new: 'label' })],
      };

      // Act
      const result = await labeler.sync_labels(node_list);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        // 1 add (new) + 1 remove (old) = 2 changes
        expect(result.value.changes).toHaveLength(2);
        expect(result.value.applied).toBe(2);
      }

      // Should have 2 calls: one for adds, one for removals
      const calls = kubectl.applied_label_calls;
      expect(calls.get('node-1')).toHaveLength(2);

      // First call: add/update labels
      expect(calls.get('node-1')?.[0]).toEqual({ 'test.io/new': 'label' });

      // Second call: removal labels (key ending with -, empty value)
      expect(calls.get('node-1')?.[1]).toEqual({ 'test.io/old-': '' });
    });

    it('should continue labeling other nodes when one node fails get_labels', async () => {
      // Arrange
      const kubectl = create_mock_kubectl(new Map(), { fail_get: ['node-1'] });
      const labeler = create_kubectl_labeler(kubectl);
      const node_list: NodeListType = {
        cluster: 'test',
        label_prefix: 'test.io',
        nodes: [create_node('node-1', { role: 'api' }), create_node('node-2', { role: 'db' })],
      };

      // Act
      const result = await labeler.sync_labels(node_list);

      // Assert — should succeed overall, with node-2 labels applied
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.applied).toBe(1);
        expect(result.value.skipped).toBeGreaterThanOrEqual(1);
      }
    });

    it('should continue labeling other nodes when one node fails label apply', async () => {
      // Arrange
      const kubectl = create_mock_kubectl(new Map(), { fail_label: ['node-1'] });
      const labeler = create_kubectl_labeler(kubectl);
      const node_list: NodeListType = {
        cluster: 'test',
        label_prefix: 'test.io',
        nodes: [create_node('node-1', { role: 'api' }), create_node('node-2', { role: 'db' })],
      };

      // Act
      const result = await labeler.sync_labels(node_list);

      // Assert — should succeed overall, with node-2 labels applied
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.applied).toBe(1);
        expect(result.value.skipped).toBe(1);
      }
    });

    it('should return all changes as skipped in dry run mode', async () => {
      // Arrange
      const kubectl = create_mock_kubectl(new Map());
      const labeler = create_kubectl_labeler(kubectl);
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
        expect(result.value.changes).toHaveLength(1);
      }
    });

    it('should return zero changes when no labels are configured', async () => {
      // Arrange
      const kubectl = create_mock_kubectl(new Map());
      const labeler = create_kubectl_labeler(kubectl);
      const node_list: NodeListType = {
        cluster: 'test',
        nodes: [create_node('node-1')],
      };

      // Act
      const result = await labeler.sync_labels(node_list);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.changes).toHaveLength(0);
        expect(result.value.applied).toBe(0);
        expect(result.value.skipped).toBe(0);
      }
    });
  });
});
