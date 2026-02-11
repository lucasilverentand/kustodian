import { describe, expect, it } from 'bun:test';

import type { LoadedClusterType, LoadedTemplateType } from '../../src/loader/project.js';
import type { ClusterType, NodeProfileType, TemplateType } from '../../src/schema/index.js';

import {
  validate_cross_references,
  validate_kustomization_overrides,
  validate_profile_references,
  validate_substitution_completeness,
  validate_template_references,
} from '../../src/generator/validation/cross-reference.js';

function create_cluster(
  name: string,
  overrides: Partial<ClusterType['spec']> = {},
): LoadedClusterType {
  return {
    path: `/clusters/${name}`,
    cluster: {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name },
      spec: {
        oci: {
          registry: 'ghcr.io',
          repository: 'test/repo',
          tag_strategy: 'git-sha',
          provider: 'generic',
          insecure: false,
        },
        ...overrides,
      },
    },
    nodes: [],
  };
}

function create_template(
  name: string,
  kustomizations: Array<{
    name: string;
    substitutions?: Array<{ name: string; default?: string }>;
  }> = [{ name: 'main' }],
  versions?: Array<{ name: string; default?: string; registry?: unknown }>,
): LoadedTemplateType {
  return {
    path: `/templates/${name}`,
    template: {
      apiVersion: 'kustodian.io/v1',
      kind: 'Template',
      metadata: { name },
      spec: {
        versions: versions as TemplateType['spec']['versions'],
        kustomizations: kustomizations.map((k) => ({
          name: k.name,
          path: `./${k.name}`,
          prune: true,
          wait: true,
          substitutions: k.substitutions,
        })),
      },
    },
  };
}

