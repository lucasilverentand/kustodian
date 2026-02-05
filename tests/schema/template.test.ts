import { describe, expect, it } from 'bun:test';

import { validate_template } from '../../src/schema/template.js';

describe('Template Schema', () => {
  describe('validate_template', () => {
    it('should validate a valid template', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: {
          name: 'nginx',
        },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              namespace: {
                default: 'nginx',
              },
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.name).toBe('nginx');
        expect(result.data.spec.kustomizations).toHaveLength(1);
      }
    });

    it('should validate a template with all optional fields', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: {
          name: 'full-template',
        },
        spec: {
          kustomizations: [
            {
              name: 'operator',
              path: './operator',
              namespace: {
                default: 'my-app',
                create: true,
              },
              depends_on: [],
              substitutions: [{ name: 'replicas', default: '2' }, { name: 'image_tag' }],
              health_checks: [{ kind: 'Deployment', name: 'operator' }],
              prune: true,
              wait: true,
              timeout: '5m',
              retry_interval: '1m',
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject invalid apiVersion', () => {
      // Arrange
      const template = {
        apiVersion: 'invalid/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: { kustomizations: [{ name: 'k', path: './k' }] },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject invalid kind', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test' },
        spec: { kustomizations: [{ name: 'k', path: './k' }] },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject empty kustomizations array', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: { kustomizations: [] },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject missing metadata name', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: {},
        spec: { kustomizations: [{ name: 'k', path: './k' }] },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should validate template with raw dependency references', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'app' },
        spec: {
          kustomizations: [
            {
              name: 'backend',
              path: './backend',
              depends_on: [
                'database',
                'secrets/doppler',
                { raw: { name: 'legacy-infrastructure', namespace: 'gitops-system' } },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.kustomizations[0]?.depends_on).toHaveLength(3);
        expect(result.data.spec.kustomizations[0]?.depends_on?.[0]).toBe('database');
        expect(result.data.spec.kustomizations[0]?.depends_on?.[1]).toBe('secrets/doppler');
        expect(result.data.spec.kustomizations[0]?.depends_on?.[2]).toEqual({
          raw: { name: 'legacy-infrastructure', namespace: 'gitops-system' },
        });
      }
    });

    it('should reject raw dependency with missing name', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'app' },
        spec: {
          kustomizations: [
            {
              name: 'backend',
              path: './backend',
              depends_on: [{ raw: { namespace: 'gitops-system' } }],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should validate doppler substitution without project/config', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              substitutions: [
                {
                  type: 'doppler',
                  name: 'db_password',
                  secret: 'DB_PASSWORD',
                },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate doppler substitution with project/config', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              substitutions: [
                {
                  type: 'doppler',
                  name: 'db_password',
                  project: 'infrastructure',
                  config: 'production',
                  secret: 'DB_PASSWORD',
                },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate 1password substitution with full ref', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              substitutions: [
                {
                  type: '1password',
                  name: 'api_key',
                  ref: 'op://Infrastructure/API-Keys/production',
                },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate 1password substitution with shorthand', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              substitutions: [
                {
                  type: '1password',
                  name: 'api_key',
                  item: 'API-Keys',
                  field: 'production',
                },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should validate 1password substitution with section', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              substitutions: [
                {
                  type: '1password',
                  name: 'api_key',
                  item: 'API-Keys',
                  section: 'production',
                  field: 'key',
                },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject 1password substitution without ref or item+field', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              substitutions: [
                {
                  type: '1password',
                  name: 'api_key',
                },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject raw dependency with missing namespace', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'app' },
        spec: {
          kustomizations: [
            {
              name: 'backend',
              path: './backend',
              depends_on: [{ raw: { name: 'legacy-infrastructure' } }],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject 1password substitution with only item', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'test' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              substitutions: [
                {
                  type: '1password',
                  name: 'api_key',
                  item: 'API-Keys',
                },
              ],
            },
          ],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should validate template with image version entries', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'media' },
        spec: {
          versions: [
            {
              name: 'nginx_version',
              default: '1.25.0',
              registry: { image: 'nginx' },
            },
            {
              name: 'redis_version',
              default: '7.2.0',
              registry: { image: 'redis', type: 'dockerhub' },
              constraint: '^7.0.0',
            },
          ],
          kustomizations: [{ name: 'app', path: './app' }],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.versions).toHaveLength(2);
        expect(result.data.spec.versions?.[0]?.name).toBe('nginx_version');
      }
    });

    it('should validate template with helm version entries', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'infra' },
        spec: {
          versions: [
            {
              name: 'traefik_version',
              default: '28.0.0',
              helm: {
                repository: 'https://traefik.github.io/charts',
                chart: 'traefik',
              },
              constraint: '^28.0.0',
            },
            {
              name: 'cert_manager_version',
              default: '1.14.0',
              helm: {
                oci: 'oci://quay.io/jetstack',
                chart: 'cert-manager',
              },
            },
          ],
          kustomizations: [{ name: 'operator', path: './operator' }],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spec.versions).toHaveLength(2);
      }
    });

    it('should validate template with mixed image and helm version entries', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'stack' },
        spec: {
          versions: [
            {
              name: 'app_version',
              default: '2.0.0',
              registry: { image: 'ghcr.io/my-org/my-app', type: 'ghcr' },
            },
            {
              name: 'ingress_version',
              default: '4.10.0',
              helm: {
                repository: 'https://kubernetes.github.io/ingress-nginx',
                chart: 'ingress-nginx',
              },
            },
          ],
          kustomizations: [{ name: 'deploy', path: './deploy' }],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject version entry without registry or helm', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'invalid' },
        spec: {
          versions: [
            {
              name: 'orphan_version',
              default: '1.0.0',
            },
          ],
          kustomizations: [{ name: 'app', path: './app' }],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject version entry with empty name', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'invalid' },
        spec: {
          versions: [
            {
              name: '',
              default: '1.0.0',
              registry: { image: 'nginx' },
            },
          ],
          kustomizations: [{ name: 'app', path: './app' }],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject helm version without chart', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'invalid' },
        spec: {
          versions: [
            {
              name: 'broken_helm',
              default: '1.0.0',
              helm: {
                repository: 'https://charts.example.com',
              },
            },
          ],
          kustomizations: [{ name: 'app', path: './app' }],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should reject helm version without repository or oci', () => {
      // Arrange
      const template = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'invalid' },
        spec: {
          versions: [
            {
              name: 'broken_helm',
              default: '1.0.0',
              helm: {
                chart: 'my-chart',
              },
            },
          ],
          kustomizations: [{ name: 'app', path: './app' }],
        },
      };

      // Act
      const result = validate_template(template);

      // Assert
      expect(result.success).toBe(false);
    });
  });
});
