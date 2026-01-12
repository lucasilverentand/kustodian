import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { create_generator } from '../packages/generator/dist/index.js';
import { load_project } from '../packages/loader/dist/index.js';

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures');
const VALID_PROJECT = path.join(FIXTURES_DIR, 'valid-project');

describe('E2E: Generator', () => {
  it('should generate flux kustomizations for a valid project', async () => {
    const project_result = await load_project(VALID_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const cluster = project.clusters[0];
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
      expect(kustomization.flux_kustomization).toBeDefined();
      expect(kustomization.flux_kustomization.apiVersion).toBe('kustomize.toolkit.fluxcd.io/v1');
      expect(kustomization.flux_kustomization.kind).toBe('Kustomization');
      expect(kustomization.flux_kustomization.metadata.namespace).toBe('flux-system');
    }
  });

  it('should generate OCIRepository when cluster uses OCI', async () => {
    const project_result = await load_project(VALID_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const cluster = project.clusters[0];
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
    const templates = project.templates.map((t) => t.template);

    const generator = create_generator();

    // Resolve templates to check values are applied
    const resolved = generator.resolve_templates(cluster.cluster, templates);

    expect(resolved.length).toBe(1);
    expect(resolved[0].enabled).toBe(true);
    expect(resolved[0].values.replicas).toBe('3'); // From cluster config
  });

  it('should skip disabled templates', async () => {
    const project_result = await load_project(VALID_PROJECT);
    expect(project_result.success).toBe(true);
    if (!project_result.success) return;

    const project = project_result.value;
    const templates = project.templates.map((t) => t.template);

    // Create a cluster config with disabled template
    const cluster_with_disabled = {
      ...project.clusters[0].cluster,
      spec: {
        ...project.clusters[0].cluster.spec,
        templates: [{ name: 'example', enabled: false }],
      },
    };

    const generator = create_generator();
    const result = await generator.generate(cluster_with_disabled, templates);

    expect(result.success).toBe(true);
    if (result.success) {
      // No kustomizations should be generated for disabled templates
      expect(result.value.kustomizations.length).toBe(0);
    }
  });
});
