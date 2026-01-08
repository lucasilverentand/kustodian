import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  create_object_type_registry,
  define_object_type,
  type PluginObjectTypeType,
} from '../src/object-types.js';

describe('Object Type Registry', () => {
  const helm_chart_schema = z.object({
    apiVersion: z.literal('helm.kustodian.io/v1'),
    kind: z.literal('HelmChart'),
    metadata: z.object({
      name: z.string(),
    }),
    spec: z.object({
      chart: z.string(),
      repo: z.string(),
      version: z.string().optional(),
      namespace: z.string(),
      values: z.record(z.unknown()).optional(),
    }),
  });

  type HelmChartType = z.infer<typeof helm_chart_schema>;

  const helm_chart_type: PluginObjectTypeType<HelmChartType> = {
    api_version: 'helm.kustodian.io/v1',
    kind: 'HelmChart',
    schema: helm_chart_schema,
    locations: ['cluster.spec', 'standalone'],
  };

  describe('register', () => {
    it('should register an object type', () => {
      const registry = create_object_type_registry();

      registry.register(helm_chart_type);

      expect(registry.has('helm.kustodian.io/v1', 'HelmChart')).toBe(true);
    });
  });

  describe('get', () => {
    it('should get a registered object type', () => {
      const registry = create_object_type_registry();
      registry.register(helm_chart_type);

      const result = registry.get('helm.kustodian.io/v1', 'HelmChart');

      expect(result).toBeDefined();
      expect(result?.kind).toBe('HelmChart');
    });

    it('should return undefined for unknown object type', () => {
      const registry = create_object_type_registry();

      const result = registry.get('unknown/v1', 'Unknown');

      expect(result).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('should validate a valid object', () => {
      const registry = create_object_type_registry();
      registry.register(helm_chart_type);

      const valid_object = {
        apiVersion: 'helm.kustodian.io/v1',
        kind: 'HelmChart',
        metadata: { name: 'nginx' },
        spec: {
          chart: 'nginx',
          repo: 'https://charts.bitnami.com/bitnami',
          version: '15.0.0',
          namespace: 'default',
        },
      };

      const result = registry.validate(valid_object);

      expect('errors' in result).toBe(false);
      if (!('errors' in result)) {
        expect(result.api_version).toBe('helm.kustodian.io/v1');
        expect(result.kind).toBe('HelmChart');
        expect(result.data).toEqual(valid_object);
      }
    });

    it('should return errors for invalid object', () => {
      const registry = create_object_type_registry();
      registry.register(helm_chart_type);

      const invalid_object = {
        apiVersion: 'helm.kustodian.io/v1',
        kind: 'HelmChart',
        metadata: { name: 'nginx' },
        spec: {
          // Missing required fields: chart, repo, namespace
        },
      };

      const result = registry.validate(invalid_object);

      expect('errors' in result).toBe(true);
      if ('errors' in result) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should return error for unknown object type', () => {
      const registry = create_object_type_registry();

      const unknown_object = {
        apiVersion: 'unknown/v1',
        kind: 'Unknown',
        metadata: { name: 'test' },
      };

      const result = registry.validate(unknown_object);

      expect('errors' in result).toBe(true);
      if ('errors' in result) {
        expect(result.errors).toContain('Unknown object type: unknown/v1/Unknown');
      }
    });

    it('should return error for non-object', () => {
      const registry = create_object_type_registry();

      const result = registry.validate('not an object');

      expect('errors' in result).toBe(true);
    });

    it('should return error for object without apiVersion/kind', () => {
      const registry = create_object_type_registry();

      const result = registry.validate({ metadata: { name: 'test' } });

      expect('errors' in result).toBe(true);
      if ('errors' in result) {
        expect(result.errors).toContain('Object must have apiVersion and kind fields');
      }
    });
  });

  describe('list', () => {
    it('should list all registered object types', () => {
      const registry = create_object_type_registry();

      const cert_schema = z.object({
        apiVersion: z.literal('cert.kustodian.io/v1'),
        kind: z.literal('Certificate'),
      });

      registry.register(helm_chart_type);
      registry.register({
        api_version: 'cert.kustodian.io/v1',
        kind: 'Certificate',
        schema: cert_schema,
        locations: ['standalone'],
      });

      const types = registry.list();

      expect(types).toHaveLength(2);
      expect(types.map((t) => t.kind)).toContain('HelmChart');
      expect(types.map((t) => t.kind)).toContain('Certificate');
    });
  });

  describe('get_by_location', () => {
    it('should filter by location', () => {
      const registry = create_object_type_registry();

      const inline_only_schema = z.object({
        apiVersion: z.literal('test/v1'),
        kind: z.literal('InlineOnly'),
      });

      registry.register(helm_chart_type);
      registry.register({
        api_version: 'test/v1',
        kind: 'InlineOnly',
        schema: inline_only_schema,
        locations: ['inline'],
      });

      const cluster_types = registry.get_by_location('cluster.spec');
      const inline_types = registry.get_by_location('inline');

      expect(cluster_types).toHaveLength(1);
      expect(cluster_types[0]?.kind).toBe('HelmChart');

      expect(inline_types).toHaveLength(1);
      expect(inline_types[0]?.kind).toBe('InlineOnly');
    });
  });

  describe('define_object_type', () => {
    it('should return the same config', () => {
      const config = {
        api_version: 'test/v1',
        kind: 'Test',
        schema: z.object({}),
        locations: ['standalone'] as ('standalone')[],
      };

      const result = define_object_type(config);

      expect(result).toBe(config);
    });
  });
});
