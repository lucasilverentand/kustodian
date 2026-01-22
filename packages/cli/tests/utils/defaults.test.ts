import { describe, expect, test } from 'bun:test';
import type { ClusterType } from '@kustodian/schema';

import { resolve_defaults } from '../../src/utils/defaults.js';

describe('Defaults Resolution', () => {
  describe('resolve_defaults', () => {
    test('should use default values when no defaults are specified', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test-cluster' },
        spec: {
          domain: 'example.com',
          oci: {
            registry: 'ghcr.io',
            repository: 'test/repo',
            tag_strategy: 'git-sha',
            provider: 'generic',
            insecure: false,
          },
        },
      };

      const result = resolve_defaults(cluster);

      expect(result.flux_namespace).toBe('flux-system');
      expect(result.oci_registry_secret_name).toBe('kustodian-oci-registry');
    });

    test('should use custom flux_namespace when specified', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test-cluster' },
        spec: {
          domain: 'example.com',
          defaults: {
            flux_namespace: 'custom-flux',
            oci_registry_secret_name: 'kustodian-oci-registry',
          },
          oci: {
            registry: 'ghcr.io',
            repository: 'test/repo',
            tag_strategy: 'git-sha',
            provider: 'generic',
            insecure: false,
          },
        },
      };

      const result = resolve_defaults(cluster);

      expect(result.flux_namespace).toBe('custom-flux');
      expect(result.oci_registry_secret_name).toBe('kustodian-oci-registry');
    });

    test('should use custom oci_registry_secret_name when specified', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test-cluster' },
        spec: {
          domain: 'example.com',
          defaults: {
            flux_namespace: 'flux-system',
            oci_registry_secret_name: 'custom-oci-secret',
          },
          oci: {
            registry: 'ghcr.io',
            repository: 'test/repo',
            tag_strategy: 'git-sha',
            provider: 'generic',
            insecure: false,
          },
        },
      };

      const result = resolve_defaults(cluster);

      expect(result.flux_namespace).toBe('flux-system');
      expect(result.oci_registry_secret_name).toBe('custom-oci-secret');
    });

    test('should use all custom defaults when all are specified', () => {
      const cluster: ClusterType = {
        apiVersion: 'kustodian.io/v1',
        kind: 'Cluster',
        metadata: { name: 'test-cluster' },
        spec: {
          domain: 'example.com',
          defaults: {
            flux_namespace: 'gitops-system',
            oci_registry_secret_name: 'my-registry-auth',
          },
          oci: {
            registry: 'ghcr.io',
            repository: 'test/repo',
            tag_strategy: 'git-sha',
            provider: 'generic',
            insecure: false,
          },
        },
      };

      const result = resolve_defaults(cluster);

      expect(result.flux_namespace).toBe('gitops-system');
      expect(result.oci_registry_secret_name).toBe('my-registry-auth');
    });
  });
});
