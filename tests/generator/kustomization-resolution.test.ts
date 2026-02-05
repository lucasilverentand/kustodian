import { describe, expect, it } from 'bun:test';

import type { ClusterType, KustomizationType, TemplateConfigType } from '../../src/schema/index.js';

import {
  get_template_config,
  resolve_kustomization_preservation,
  resolve_kustomization_state,
} from '../../src/generator/kustomization-resolution.js';

/**
 * Tests for kustomization resolution.
 * After removing the enabled field, these tests focus on preservation policy resolution.
 */
describe('Kustomization Resolution', () => {
  function create_kustomization(overrides: Partial<KustomizationType> = {}): KustomizationType {
    return {
      name: 'test-kustomization',
      path: './test',
      prune: true,
      wait: true,
      ...overrides,
    };
  }

  describe('resolve_kustomization_preservation', () => {
    it('should return template default when no cluster override', () => {
      const kustomization = create_kustomization({
        preservation: { mode: 'custom', keep_resources: ['Secret'] },
      });
      const result = resolve_kustomization_preservation(
        kustomization,
        undefined,
        'test-kustomization',
      );

      expect(result.mode).toBe('custom');
      expect(result.keep_resources).toEqual(['Secret']);
    });

    it('should return stateful mode by default when no preservation specified', () => {
      const kustomization = create_kustomization();
      const result = resolve_kustomization_preservation(
        kustomization,
        undefined,
        'test-kustomization',
      );

      expect(result.mode).toBe('stateful');
    });

    it('should use cluster override when specified', () => {
      const kustomization = create_kustomization({
        preservation: { mode: 'stateful' },
      });
      const template_config: TemplateConfigType = {
        name: 'test',
        kustomizations: {
          'test-kustomization': {
            preservation: { mode: 'none' },
          },
        },
      };

      const result = resolve_kustomization_preservation(
        kustomization,
        template_config,
        'test-kustomization',
      );

      expect(result.mode).toBe('none');
    });

    it('should merge keep_resources from cluster override', () => {
      const kustomization = create_kustomization({
        preservation: { mode: 'custom', keep_resources: ['PVC'] },
      });
      const template_config: TemplateConfigType = {
        name: 'test',
        kustomizations: {
          'test-kustomization': {
            preservation: { mode: 'custom', keep_resources: ['Secret', 'ConfigMap'] },
          },
        },
      };

      const result = resolve_kustomization_preservation(
        kustomization,
        template_config,
        'test-kustomization',
      );

      expect(result.mode).toBe('custom');
      expect(result.keep_resources).toEqual(['Secret', 'ConfigMap']);
    });
  });

  describe('resolve_kustomization_state', () => {
    it('should return preservation state', () => {
      const kustomization = create_kustomization({
        preservation: { mode: 'none' },
      });

      const result = resolve_kustomization_state(kustomization, undefined, 'test-kustomization');

      expect(result.preservation.mode).toBe('none');
    });

    it('should apply cluster override to preservation', () => {
      const kustomization = create_kustomization({
        preservation: { mode: 'stateful' },
      });
      const template_config: TemplateConfigType = {
        name: 'test',
        kustomizations: {
          'test-kustomization': {
            preservation: { mode: 'custom', keep_resources: ['Secret'] },
          },
        },
      };

      const result = resolve_kustomization_state(
        kustomization,
        template_config,
        'test-kustomization',
      );

      expect(result.preservation.mode).toBe('custom');
      expect(result.preservation.keep_resources).toEqual(['Secret']);
    });
  });

  describe('get_template_config', () => {
    it('should return undefined when template not listed', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.example.com',
          git: { owner: 'test', repository: 'test', branch: 'main' },
          templates: [{ name: 'other-template' }],
        },
      };

      const result = get_template_config(cluster, 'missing-template');

      expect(result).toBeUndefined();
    });

    it('should return config when template is listed', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.example.com',
          git: { owner: 'test', repository: 'test', branch: 'main' },
          templates: [{ name: 'my-template', values: { key: 'value' } }],
        },
      };

      const result = get_template_config(cluster, 'my-template');

      expect(result).toBeDefined();
      expect(result?.name).toBe('my-template');
      expect(result?.values?.key).toBe('value');
    });
  });
});
