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
