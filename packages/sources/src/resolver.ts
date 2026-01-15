import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type KustodianErrorType, type ResultType, failure, success } from '@kustodian/core';
import { type TemplateSourceType, is_mutable_source } from '@kustodian/schema';
import { type CacheManagerType, create_cache_manager } from './cache/index.js';
import { get_fetcher_for_source } from './fetchers/index.js';
import type {
  FetchOptionsType,
  ResolvedSourceType,
  ResolverOptionsType,
  SourceResolverType,
} from './types.js';

/**
 * Default cache directory relative to project root.
 */
export const DEFAULT_CACHE_DIR = '.kustodian/templates-cache';

/**
 * Options for creating a source resolver.
 */
export interface CreateResolverOptionsType {
  /** Base cache directory (defaults to .kustodian/templates-cache) */
  cache_dir?: string;
}

/**
 * Creates a source resolver instance.
 */
export function create_source_resolver(options?: CreateResolverOptionsType): SourceResolverType {
  const cache_dir = options?.cache_dir ?? path.join(process.cwd(), DEFAULT_CACHE_DIR);
  const cache_manager = create_cache_manager(cache_dir);
  return new SourceResolver(cache_manager);
}

class SourceResolver implements SourceResolverType {
  private readonly cache: CacheManagerType;

  constructor(cache_manager: CacheManagerType) {
    this.cache = cache_manager;
  }

  async resolve_all(
    sources: TemplateSourceType[],
    options?: ResolverOptionsType,
  ): Promise<ResultType<ResolvedSourceType[], KustodianErrorType>> {
    const parallel = options?.parallel ?? true;

    if (parallel) {
      const results = await Promise.all(sources.map((source) => this.resolve(source, options)));

      // Check for first failure
      const resolved: ResolvedSourceType[] = [];
      for (const result of results) {
        if (!result.success) {
          return failure(result.error);
        }
        resolved.push(result.value);
      }
      return success(resolved);
    }

    // Sequential execution
    const resolved: ResolvedSourceType[] = [];
    for (const source of sources) {
      const result = await this.resolve(source, options);
      if (!result.success) {
        return failure(result.error);
      }
      resolved.push(result.value);
    }
    return success(resolved);
  }

  async resolve(
    source: TemplateSourceType,
    options?: FetchOptionsType,
  ): Promise<ResultType<ResolvedSourceType, KustodianErrorType>> {
    const force_refresh = options?.force_refresh ?? false;
    const fetcher = get_fetcher_for_source(source);
    const mutable = is_mutable_source(source);

    // Determine the version to fetch
    const version = this.get_source_version(source);

    // Check cache first (unless force refresh)
    if (!force_refresh) {
      const cached = await this.cache.get(source.name, version);
      if (cached.success && cached.value) {
        return success({
          source,
          fetch_result: {
            path: cached.value.path,
            version: cached.value.version,
            from_cache: true,
            fetched_at: cached.value.fetched_at,
          },
        });
      }
    }

    // Fetch from remote
    const fetch_result = await fetcher.fetch(source, options);
    if (!fetch_result.success) {
      return fetch_result;
    }

    // Store in cache
    const cache_result = await this.cache.put(
      source.name,
      fetcher.type,
      fetch_result.value.version,
      fetch_result.value.path,
      mutable,
      source.ttl,
    );

    if (!cache_result.success) {
      // Log warning but don't fail - we have the content
      console.warn(
        `Warning: Failed to cache source '${source.name}': ${cache_result.error.message}`,
      );
    }

    // If caching succeeded, use the cached path (which is more stable)
    const final_path = cache_result.success ? cache_result.value.path : fetch_result.value.path;

    // Cleanup temp directory if we successfully cached
    if (cache_result.success && fetch_result.value.path !== cache_result.value.path) {
      await fs.rm(fetch_result.value.path, { recursive: true, force: true }).catch(() => {});
    }

    return success({
      source,
      fetch_result: {
        path: final_path,
        version: fetch_result.value.version,
        from_cache: false,
        fetched_at: fetch_result.value.fetched_at,
      },
    });
  }

  async update_all(
    sources: TemplateSourceType[],
  ): Promise<ResultType<ResolvedSourceType[], KustodianErrorType>> {
    return this.resolve_all(sources, { force_refresh: true });
  }

  private get_source_version(source: TemplateSourceType): string {
    if (source.git) {
      const ref = source.git.ref;
      return ref.tag ?? ref.commit ?? ref.branch ?? 'unknown';
    }
    if (source.http) {
      // Use checksum as version if available, otherwise use URL hash
      return source.http.checksum ?? this.hash_url(source.http.url);
    }
    if (source.oci) {
      return source.oci.digest ?? source.oci.tag ?? 'unknown';
    }
    return 'unknown';
  }

  private hash_url(url: string): string {
    // Simple hash for URL-based versioning
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `url-${Math.abs(hash).toString(16)}`;
  }
}
