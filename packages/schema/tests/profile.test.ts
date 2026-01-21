import { describe, expect, it } from 'bun:test';

import {
  node_profile_resource_to_profile,
  validate_node_profile_resource} from '../src/profile.js';

describe('NodeProfile Schema', () => {
  describe('validate_node_profile_resource', () => {
    it('should validate a minimal profile', () => {
      // Arrange
      const profile = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeProfile',
        metadata: {
          name: 'minimal-profile'},
        spec: {}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.name).toBe('minimal-profile');
      }
    });

    it('should validate a profile with all fields', () => {
      // Arrange
      const profile = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeProfile',
        metadata: {
          name: 'storage-node'},
        spec: {
          name: 'Storage Node',
          description: 'Node with NVMe storage for high-performance workloads',
          labels: {
            storage: 'nvme',
            'storage-tier': 'high-performance'},
          taints: [
            {
              key: 'storage',
              value: 'nvme',
              effect: 'NoSchedule'},
          ],
          annotations: {
            description: 'High-performance storage node',
            'storage-capacity': '2TB'}}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.name).toBe('storage-node');
        expect(result.data.spec.name).toBe('Storage Node');
        expect(result.data.spec.description).toContain('NVMe storage');
        expect(result.data.spec.labels?.['storage']).toBe('nvme');
        expect(result.data.spec.taints).toHaveLength(1);
        expect(result.data.spec.annotations?.['description']).toBe('High-performance storage node');
      }
    });

    it('should support boolean and number labels', () => {
      // Arrange
      const profile = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeProfile',
        metadata: {
          name: 'mixed-labels'},
        spec: {
          labels: {
            active: true,
            disabled: false,
            count: 5,
            ratio: 1.5}}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.labels?.['active']).toBe(true);
        expect(result.data.spec.labels?.['disabled']).toBe(false);
        expect(result.data.spec.labels?.['count']).toBe(5);
        expect(result.data.spec.labels?.['ratio']).toBe(1.5);
      }
    });

    it('should validate all taint effects', () => {
      // Arrange
      const profile = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeProfile',
        metadata: {
          name: 'taint-effects'},
        spec: {
          taints: [
            { key: 'no-schedule', effect: 'NoSchedule' },
            { key: 'prefer-no-schedule', effect: 'PreferNoSchedule' },
            { key: 'no-execute', effect: 'NoExecute' },
          ]}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.taints).toHaveLength(3);
      }
    });

    it('should reject invalid apiVersion', () => {
      // Arrange
      const profile = {
        apiVersion: 'wrong/v1',
        kind: 'NodeProfile',
        metadata: {
          name: 'invalid'},
        spec: {}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject invalid kind', () => {
      // Arrange
      const profile = {
        apiVersion: 'kustodian.io/v1',
        kind: 'WrongKind',
        metadata: {
          name: 'invalid'},
        spec: {}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      // Arrange
      const profile = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeProfile',
        metadata: {
          name: ''},
        spec: {}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject invalid taint effect', () => {
      // Arrange
      const profile = {
        apiVersion: 'kustodian.io/v1',
        kind: 'NodeProfile',
        metadata: {
          name: 'invalid-taint'},
        spec: {
          taints: [{ key: 'test', effect: 'InvalidEffect' }]}};

      // Act
      const result = validate_node_profile_resource(profile);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('node_profile_resource_to_profile', () => {
    it('should convert minimal profile', () => {
      // Arrange
      const resource = {
        apiVersion: 'kustodian.io/v1' as const,
        kind: 'NodeProfile' as const,
        metadata: {
          name: 'minimal'},
        spec: {}};

      // Act
      const profile = node_profile_resource_to_profile(resource);

      // Assert
      expect(profile.name).toBe('minimal');
      expect(profile.display_name).toBeUndefined();
      expect(profile.description).toBeUndefined();
      expect(profile.labels).toBeUndefined();
      expect(profile.taints).toBeUndefined();
      expect(profile.annotations).toBeUndefined();
    });

    it('should convert full profile', () => {
      // Arrange
      const resource = {
        apiVersion: 'kustodian.io/v1' as const,
        kind: 'NodeProfile' as const,
        metadata: {
          name: 'storage-node'},
        spec: {
          name: 'Storage Node',
          description: 'High-performance storage',
          labels: {
            storage: 'nvme'},
          taints: [{ key: 'storage', effect: 'NoSchedule' as const }],
          annotations: {
            note: 'test'}}};

      // Act
      const profile = node_profile_resource_to_profile(resource);

      // Assert
      expect(profile.name).toBe('storage-node');
      expect(profile.display_name).toBe('Storage Node');
      expect(profile.description).toBe('High-performance storage');
      expect(profile.labels).toEqual({ storage: 'nvme' });
      expect(profile.taints).toEqual([{ key: 'storage', effect: 'NoSchedule' }]);
      expect(profile.annotations).toEqual({ note: 'test' });
    });
  });
});
