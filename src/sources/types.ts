import type { KustodianErrorType, ResultType } from '../core/index.js';
import type { TemplateSourceType } from '../schema/index.js';

/**
 * Result of a successful fetch operation.
 */
export interface FetchResultType {
  /** Absolute path to the fetched/extracted templates directory */
  path: string;
  /** Version/ref that was fetched (tag, commit, digest, etc.) */
  version: string;
  /** Whether this result came from cache */
  from_cache: boolean;
  /** Timestamp when this was fetched */
  fetched_at: Date;
}

/**
 * Options for fetching sources.
 */
export interface FetchOptionsType {
  /** Force refresh, ignoring cache */
  force_refresh?: boolean;
  /** Target cache directory (defaults to .kustodian/templates-cache) */
  cache_dir?: string;
  /** Custom timeout in milliseconds */
  timeout?: number;
}

/**
 * Version information from a remote source.
 */
export interface RemoteVersionType {
  /** Version identifier (tag name, commit sha, etc.) */
  version: string;
  /** Content digest if available */
  digest?: string;
  /** Date of the version if available */
  date?: Date;
}

/**
 * Cache entry metadata.
 */
export interface CacheEntryType {
  /** Source name from configuration */
  source_name: string;
  /** Source type: git, http, or oci */
  source_type: 'git' | 'http' | 'oci';
  /** Version/ref that was cached */
  version: string;
  /** Absolute path to cached content */
  path: string;
  /** When this was fetched */
  fetched_at: Date;
  /** When this expires (only for mutable refs) */
  expires_at: Date | null;
  /** Content checksum if available */
  checksum?: string;
}

/**
 * Template source fetcher interface.
 * Each source type (git, http, oci) implements this interface.
 */
export interface SourceFetcherType {
  /** Unique identifier for this fetcher type */
  readonly type: 'git' | 'http' | 'oci';

  /**
   * Fetches templates from the source.
   * Returns path to extracted templates directory.
   */
  fetch(
    source: TemplateSourceType,
    options?: FetchOptionsType,
  ): Promise<ResultType<FetchResultType, KustodianErrorType>>;

  /**
   * Lists available versions from the remote.
   * For Git: tags and branches
   * For OCI: tags
   * For HTTP: not applicable (returns empty array)
   */
  list_versions(
    source: TemplateSourceType,
  ): Promise<ResultType<RemoteVersionType[], KustodianErrorType>>;

  /**
   * Determines if this source reference is mutable.
   * Mutable refs (branches, 'latest' tag) need TTL-based refresh.
   * Immutable refs (tags, commits, digests) can be cached forever.
   */
  is_mutable(source: TemplateSourceType): boolean;
}

/**
 * Cache manager interface.
 */
export interface CacheManagerType {
  /** Base cache directory */
  readonly cache_dir: string;

  /**
   * Gets a cached entry if valid (not expired for mutable refs).
   */
  get(
    source_name: string,
    version: string,
  ): Promise<ResultType<CacheEntryType | null, KustodianErrorType>>;

  /**
   * Stores content in cache.
   */
  put(
    source_name: string,
    source_type: 'git' | 'http' | 'oci',
    version: string,
    content_path: string,
    mutable: boolean,
    ttl?: string,
  ): Promise<ResultType<CacheEntryType, KustodianErrorType>>;

  /**
   * Invalidates a specific cache entry.
   * If version is omitted, invalidates all versions for the source.
   */
  invalidate(source_name: string, version?: string): Promise<ResultType<void, KustodianErrorType>>;

  /**
   * Clears all expired entries (mutable refs past their TTL).
   * Returns the number of entries removed.
   */
  prune(): Promise<ResultType<number, KustodianErrorType>>;

  /**
   * Lists all cache entries.
   */
  list(): Promise<ResultType<CacheEntryType[], KustodianErrorType>>;

  /**
   * Gets total cache size in bytes.
   */
  size(): Promise<ResultType<number, KustodianErrorType>>;

  /**
   * Clears all cached content.
   */
  clear(): Promise<ResultType<void, KustodianErrorType>>;
}

/**
 * Resolved source with fetch result.
 */
export interface ResolvedSourceType {
  source: TemplateSourceType;
  fetch_result: FetchResultType;
}

/**
 * Source resolver options.
 */
export interface ResolverOptionsType extends FetchOptionsType {
  /** Run fetches in parallel (default: true) */
  parallel?: boolean;
}

/**
 * Source resolver interface - main entry point for fetching templates.
 */
export interface SourceResolverType {
  /**
   * Resolves and fetches all template sources.
   */
  resolve_all(
    sources: TemplateSourceType[],
    options?: ResolverOptionsType,
  ): Promise<ResultType<ResolvedSourceType[], KustodianErrorType>>;

  /**
   * Resolves and fetches a single source.
   */
  resolve(
    source: TemplateSourceType,
    options?: FetchOptionsType,
  ): Promise<ResultType<ResolvedSourceType, KustodianErrorType>>;

  /**
   * Force updates all sources (ignores cache).
   */
  update_all(
    sources: TemplateSourceType[],
  ): Promise<ResultType<ResolvedSourceType[], KustodianErrorType>>;
}
