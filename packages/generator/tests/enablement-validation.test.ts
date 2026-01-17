import { describe, expect, it } from 'bun:test';

import type { ClusterType, TemplateType } from '@kustodian/schema';

import { validate_enablement_dependencies } from '../src/validation/enablement.js';

interface TemplateConfig {
  enabled?: boolean;
  kustomizations?: Record<
    string,
    boolean | { enabled: boolean; preservation?: { mode: 'stateful' | 'none' | 'custom' } }
  >;
}

describe('Enablement Validation', () => {
  function create_cluster(
    name = 'test',
    template_configs: Record<string, TemplateConfig> = {},
  ): ClusterType {
    return {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name },
      spec: {
        domain: 'test.example.com',
        git: {
          owner: 'test',
          repository: 'test',
          branch: 'main',
        },
        templates: Object.entries(template_configs).map(([name, config]) => ({
          name,
          enabled: config.enabled ?? true,
          kustomizations: config.kustomizations,
        })),
      },
    };
  }

  function create_template(
    name: string,
    kustomizations: Array<{ name: string; enabled?: boolean; depends_on?: string[] }>,
  ): TemplateType {
    return {
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: { name },
      spec: {
        kustomizations: kustomizations.map((k) => ({
          name: k.name,
          path: `./${k.name}`,
          prune: true,
          wait: true,
          enabled: k.enabled ?? true,
          depends_on: k.depends_on,
        })),
      },
    };
  }

  describe('validate_enablement_dependencies', () => {
    it('should pass when all kustomizations are enabled', () => {
      const cluster = create_cluster();
      const templates = [
        create_template('app', [
          { name: 'database', enabled: true },
          { name: 'api', enabled: true, depends_on: ['database'] },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should pass when disabled kustomization has no dependents', () => {
      const cluster = create_cluster();
      const templates = [
        create_template('app', [
          { name: 'database', enabled: false },
          { name: 'api', enabled: true },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should fail when enabled kustomization depends on disabled one', () => {
      const cluster = create_cluster();
      const templates = [
        create_template('app', [
          { name: 'database', enabled: false },
          { name: 'api', enabled: true, depends_on: ['database'] },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('disabled_dependency');
      expect(errors[0]?.source).toBe('app/api');
      expect(errors[0]?.target).toBe('app/database');
    });

    it('should fail with cross-template disabled dependency', () => {
      const cluster = create_cluster('test', {
        secrets: { enabled: true },
        app: {
          enabled: true,
          kustomizations: {
            api: true,
          },
        },
      });
      const templates = [
        create_template('secrets', [{ name: 'vault', enabled: false }]),
        create_template('app', [{ name: 'api', enabled: true, depends_on: ['secrets/vault'] }]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('disabled_dependency');
      expect(errors[0]?.source).toBe('app/api');
      expect(errors[0]?.target).toBe('secrets/vault');
    });

    it('should respect cluster overrides for enablement', () => {
      const cluster = create_cluster('test', {
        database: {
          enabled: true,
          kustomizations: {
            postgres: true, // Enable via cluster override
          },
        },
      });
      const templates = [
        create_template('database', [
          { name: 'postgres', enabled: false }, // Disabled in template
          { name: 'api', enabled: true, depends_on: ['postgres'] },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      // Should pass because cluster enables postgres
      expect(errors).toHaveLength(0);
    });

    it('should fail when cluster disables a dependency', () => {
      const cluster = create_cluster('test', {
        database: {
          enabled: true,
          kustomizations: {
            postgres: false, // Disable via cluster override
          },
        },
      });
      const templates = [
        create_template('database', [
          { name: 'postgres', enabled: true }, // Enabled in template
          { name: 'api', enabled: true, depends_on: ['postgres'] },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('disabled_dependency');
    });

    it('should pass when both kustomizations are disabled', () => {
      const cluster = create_cluster();
      const templates = [
        create_template('app', [
          { name: 'database', enabled: false },
          { name: 'api', enabled: false, depends_on: ['database'] },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should handle template-level disable', () => {
      const cluster = create_cluster('test', {
        database: { enabled: false },
        app: { enabled: true },
      });
      const templates = [
        create_template('database', [{ name: 'postgres', enabled: true }]),
        create_template('app', [{ name: 'api', enabled: true, depends_on: ['database/postgres'] }]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('disabled_dependency');
      expect(errors[0]?.target).toBe('database/postgres');
    });

    it('should handle multiple dependencies', () => {
      const cluster = create_cluster();
      const templates = [
        create_template('app', [
          { name: 'database', enabled: false },
          { name: 'cache', enabled: false },
          { name: 'api', enabled: true, depends_on: ['database', 'cache'] },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(2);
      expect(errors.every((e) => e.type === 'disabled_dependency')).toBe(true);
    });

    it('should provide clear error messages', () => {
      const cluster = create_cluster();
      const templates = [
        create_template('app', [
          { name: 'database', enabled: false },
          { name: 'api', enabled: true, depends_on: ['database'] },
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors[0]?.message).toContain('app/api');
      expect(errors[0]?.message).toContain('app/database');
      expect(errors[0]?.message).toContain('Either enable');
      expect(errors[0]?.message).toContain('or disable');
    });
  });
});
