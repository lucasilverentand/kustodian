import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { create_generator } from '../packages/generator/src/index.js';
import { load_project } from '../packages/loader/src/index.js';

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures');
const VALID_PROJECT = path.join(FIXTURES_DIR, 'valid-project');

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
      flux_namespace: 'flux-system'});

    const result = await generator.generate(cluster.cluster, templates, {
      output_dir: '/tmp/e2e-output'});

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
      flux_namespace: 'flux-system'});

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
        templates: []}}; // Empty = no templates enabled

    const generator = create_generator();
    const result = await generator.generate(cluster_with_no_templates, templates);

    expect(result.success).toBe(true);
    if (result.success) {
      // No kustomizations should be generated for templates not listed
      expect(result.value.kustomizations.length).toBe(0);
    }
  });
});
