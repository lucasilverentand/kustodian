import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  StandardDirs,
  StandardFiles,
  find_project_root,
  load_all_clusters,
  load_all_templates,
  load_cluster,
  load_project,
  load_template,
} from '../../src/loader/project.js';

describe('Project Loader', () => {
  let temp_dir: string;

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kustodian-project-test-'));
  });

  afterEach(async () => {
    await fs.rm(temp_dir, { recursive: true, force: true });
  });

  describe('StandardFiles', () => {
    it('should have correct file names', () => {
      expect(StandardFiles.TEMPLATE).toBe('template.yaml');
      expect(StandardFiles.CLUSTER).toBe('cluster.yaml');
      expect(StandardFiles.NODES).toBe('nodes.yaml');
      expect(StandardFiles.PROJECT).toBe('kustodian.yaml');
    });
  });

  describe('StandardDirs', () => {
    it('should have correct directory names', () => {
      expect(StandardDirs.TEMPLATES).toBe('templates');
      expect(StandardDirs.CLUSTERS).toBe('clusters');
    });
  });

  describe('find_project_root', () => {
    it('should find project root when kustodian.yaml exists', async () => {
      // Arrange
      const project_file = path.join(temp_dir, 'kustodian.yaml');
      await fs.writeFile(project_file, 'apiVersion: kustodian.io/v1\n');
      const nested_dir = path.join(temp_dir, 'foo', 'bar');
      await fs.mkdir(nested_dir, { recursive: true });

      // Act
      const result = await find_project_root(nested_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(temp_dir);
      }
    });

    it('should find project root in current directory', async () => {
      // Arrange
      const project_file = path.join(temp_dir, 'kustodian.yaml');
      await fs.writeFile(project_file, 'apiVersion: kustodian.io/v1\n');

      // Act
      const result = await find_project_root(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(temp_dir);
      }
    });

    it('should return error when project file not found', async () => {
      // Act
      const result = await find_project_root(temp_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_NOT_FOUND');
        expect(result.error.message).toContain('kustodian.yaml not found');
      }
    });
  });

  describe('load_template', () => {
    it('should load a valid template', async () => {
      // Arrange
      const template_dir = path.join(temp_dir, 'my-template');
      await fs.mkdir(template_dir, { recursive: true });
      await fs.writeFile(
        path.join(template_dir, 'template.yaml'),
        `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: nginx
spec:
  kustomizations:
    - name: app
      path: ./app
`,
      );

      // Act
      const result = await load_template(template_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.path).toBe(template_dir);
        expect(result.value.template.metadata.name).toBe('nginx');
      }
    });

    it('should return error for missing template file', async () => {
      // Arrange
      const template_dir = path.join(temp_dir, 'missing-template');
      await fs.mkdir(template_dir, { recursive: true });

      // Act
      const result = await load_template(template_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FILE_NOT_FOUND');
      }
    });

    it('should return error for invalid template schema', async () => {
      // Arrange
      const template_dir = path.join(temp_dir, 'invalid-template');
      await fs.mkdir(template_dir, { recursive: true });
      await fs.writeFile(
        path.join(template_dir, 'template.yaml'),
        `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: invalid
spec:
  kustomizations: []
`,
      );

      // Act
      const result = await load_template(template_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCHEMA_VALIDATION_ERROR');
      }
    });
  });

  describe('load_cluster', () => {
    it('should load a valid cluster', async () => {
      // Arrange
      const cluster_dir = path.join(temp_dir, 'production');
      await fs.mkdir(cluster_dir, { recursive: true });
      await fs.writeFile(
        path.join(cluster_dir, 'cluster.yaml'),
        `apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: production
spec:
  git:
    owner: my-org
    repository: my-repo
`,
      );

      // Act
      const result = await load_cluster(cluster_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.path).toBe(cluster_dir);
        expect(result.value.cluster.metadata.name).toBe('production');
      }
    });

    it('should return error for missing cluster file', async () => {
      // Arrange
      const cluster_dir = path.join(temp_dir, 'missing-cluster');
      await fs.mkdir(cluster_dir, { recursive: true });

      // Act
      const result = await load_cluster(cluster_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FILE_NOT_FOUND');
      }
    });

    it('should return error for invalid cluster schema', async () => {
      // Arrange
      const cluster_dir = path.join(temp_dir, 'invalid-cluster');
      await fs.mkdir(cluster_dir, { recursive: true });
      await fs.writeFile(
        path.join(cluster_dir, 'cluster.yaml'),
        `apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: invalid
spec: {}
`,
      );

      // Act
      const result = await load_cluster(cluster_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCHEMA_VALIDATION_ERROR');
      }
    });
  });

  describe('load_all_templates', () => {
    it('should load all templates from templates directory', async () => {
      // Arrange
      const templates_dir = path.join(temp_dir, 'templates');
      await fs.mkdir(templates_dir, { recursive: true });

      // Create two templates
      for (const name of ['nginx', 'redis']) {
        const dir = path.join(templates_dir, name);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
          path.join(dir, 'template.yaml'),
          `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: ${name}
spec:
  kustomizations:
    - name: app
      path: ./app
`,
        );
      }

      // Act
      const result = await load_all_templates(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(2);
        const names = result.value.map((t) => t.template.metadata.name);
        expect(names).toContain('nginx');
        expect(names).toContain('redis');
      }
    });

    it('should return empty array when templates directory does not exist', async () => {
      // Act
      const result = await load_all_templates(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return error when any template is invalid', async () => {
      // Arrange
      const templates_dir = path.join(temp_dir, 'templates');
      const invalid_dir = path.join(templates_dir, 'invalid');
      await fs.mkdir(invalid_dir, { recursive: true });
      await fs.writeFile(
        path.join(invalid_dir, 'template.yaml'),
        `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: invalid
spec:
  kustomizations: []
`,
      );

      // Act
      const result = await load_all_templates(temp_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('load_all_clusters', () => {
    it('should load all clusters from clusters directory', async () => {
      // Arrange
      const clusters_dir = path.join(temp_dir, 'clusters');
      await fs.mkdir(clusters_dir, { recursive: true });

      // Create two clusters
      for (const name of ['production', 'staging']) {
        const dir = path.join(clusters_dir, name);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
          path.join(dir, 'cluster.yaml'),
          `apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: ${name}
spec:
  git:
    owner: my-org
    repository: my-repo
`,
        );
      }

      // Act
      const result = await load_all_clusters(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(2);
        const names = result.value.map((c) => c.cluster.metadata.name);
        expect(names).toContain('production');
        expect(names).toContain('staging');
      }
    });

    it('should return empty array when clusters directory does not exist', async () => {
      // Act
      const result = await load_all_clusters(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return error when any cluster is invalid', async () => {
      // Arrange
      const clusters_dir = path.join(temp_dir, 'clusters');
      const invalid_dir = path.join(clusters_dir, 'invalid');
      await fs.mkdir(invalid_dir, { recursive: true });
      await fs.writeFile(
        path.join(invalid_dir, 'cluster.yaml'),
        `apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: invalid
spec: {}
`,
      );

      // Act
      const result = await load_all_clusters(temp_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('load_project', () => {
    it('should load a complete project', async () => {
      // Arrange
      await fs.writeFile(path.join(temp_dir, 'kustodian.yaml'), 'apiVersion: kustodian.io/v1\n');

      // Create a template
      const template_dir = path.join(temp_dir, 'templates', 'nginx');
      await fs.mkdir(template_dir, { recursive: true });
      await fs.writeFile(
        path.join(template_dir, 'template.yaml'),
        `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: nginx
spec:
  kustomizations:
    - name: app
      path: ./app
`,
      );

      // Create a cluster
      const cluster_dir = path.join(temp_dir, 'clusters', 'production');
      await fs.mkdir(cluster_dir, { recursive: true });
      await fs.writeFile(
        path.join(cluster_dir, 'cluster.yaml'),
        `apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: production
spec:
  git:
    owner: my-org
    repository: my-repo
`,
      );

      // Act
      const result = await load_project(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.root).toBe(temp_dir);
        expect(result.value.templates).toHaveLength(1);
        expect(result.value.clusters).toHaveLength(1);
        expect(result.value.templates[0]?.template.metadata.name).toBe('nginx');
        expect(result.value.clusters[0]?.cluster.metadata.name).toBe('production');
      }
    });

    it('should return error when project file does not exist', async () => {
      // Act
      const result = await load_project(temp_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_NOT_FOUND');
      }
    });

    it('should return error when templates fail to load', async () => {
      // Arrange
      await fs.writeFile(path.join(temp_dir, 'kustodian.yaml'), 'apiVersion: kustodian.io/v1\n');

      const template_dir = path.join(temp_dir, 'templates', 'invalid');
      await fs.mkdir(template_dir, { recursive: true });
      await fs.writeFile(
        path.join(template_dir, 'template.yaml'),
        `apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: invalid
spec:
  kustomizations: []
`,
      );

      // Act
      const result = await load_project(temp_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return error when clusters fail to load', async () => {
      // Arrange
      await fs.writeFile(path.join(temp_dir, 'kustodian.yaml'), 'apiVersion: kustodian.io/v1\n');

      const cluster_dir = path.join(temp_dir, 'clusters', 'invalid');
      await fs.mkdir(cluster_dir, { recursive: true });
      await fs.writeFile(
        path.join(cluster_dir, 'cluster.yaml'),
        `apiVersion: kustodian.io/v1
kind: Cluster
metadata:
  name: invalid
spec: {}
`,
      );

      // Act
      const result = await load_project(temp_dir);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should load project with no templates or clusters', async () => {
      // Arrange
      await fs.writeFile(path.join(temp_dir, 'kustodian.yaml'), 'apiVersion: kustodian.io/v1\n');

      // Act
      const result = await load_project(temp_dir);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.templates).toEqual([]);
        expect(result.value.clusters).toEqual([]);
      }
    });
  });
});
