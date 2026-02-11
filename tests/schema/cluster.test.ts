import { describe, expect, it } from 'bun:test';

import { validate_cluster } from '../../src/schema/cluster.js';

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
          git: {
            owner: 'my-org',
            repository: 'gitops-repo',
            branch: 'develop',
            path: 'clusters/production',
          },
          templates: [
            {
              name: 'nginx',
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
        expect(templates?.[0]?.name).toBe('nginx');
      }
    });

    it('should reject invalid apiVersion', () => {
      // Arrange
      const cluster = {
        apiVersion: 'invalid/v1',
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

    it('should reject invalid kind', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
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
        spec: {},
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
          git: { owner: 'org', repository: 'repo' },
          plugins: [{ name: '' }],
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should validate a cluster with code field in metadata', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production', code: 'prod' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.code).toBe('prod');
      }
    });

    it('should validate a cluster with timezone in metadata', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production', timezone: 'Europe/Amsterdam' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.timezone).toBe('Europe/Amsterdam');
      }
    });

    it('should validate a cluster with environment in metadata', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production', environment: 'production' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      const result = validate_cluster(cluster);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.environment).toBe('production');
      }
    });

    it('should validate a cluster with region in metadata', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production', region: 'eu-west-1' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      const result = validate_cluster(cluster);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.region).toBe('eu-west-1');
      }
    });

    it('should validate a cluster with description in metadata', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production', description: 'Main production cluster' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      const result = validate_cluster(cluster);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.description).toBe('Main production cluster');
      }
    });

    it('should validate a cluster with labels in metadata', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: {
          name: 'production',
          labels: {
            team: 'platform',
            'cost-center': 'engineering',
            tier: 'critical',
          },
        },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      const result = validate_cluster(cluster);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.labels).toEqual({
          team: 'platform',
          'cost-center': 'engineering',
          tier: 'critical',
        });
      }
    });

    it('should validate a cluster with all metadata fields', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: {
          name: 'production',
          code: 'prod',
          description: 'EU production cluster',
          environment: 'production',
          region: 'eu-west-1',
          timezone: 'Europe/Amsterdam',
          labels: { team: 'platform', tier: 'critical' },
        },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      const result = validate_cluster(cluster);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.code).toBe('prod');
        expect(result.data.metadata.description).toBe('EU production cluster');
        expect(result.data.metadata.environment).toBe('production');
        expect(result.data.metadata.region).toBe('eu-west-1');
        expect(result.data.metadata.timezone).toBe('Europe/Amsterdam');
        expect(result.data.metadata.labels).toEqual({ team: 'platform', tier: 'critical' });
      }
    });

    it('should reject empty environment', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test', environment: '' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      const result = validate_cluster(cluster);
      expect(result.success).toBe(false);
    });

    it('should validate a cluster with cluster-level values', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          values: { domain: 'example.com', environment: 'production' },
        },
      };

      const result = validate_cluster(cluster);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.values).toEqual({
          domain: 'example.com',
          environment: 'production',
        });
      }
    });

    it('should reject empty region', () => {
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test', region: '' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
        },
      };

      const result = validate_cluster(cluster);
      expect(result.success).toBe(false);
    });

    it('should validate a cluster with github configuration', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
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
        metadata: { name: 'production', code: 'prod' },
        spec: {
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
        expect(result.data.metadata.code).toBe('prod');
        expect(result.data.spec.github?.organization).toBe('acme-corp');
      }
    });

    it('should reject empty code', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test', code: '' },
        spec: {
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

    it('should validate a cluster with flux controllers configuration', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          flux: {
            controllers: {
              concurrent: 20,
              requeue_dependency: '5s',
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.flux?.controllers?.concurrent).toBe(20);
        expect(result.data.spec.flux?.controllers?.requeue_dependency).toBe('5s');
      }
    });

    it('should validate a cluster with per-controller flux settings', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          flux: {
            controllers: {
              concurrent: 10,
              kustomize_controller: {
                concurrent: 30,
              },
              helm_controller: {
                requeue_dependency: '3s',
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
        expect(result.data.spec.flux?.controllers?.concurrent).toBe(10);
        expect(result.data.spec.flux?.controllers?.kustomize_controller?.concurrent).toBe(30);
        expect(result.data.spec.flux?.controllers?.helm_controller?.requeue_dependency).toBe('3s');
      }
    });

    it('should reject non-positive concurrent value', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          flux: {
            controllers: {
              concurrent: 0,
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject negative concurrent value', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          flux: {
            controllers: {
              concurrent: -5,
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should validate 1Password with cluster_secret configuration', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          secrets: {
            onepassword: {
              vault: 'Infrastructure',
              cluster_secret: {
                enabled: true,
                namespace: 'onepassword-system',
                name: '1password-token',
                key: 'token',
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
        const op = result.data.spec.secrets?.onepassword;
        expect(op?.cluster_secret?.enabled).toBe(true);
        expect(op?.cluster_secret?.namespace).toBe('onepassword-system');
        expect(op?.cluster_secret?.name).toBe('1password-token');
        expect(op?.cluster_secret?.key).toBe('token');
      }
    });

    it('should validate cluster_secret with no namespace/name/key (all optional, no defaults)', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          secrets: {
            doppler: {
              project: 'infrastructure',
              config: 'prod',
              cluster_secret: {},
            },
          },
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const cs = result.data.spec.secrets?.doppler?.cluster_secret;
        expect(cs?.enabled).toBe(true); // default
        expect(cs?.namespace).toBeUndefined();
        expect(cs?.name).toBeUndefined();
        expect(cs?.key).toBeUndefined();
      }
    });

    it('should validate empty flux configuration', () => {
      // Arrange
      const cluster = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'production' },
        spec: {
          git: { owner: 'org', repository: 'repo' },
          flux: {},
        },
      };

      // Act
      const result = validate_cluster(cluster);

      // Assert
      expect(result.success).toBe(true);
    });
  });
});
