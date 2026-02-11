import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { create_generator } from '../src/generator/index.js';
import { load_project } from '../src/loader/index.js';

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures');
const MULTI_CLUSTER_PROJECT = path.join(FIXTURES_DIR, 'multi-cluster-project');

describe('E2E: Multi-Cluster', () => {
  describe('Project Loading', () => {
    it('should load a multi-cluster project with staging and production', async () => {
      const result = await load_project(MULTI_CLUSTER_PROJECT);

      expect(result.success).toBe(true);
      if (result.success) {
        const project = result.value;

        // Verify both clusters loaded
        expect(project.clusters.length).toBe(2);

        const staging = project.clusters.find((c) => c.cluster.metadata.name === 'staging');
        const production = project.clusters.find((c) => c.cluster.metadata.name === 'production');

        expect(staging).toBeDefined();
        expect(production).toBeDefined();

        // Verify cluster-specific configuration
        if (staging) {
          expect(staging.cluster.metadata.code).toBe('stg');
        }

        if (production) {
          expect(production.cluster.metadata.code).toBe('prod');
        }
      }
    });

    it('should load multiple templates', async () => {
      const result = await load_project(MULTI_CLUSTER_PROJECT);

      expect(result.success).toBe(true);
      if (result.success) {
        const project = result.value;

        // Verify both templates loaded
        expect(project.templates.length).toBe(2);

        const web_app = project.templates.find((t) => t.template.metadata.name === 'web-app');
        const database = project.templates.find((t) => t.template.metadata.name === 'database');

        expect(web_app).toBeDefined();
        expect(database).toBeDefined();
      }
    });
  });

  describe('Cross-Cluster Generation', () => {
    it('should generate different values for staging vs production', async () => {
      const project_result = await load_project(MULTI_CLUSTER_PROJECT);
      expect(project_result.success).toBe(true);
      if (!project_result.success) return;

      const project = project_result.value;
      const templates = project.templates.map((t) => t.template);

      const staging = project.clusters.find((c) => c.cluster.metadata.name === 'staging');
      const production = project.clusters.find((c) => c.cluster.metadata.name === 'production');

      expect(staging).toBeDefined();
      expect(production).toBeDefined();
      if (!staging || !production) return;

      const generator = create_generator({ flux_namespace: 'flux-system' });

      // Generate for staging
      const staging_result = await generator.generate(staging.cluster, templates);
      expect(staging_result.success).toBe(true);

      // Generate for production
      const prod_result = await generator.generate(production.cluster, templates);
      expect(prod_result.success).toBe(true);

      if (staging_result.success && prod_result.success) {
        // Both should have the same number of kustomizations
        expect(staging_result.value.kustomizations.length).toBe(
          prod_result.value.kustomizations.length,
        );

        // But with different cluster names
        expect(staging_result.value.cluster).toBe('staging');
        expect(prod_result.value.cluster).toBe('production');
      }
    });

    it('should resolve template values per cluster', async () => {
      const project_result = await load_project(MULTI_CLUSTER_PROJECT);
      expect(project_result.success).toBe(true);
      if (!project_result.success) return;

      const project = project_result.value;
      const templates = project.templates.map((t) => t.template);

      const staging = project.clusters.find((c) => c.cluster.metadata.name === 'staging');
      const production = project.clusters.find((c) => c.cluster.metadata.name === 'production');

      expect(staging).toBeDefined();
      expect(production).toBeDefined();
      if (!staging || !production) return;

      const generator = create_generator({ flux_namespace: 'flux-system' });

      // Resolve templates for each cluster
      const staging_resolved = generator.resolve_templates(staging.cluster, templates);
      const prod_resolved = generator.resolve_templates(production.cluster, templates);

      // Find web-app template in both
      const staging_webapp = staging_resolved.find((r) => r.template.metadata.name === 'web-app');
      const prod_webapp = prod_resolved.find((r) => r.template.metadata.name === 'web-app');

      expect(staging_webapp).toBeDefined();
      expect(prod_webapp).toBeDefined();

      if (staging_webapp && prod_webapp) {
        // Staging should have 2 replicas, production should have 5
        expect(staging_webapp.values['replicas']).toBe('2');
        expect(prod_webapp.values['replicas']).toBe('5');

        // Environment values should differ
        expect(staging_webapp.values['environment']).toBe('staging');
        expect(prod_webapp.values['environment']).toBe('production');
      }

      // Find database template in both
      const staging_db = staging_resolved.find((r) => r.template.metadata.name === 'database');
      const prod_db = prod_resolved.find((r) => r.template.metadata.name === 'database');

      expect(staging_db).toBeDefined();
      expect(prod_db).toBeDefined();

      if (staging_db && prod_db) {
        // Storage size should differ
        expect(staging_db.values['storage_size']).toBe('10Gi');
        expect(prod_db.values['storage_size']).toBe('100Gi');
      }
    });
  });

  describe('Template Dependencies', () => {
    it('should resolve cross-template dependencies', async () => {
      const project_result = await load_project(MULTI_CLUSTER_PROJECT);
      expect(project_result.success).toBe(true);
      if (!project_result.success) return;

      const project = project_result.value;

      // web-app template has depends_on: database/app
      const web_app = project.templates.find((t) => t.template.metadata.name === 'web-app');
      expect(web_app).toBeDefined();

      if (web_app) {
        const kustomization = web_app.template.spec.kustomizations[0];
        expect(kustomization).toBeDefined();
        if (kustomization) {
          expect(kustomization.depends_on).toContain('database/app');
        }
      }
    });

    it('should generate correct dependsOn in Flux Kustomization', async () => {
      const project_result = await load_project(MULTI_CLUSTER_PROJECT);
      expect(project_result.success).toBe(true);
      if (!project_result.success) return;

      const project = project_result.value;
      const templates = project.templates.map((t) => t.template);

      const staging = project.clusters.find((c) => c.cluster.metadata.name === 'staging');
      expect(staging).toBeDefined();
      if (!staging) return;

      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(staging.cluster, templates);

      expect(result.success).toBe(true);
      if (result.success) {
        // Find web-app kustomization
        const web_app_kust = result.value.kustomizations.find((k) => k.name === 'web-app-app');
        expect(web_app_kust).toBeDefined();

        if (web_app_kust) {
          // Should have dependsOn referencing database-app
          const depends_on = web_app_kust.flux_kustomization.spec.dependsOn;
          expect(depends_on).toBeDefined();
          expect(depends_on).toContainEqual({ name: 'database-app' });
        }
      }
    });
  });

  describe('OCI Configuration', () => {
    it('should use different OCI tag strategies per cluster', async () => {
      const project_result = await load_project(MULTI_CLUSTER_PROJECT);
      expect(project_result.success).toBe(true);
      if (!project_result.success) return;

      const project = project_result.value;

      const staging = project.clusters.find((c) => c.cluster.metadata.name === 'staging');
      const production = project.clusters.find((c) => c.cluster.metadata.name === 'production');

      expect(staging).toBeDefined();
      expect(production).toBeDefined();

      if (staging && production) {
        // Staging uses git-sha strategy
        expect(staging.cluster.spec.oci?.tag_strategy).toBe('git-sha');

        // Production uses version strategy
        expect(production.cluster.spec.oci?.tag_strategy).toBe('version');
      }
    });

    it('should generate OCIRepository for each cluster', async () => {
      const project_result = await load_project(MULTI_CLUSTER_PROJECT);
      expect(project_result.success).toBe(true);
      if (!project_result.success) return;

      const project = project_result.value;
      const templates = project.templates.map((t) => t.template);

      const staging = project.clusters.find((c) => c.cluster.metadata.name === 'staging');
      expect(staging).toBeDefined();
      if (!staging) return;

      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(staging.cluster, templates);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have an OCIRepository
        expect(result.value.oci_repository).toBeDefined();
        expect(result.value.oci_repository?.kind).toBe('OCIRepository');
        expect(result.value.oci_repository?.spec.url).toContain('ghcr.io');
      }
    });
  });
});
