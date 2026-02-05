import type { ClusterType, ProjectType as ProjectConfigType } from '../../schema/index.js';

/**
 * Schema-level defaults (hardcoded fallbacks).
 * These match the current behavior for 100% backward compatibility.
 */
const SCHEMA_DEFAULTS = {
  flux_namespace: 'flux-system',
  oci_repository_name: 'kustodian-oci',
  oci_registry_secret_name: 'kustodian-oci-registry',
  flux_reconciliation_interval: '10m',
  flux_reconciliation_timeout: '5m',
} as const;

/**
 * Resolved defaults for a cluster with all values guaranteed to be defined.
 */
export interface ResolvedDefaultsType {
  flux_namespace: string;
  oci_repository_name: string;
  oci_registry_secret_name: string;
  flux_reconciliation_interval: string;
  flux_reconciliation_timeout: string;
}

/**
 * Resolves defaults for a cluster using three-tier cascading:
 * 1. Cluster spec.defaults (highest priority)
 * 2. Project spec.defaults
 * 3. Schema defaults (hardcoded fallbacks)
 *
 * @param cluster - The cluster configuration
 * @param project_config - Optional project configuration from kustodian.yaml
 * @returns Resolved defaults with all values defined
 */
export function resolve_defaults(
  cluster: ClusterType,
  project_config?: ProjectConfigType,
): ResolvedDefaultsType {
  const project_defaults = project_config?.spec?.defaults || {};
  const cluster_defaults = cluster.spec.defaults || {};

  return {
    flux_namespace:
      cluster_defaults.flux_namespace ||
      project_defaults.flux_namespace ||
      SCHEMA_DEFAULTS.flux_namespace,

    oci_repository_name:
      cluster_defaults.oci_repository_name ||
      project_defaults.oci_repository_name ||
      SCHEMA_DEFAULTS.oci_repository_name,

    oci_registry_secret_name:
      cluster_defaults.oci_registry_secret_name ||
      project_defaults.oci_registry_secret_name ||
      SCHEMA_DEFAULTS.oci_registry_secret_name,

    flux_reconciliation_interval:
      cluster_defaults.flux_reconciliation_interval ||
      project_defaults.flux_reconciliation_interval ||
      SCHEMA_DEFAULTS.flux_reconciliation_interval,

    flux_reconciliation_timeout:
      cluster_defaults.flux_reconciliation_timeout ||
      project_defaults.flux_reconciliation_timeout ||
      SCHEMA_DEFAULTS.flux_reconciliation_timeout,
  };
}
