import { describe, expect, it } from 'bun:test';

import type { ClusterType, KustomizationType, TemplateConfigType } from '@kustodian/schema';

import {
  get_template_config,
  resolve_kustomization_enabled,
  resolve_kustomization_preservation,
  resolve_kustomization_state,
} from '../src/kustomization-resolution.js';

describe('Kustomization Resolution', () => {
  describe('resolve_kustomization_enabled', () => {
    it('should return template default when no cluster override', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: false,
      };

      const result = resolve_kustomization_enabled(kustomization, undefined, 'test');

      expect(result).toBe(false);
    });

    it('should default to true when enabled field is omitted', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: true,
      };

      const result = resolve_kustomization_enabled(kustomization, undefined, 'test');

      expect(result).toBe(true);
    });

    it('should use cluster boolean override', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: false,
      };

      const template_config: TemplateConfigType = {
        name: 'template',
        enabled: true,
        kustomizations: {
          test: true, // Simple boolean override
        },
      };

      const result = resolve_kustomization_enabled(kustomization, template_config, 'test');

      expect(result).toBe(true);
    });

    it('should use cluster object override', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: false,
      };

      const template_config: TemplateConfigType = {
        name: 'template',
        enabled: true,
        kustomizations: {
          test: {
            enabled: true,
            preservation: {
              mode: 'stateful',
            },
          },
        },
      };

      const result = resolve_kustomization_enabled(kustomization, template_config, 'test');

      expect(result).toBe(true);
    });

    it('should return template default when kustomization not in override map', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: false,
      };

      const template_config: TemplateConfigType = {
        name: 'template',
        enabled: true,
        kustomizations: {
          other: true,
        },
      };

      const result = resolve_kustomization_enabled(kustomization, template_config, 'test');

      expect(result).toBe(false);
    });
  });

  describe('resolve_kustomization_preservation', () => {
    it('should return template default preservation', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: true,
        preservation: {
          mode: 'custom',
          keep_resources: ['PersistentVolumeClaim'],
        },
      };

      const result = resolve_kustomization_preservation(kustomization, undefined, 'test');

      expect(result.mode).toBe('custom');
      expect(result.keep_resources).toEqual(['PersistentVolumeClaim']);
    });

    it('should default to stateful when preservation field is omitted', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: true,
      };

      const result = resolve_kustomization_preservation(kustomization, undefined, 'test');

      expect(result.mode).toBe('stateful');
    });

    it('should merge cluster override with template default', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: true,
        preservation: {
          mode: 'custom',
          keep_resources: ['PersistentVolumeClaim', 'Secret'],
        },
      };

      const template_config: TemplateConfigType = {
        name: 'template',
        enabled: true,
        kustomizations: {
          test: {
            enabled: true,
            preservation: {
              mode: 'stateful', // Override mode
            },
          },
        },
      };

      const result = resolve_kustomization_preservation(kustomization, template_config, 'test');

      expect(result.mode).toBe('stateful');
      // keep_resources from template is preserved
      expect(result.keep_resources).toEqual(['PersistentVolumeClaim', 'Secret']);
    });

    it('should use template default when cluster has no preservation override', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: true,
        preservation: {
          mode: 'none',
        },
      };

      const template_config: TemplateConfigType = {
        name: 'template',
        enabled: true,
        kustomizations: {
          test: true, // Simple boolean, no preservation override
        },
      };

      const result = resolve_kustomization_preservation(kustomization, template_config, 'test');

      expect(result.mode).toBe('none');
    });
  });

  describe('resolve_kustomization_state', () => {
    it('should resolve both enabled and preservation', () => {
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        enabled: false,
        preservation: {
          mode: 'stateful',
        },
      };

      const template_config: TemplateConfigType = {
        name: 'template',
        enabled: true,
        kustomizations: {
          test: {
            enabled: true,
            preservation: {
              mode: 'custom',
            },
          },
        },
      };

      const result = resolve_kustomization_state(kustomization, template_config, 'test');

      expect(result.enabled).toBe(true);
      expect(result.preservation.mode).toBe('custom');
    });
  });

  describe('get_template_config', () => {
    it('should return template config when found', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.example.com',
          git: {
            owner: 'test',
            repository: 'test',
            branch: 'main',
          },
          templates: [
            { name: 'database', enabled: true },
            { name: 'monitoring', enabled: false },
          ],
        },
      };

      const result = get_template_config(cluster, 'database');

      expect(result).toBeDefined();
      expect(result?.name).toBe('database');
      expect(result?.enabled).toBe(true);
    });

    it('should return undefined when template not found', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.example.com',
          git: {
            owner: 'test',
            repository: 'test',
            branch: 'main',
          },
          templates: [{ name: 'database', enabled: true }],
        },
      };

      const result = get_template_config(cluster, 'nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined when cluster has no templates', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.example.com',
          git: {
            owner: 'test',
            repository: 'test',
            branch: 'main',
          },
        },
      };

      const result = get_template_config(cluster, 'database');

      expect(result).toBeUndefined();
    });
  });
});