describe('Cross-Reference Validation', () => {
  describe('validate_template_references', () => {
    it('should pass when all referenced templates exist', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }, { name: 'monitoring' }],
      });
      const templates = [create_template('networking'), create_template('monitoring')];

      const errors = validate_template_references(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should report missing template references', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }, { name: 'does-not-exist' }],
      });
      const templates = [create_template('networking')];

      const errors = validate_template_references(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('missing_template');
      expect(errors[0]?.message).toContain('does-not-exist');
      expect(errors[0]?.cluster).toBe('prod');
    });

    it('should pass when cluster has no templates', () => {
      const cluster = create_cluster('empty');
      const templates = [create_template('networking')];

      const errors = validate_template_references(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should report multiple missing templates', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'foo' }, { name: 'bar' }],
      });

      const errors = validate_template_references(cluster, []);

      expect(errors).toHaveLength(2);
    });
  });

  describe('validate_substitution_completeness', () => {
    it('should pass when all required substitutions have values', () => {
      const cluster = create_cluster('prod', {
        templates: [
          {
            name: 'networking',
            values: { domain: 'example.com' },
          },
        ],
      });
      const templates = [
        create_template('networking', [{ name: 'main', substitutions: [{ name: 'domain' }] }]),
      ];

      const errors = validate_substitution_completeness(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should pass when substitutions have defaults', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }],
      });
      const templates = [
        create_template('networking', [
          { name: 'main', substitutions: [{ name: 'domain', default: 'localhost' }] },
        ]),
      ];

      const errors = validate_substitution_completeness(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should report missing required substitutions', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }],
      });
      const templates = [
        create_template('networking', [
          { name: 'main', substitutions: [{ name: 'domain' }, { name: 'tls_secret' }] },
        ]),
      ];

      const errors = validate_substitution_completeness(cluster, templates);

      expect(errors).toHaveLength(2);
      expect(errors[0]?.type).toBe('missing_substitution');
      expect(errors[0]?.message).toContain('domain');
      expect(errors[1]?.message).toContain('tls_secret');
    });

    it('should accept cluster-level values for substitutions', () => {
      const cluster = create_cluster('prod', {
        values: { domain: 'example.com' },
        templates: [{ name: 'networking' }],
      });
      const templates = [
        create_template('networking', [{ name: 'main', substitutions: [{ name: 'domain' }] }]),
      ];

      const errors = validate_substitution_completeness(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should report missing required template-level versions', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }],
      });
      const templates = [
        create_template(
          'networking',
          [{ name: 'main' }],
          [{ name: 'app_version', registry: { image: 'nginx', type: 'dockerhub' } }],
        ),
      ];

      const errors = validate_substitution_completeness(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('missing_substitution');
      expect(errors[0]?.message).toContain('app_version');
    });

    it('should pass when version has a default', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }],
      });
      const templates = [
        create_template(
          'networking',
          [{ name: 'main' }],
          [
            {
              name: 'app_version',
              default: '1.0.0',
              registry: { image: 'nginx', type: 'dockerhub' },
            },
          ],
        ),
      ];

      const errors = validate_substitution_completeness(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should skip templates not found (handled by template ref check)', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'nonexistent' }],
      });

      const errors = validate_substitution_completeness(cluster, []);

      expect(errors).toHaveLength(0);
    });

    it('should use template-level values over cluster-level values', () => {
      const cluster = create_cluster('prod', {
        values: { shared: 'cluster-value' },
        templates: [
          {
            name: 'networking',
            values: { specific: 'template-value' },
          },
        ],
      });
      const templates = [
        create_template('networking', [
          {
            name: 'main',
            substitutions: [{ name: 'shared' }, { name: 'specific' }],
          },
        ]),
      ];

      const errors = validate_substitution_completeness(cluster, templates);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_kustomization_overrides', () => {
    it('should pass when override keys match template kustomizations', () => {
      const cluster = create_cluster('prod', {
        templates: [
          {
            name: 'networking',
            kustomizations: {
              main: { preservation: { mode: 'none' } },
            },
          },
        ],
      });
      const templates = [create_template('networking', [{ name: 'main' }])];

      const errors = validate_kustomization_overrides(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should report override keys that do not match any kustomization', () => {
      const cluster = create_cluster('prod', {
        templates: [
          {
            name: 'networking',
            kustomizations: {
              nonexistent: { preservation: { mode: 'none' } },
            },
          },
        ],
      });
      const templates = [create_template('networking', [{ name: 'main' }])];

      const errors = validate_kustomization_overrides(cluster, templates);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('invalid_kustomization_override');
      expect(errors[0]?.message).toContain('nonexistent');
    });

    it('should pass when no overrides are specified', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }],
      });
      const templates = [create_template('networking')];

      const errors = validate_kustomization_overrides(cluster, templates);

      expect(errors).toHaveLength(0);
    });

    it('should skip templates not found (handled by template ref check)', () => {
      const cluster = create_cluster('prod', {
        templates: [
          {
            name: 'nonexistent',
            kustomizations: { foo: { preservation: { mode: 'none' } } },
          },
        ],
      });

      const errors = validate_kustomization_overrides(cluster, []);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_profile_references', () => {
    it('should pass when all node profiles exist', () => {
      const profiles = new Map<string, NodeProfileType>([['gpu', { name: 'gpu' }]]);
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'worker', address: '10.0.0.1', profile: 'gpu' }];

      const errors = validate_profile_references(cluster, profiles);

      expect(errors).toHaveLength(0);
    });

    it('should report missing profile references', () => {
      const profiles = new Map<string, NodeProfileType>();
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'worker', address: '10.0.0.1', profile: 'gpu' }];

      const errors = validate_profile_references(cluster, profiles);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('missing_profile');
      expect(errors[0]?.message).toContain('gpu');
      expect(errors[0]?.message).toContain('node-1');
    });

    it('should pass when nodes have no profile', () => {
      const profiles = new Map<string, NodeProfileType>();
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'worker', address: '10.0.0.1' }];

      const errors = validate_profile_references(cluster, profiles);

      expect(errors).toHaveLength(0);
    });

    it('should pass when cluster has no nodes', () => {
      const profiles = new Map<string, NodeProfileType>();
      const cluster = create_cluster('prod');

      const errors = validate_profile_references(cluster, profiles);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_cross_references (orchestrator)', () => {
    it('should pass when everything is valid', () => {
      const templates = [create_template('networking', [{ name: 'main' }])];
      const profiles = new Map<string, NodeProfileType>();
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }],
      });

      const result = validate_cross_references([cluster], templates, profiles);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect errors from all checks', () => {
      const templates = [create_template('networking', [{ name: 'main' }])];
      const profiles = new Map<string, NodeProfileType>();
      const cluster = create_cluster('prod', {
        templates: [
          { name: 'nonexistent' },
          {
            name: 'networking',
            kustomizations: { bogus: { preservation: { mode: 'none' } } },
          },
        ],
      });
      cluster.nodes = [
        { name: 'node-1', role: 'worker', address: '10.0.0.1', profile: 'missing-profile' },
      ];

      const result = validate_cross_references([cluster], templates, profiles);

      expect(result.valid).toBe(false);
      // missing_template + invalid_kustomization_override + missing_profile
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should validate multiple clusters independently', () => {
      const templates = [create_template('networking')];
      const profiles = new Map<string, NodeProfileType>();
      const cluster1 = create_cluster('prod', {
        templates: [{ name: 'missing1' }],
      });
      const cluster2 = create_cluster('staging', {
        templates: [{ name: 'missing2' }],
      });

      const result = validate_cross_references([cluster1, cluster2], templates, profiles);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]?.cluster).toBe('prod');
      expect(result.errors[1]?.cluster).toBe('staging');
    });
  });
});
