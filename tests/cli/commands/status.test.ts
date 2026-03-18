import { describe, it } from 'bun:test';

import { print_cluster_status } from '../../../src/cli/commands/status.js';
import type { ClusterFluxStatusType } from '../../../src/k8s/flux-operator.js';

describe('status command', () => {
  describe('print_cluster_status', () => {
    it('should handle not-installed flux', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: false,
        components: [],
        kustomizations: [],
        summary: { total: 0, healthy: 0, unhealthy: 0, suspended: 0 },
      };

      // Should not throw
      print_cluster_status('test-cluster', status);
    });

    it('should handle fully healthy cluster', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        flux_version: '2.3.0',
        components: [
          { name: 'source-controller', ready: true },
          { name: 'kustomize-controller', ready: true },
        ],
        oci_repository: {
          name: 'kustodian-oci',
          namespace: 'flux-system',
          suspended: false,
          ready: true,
          revision: 'sha1:abc123',
        },
        kustomizations: [
          {
            name: 'app',
            namespace: 'flux-system',
            suspended: false,
            ready: true,
            healthy: true,
            last_applied_revision: 'sha1:abc123',
            has_failed_revision: false,
          },
        ],
        summary: { total: 1, healthy: 1, unhealthy: 0, suspended: 0 },
      };

      // Should not throw
      print_cluster_status('prod', status);
    });

    it('should handle unhealthy kustomizations with error details', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        components: [{ name: 'source-controller', ready: true }],
        kustomizations: [
          {
            name: 'failing-app',
            namespace: 'flux-system',
            suspended: false,
            ready: false,
            healthy: false,
            ready_reason: 'HealthCheckFailed',
            ready_message:
              'health check failed for deployment/nginx: timeout waiting for condition',
            healthy_message: 'deployment nginx unhealthy',
            last_applied_revision: 'sha1:old111',
            last_attempted_revision: 'sha1:new222',
            has_failed_revision: true,
          },
        ],
        summary: { total: 1, healthy: 0, unhealthy: 1, suspended: 0 },
      };

      // Should not throw and should include tip about rollback
      print_cluster_status('prod', status);
    });

    it('should handle suspended kustomizations', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        components: [{ name: 'source-controller', ready: true }],
        kustomizations: [
          {
            name: 'suspended-app',
            namespace: 'flux-system',
            suspended: true,
            ready: false,
            healthy: null,
            has_failed_revision: false,
          },
        ],
        summary: { total: 1, healthy: 0, unhealthy: 0, suspended: 1 },
      };

      // Should not throw
      print_cluster_status('prod', status);
    });

    it('should handle missing OCI repository', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        components: [],
        kustomizations: [],
        summary: { total: 0, healthy: 0, unhealthy: 0, suspended: 0 },
      };

      // Should not throw, should use fallback name
      print_cluster_status('prod', status, 'kustodian-oci');
    });

    it('should handle suspended OCI repository', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        components: [],
        oci_repository: {
          name: 'kustodian-oci',
          namespace: 'flux-system',
          suspended: true,
          ready: false,
        },
        kustomizations: [],
        summary: { total: 0, healthy: 0, unhealthy: 0, suspended: 0 },
      };

      // Should not throw
      print_cluster_status('prod', status);
    });

    it('should handle empty kustomizations list', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        flux_version: '2.3.0',
        components: [{ name: 'source-controller', ready: true }],
        kustomizations: [],
        summary: { total: 0, healthy: 0, unhealthy: 0, suspended: 0 },
      };

      // Should not throw
      print_cluster_status('prod', status);
    });

    it('should handle mixed kustomization states', () => {
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        components: [{ name: 'source-controller', ready: true }],
        kustomizations: [
          {
            name: 'healthy-app',
            namespace: 'flux-system',
            suspended: false,
            ready: true,
            healthy: true,
            has_failed_revision: false,
          },
          {
            name: 'unhealthy-app',
            namespace: 'flux-system',
            suspended: false,
            ready: true,
            healthy: false,
            healthy_message: 'deployment failing',
            has_failed_revision: false,
          },
          {
            name: 'failing-app',
            namespace: 'flux-system',
            suspended: false,
            ready: false,
            healthy: null,
            ready_reason: 'ReconciliationFailed',
            ready_message: 'apply failed',
            has_failed_revision: false,
          },
          {
            name: 'paused-app',
            namespace: 'flux-system',
            suspended: true,
            ready: false,
            healthy: null,
            has_failed_revision: false,
          },
        ],
        summary: { total: 4, healthy: 2, unhealthy: 1, suspended: 1 },
      };

      // Should not throw
      print_cluster_status('prod', status);
    });

    it('should truncate long revisions', () => {
      const long_revision = `sha1:${'a'.repeat(80)}`;
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        components: [],
        kustomizations: [
          {
            name: 'app',
            namespace: 'flux-system',
            suspended: false,
            ready: true,
            healthy: true,
            last_applied_revision: long_revision,
            has_failed_revision: false,
          },
        ],
        summary: { total: 1, healthy: 1, unhealthy: 0, suspended: 0 },
      };

      // Should not throw (truncation happens inside)
      print_cluster_status('prod', status);
    });

    it('should truncate long error messages', () => {
      const long_message = `Error: ${'x'.repeat(200)}`;
      const status: ClusterFluxStatusType = {
        flux_installed: true,
        components: [],
        kustomizations: [
          {
            name: 'app',
            namespace: 'flux-system',
            suspended: false,
            ready: false,
            healthy: null,
            ready_reason: 'Failed',
            ready_message: long_message,
            has_failed_revision: false,
          },
        ],
        summary: { total: 1, healthy: 0, unhealthy: 1, suspended: 0 },
      };

      // Should not throw (truncation happens inside)
      print_cluster_status('prod', status);
    });
  });
});
