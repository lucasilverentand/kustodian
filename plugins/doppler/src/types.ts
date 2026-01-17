/**
 * Cluster-level Doppler defaults.
 */
export interface DopplerClusterDefaultsType {
  /** Default project name */
  project?: string | undefined;
  /** Default config name */
  config?: string | undefined;
}

/**
 * Options for the Doppler plugin.
 */
export interface DopplerPluginOptionsType {
  /** Doppler service token (can also be set via DOPPLER_TOKEN env var) */
  token?: string | undefined;
  /** Timeout for CLI operations in milliseconds (default: 30000) */
  timeout?: number | undefined;
  /** Whether to fail on missing secrets (default: true) */
  fail_on_missing?: boolean | undefined;
  /** Cluster-level defaults for project/config */
  cluster_defaults?: DopplerClusterDefaultsType | undefined;
}

/**
 * Parsed Doppler secret reference.
 */
export interface DopplerRefType {
  project: string;
  config: string;
  secret: string;
}

/**
 * Cache key for Doppler project/config combination.
 */
export type DopplerCacheKeyType = `${string}/${string}`;

/**
 * Default timeout for Doppler CLI operations.
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Creates a cache key for a Doppler project/config combination.
 */
export function create_cache_key(project: string, config: string): DopplerCacheKeyType {
  return `${project}/${config}`;
}
