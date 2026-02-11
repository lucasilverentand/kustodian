import { describe, expect, it } from 'bun:test';

import type { LoadedClusterType } from '../../src/loader/project.js';
import type { ClusterType } from '../../src/schema/index.js';

import {
  validate_cluster_metadata,
  validate_duplicate_plugins,
  validate_duplicate_templates,
  validate_flux_durations,
  validate_git_github_consistency,
  validate_node_addresses,
  validate_node_labels,
  validate_node_names,
  validate_node_roles,
  validate_node_taints,
  validate_oci_format,
  validate_semantics,
  validate_unique_cluster_identifiers,
} from '../../src/generator/validation/semantic.js';

function create_cluster(
  name: string,
  overrides: Partial<ClusterType['spec']> = {},
  metadata_overrides: Partial<ClusterType['metadata']> = {},
): LoadedClusterType {
  return {
    path: `/clusters/${name}`,
    cluster: {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name, ...metadata_overrides },
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

describe('Semantic Validation', () => {
  describe('validate_unique_cluster_identifiers', () => {
    it('should pass with unique cluster names', () => {
      const clusters = [create_cluster('prod'), create_cluster('staging')];

      const errors = validate_unique_cluster_identifiers(clusters);

      expect(errors).toHaveLength(0);
    });

    it('should report duplicate cluster names', () => {
      const clusters = [create_cluster('prod'), create_cluster('prod')];

      const errors = validate_unique_cluster_identifiers(clusters);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('duplicate');
      expect(errors[0]?.field).toBe('metadata.name');
      expect(errors[0]?.message).toContain('prod');
    });

    it('should pass with unique cluster codes', () => {
      const clusters = [
        create_cluster('prod', {}, { code: 'prd' }),
        create_cluster('staging', {}, { code: 'stg' }),
      ];

      const errors = validate_unique_cluster_identifiers(clusters);

      expect(errors).toHaveLength(0);
    });

    it('should report duplicate cluster codes', () => {
      const clusters = [
        create_cluster('prod', {}, { code: 'shared' }),
        create_cluster('staging', {}, { code: 'shared' }),
      ];

      const errors = validate_unique_cluster_identifiers(clusters);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('duplicate');
      expect(errors[0]?.field).toBe('metadata.code');
      expect(errors[0]?.message).toContain('shared');
    });
  });

  describe('validate_cluster_metadata', () => {
    it('should pass when tag_strategy is not cluster', () => {
      const cluster = create_cluster('prod');

      const errors = validate_cluster_metadata(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass when tag_strategy is cluster and code is set', () => {
      const cluster = create_cluster(
        'prod',
        {
          oci: {
            registry: 'ghcr.io',
            repository: 'test/repo',
            tag_strategy: 'cluster',
            provider: 'generic',
            insecure: false,
          },
        },
        { code: 'prd' },
      );

      const errors = validate_cluster_metadata(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report when tag_strategy is cluster but code is missing', () => {
      const cluster = create_cluster('prod', {
        oci: {
          registry: 'ghcr.io',
          repository: 'test/repo',
          tag_strategy: 'cluster',
          provider: 'generic',
          insecure: false,
        },
      });

      const errors = validate_cluster_metadata(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('missing_required');
      expect(errors[0]?.field).toBe('metadata.code');
    });
  });

  describe('validate_oci_format', () => {
    it('should pass with valid registry and repository', () => {
      const cluster = create_cluster('prod');

      const errors = validate_oci_format(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass when cluster has no OCI config', () => {
      const cluster = create_cluster('prod', {
        git: { owner: 'test', repository: 'test', branch: 'main' },
      });
      delete (cluster.cluster.spec as Record<string, unknown>).oci;

      const errors = validate_oci_format(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report when repository starts with /', () => {
      const cluster = create_cluster('prod', {
        oci: {
          registry: 'ghcr.io',
          repository: '/test/repo',
          tag_strategy: 'git-sha',
          provider: 'generic',
          insecure: false,
        },
      });

      const errors = validate_oci_format(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('invalid_format');
      expect(errors[0]?.field).toBe('spec.oci.repository');
    });

    it('should report when registry is not a valid hostname', () => {
      const cluster = create_cluster('prod', {
        oci: {
          registry: 'not a hostname!',
          repository: 'test/repo',
          tag_strategy: 'git-sha',
          provider: 'generic',
          insecure: false,
        },
      });

      const errors = validate_oci_format(cluster);

      expect(errors.some((e) => e.field === 'spec.oci.registry')).toBe(true);
    });

    it('should accept registry with port', () => {
      const cluster = create_cluster('prod', {
        oci: {
          registry: 'localhost:5000',
          repository: 'test/repo',
          tag_strategy: 'git-sha',
          provider: 'generic',
          insecure: false,
        },
      });

      const errors = validate_oci_format(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report when tag_strategy is manual but no tag is set', () => {
      const cluster = create_cluster('prod', {
        oci: {
          registry: 'ghcr.io',
          repository: 'test/repo',
          tag_strategy: 'manual',
          provider: 'generic',
          insecure: false,
        },
      });

      const errors = validate_oci_format(cluster);

      expect(errors.some((e) => e.field === 'spec.oci.tag')).toBe(true);
      expect(errors.some((e) => e.message.includes('manual'))).toBe(true);
    });

    it('should pass when tag_strategy is manual and tag is set', () => {
      const cluster = create_cluster('prod', {
        oci: {
          registry: 'ghcr.io',
          repository: 'test/repo',
          tag_strategy: 'manual',
          tag: 'v1.0.0',
          provider: 'generic',
          insecure: false,
        },
      });

      const errors = validate_oci_format(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_git_github_consistency', () => {
    it('should pass when only git is configured', () => {
      const cluster = create_cluster('prod', {
        git: { owner: 'org', repository: 'repo', branch: 'main' },
      });

      const errors = validate_git_github_consistency(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass when only github is configured', () => {
      const cluster = create_cluster('prod', {
        github: { organization: 'org', repository: 'repo', branch: 'main' },
      });

      const errors = validate_git_github_consistency(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass when git and github branches match', () => {
      const cluster = create_cluster('prod', {
        git: { owner: 'org', repository: 'repo', branch: 'main' },
        github: { organization: 'org', repository: 'repo', branch: 'main' },
      });

      const errors = validate_git_github_consistency(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report when git and github branches differ', () => {
      const cluster = create_cluster('prod', {
        git: { owner: 'org', repository: 'repo', branch: 'main' },
        github: { organization: 'org', repository: 'repo', branch: 'develop' },
      });

      const errors = validate_git_github_consistency(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('inconsistency');
      expect(errors[0]?.message).toContain('main');
      expect(errors[0]?.message).toContain('develop');
    });
  });

  describe('validate_flux_durations', () => {
    it('should pass with valid Go durations', () => {
      const cluster = create_cluster('prod', {
        defaults: {
          flux_reconciliation_interval: '5m',
          flux_reconciliation_timeout: '3m',
        },
      });

      const errors = validate_flux_durations(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should accept compound durations', () => {
      const cluster = create_cluster('prod', {
        defaults: {
          flux_reconciliation_interval: '1h30m',
        },
      });

      const errors = validate_flux_durations(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should accept millisecond durations', () => {
      const cluster = create_cluster('prod', {
        defaults: {
          flux_reconciliation_interval: '500ms',
        },
      });

      const errors = validate_flux_durations(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report invalid duration formats', () => {
      const cluster = create_cluster('prod', {
        defaults: {
          flux_reconciliation_interval: 'five-minutes',
          flux_reconciliation_timeout: '3x',
        },
      });

      const errors = validate_flux_durations(cluster);

      expect(errors).toHaveLength(2);
      expect(errors.every((e) => e.type === 'invalid_format')).toBe(true);
    });

    it('should validate flux controller requeue_dependency', () => {
      const cluster = create_cluster('prod', {
        flux: {
          controllers: {
            requeue_dependency: 'invalid',
          },
        },
      });

      const errors = validate_flux_durations(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe('spec.flux.controllers.requeue_dependency');
    });

    it('should pass when no duration fields are set', () => {
      const cluster = create_cluster('prod');

      const errors = validate_flux_durations(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_duplicate_templates', () => {
    it('should pass with unique template names', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }, { name: 'monitoring' }],
      });

      const errors = validate_duplicate_templates(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report duplicate template names', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'networking' }, { name: 'networking' }],
      });

      const errors = validate_duplicate_templates(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('duplicate');
      expect(errors[0]?.field).toBe('spec.templates');
      expect(errors[0]?.message).toContain('networking');
    });

    it('should pass when no templates defined', () => {
      const cluster = create_cluster('prod');

      const errors = validate_duplicate_templates(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_duplicate_plugins', () => {
    it('should pass with unique plugin names', () => {
      const cluster = create_cluster('prod', {
        plugins: [{ name: 'k0s' }, { name: 'talos' }],
      });

      const errors = validate_duplicate_plugins(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report duplicate plugin names', () => {
      const cluster = create_cluster('prod', {
        plugins: [{ name: 'k0s' }, { name: 'k0s' }],
      });

      const errors = validate_duplicate_plugins(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('duplicate');
      expect(errors[0]?.field).toBe('spec.plugins');
      expect(errors[0]?.message).toContain('k0s');
    });

    it('should pass when no plugins defined', () => {
      const cluster = create_cluster('prod');

      const errors = validate_duplicate_plugins(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_node_names', () => {
    it('should pass with unique node names', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'controller', address: '10.0.0.1' },
        { name: 'node-2', role: 'worker', address: '10.0.0.2' },
      ];

      const errors = validate_node_names(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report duplicate node names', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'controller', address: '10.0.0.1' },
        { name: 'node-1', role: 'worker', address: '10.0.0.2' },
      ];

      const errors = validate_node_names(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('duplicate');
      expect(errors[0]?.message).toContain('node-1');
    });

    it('should pass when no nodes defined', () => {
      const cluster = create_cluster('prod');

      const errors = validate_node_names(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_node_addresses', () => {
    it('should pass with valid unique IPv4 addresses', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'controller', address: '10.0.0.1' },
        { name: 'node-2', role: 'worker', address: '10.0.0.2' },
      ];

      const errors = validate_node_addresses(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass with valid hostnames', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'controller', address: 'node-1.example.com' },
        { name: 'node-2', role: 'worker', address: 'node-2.example.com' },
      ];

      const errors = validate_node_addresses(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass with valid IPv6 addresses', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'controller', address: '::1' },
        { name: 'node-2', role: 'worker', address: 'fe80::1' },
      ];

      const errors = validate_node_addresses(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report duplicate addresses', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'controller', address: '10.0.0.1' },
        { name: 'node-2', role: 'worker', address: '10.0.0.1' },
      ];

      const errors = validate_node_addresses(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('duplicate');
      expect(errors[0]?.message).toContain('10.0.0.1');
    });

    it('should report invalid addresses', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'controller', address: '999.999.999.999' }];

      const errors = validate_node_addresses(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('invalid_format');
    });

    it('should report addresses with leading zeros', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'controller', address: '010.0.0.1' }];

      const errors = validate_node_addresses(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('invalid_format');
    });
  });

  describe('validate_node_roles', () => {
    it('should pass when controller node exists', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'controller', address: '10.0.0.1' },
        { name: 'node-2', role: 'worker', address: '10.0.0.2' },
      ];

      const errors = validate_node_roles(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass when controller+worker node exists', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'controller+worker', address: '10.0.0.1' }];

      const errors = validate_node_roles(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report when only workers exist', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        { name: 'node-1', role: 'worker', address: '10.0.0.1' },
        { name: 'node-2', role: 'worker', address: '10.0.0.2' },
      ];

      const errors = validate_node_roles(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('missing_required');
      expect(errors[0]?.message).toContain('controller');
    });

    it('should pass when no nodes are defined', () => {
      const cluster = create_cluster('prod');

      const errors = validate_node_roles(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_node_labels', () => {
    it('should pass with valid Kubernetes labels', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          labels: { 'app.kubernetes.io/name': 'test', role: 'gpu' },
        },
      ];

      const errors = validate_node_labels(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should pass with empty label value', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          labels: { role: '' },
        },
      ];

      const errors = validate_node_labels(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report invalid label keys', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          labels: { 'invalid key with spaces': 'value' },
        },
      ];

      const errors = validate_node_labels(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('invalid_format');
      expect(errors[0]?.message).toContain('label key');
    });

    it('should report label values exceeding 63 characters', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          labels: { role: 'a'.repeat(64) },
        },
      ];

      const errors = validate_node_labels(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('invalid_format');
      expect(errors[0]?.message).toContain('label value');
    });

    it('should pass when nodes have no labels', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'controller', address: '10.0.0.1' }];

      const errors = validate_node_labels(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report label key with multiple slashes', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          labels: { 'a/b/c': 'value' },
        },
      ];

      const errors = validate_node_labels(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('invalid_format');
    });

    it('should accept boolean and numeric label values', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          labels: { gpu: true, count: 4 },
        },
      ];

      const errors = validate_node_labels(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_node_taints', () => {
    it('should pass with unique taints', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          taints: [
            { key: 'dedicated', value: 'gpu', effect: 'NoSchedule' },
            { key: 'dedicated', value: 'gpu', effect: 'NoExecute' },
          ],
        },
      ];

      const errors = validate_node_taints(cluster);

      expect(errors).toHaveLength(0);
    });

    it('should report duplicate taints (same key + effect)', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [
        {
          name: 'node-1',
          role: 'controller',
          address: '10.0.0.1',
          taints: [
            { key: 'dedicated', value: 'gpu', effect: 'NoSchedule' },
            { key: 'dedicated', value: 'other', effect: 'NoSchedule' },
          ],
        },
      ];

      const errors = validate_node_taints(cluster);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('duplicate');
      expect(errors[0]?.message).toContain('dedicated');
      expect(errors[0]?.message).toContain('NoSchedule');
    });

    it('should pass when nodes have no taints', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'controller', address: '10.0.0.1' }];

      const errors = validate_node_taints(cluster);

      expect(errors).toHaveLength(0);
    });
  });

  describe('validate_semantics (orchestrator)', () => {
    it('should pass when everything is valid', () => {
      const cluster = create_cluster('prod');
      cluster.nodes = [{ name: 'node-1', role: 'controller', address: '10.0.0.1' }];

      const result = validate_semantics([cluster]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect errors from multiple checks', () => {
      const cluster = create_cluster('prod', {
        templates: [{ name: 'net' }, { name: 'net' }],
        defaults: {
          flux_reconciliation_interval: 'bad',
        },
      });
      cluster.nodes = [
        { name: 'node-1', role: 'worker', address: '10.0.0.1' },
        { name: 'node-1', role: 'worker', address: '10.0.0.1' },
      ];

      const result = validate_semantics([cluster]);

      expect(result.valid).toBe(false);
      // At least: duplicate template + invalid duration + duplicate node name + duplicate address + missing controller
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('should validate across multiple clusters', () => {
      const cluster1 = create_cluster('prod');
      const cluster2 = create_cluster('prod');

      const result = validate_semantics([cluster1, cluster2]);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'duplicate' && e.field === 'metadata.name')).toBe(
        true,
      );
    });
  });
});
