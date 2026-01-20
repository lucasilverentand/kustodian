import { describe, expect, it, vi } from 'bun:test';

import type { ClusterType, TemplateType } from '@kustodian/schema';
import type { GeneratorHookContextType, GeneratorHookPhaseType } from '../src/generator.js';
import { create_generator } from '../src/generator.js';

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
    enabled: true,
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
      const cluster = create_cluster([{ name: 'nginx', enabled: true, values: { replicas: '5' } }]);
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
      expect(result[0]?.enabled).toBe(true);
    });

    it('should mark disabled templates', () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster([{ name: 'nginx', enabled: false }]);
      const templates = [
        create_template('nginx', [
          { name: 'deployment', path: './deployment', prune: true, wait: true },
        ]),
      ];

      // Act
      const result = generator.resolve_templates(cluster, templates);

      // Assert
      expect(result[0]?.enabled).toBe(false);
    });

    it('should default to enabled when template not in cluster config', () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster([]);
      const templates = [
        create_template('nginx', [
          { name: 'deployment', path: './deployment', prune: true, wait: true },
        ]),
      ];

      // Act
      const result = generator.resolve_templates(cluster, templates);

      // Assert
      expect(result[0]?.enabled).toBe(true);
    });
  });

  describe('generate', () => {
    it('should generate flux kustomizations for templates', async () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster();
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

    it('should skip disabled templates', async () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster([{ name: 'nginx', enabled: false }]);
      const templates = [create_template('nginx', [{ name: 'deployment', path: './deployment' }])];

      // Act
      const result = await generator.generate(cluster, templates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.kustomizations).toHaveLength(0);
      }
    });

    it('should use custom flux namespace', async () => {
      // Arrange
      const generator = create_generator({ flux_namespace: 'custom-flux' });
      const cluster = create_cluster();
      const templates = [create_template('nginx', [{ name: 'deployment', path: './deployment' }])];

      // Act
      const result = await generator.generate(cluster, templates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.kustomizations[0]?.flux_kustomization.metadata.namespace).toBe(
          'custom-flux',
        );
      }
    });

    it('should use custom git repository name', async () => {
      // Arrange
      const generator = create_generator({ git_repository_name: 'my-repo' });
      const cluster = create_cluster();
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

    it('should use custom output directory', async () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster();
      const templates = [create_template('nginx', [{ name: 'deployment', path: './deployment' }])];

      // Act
      const result = await generator.generate(cluster, templates, { output_dir: '/custom/output' });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.output_dir).toBe('/custom/output');
      }
    });
  });

  describe('hooks', () => {
    it('should call before_generate hook', async () => {
      // Arrange
      const generator = create_generator();
      const hook_spy = vi.fn();
      generator.on_hook(hook_spy);

      const cluster = create_cluster();
      const templates: TemplateType[] = [];

      // Act
      await generator.generate(cluster, templates);

      // Assert
      expect(hook_spy).toHaveBeenCalledWith(
        'before_generate',
        expect.objectContaining({ cluster }),
      );
    });

    it('should call after_resolve_template hook for each template', async () => {
      // Arrange
      const generator = create_generator();
      const hook_calls: Array<{
        phase: GeneratorHookPhaseType;
        context: GeneratorHookContextType;
      }> = [];
      generator.on_hook((phase, context) => {
        hook_calls.push({ phase, context });
      });

      const cluster = create_cluster();
      const templates = [
        create_template('t1', [{ name: 'k1', path: './k1' }]),
        create_template('t2', [{ name: 'k2', path: './k2' }]),
      ];

      // Act
      await generator.generate(cluster, templates);

      // Assert
      const after_resolve_calls = hook_calls.filter((c) => c.phase === 'after_resolve_template');
      expect(after_resolve_calls).toHaveLength(2);
    });

    it('should call after_generate_kustomization hook for each kustomization', async () => {
      // Arrange
      const generator = create_generator();
      const hook_calls: Array<{
        phase: GeneratorHookPhaseType;
        context: GeneratorHookContextType;
      }> = [];
      generator.on_hook((phase, context) => {
        hook_calls.push({ phase, context });
      });

      const cluster = create_cluster();
      const templates = [
        create_template('app', [
          { name: 'k1', path: './k1' },
          { name: 'k2', path: './k2' },
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

    it('should call after_generate hook with result', async () => {
      // Arrange
      const generator = create_generator();
      const hook_spy = vi.fn();
      generator.on_hook(hook_spy);

      const cluster = create_cluster();
      const templates = [create_template('app', [{ name: 'k', path: './k' }])];

      // Act
      await generator.generate(cluster, templates);

      // Assert
      expect(hook_spy).toHaveBeenCalledWith(
        'after_generate',
        expect.objectContaining({
          cluster,
          result: expect.objectContaining({
            cluster: 'test-cluster',
            kustomizations: expect.any(Array),
          }),
        }),
      );
    });

    it('should support async hooks', async () => {
      // Arrange
      const generator = create_generator();
      let hook_completed = false;

      generator.on_hook(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        hook_completed = true;
      });

      const cluster = create_cluster();
      const templates: TemplateType[] = [];

      // Act
      await generator.generate(cluster, templates);

      // Assert
      expect(hook_completed).toBe(true);
    });
  });

  describe('generate_plugin_resources', () => {
    it('should return empty array when no registry provided', () => {
      // Arrange
      const generator = create_generator();
      const cluster = create_cluster();
      const templates = generator.resolve_templates(cluster, []);

      // Act
      const result = generator.generate_plugin_resources(cluster, templates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
