import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { create_generator } from '../src/generator/index.js';
import { load_project } from '../src/loader/index.js';

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures');
const VALID_PROJECT = path.join(FIXTURES_DIR, 'valid-project');
const MULTI_INSTANCE_PROJECT = path.join(FIXTURES_DIR, 'multi-instance-project');

describe('E2E: Generator', () => {
  it('should generate flux kustomizations for a valid project', async () => {
    const project_result = await load_project(VALID_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const cluster = project.clusters[0];
    expect(cluster).toBeDefined();
    if (!cluster) return;

    const templates = project.templates.map((t) => t.template);

    const generator = create_generator({
      flux_namespace: 'flux-system',
    });

    const result = await generator.generate(cluster.cluster, templates, {
      output_dir: '/tmp/e2e-output',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const generation = result.value;

      expect(generation.cluster).toBe('local');
      expect(generation.kustomizations.length).toBeGreaterThan(0);

      // Verify kustomization structure
      const kustomization = generation.kustomizations[0];
      expect(kustomization).toBeDefined();
      if (kustomization) {
        expect(kustomization.flux_kustomization).toBeDefined();
        expect(kustomization.flux_kustomization.apiVersion).toBe('kustomize.toolkit.fluxcd.io/v1');
        expect(kustomization.flux_kustomization.kind).toBe('Kustomization');
        expect(kustomization.flux_kustomization.metadata.namespace).toBe('flux-system');
      }
    }
  });

  it('should generate OCIRepository when cluster uses OCI', async () => {
    const project_result = await load_project(VALID_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const cluster = project.clusters[0];
    expect(cluster).toBeDefined();
    if (!cluster) return;

    const templates = project.templates.map((t) => t.template);

    const generator = create_generator({
      flux_namespace: 'flux-system',
    });

    const result = await generator.generate(cluster.cluster, templates);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.oci_repository).toBeDefined();
      expect(result.value.oci_repository?.apiVersion).toBe('source.toolkit.fluxcd.io/v1');
      expect(result.value.oci_repository?.kind).toBe('OCIRepository');
      expect(result.value.oci_repository?.spec.url).toContain('ghcr.io');
    }
  });

  it('should apply template values from cluster configuration', async () => {
    const project_result = await load_project(VALID_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const cluster = project.clusters[0];
    expect(cluster).toBeDefined();
    if (!cluster) return;

    const templates = project.templates.map((t) => t.template);

    const generator = create_generator();

    // Resolve templates to check values are applied
    const resolved = generator.resolve_templates(cluster.cluster, templates);

    expect(resolved.length).toBe(1);
    const first_resolved = resolved[0];
    expect(first_resolved).toBeDefined();
    if (first_resolved) {
      expect(first_resolved.enabled).toBe(true); // Listed in cluster = enabled
      expect(first_resolved.instance_name).toBe('example'); // Instance name matches config entry name
      expect(first_resolved.values['replicas']).toBe('3'); // From cluster config
    }
  });

  it('should skip templates not listed in cluster.yaml', async () => {
    const project_result = await load_project(VALID_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const templates = project.templates.map((t) => t.template);

    const first_cluster = project.clusters[0];
    expect(first_cluster).toBeDefined();
    if (!first_cluster) return;

    // Create a cluster config with no templates listed (opt-in model)
    const cluster_with_no_templates = {
      ...first_cluster.cluster,
      spec: {
        ...first_cluster.cluster.spec,
        templates: [],
      },
    }; // Empty = no templates enabled

    const generator = create_generator();
    const result = await generator.generate(cluster_with_no_templates, templates);

    expect(result.success).toBe(true);
    if (result.success) {
      // No kustomizations should be generated for templates not listed
      expect(result.value.kustomizations.length).toBe(0);
    }
  });

  it('should generate distinct Flux resources for multi-instance templates', async () => {
    const project_result = await load_project(MULTI_INSTANCE_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const cluster = project.clusters[0];
    expect(cluster).toBeDefined();
    if (!cluster) return;

    const templates = project.templates.map((t) => t.template);
    const generator = create_generator({ flux_namespace: 'flux-system' });

    // Resolve templates — should produce two instances from the same template
    const resolved = generator.resolve_templates(cluster.cluster, templates);
    expect(resolved.length).toBe(2);

    const instance_names = resolved.map((r) => r.instance_name);
    expect(instance_names).toContain('my-app');
    expect(instance_names).toContain('my-app-4k');

    // Both instances should reference the same template
    for (const r of resolved) {
      expect(r.template.metadata.name).toBe('my-app');
    }

    // Values should differ per instance
    const standard = resolved.find((r) => r.instance_name === 'my-app');
    const variant = resolved.find((r) => r.instance_name === 'my-app-4k');
    expect(standard?.values['app_name']).toBe('my-app');
    expect(variant?.values['app_name']).toBe('my-app-4k');
    expect(variant?.values['category']).toBe('4k');

    // Generate and verify distinct Flux resource names
    const result = await generator.generate(cluster.cluster, templates, {
      output_dir: '/tmp/e2e-multi-instance',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const gen = result.value;
    expect(gen.kustomizations.length).toBe(2);

    const kustomization_names = gen.kustomizations.map((k) => k.name);
    expect(kustomization_names).toContain('my-app-app');
    expect(kustomization_names).toContain('my-app-4k-app');

    // Both should use the same template path
    for (const k of gen.kustomizations) {
      expect(k.flux_kustomization.spec.path).toContain('my-app');
    }

    // Substitution values should differ
    const standard_k = gen.kustomizations.find((k) => k.name === 'my-app-app');
    const variant_k = gen.kustomizations.find((k) => k.name === 'my-app-4k-app');
    expect(standard_k?.flux_kustomization.spec.postBuild?.substitute?.['app_name']).toBe('my-app');
    expect(variant_k?.flux_kustomization.spec.postBuild?.substitute?.['app_name']).toBe(
      'my-app-4k',
    );
  });

  it('should fall back to name when template field is omitted', async () => {
    const project_result = await load_project(MULTI_INSTANCE_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const cluster = project.clusters[0];
    expect(cluster).toBeDefined();
    if (!cluster) return;

    const templates = project.templates.map((t) => t.template);
    const generator = create_generator();

    const resolved = generator.resolve_templates(cluster.cluster, templates);

    // The first entry has name=my-app without template field — should match template "my-app"
    const standard = resolved.find((r) => r.instance_name === 'my-app');
    expect(standard).toBeDefined();
    expect(standard?.template.metadata.name).toBe('my-app');
  });
});
