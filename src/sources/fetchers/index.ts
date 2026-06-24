export { create_git_fetcher } from './git.js';
export { create_http_fetcher } from './http.js';
export { create_oci_fetcher } from './oci.js';
export type { SourceFetcherType } from './types.js';

import {
  Errors,
  type KustodianErrorType,
  type ResultType,
  failure,
  success,
} from '../../core/index.js';
import {
  type TemplateSourceType,
  is_git_source,
  is_http_source,
  is_oci_source,
  normalize_template_source,
} from '../../schema/index.js';
import { create_git_fetcher } from './git.js';
import { create_http_fetcher } from './http.js';
import { create_oci_fetcher } from './oci.js';
import type { SourceFetcherType } from './types.js';

/**
 * Gets the appropriate fetcher for a source type. The source is normalized
 * first, so GitHub sources are dispatched to the Git fetcher.
 */
export function get_fetcher_for_source(
  source: TemplateSourceType,
): ResultType<SourceFetcherType, KustodianErrorType> {
  const normalized = normalize_template_source(source);

  if (is_git_source(normalized)) {
    return success(create_git_fetcher());
  }
  if (is_http_source(normalized)) {
    return success(create_http_fetcher());
  }
  if (is_oci_source(normalized)) {
    return success(create_oci_fetcher());
  }
  return failure(
    Errors.invalid_argument('source', `Unknown source type for source: ${source.name}`),
  );
}
