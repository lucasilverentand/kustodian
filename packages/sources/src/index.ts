// Types
export type {
  CacheEntryType,
  CacheManagerType,
  FetchOptionsType,
  FetchResultType,
  RemoteVersionType,
  ResolvedSourceType,
  ResolverOptionsType,
  SourceFetcherType,
  SourceResolverType,
} from './types.js';

// Cache
export {
  create_cache_manager,
  parse_ttl,
  calculate_expiry,
  is_expired,
  DEFAULT_TTL,
  META_FILENAME,
  TEMPLATES_DIRNAME,
} from './cache/index.js';

// Fetchers
export {
  create_git_fetcher,
  create_http_fetcher,
  create_oci_fetcher,
  get_fetcher_for_source,
} from './fetchers/index.js';

// Resolver
export {
  create_source_resolver,
  DEFAULT_CACHE_DIR,
  type CreateResolverOptionsType,
} from './resolver.js';

// Template loader integration
export {
  load_templates_from_sources,
  type LoadedSourcesResultType,
  type LoadSourcesOptionsType,
  type SourcedTemplateType,
} from './loader.js';
