import { describe, expect, it } from 'bun:test';

import {
  type NodeProfileType,
  get_referenced_profiles,
  resolve_all_node_profiles,
  resolve_node_profile,
  validate_profile_references,
} from '../src/profile.js';
import type { NodeType } from '../src/types.js';

describe('Profile Resolution', () => {
  const create_node = (
    name: string,
    overrides: Partial<NodeType> = {},
  ): NodeType => ({
    name,
    role: 'worker',
    address: `${name}.local`,
    ...overrides,
  });

  const create_profile = (
    name: string,
    overrides: Partial<NodeProfileType> = {},
  ): NodeProfileType => ({
    name,
    ...overrides,
  });

  describe('resolve_node_profile', () => {
    it('should return node as-is when no profile', () => {
      // Arrange
      const node = create_node('node-1', {
        labels: { storage: 'nvme' },
      });

      // Act
      const resolved = resolve_node_profile(node, undefined);

      // Assert
      expect(resolved.name).toBe('node-1');
      expect(resolved.labels).toEqual({ storage: 'nvme' });
      expect('profile' in resolved).toBe(false);
    });

    it('should remove profile field even without profile data', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'some-profile',
      });

      // Act
      const resolved = resolve_node_profile(node, undefined);

      // Assert
      expect('profile' in resolved).toBe(false);
    });

    it('should merge profile labels with node labels', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
        labels: { rack: 'A1' },
      });
      const profile = create_profile('storage-node', {
        labels: { storage: 'nvme', tier: 'high' },
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.labels).toEqual({
        storage: 'nvme',
        tier: 'high',
        rack: 'A1',
      });
    });

    it('should allow node labels to override profile labels', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
        labels: { tier: 'ultra' }, // Override profile value
      });
      const profile = create_profile('storage-node', {
        labels: { storage: 'nvme', tier: 'high' },
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.labels).toEqual({
        storage: 'nvme',
        tier: 'ultra', // Node value wins
      });
    });

    it('should merge profile taints with node taints', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
        taints: [{ key: 'custom', effect: 'NoSchedule' }],
      });
      const profile = create_profile('storage-node', {
        taints: [{ key: 'storage', effect: 'NoSchedule' }],
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.taints).toHaveLength(2);
      expect(resolved.taints).toContainEqual({ key: 'storage', effect: 'NoSchedule' });
      expect(resolved.taints).toContainEqual({ key: 'custom', effect: 'NoSchedule' });
    });

    it('should allow node taints to override profile taints with same key+effect', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
        taints: [{ key: 'storage', value: 'premium', effect: 'NoSchedule' }],
      });
      const profile = create_profile('storage-node', {
        taints: [{ key: 'storage', value: 'standard', effect: 'NoSchedule' }],
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.taints).toHaveLength(1);
      expect(resolved.taints?.[0]).toEqual({
        key: 'storage',
        value: 'premium',
        effect: 'NoSchedule',
      });
    });

    it('should not override profile taint with different effect', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
        taints: [{ key: 'storage', effect: 'NoExecute' }],
      });
      const profile = create_profile('storage-node', {
        taints: [{ key: 'storage', effect: 'NoSchedule' }],
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.taints).toHaveLength(2);
    });

    it('should merge profile annotations with node annotations', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
        annotations: { 'custom/note': 'special' },
      });
      const profile = create_profile('storage-node', {
        annotations: { description: 'Storage node' },
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.annotations).toEqual({
        description: 'Storage node',
        'custom/note': 'special',
      });
    });

    it('should not inherit ssh from profile', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
        ssh: { user: 'node-user' },
      });
      const profile = create_profile('storage-node', {
        labels: { storage: 'nvme' },
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.ssh).toEqual({ user: 'node-user' });
    });

    it('should use only profile labels when node has none', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'storage-node',
      });
      const profile = create_profile('storage-node', {
        labels: { storage: 'nvme' },
      });

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.labels).toEqual({ storage: 'nvme' });
    });

    it('should use only node labels when profile has none', () => {
      // Arrange
      const node = create_node('node-1', {
        profile: 'empty-profile',
        labels: { custom: 'value' },
      });
      const profile = create_profile('empty-profile', {});

      // Act
      const resolved = resolve_node_profile(node, profile);

      // Assert
      expect(resolved.labels).toEqual({ custom: 'value' });
    });
  });

  describe('resolve_all_node_profiles', () => {
    it('should resolve all nodes with their profiles', () => {
      // Arrange
      const nodes: NodeType[] = [
        create_node('node-1', { profile: 'storage-node' }),
        create_node('node-2', { profile: 'storage-node' }),
        create_node('node-3', { labels: { custom: 'value' } }),
      ];
      const profiles = new Map<string, NodeProfileType>([
        ['storage-node', create_profile('storage-node', { labels: { storage: 'nvme' } })],
      ]);

      // Act
      const { resolved, errors } = resolve_all_node_profiles(nodes, profiles);

      // Assert
      expect(errors).toHaveLength(0);
      expect(resolved).toHaveLength(3);
      expect(resolved[0]?.labels).toEqual({ storage: 'nvme' });
      expect(resolved[1]?.labels).toEqual({ storage: 'nvme' });
      expect(resolved[2]?.labels).toEqual({ custom: 'value' });
    });

    it('should report errors for missing profiles', () => {
      // Arrange
      const nodes: NodeType[] = [
        create_node('node-1', { profile: 'missing-profile' }),
      ];
      const profiles = new Map<string, NodeProfileType>();

      // Act
      const { resolved, errors } = resolve_all_node_profiles(nodes, profiles);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('missing-profile');
      expect(errors[0]).toContain('node-1');
      // Node should still be resolved without the profile
      expect(resolved).toHaveLength(1);
      expect('profile' in resolved[0]!).toBe(false);
    });
  });

  describe('get_referenced_profiles', () => {
    it('should return empty set for nodes without profiles', () => {
      // Arrange
      const nodes: NodeType[] = [
        create_node('node-1'),
        create_node('node-2'),
      ];

      // Act
      const profiles = get_referenced_profiles(nodes);

      // Assert
      expect(profiles.size).toBe(0);
    });

    it('should return unique profile names', () => {
      // Arrange
      const nodes: NodeType[] = [
        create_node('node-1', { profile: 'storage-node' }),
        create_node('node-2', { profile: 'storage-node' }),
        create_node('node-3', { profile: 'compute-node' }),
      ];

      // Act
      const profiles = get_referenced_profiles(nodes);

      // Assert
      expect(profiles.size).toBe(2);
      expect(profiles.has('storage-node')).toBe(true);
      expect(profiles.has('compute-node')).toBe(true);
    });
  });

  describe('validate_profile_references', () => {
    it('should return empty array when all profiles exist', () => {
      // Arrange
      const nodes: NodeType[] = [
        create_node('node-1', { profile: 'storage-node' }),
      ];
      const profiles = new Map<string, NodeProfileType>([
        ['storage-node', create_profile('storage-node')],
      ]);

      // Act
      const errors = validate_profile_references(nodes, profiles);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return errors for missing profiles', () => {
      // Arrange
      const nodes: NodeType[] = [
        create_node('node-1', { profile: 'missing-profile' }),
        create_node('node-2', { profile: 'missing-profile' }),
        create_node('node-3', { profile: 'another-missing' }),
      ];
      const profiles = new Map<string, NodeProfileType>();

      // Act
      const errors = validate_profile_references(nodes, profiles);

      // Assert
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('missing-profile');
      expect(errors[0]).toContain('node-1');
      expect(errors[0]).toContain('node-2');
      expect(errors[1]).toContain('another-missing');
      expect(errors[1]).toContain('node-3');
    });

    it('should return empty array for nodes without profiles', () => {
      // Arrange
      const nodes: NodeType[] = [
        create_node('node-1'),
        create_node('node-2'),
      ];
      const profiles = new Map<string, NodeProfileType>();

      // Act
      const errors = validate_profile_references(nodes, profiles);

      // Assert
      expect(errors).toHaveLength(0);
    });
  });
});
