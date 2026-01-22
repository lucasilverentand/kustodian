import type { ClusterType } from '@kustodian/schema';

/**
 * Resolved defaults for a cluster with all values guaranteed to be defined.
 */
export interface ResolvedDefaultsType {
  flux_namespace: string;
  oci_registry_secret_name: string;
}

/**
 * Resolves defaults for a cluster.
 * Merges cluster-level overrides with schema defaults.
 *
 * Resolution order:
 * 1. Cluster spec.defaults (if present)
 * 2. Schema defaults (from defaults_config_schema)
 *
 * @param cluster - The cluster configuration
 * @returns Resolved defaults with all values defined
 */
export function resolve_defaults(cluster: ClusterType): ResolvedDefaultsType {
  // Schema defaults are already applied by Zod, so we can safely use them
  // If cluster.spec.defaults is not provided, we fall back to hardcoded values
  // that match the schema defaults for backward compatibility
  const defaults = cluster.spec.defaults || {
    flux_namespace: 'flux-system',
    oci_registry_secret_name: 'kustodian-oci-registry',
  };

  return {
    flux_namespace: defaults.flux_namespace || 'flux-system',
    oci_registry_secret_name: defaults.oci_registry_secret_name || 'kustodian-oci-registry',
  };
}
