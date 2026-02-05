import { describe, expect, it } from 'bun:test';

import type {
  GeneratorHookContextType,
  GeneratorHookPhaseType,
} from '../../src/generator/generator.js';
import { create_generator } from '../../src/generator/generator.js';
import type { ClusterType, TemplateType } from '../../src/schema/index.js';

/**
 * Generator tests for the opt-in template model.
 * Templates are only deployed if explicitly listed in cluster.yaml.
 */
describe('Generator', () => {
  const create_cluster = (templates?: ClusterType['spec']['templates']): ClusterType => ({
    apiVersion: 'kustodian.io/v1',
    kind: 'Cluster',
    metadata: { name: 'test-cluster' },
    spec: {
      domain: 'example.com',
      git: {
        owner: 'test-org',
        repository: 'test-repo',
        branch: 'main',
      },
      templates,
    },
  });

  const create_kustomization = (
    overrides: { name: string; path: string } & Partial<TemplateType['spec']['kustomizations'][0]>,
  ): TemplateType['spec']['kustomizations'][0] => ({
    prune: true,
    wait: true,
    ...overrides,
  });

  const create_template = (
    name: string,
    kustomizations: Array<
      { name: string; path: string } & Partial<TemplateType['spec']['kustomizations'][0]>
    >,
  ): TemplateType => ({
    apiVersion: 'kustodian.io/v1',
    kind: 'Template',
    metadata: { name },
    spec: { kustomizations: kustomizations.map(create_kustomization) },
  });

  describe('create_generator', () => {
    it('should create generator with default options', () => {
      // Act
      const generator = create_generator();

      // Assert
      expect(generator).toBeDefined();
      expect(generator.on_hook).toBeDefined();
      expect(generator.resolve_templates).toBeDefined();
      expect(generator.generate).toBeDefined();
      expect(generator.generate_plugin_resources).toBeDefined();
      expect(generator.write).toBeDefined();
    });
  });

  describe('resolve_templates', () => {
    it('should resolve templates with cluster values', () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster([{ name: 'nginx', values: { replicas: '5' } }]);
      const templates = [
        create_template('nginx', [
          { name: 'deployment', path: './deployment', prune: true, wait: true },
        ]),
      ];

      // Act
      const result = generator.resolve_templates(cluster, templates);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.values).toEqual({ replicas: '5' });
      expect(result[0]?.enabled).toBe(true); // Listed in cluster.yaml = enabled
    });

    it('should mark templates not listed as disabled', () => {
      // Arrange
      const generator = create_generator();
      // Empty templates array in cluster.yaml means no templates are enabled
      const cluster = create_cluster([]);
      const templates = [
        create_template('nginx', [
          { name: 'deployment', path: './deployment', prune: true, wait: true },
        ]),
      ];

      // Act
      const result = generator.resolve_templates(cluster, templates);

      // Assert
      expect(result[0]?.enabled).toBe(false); // Not listed = disabled
    });

    it('should enable templates when listed in cluster config', () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster([{ name: 'nginx' }]); // Listed without values
      const templates = [
        create_template('nginx', [
          { name: 'deployment', path: './deployment', prune: true, wait: true },
        ]),
      ];

      // Act
      const result = generator.resolve_templates(cluster, templates);

      // Assert
      expect(result[0]?.enabled).toBe(true); // Listed = enabled
    });
  });

  describe('generate', () => {
    it('should generate flux kustomizations for listed templates', async () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster([{ name: 'nginx' }]);
      const templates = [
        create_template('nginx', [
          { name: 'deployment', path: './deployment' },
          { name: 'service', path: './service' },
        ]),
      ];

      // Act
      const result = await generator.generate(cluster, templates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.cluster).toBe('test-cluster');
        expect(result.value.kustomizations).toHaveLength(2);
        expect(result.value.kustomizations[0]?.name).toBe('nginx-deployment');
        expect(result.value.kustomizations[1]?.name).toBe('nginx-service');
      }
    });

    it('should skip templates not listed in cluster.yaml', async () => {
      // Arrange
      const generator = create_generator();
      // No templates listed in cluster.yaml
      const cluster = create_cluster([]);
      const templates = [create_template('nginx', [{ name: 'deployment', path: './deployment' }])];

      // Act
      const result = await generator.generate(cluster, templates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.kustomizations).toHaveLength(0);
      }
    });

    it('should use default git repository name', async () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster([{ name: 'nginx' }]);
      const templates = [create_template('nginx', [{ name: 'deployment', path: './deployment' }])];

      // Act
      const result = await generator.generate(cluster, templates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        // Default is 'flux-system' (matching the flux namespace)
        expect(result.value.kustomizations[0]?.flux_kustomization.spec.sourceRef.name).toBe(
          'flux-system',
        );
      }
    });

    it('should use custom git repository name', async () => {
      // Arrange
      const generator = create_generator({ git_repository_name: 'my-repo' });
      const cluster = create_cluster([{ name: 'nginx' }]);
      const templates = [create_template('nginx', [{ name: 'deployment', path: './deployment' }])];

      // Act
      const result = await generator.generate(cluster, templates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.kustomizations[0]?.flux_kustomization.spec.sourceRef.name).toBe(
          'my-repo',
        );
      }
    });
  });

  describe('hooks', () => {
    it('should call before_generate hook', async () => {
      // Arrange
      const generator = create_generator();
      const hook_calls: Array<{
        phase: GeneratorHookPhaseType;
        context: GeneratorHookContextType;
      }> = [];
      generator.on_hook(async (phase, context) => {
        hook_calls.push({ phase, context });
      });
      const cluster = create_cluster([{ name: 'nginx' }]);
      const templates = [create_template('nginx', [{ name: 'deployment', path: './deployment' }])];

      // Act
      await generator.generate(cluster, templates);

      // Assert
      const before_generate_calls = hook_calls.filter((c) => c.phase === 'before_generate');
      expect(before_generate_calls).toHaveLength(1);
      expect(before_generate_calls[0]?.context.cluster).toBe(cluster);
    });

    it('should call after_generate_kustomization hook for each kustomization', async () => {
      // Arrange
      const generator = create_generator();
      const hook_calls: Array<{
        phase: GeneratorHookPhaseType;
        context: GeneratorHookContextType;
      }> = [];
      generator.on_hook(async (phase, context) => {
        hook_calls.push({ phase, context });
      });
      const cluster = create_cluster([{ name: 'nginx' }]);
      const templates = [
        create_template('nginx', [
          { name: 'deployment', path: './deployment' },
          { name: 'service', path: './service' },
        ]),
      ];

      // Act
      await generator.generate(cluster, templates);

      // Assert
      const after_kustomization_calls = hook_calls.filter(
        (c) => c.phase === 'after_generate_kustomization',
      );
      expect(after_kustomization_calls).toHaveLength(2);
    });
  });
});
