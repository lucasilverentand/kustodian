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
        expect(result.data.spec.git?.owner).toBe('my-org');
        expect(result.data.spec.git?.branch).toBe('main');
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
        expect(result.data.spec.git?.branch).toBe('develop');
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

    it('should validate a cluster with code field', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          code: 'prod',
          domain: 'example.com',
          git: { owner: 'org', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.code).toBe('prod');
      }
    });

    it('should validate a cluster with github configuration', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          domain: 'example.com',
          git: { owner: 'org', repository: 'repo' },
          github: {
            organization: 'acme-corp',
            repository: 'infrastructure',
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.github?.organization).toBe('acme-corp');
        expect(result.data.spec.github?.repository).toBe('infrastructure');
        expect(result.data.spec.github?.branch).toBe('main');
      }
    });

    it('should validate a cluster with github custom branch', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          domain: 'example.com',
          git: { owner: 'org', repository: 'repo' },
          github: {
            organization: 'acme-corp',
            repository: 'infrastructure',
            branch: 'production',
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.github?.branch).toBe('production');
      }
    });

    it('should validate a cluster with both code and github', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          code: 'prod',
          domain: 'example.com',
          git: { owner: 'org', repository: 'repo' },
          github: {
            organization: 'acme-corp',
            repository: 'infrastructure',
            branch: 'production',
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.code).toBe('prod');
        expect(result.data.spec.github?.organization).toBe('acme-corp');
      }
    });

    it('should reject empty code', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          code: '',
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty github organization', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
          github: { organization: '', repository: 'infra' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty github repository', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
          github: { organization: 'acme', repository: '' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should validate a cluster with secrets configuration', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          domain: 'example.com',
          git: { owner: 'org', repository: 'repo' },
          secrets: {
            doppler: {
              project: 'infrastructure',
              config: 'cluster_production',
            },
            onepassword: {
              vault: 'Infrastructure',
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.secrets?.doppler?.project).toBe('infrastructure');
        expect(result.data.spec.secrets?.doppler?.config).toBe('cluster_production');
        expect(result.data.spec.secrets?.onepassword?.vault).toBe('Infrastructure');
      }
    });

    it('should validate a cluster with bootstrap credentials', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          domain: 'example.com',
          git: { owner: 'org', repository: 'repo' },
          secrets: {
            doppler: {
              project: 'infrastructure',
              config: 'cluster_production',
              service_token: {
                type: '1password',
                ref: 'op://Operations/Doppler/service_token',
              },
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const doppler = result.data.spec.secrets?.doppler;
        expect(doppler?.service_token?.type).toBe('1password');
        if (doppler?.service_token?.type === '1password') {
          expect(doppler.service_token.ref).toBe('op://Operations/Doppler/service_token');
        }
      }
    });

    it('should reject empty doppler project', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
          secrets: {
            doppler: {
              project: '',
              config: 'prod',
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty onepassword vault', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          domain: 'test.com',
          git: { owner: 'org', repository: 'repo' },
          secrets: {
            onepassword: {
              vault: '',
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });
  });
});
