import { z } from 'zod';

/**
 * Git reference - exactly one of branch, tag, or commit must be specified.
 */
export const git_ref_schema = z
  .object({
    branch: z.string().min(1).optional(),
    tag: z.string().min(1).optional(),
    commit: z.string().min(1).optional(),
  })
  .refine((data) => [data.branch, data.tag, data.commit].filter(Boolean).length === 1, {
    message: "Exactly one of 'branch', 'tag', or 'commit' must be specified",
  });

export type GitRefType = z.infer<typeof git_ref_schema>;

/**
 * Git source configuration for fetching templates from a Git repository.
 */
export const git_source_schema = z.object({
  url: z.string().url(),
  ref: git_ref_schema,
  path: z.string().optional(),
});

export type GitSourceType = z.infer<typeof git_source_schema>;

/**
 * HTTP archive source configuration for fetching templates from URLs.
 * Supports tar.gz and zip archives.
 */
export const http_source_schema = z.object({
  url: z.string().url(),
  checksum: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type HttpSourceType = z.infer<typeof http_source_schema>;

/**
 * OCI artifact source configuration for pulling templates from OCI registries.
 */
export const oci_source_schema = z
  .object({
    registry: z.string().min(1),
    repository: z.string().min(1),
    tag: z.string().min(1).optional(),
    digest: z.string().min(1).optional(),
  })
  .refine((data) => data.tag || data.digest, {
    message: "Either 'tag' or 'digest' must be specified",
  });

export type OciSourceType = z.infer<typeof oci_source_schema>;

/**
 * Duration format for TTL values.
 * Examples: 30m, 1h, 24h, 7d
 */
export const duration_schema = z.string().regex(/^(\d+)(m|h|d)$/, {
  message: "Duration must be in format: <number>(m|h|d), e.g., '30m', '1h', '7d'",
});

/**
 * Template source configuration - union of all source types.
 * Exactly one of git, http, or oci must be specified.
 */
export const template_source_schema = z
  .object({
    name: z.string().min(1),
    git: git_source_schema.optional(),
    http: http_source_schema.optional(),
    oci: oci_source_schema.optional(),
    ttl: duration_schema.optional(),
  })
  .refine((data) => [data.git, data.http, data.oci].filter(Boolean).length === 1, {
    message: "Exactly one of 'git', 'http', or 'oci' must be specified",
  });

export type TemplateSourceType = z.infer<typeof template_source_schema>;

/**
 * Type guard for Git sources.
 */
export function is_git_source(
  source: TemplateSourceType,
): source is TemplateSourceType & { git: GitSourceType } {
  return source.git !== undefined;
}

/**
 * Type guard for HTTP sources.
 */
export function is_http_source(
  source: TemplateSourceType,
): source is TemplateSourceType & { http: HttpSourceType } {
  return source.http !== undefined;
}

/**
 * Type guard for OCI sources.
 */
export function is_oci_source(
  source: TemplateSourceType,
): source is TemplateSourceType & { oci: OciSourceType } {
  return source.oci !== undefined;
}

/**
 * Determines if a source reference is mutable (requires TTL-based refresh).
 * - Git branches: mutable
 * - Git tags/commits: immutable
 * - HTTP with checksum: immutable
 * - HTTP without checksum: mutable
 * - OCI 'latest' tag: mutable
 * - OCI other tags/digests: immutable
 */
export function is_mutable_source(source: TemplateSourceType): boolean {
  if (is_git_source(source)) {
    return source.git.ref.branch !== undefined;
  }

  if (is_http_source(source)) {
    return source.http.checksum === undefined;
  }

  if (is_oci_source(source)) {
    return source.oci.tag === 'latest' && source.oci.digest === undefined;
  }

  return true;
}

/**
 * Validates a template source object and returns the result.
 */
export function validate_template_source(
  data: unknown,
): z.SafeParseReturnType<unknown, TemplateSourceType> {
  return template_source_schema.safeParse(data);
}
