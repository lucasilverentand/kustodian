import type { KustodianErrorType, ResultType } from '../../core/index.js';
import type { TemplateSourceType } from '../../schema/index.js';
import type { FetchOptionsType, FetchResultType, RemoteVersionType } from '../types.js';

/**
 * Base interface for source fetchers.
 * Each source type (git, http, oci) implements this interface.
 */
export interface SourceFetcherType {
  /** Unique identifier for this fetcher type */
  readonly type: 'git' | 'http' | 'oci';

  /**
   * Fetches templates from the source to a temporary directory.
   * The caller is responsible for caching the result.
   */
  fetch(
    source: TemplateSourceType,
    options?: FetchOptionsType,
  ): Promise<ResultType<FetchResultType, KustodianErrorType>>;

  /**
   * Lists available versions from the remote.
   */
  list_versions(
    source: TemplateSourceType,
  ): Promise<ResultType<RemoteVersionType[], KustodianErrorType>>;

  /**
   * Determines if this source reference is mutable.
   */
  is_mutable(source: TemplateSourceType): boolean;
}
