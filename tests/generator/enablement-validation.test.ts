import { describe, expect, it } from 'bun:test';

import type { ClusterType, TemplateType } from '../../src/schema/index.js';

import { validate_enablement_dependencies } from '../../src/generator/validation/enablement.js';

/**
 * Tests for the opt-in template model.
 * Templates are only deployed if explicitly listed in cluster.yaml.
 * Dependencies must reference templates that are listed.
 */
describe('Enablement Validation (Opt-in Model)', () => {
  function create_cluster(name = 'test', template_names: string[] = []): ClusterType {
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
        templates: template_names.map((name) => ({ name })),
      },
    };
  }

  function create_template(
    name: string,
    kustomizations: Array<{ name: string; depends_on?: string[] }>,
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
          depends_on: k.depends_on,
        })),
      },
    };
  }

  describe('validate_enablement_dependencies', () => {
    it('should pass when all dependencies are from listed templates', () => {
      // Both templates are listed in cluster.yaml
      const cluster = create_cluster('test', ['database', 'app']);
      const templates = [
        create_template('database', [{ name: 'postgres' }]),
        create_template('app', [{ name: 'api', depends_on: ['database/postgres'] }]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should pass for templates with within-template dependencies', () => {
      const cluster = create_cluster('test', ['app']);
      const templates = [
        create_template('app', [{ name: 'database' }, { name: 'api', depends_on: ['database'] }]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should fail when dependency is from template not listed in cluster.yaml', () => {
      // Only 'app' is listed, but it depends on 'database' which is not listed
      const cluster = create_cluster('test', ['app']);
      const templates = [
        create_template('database', [{ name: 'postgres' }]),
        create_template('app', [{ name: 'api', depends_on: ['database/postgres'] }]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('missing_dependency');
      expect(errors[0]?.message).toContain('database/postgres');
    });

    it('should pass when template is not listed but has no dependents', () => {
      // Only 'app' is listed, 'database' exists but is not needed
      const cluster = create_cluster('test', ['app']);
      const templates = [
        create_template('database', [{ name: 'postgres' }]),
        create_template('app', [
          { name: 'api' }, // No dependency on database
        ]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should fail with multiple errors for multiple missing dependencies', () => {
      const cluster = create_cluster('test', ['app']);
      const templates = [
        create_template('database', [{ name: 'postgres' }]),
        create_template('cache', [{ name: 'redis' }]),
        create_template('app', [{ name: 'api', depends_on: ['database/postgres', 'cache/redis'] }]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(2);
      expect(errors.map((e) => e.target).sort()).toEqual(['cache/redis', 'database/postgres']);
    });

    it('should skip templates not listed in cluster.yaml when checking dependencies', () => {
      // 'database' is not listed, so its internal dependencies are not checked
      const cluster = create_cluster('test', ['app']);
      const templates = [
        create_template('database', [{ name: 'init' }, { name: 'postgres', depends_on: ['init'] }]),
        create_template('app', [{ name: 'api' }]),
      ];

      const errors = validate_enablement_dependencies(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should handle empty template list in cluster.yaml', () => {
      const cluster = create_cluster('test', []);
      const templates = [create_template('app', [{ name: 'api' }])];

      const errors = validate_enablement_dependencies(cluster, templates);

      // No templates listed means no dependencies to check
      expect(errors).toHaveLength(0);
    });
  });
});
