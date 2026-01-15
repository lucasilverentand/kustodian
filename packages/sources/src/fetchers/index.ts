export type { SourceFetcherType } from './types.js';
export { create_git_fetcher } from './git.js';
export { create_http_fetcher } from './http.js';
export { create_oci_fetcher } from './oci.js';

import {
  type TemplateSourceType,
  is_git_source,
  is_http_source,
  is_oci_source,
} from '@kustodian/schema';
import { create_git_fetcher } from './git.js';
import { create_http_fetcher } from './http.js';
import { create_oci_fetcher } from './oci.js';
import type { SourceFetcherType } from './types.js';

/**
 * Gets the appropriate fetcher for a source type.
 */
export function get_fetcher_for_source(source: TemplateSourceType): SourceFetcherType {
  if (is_git_source(source)) {
    return create_git_fetcher();
  }
  if (is_http_source(source)) {
    return create_http_fetcher();
  }
  if (is_oci_source(source)) {
    return create_oci_fetcher();
  }
  // This should never happen due to schema validation
  throw new Error(`Unknown source type for source: ${source.name}`);
}
