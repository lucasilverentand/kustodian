import { z } from 'zod';

/**
 * Schema for cache entry metadata stored in _meta.json files.
 */
export const cache_meta_schema = z.object({
  source_name: z.string(),
  source_type: z.enum(['git', 'http', 'oci']),
  version: z.string(),
  fetched_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable(),
  checksum: z.string().optional(),
});

export type CacheMetaType = z.infer<typeof cache_meta_schema>;

/**
 * Filename for cache metadata.
 */
export const META_FILENAME = '_meta.json';

/**
 * Directory name for cached templates within a version directory.
 */
export const TEMPLATES_DIRNAME = 'templates';
