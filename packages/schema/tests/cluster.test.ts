import { describe, expect, it } from 'bun:test';

import { validate_cluster } from '../src/cluster.js';

describe('Cluster Schema', () => {
  describe('validate_cluster', () => {
    it('should validate a minimal valid cluster', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: {
          name: 'production',
        },
        spec: {
          domain: 'example.com',
          git: {
            owner: 'my-org',
            repository: 'my-repo',
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.name).toBe('production');
        expect(result.data.spec.domain).toBe('example.com');
        expect(result.data.spec.git.owner).toBe('my-org');
        expect(result.data.spec.git.branch).toBe('main');
      }
    });

    it('should validate a cluster with all optional fields', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: {
          name: 'full-cluster',
        },
        spec: {
          domain: 'production.example.com',
          git: {
            owner: 'my-org',
            repository: 'gitops-repo',
            branch: 'develop',
            path: 'clusters/production',
          },
          templates: [
            {
              name: 'nginx',
              enabled: true,
              values: { replicas: '3' },
            },
            {
              name: 'redis',
              enabled: false,
            },
          ],
          plugins: [
            {
              name: 'doppler',
              config: { project: 'my-project' },
            },
          ],
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.git.branch).toBe('develop');
        expect(result.data.spec.templates).toHaveLength(2);
        expect(result.data.spec.plugins).toHaveLength(1);
      }
    });

    it('should apply default values for templates', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: {
          name: 'test',
        },
        spec: {
          domain: 'test.com',
          git: {
            owner: 'org',
            repository: 'repo',
          },
          templates: [{ name: 'nginx' }],
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const templates = result.data.spec.templates;
        expect(templates).toBeDefined();
        expect(templates?.[0]?.enabled).toBe(true);
      }
    });

    it('should reject invalid apiVersion', () => {
      // Arrange
      const cluster = {
        apiVersion: 'invalid/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject invalid kind', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject missing domain', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject missing git config', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty git owner', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: '', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty git repository', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: '' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty template name', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
          templates: [{ name: '' }],
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty plugin name', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
          plugins: [{ name: '' }],
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });
  });
});
