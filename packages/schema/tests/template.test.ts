import { describe, expect, it } from 'bun:test';

import { validate_template } from '../src/template.js';

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
  });
});
