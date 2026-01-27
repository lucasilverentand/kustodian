import { describe, expect, it } from 'bun:test';
import type { ClusterType } from '@kustodian/schema';
import type { ProjectType as ProjectConfigType } from '@kustodian/schema';
import { resolve_defaults } from '../../src/utils/defaults.js';

describe('resolve_defaults', () => {
  it('should use schema defaults when no config provided', () => {
    const cluster: ClusterType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name: 'test' },
      spec: { domain: 'example.com', git: { owner: 'org', repository: 'repo', branch: 'main' } },
    };

    const defaults = resolve_defaults(cluster);

    expect(defaults.flux_namespace).toBe('flux-system');
    expect(defaults.oci_repository_name).toBe('kustodian-oci');
    expect(defaults.oci_registry_secret_name).toBe('kustodian-oci-registry');
    expect(defaults.flux_reconciliation_interval).toBe('10m');
    expect(defaults.flux_reconciliation_timeout).toBe('5m');
  });

  it('should use project defaults when provided', () => {
    const cluster: ClusterType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name: 'test' },
      spec: { domain: 'example.com', git: { owner: 'org', repository: 'repo', branch: 'main' } },
    };

    const project: ProjectConfigType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Project',
      metadata: { name: 'my-project' },
      spec: {
        defaults: {
          flux_namespace: 'gitops-system',
          oci_repository_name: 'my-oci-repo',
        },
      },
    };

    const defaults = resolve_defaults(cluster, project);

    expect(defaults.flux_namespace).toBe('gitops-system');
    expect(defaults.oci_repository_name).toBe('my-oci-repo');
    expect(defaults.oci_registry_secret_name).toBe('kustodian-oci-registry'); // Schema default
  });

  it('should use cluster defaults over project defaults', () => {
    const cluster: ClusterType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name: 'test' },
      spec: {
        domain: 'example.com',
        git: { owner: 'org', repository: 'repo', branch: 'main' },
        defaults: {
          flux_namespace: 'flux-cluster-override',
          flux_reconciliation_interval: '5m',
        },
      },
    };

    const project: ProjectConfigType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Project',
      metadata: { name: 'my-project' },
      spec: {
        defaults: {
          flux_namespace: 'gitops-system',
          oci_repository_name: 'my-oci-repo',
        },
      },
    };

    const defaults = resolve_defaults(cluster, project);

    expect(defaults.flux_namespace).toBe('flux-cluster-override');
    expect(defaults.oci_repository_name).toBe('my-oci-repo'); // Project default
    expect(defaults.flux_reconciliation_interval).toBe('5m'); // Cluster override
    expect(defaults.flux_reconciliation_timeout).toBe('5m'); // Schema default
  });

  it('should handle partial overrides correctly', () => {
    const cluster: ClusterType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Cluster',
      metadata: { name: 'test' },
      spec: {
        domain: 'example.com',
        git: { owner: 'org', repository: 'repo', branch: 'main' },
        defaults: {
          oci_repository_name: 'cluster-oci',
        },
      },
    };

    const project: ProjectConfigType = {
      apiVersion: 'kustodian.io/v1',
      kind: 'Project',
      metadata: { name: 'my-project' },
      spec: {
        defaults: {
          flux_namespace: 'gitops-system',
        },
      },
    };

    const defaults = resolve_defaults(cluster, project);

    expect(defaults.flux_namespace).toBe('gitops-system'); // From project
    expect(defaults.oci_repository_name).toBe('cluster-oci'); // From cluster
    expect(defaults.oci_registry_secret_name).toBe('kustodian-oci-registry'); // Schema
  });
});
