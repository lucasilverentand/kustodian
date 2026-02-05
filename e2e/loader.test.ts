import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { find_project_root, load_project } from '../src/loader/index.js';

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures');
const VALID_PROJECT = path.join(FIXTURES_DIR, 'valid-project');
const INVALID_PROJECT = path.join(FIXTURES_DIR, 'invalid-project');

describe('E2E: Project Loader', () => {
  describe('find_project_root', () => {
    it('should find project root from project directory', async () => {
      const result = await find_project_root(VALID_PROJECT);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(VALID_PROJECT);
      }
    });

    it('should find project root from nested directory', async () => {
      const nested_path = path.join(VALID_PROJECT, 'clusters', 'local');
      const result = await find_project_root(nested_path);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(VALID_PROJECT);
      }
    });

    it('should fail when no project root exists', async () => {
      const result = await find_project_root('/tmp');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_NOT_FOUND');
      }
    });
  });

  describe('load_project', () => {
    it('should load a valid project with templates and clusters', async () => {
      const result = await load_project(VALID_PROJECT);

      expect(result.success).toBe(true);
      if (result.success) {
        const project = result.value;

        expect(project.root).toBe(VALID_PROJECT);
        expect(project.templates.length).toBe(1);
        expect(project.clusters.length).toBe(1);

        // Verify template
        const template = project.templates[0];
        expect(template).toBeDefined();
        if (template) {
          expect(template.template.metadata.name).toBe('example');
          expect(template.template.spec.kustomizations.length).toBe(1);
        }

        // Verify cluster
        const cluster = project.clusters[0];
        expect(cluster).toBeDefined();
        if (cluster) {
          expect(cluster.cluster.metadata.name).toBe('local');
          expect(cluster.cluster.spec.oci).toBeDefined();
        }
      }
    });

    it('should load cluster nodes', async () => {
      const result = await load_project(VALID_PROJECT);

      expect(result.success).toBe(true);
      if (result.success) {
        const cluster = result.value.clusters[0];
        expect(cluster).toBeDefined();
        if (cluster) {
          expect(cluster.nodes.length).toBe(1);
          // Node schema is flattened after loading
          const first_node = cluster.nodes[0];
          expect(first_node).toBeDefined();
          if (first_node) {
            expect(first_node.name).toBe('controller-1');
            expect(first_node.role).toBe('controller');
          }
        }
      }
    });

    it('should fail on invalid cluster configuration', async () => {
      const result = await load_project(INVALID_PROJECT);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Failed to load clusters');
      }
    });
  });
});
