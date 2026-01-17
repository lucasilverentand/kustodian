import { describe, expect, it } from 'bun:test';

import type { PreservationPolicyType } from '@kustodian/schema';

import {
  DEFAULT_STATEFUL_RESOURCES,
  generate_preservation_patches,
  get_preserved_resource_types,
  should_preserve_resource,
} from '../src/preservation.js';

describe('Preservation', () => {
  describe('get_preserved_resource_types', () => {
    it('should return empty array for none mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'none',
      };

      const result = get_preserved_resource_types(policy);

      expect(result).toEqual([]);
    });

    it('should return default stateful resources for stateful mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'stateful',
      };

      const result = get_preserved_resource_types(policy);

      expect(result).toEqual([...DEFAULT_STATEFUL_RESOURCES]);
    });

    it('should return custom resources for custom mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'custom',
        keep_resources: ['PersistentVolumeClaim', 'ConfigMap'],
      };

      const result = get_preserved_resource_types(policy);

      expect(result).toEqual(['PersistentVolumeClaim', 'ConfigMap']);
    });

    it('should return empty array for custom mode with no resources specified', () => {
      const policy: PreservationPolicyType = {
        mode: 'custom',
      };

      const result = get_preserved_resource_types(policy);

      expect(result).toEqual([]);
    });
  });

  describe('generate_preservation_patches', () => {
    it('should return empty array for no preserved types', () => {
      const result = generate_preservation_patches([]);

      expect(result).toEqual([]);
    });

    it('should generate patches for preserved types', () => {
      const preserved_types = ['PersistentVolumeClaim', 'Secret'];

      const result = generate_preservation_patches(preserved_types);

      expect(result).toHaveLength(2);
      if (result[0] && result[1]) {
        expect(result[0].target.kind).toBe('PersistentVolumeClaim');
        expect(result[1].target.kind).toBe('Secret');
      }
    });

    it('should include preservation label in patch', () => {
      const preserved_types = ['PersistentVolumeClaim'];

      const result = generate_preservation_patches(preserved_types);

      if (result[0]) {
        expect(result[0].patch).toContain('kustodian.io/preserve: "true"');
        expect(result[0].patch).toContain('kind: PersistentVolumeClaim');
      }
    });

    it('should generate correct patch structure', () => {
      const preserved_types = ['ConfigMap'];

      const result = generate_preservation_patches(preserved_types);

      if (result[0]) {
        expect(result[0]).toHaveProperty('patch');
        expect(result[0]).toHaveProperty('target');
        expect(result[0].target).toHaveProperty('kind');
        expect(result[0].target.kind).toBe('ConfigMap');
      }
    });
  });

  describe('should_preserve_resource', () => {
    it('should preserve PVC in stateful mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'stateful',
      };

      const result = should_preserve_resource('PersistentVolumeClaim', policy);

      expect(result).toBe(true);
    });

    it('should preserve Secret in stateful mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'stateful',
      };

      const result = should_preserve_resource('Secret', policy);

      expect(result).toBe(true);
    });

    it('should preserve ConfigMap in stateful mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'stateful',
      };

      const result = should_preserve_resource('ConfigMap', policy);

      expect(result).toBe(true);
    });

    it('should not preserve Deployment in stateful mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'stateful',
      };

      const result = should_preserve_resource('Deployment', policy);

      expect(result).toBe(false);
    });

    it('should not preserve anything in none mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'none',
      };

      expect(should_preserve_resource('PersistentVolumeClaim', policy)).toBe(false);
      expect(should_preserve_resource('Secret', policy)).toBe(false);
      expect(should_preserve_resource('Deployment', policy)).toBe(false);
    });

    it('should preserve only specified resources in custom mode', () => {
      const policy: PreservationPolicyType = {
        mode: 'custom',
        keep_resources: ['PersistentVolumeClaim'],
      };

      expect(should_preserve_resource('PersistentVolumeClaim', policy)).toBe(true);
      expect(should_preserve_resource('Secret', policy)).toBe(false);
      expect(should_preserve_resource('ConfigMap', policy)).toBe(false);
    });
  });
});
