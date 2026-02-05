import { describe, expect, it } from 'bun:test';

import {
  generate_custom_health_checks,
  generate_depends_on,
  generate_flux_kustomization,
  generate_flux_name,
  generate_flux_path,
  generate_health_checks,
  resolve_kustomization,
} from '../../src/generator/flux.js';
import type { KustomizationType, TemplateType } from '../../src/schema/index.js';

describe('Flux Generator', () => {
  describe('generate_flux_name', () => {
    it('should combine template and kustomization names', () => {
      // Act
      const result = generate_flux_name('nginx', 'deployment');

      // Assert
      expect(result).toBe('nginx-deployment');
    });
  });

  describe('generate_flux_path', () => {
    it('should generate path with defaults', () => {
      // Act
      const result = generate_flux_path('nginx', './deployment');

      // Assert
      expect(result).toBe('./templates/nginx/deployment');
    });

    it('should use custom base path', () => {
      // Act
      const result = generate_flux_path('nginx', './config', './custom');

      // Assert
      expect(result).toBe('./custom/nginx/config');
    });

    it('should normalize paths without leading ./', () => {
      // Act
      const result = generate_flux_path('app', 'manifests');

      // Assert
      expect(result).toBe('./templates/app/manifests');
    });
  });

  describe('generate_depends_on', () => {
    it('should return undefined for empty deps', () => {
      // Act
      const result = generate_depends_on('nginx', []);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined deps', () => {
      // Act
      const result = generate_depends_on('nginx', undefined);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should format dependencies', () => {
      // Act
      const result = generate_depends_on('app', ['operator', 'config']);

      // Assert
      expect(result).toEqual([{ name: 'app-operator' }, { name: 'app-config' }]);
    });

    it('should format cross-template dependencies', () => {
      // Act
      const result = generate_depends_on('app', ['secrets/doppler']);

      // Assert
      expect(result).toEqual([{ name: 'secrets-doppler' }]);
    });

    it('should format mixed within-template and cross-template dependencies', () => {
      // Act
      const result = generate_depends_on('app', [
        'config',
        'secrets/doppler',
        'networking/traefik',
      ]);

      // Assert
      expect(result).toEqual([
        { name: 'app-config' },
        { name: 'secrets-doppler' },
        { name: 'networking-traefik' },
      ]);
    });

    it('should format raw external dependencies', () => {
      // Act
      const result = generate_depends_on('app', [
        { raw: { name: 'legacy-infrastructure', namespace: 'gitops-system' } },
      ]);

      // Assert
      expect(result).toEqual([{ name: 'legacy-infrastructure', namespace: 'gitops-system' }]);
    });

    it('should format mixed string and raw dependencies', () => {
      // Act
      const result = generate_depends_on('app', [
        'database',
        'secrets/doppler',
        { raw: { name: 'legacy-infrastructure', namespace: 'gitops-system' } },
        { raw: { name: 'external-config', namespace: 'config-system' } },
      ]);

      // Assert
      expect(result).toEqual([
        { name: 'app-database' },
        { name: 'secrets-doppler' },
        { name: 'legacy-infrastructure', namespace: 'gitops-system' },
        { name: 'external-config', namespace: 'config-system' },
      ]);
    });
  });

  describe('generate_health_checks', () => {
    it('should return undefined for empty checks', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        health_checks: [],
      };

      // Act
      const result = generate_health_checks(kustomization, 'default');

      // Assert
      expect(result).toBeUndefined();
    });

    it('should format health checks', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        health_checks: [
          { kind: 'Deployment', name: 'app' },
          { kind: 'StatefulSet', name: 'db', namespace: 'database' },
        ],
      };

      // Act
      const result = generate_health_checks(kustomization, 'default');

      // Assert
      expect(result).toHaveLength(2);
      expect(result?.[0]).toEqual({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: 'app',
        namespace: 'default',
      });
      expect(result?.[1]).toEqual({
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        name: 'db',
        namespace: 'database',
      });
    });

    it('should use custom api_version when specified', () => {
      // Arrange
      const kustomization = {
        name: 'test',
        path: './test',
        health_checks: [
          { kind: 'Cluster', name: 'my-cluster', api_version: 'postgresql.cnpg.io/v1' },
          { kind: 'Deployment', name: 'app' },
        ],
      } as KustomizationType;

      // Act
      const result = generate_health_checks(kustomization, 'default');

      // Assert
      expect(result).toHaveLength(2);
      expect(result?.[0]).toEqual({
        apiVersion: 'postgresql.cnpg.io/v1',
        kind: 'Cluster',
        name: 'my-cluster',
        namespace: 'default',
      });
      expect(result?.[1]).toEqual({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: 'app',
        namespace: 'default',
      });
    });
  });

  describe('generate_custom_health_checks', () => {
    it('should return undefined for empty checks', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        health_check_exprs: [],
      };

      // Act
      const result = generate_custom_health_checks(kustomization, 'default');

      // Assert
      expect(result).toBeUndefined();
    });

    it('should format custom health checks with CEL expressions', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        health_check_exprs: [
          {
            api_version: 'postgresql.cnpg.io/v1',
            kind: 'Cluster',
            current: "status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'True')",
            failed: "status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'False')",
          },
        ],
      };

      // Act
      const result = generate_custom_health_checks(kustomization, 'databases');

      // Assert
      expect(result).toHaveLength(1);
      expect(result?.[0]).toEqual({
        apiVersion: 'postgresql.cnpg.io/v1',
        kind: 'Cluster',
        namespace: 'databases',
        current: "status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'True')",
        failed: "status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'False')",
      });
    });

    it('should use custom namespace when specified', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        health_check_exprs: [
          {
            api_version: 'postgresql.cnpg.io/v1',
            kind: 'Cluster',
            namespace: 'custom-db',
            current: "status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'True')",
          },
        ],
      };

      // Act
      const result = generate_custom_health_checks(kustomization, 'default');

      // Assert
      expect(result).toHaveLength(1);
      expect(result?.[0]).toEqual({
        apiVersion: 'postgresql.cnpg.io/v1',
        kind: 'Cluster',
        namespace: 'custom-db',
        current: "status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'True')",
      });
    });

    it('should handle multiple CEL expression health checks', () => {
      // Arrange
      const kustomization: KustomizationType = {
        name: 'test',
        path: './test',
        prune: true,
        wait: true,
        health_check_exprs: [
          {
            api_version: 'postgresql.cnpg.io/v1',
            kind: 'Cluster',
            current: "status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'True')",
          },
          {
            api_version: 'v1',
            kind: 'Service',
            namespace: 'custom',
            current: 'status.loadBalancer.ingress.size() > 0',
          },
        ],
      };

      // Act
      const result = generate_custom_health_checks(kustomization, 'default');

      // Assert
      expect(result).toHaveLength(2);
      if (result?.[0] && result?.[1]) {
        expect(result[0].kind).toBe('Cluster');
        expect(result[0].namespace).toBe('default');
        expect(result[1].kind).toBe('Service');
        expect(result[1].namespace).toBe('custom');
      }
    });
  });

  describe('resolve_kustomization', () => {
    const template: TemplateType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: { name: 'nginx' },
      spec: {
        kustomizations: [
          {
            name: 'deployment',
            path: './deployment',
            prune: true,
            wait: true,
            namespace: { default: 'nginx', create: true },
            substitutions: [{ name: 'replicas', default: '2' }, { name: 'image_tag' }],
          },
        ],
      },
    };

    it('should use default values', () => {
      // Arrange
      const kustomization = template.spec.kustomizations[0] as KustomizationType;

      // Act
      const result = resolve_kustomization(template, kustomization);

      // Assert
      expect(result.values['replicas']).toBe('2');
      expect(result.values['image_tag']).toBeUndefined();
    });

    it('should override with cluster values', () => {
      // Arrange
      const kustomization = template.spec.kustomizations[0] as KustomizationType;
      const cluster_values = { replicas: '5', image_tag: '1.25' };

      // Act
      const result = resolve_kustomization(template, kustomization, cluster_values);

      // Assert
      expect(result.values['replicas']).toBe('5');
      expect(result.values['image_tag']).toBe('1.25');
    });

    it('should set namespace from config', () => {
      // Arrange
      const kustomization = template.spec.kustomizations[0] as KustomizationType;

      // Act
      const result = resolve_kustomization(template, kustomization);

      // Assert
      expect(result.namespace).toBe('nginx');
    });
  });

  describe('generate_flux_kustomization', () => {
    it('should generate a valid Flux Kustomization', () => {
      // Arrange
      const template: TemplateType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'nginx' },
        spec: {
          kustomizations: [
            {
              name: 'deployment',
              path: './deployment',
              prune: true,
              wait: true,
              namespace: { default: 'nginx', create: true },
            },
          ],
        },
      };
      const kustomization = template.spec.kustomizations[0] as KustomizationType;
      const resolved = resolve_kustomization(template, kustomization);

      // Act
      const flux = generate_flux_kustomization(resolved);

      // Assert
      expect(flux.apiVersion).toBe('kustomize.toolkit.fluxcd.io/v1');
      expect(flux.kind).toBe('Kustomization');
      expect(flux.metadata.name).toBe('nginx-deployment');
      expect(flux.metadata.namespace).toBe('flux-system');
      expect(flux.spec.path).toBe('./templates/nginx/deployment');
      expect(flux.spec.prune).toBe(true);
      expect(flux.spec.wait).toBe(true);
    });

    it('should use custom git repository name', () => {
      // Arrange
      const template: TemplateType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Template',
        metadata: { name: 'app' },
        spec: {
          kustomizations: [{ name: 'main', path: './main', prune: true, wait: true }],
        },
      };
      const kustomization = template.spec.kustomizations[0] as KustomizationType;
      const resolved = resolve_kustomization(template, kustomization);

      // Act
      const flux = generate_flux_kustomization(resolved, 'my-repo');

      // Assert
      expect(flux.spec.sourceRef.name).toBe('my-repo');
    });
  });
});
