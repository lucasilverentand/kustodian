import { describe, expect, it } from 'bun:test';
import { success } from '@kustodian/core';

import { type PluginGeneratorType, define_generator } from '../src/generators.js';

describe('Plugin Generators', () => {
  describe('define_generator', () => {
    it('should return the generator config', () => {
      const generator: PluginGeneratorType = {
        name: 'helm-generator',
        handles: [{ api_version: 'helm.kustodian.io/v1', kind: 'HelmChart' }],
        generate: async (_object, _context) => {
          return success([
            {
              api_version: 'helm.toolkit.fluxcd.io/v2',
              kind: 'HelmRelease',
              metadata: { name: 'test-release', namespace: 'default' },
              spec: {},
            },
          ]);
        },
      };

      const result = define_generator(generator);

      expect(result).toBe(generator);
      expect(result.name).toBe('helm-generator');
      expect(result.handles).toHaveLength(1);
    });
  });

  describe('generator invocation', () => {
    it('should generate resources from object', async () => {
      const generator: PluginGeneratorType = {
        name: 'configmap-generator',
        handles: [{ api_version: 'test/v1', kind: 'ConfigData' }],
        generate: async (object, context) => {
          const obj = object as {
            metadata: { name: string };
            spec: { data: Record<string, string> };
          };
          return success([
            {
              api_version: 'v1',
              kind: 'ConfigMap',
              metadata: {
                name: obj.metadata.name,
                namespace: (context.config['namespace'] as string) || 'default',
              },
              data: obj.spec.data,
            },
          ]);
        },
      };

      const context = {
        cluster: {
          apiVersion: 'kustodian.io/v1' as const,
          kind: 'Cluster' as const,
          metadata: { name: 'test' },
          spec: {
            domain: 'example.com',
            git: { owner: 'test', repository: 'test', branch: 'main', path: './' },
          },
        },
        config: { namespace: 'my-namespace' },
        all_objects: new Map(),
      };

      const object = {
        metadata: { name: 'my-config' },
        spec: { data: { key: 'value' } },
      };

      const result = await generator.generate(object, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.kind).toBe('ConfigMap');
        expect(result.value[0]?.metadata.name).toBe('my-config');
        expect(result.value[0]?.metadata.namespace).toBe('my-namespace');
      }
    });

    it('should handle multiple object types', () => {
      const generator: PluginGeneratorType = {
        name: 'multi-generator',
        handles: [
          { api_version: 'test/v1', kind: 'TypeA' },
          { api_version: 'test/v1', kind: 'TypeB' },
          { api_version: 'test/v2', kind: 'TypeA' },
        ],
        generate: async () => success([]),
      };

      expect(generator.handles).toHaveLength(3);
      expect(generator.handles.some((h) => h.kind === 'TypeA' && h.api_version === 'test/v1')).toBe(
        true,
      );
      expect(generator.handles.some((h) => h.kind === 'TypeB')).toBe(true);
    });
  });
});
