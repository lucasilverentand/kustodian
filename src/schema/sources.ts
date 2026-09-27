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
 * Object form of a GitHub source: `{ repo: 'owner/name', ref: { tag: 'v1' }, path? }`.
 *
 * The repo is `owner/name`. Sub-paths into the repo are passed as `path`,
 * which lets a single repo host either one template (root) or many (one
 * per subdirectory).
 */
export const github_source_object_schema = z.object({
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "GitHub repo must be in the form 'owner/name'"),
  ref: git_ref_schema,
  path: z.string().optional(),
});

export type GitHubSourceObjectType = z.infer<typeof github_source_object_schema>;

/**
 * Parses a GitHub shorthand string into the object form.
 *
 * Accepted forms:
 * - `owner/repo@v1.2.3`         — tag (anything that looks like a semver tag)
 * - `owner/repo@main`           — branch (any other ref)
 * - `owner/repo@<40-hex>`       — full commit SHA
 * - `owner/repo@ref:sub/path`   — with sub-path inside the repo
 *
 * The ref kind (tag vs branch vs commit) is inferred:
 * - 40-character hex strings are treated as commits
 * - strings matching `v?\d+...` are treated as tags
 * - everything else is treated as a branch
 */
function parse_github_shorthand(input: string): GitHubSourceObjectType {
  const at = input.indexOf('@');
  if (at < 0) {
    throw new Error(
      `GitHub shorthand must include a ref: 'owner/repo@<branch|tag|commit>[:path]', got '${input}'`,
    );
  }

  const repo = input.slice(0, at);
  const rest = input.slice(at + 1);

  // Sub-path is separated by ':' after the ref
  const colon = rest.indexOf(':');
  const ref_str = colon < 0 ? rest : rest.slice(0, colon);
  const path = colon < 0 ? undefined : rest.slice(colon + 1);

  if (!repo || !ref_str) {
    throw new Error(
      `GitHub shorthand must be 'owner/repo@<branch|tag|commit>[:path]', got '${input}'`,
    );
  }

  let ref: GitRefType;
  if (/^[0-9a-f]{40}$/i.test(ref_str)) {
    ref = { commit: ref_str };
  } else if (/^v?\d+(\.\d+)*([.-].+)?$/.test(ref_str)) {
    ref = { tag: ref_str };
  } else {
    ref = { branch: ref_str };
  }

  return path ? { repo, ref, path } : { repo, ref };
}

/**
 * GitHub source configuration. Accepts either a structured object or a
 * shorthand string of the form `owner/repo@ref[:path]`.
 *
 * Internally normalized to a Git source pointing at
 * `https://github.com/<owner>/<repo>.git`.
 */
export const github_source_schema = z.union([
  github_source_object_schema,
  z.string().transform((value, ctx): GitHubSourceObjectType => {
    try {
      return parse_github_shorthand(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Invalid GitHub shorthand',
      });
      return z.NEVER;
    }
  }),
]);

export type GitHubSourceType = z.infer<typeof github_source_schema>;

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
 * Exactly one of git, github, http, or oci must be specified.
 */
export const template_source_schema = z
  .object({
    name: z.string().min(1),
    git: git_source_schema.optional(),
    github: github_source_schema.optional(),
    http: http_source_schema.optional(),
    oci: oci_source_schema.optional(),
    ttl: duration_schema.optional(),
  })
  .refine((data) => [data.git, data.github, data.http, data.oci].filter(Boolean).length === 1, {
    message: "Exactly one of 'git', 'github', 'http', or 'oci' must be specified",
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
 * Type guard for GitHub sources.
 */
export function is_github_source(
  source: TemplateSourceType,
): source is TemplateSourceType & { github: GitHubSourceType } {
  return source.github !== undefined;
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
 * - GitHub branches: mutable
 * - GitHub tags/commits: immutable
 * - HTTP with checksum: immutable
 * - HTTP without checksum: mutable
 * - OCI 'latest' tag: mutable
 * - OCI other tags/digests: immutable
 */
export function is_mutable_source(source: TemplateSourceType): boolean {
  const normalized = normalize_template_source(source);

  if (is_git_source(normalized)) {
    return normalized.git.ref.branch !== undefined;
  }

  if (is_http_source(normalized)) {
    return normalized.http.checksum === undefined;
  }

  if (is_oci_source(normalized)) {
    return normalized.oci.tag === 'latest' && normalized.oci.digest === undefined;
  }

  return true;
}

/**
 * Normalizes a template source so downstream code only sees `git`, `http`,
 * or `oci` variants. GitHub sources are rewritten to a Git source pointing
 * at `https://github.com/<owner>/<repo>.git`.
 *
 * Idempotent: passing an already-normalized source returns it unchanged.
 */
export function normalize_template_source(source: TemplateSourceType): TemplateSourceType {
  if (!is_github_source(source)) {
    return source;
  }

  const gh = source.github;

  const git: GitSourceType = {
    url: `https://github.com/${gh.repo}.git`,
    ref: gh.ref,
    ...(gh.path !== undefined ? { path: gh.path } : {}),
  };

  const normalized: TemplateSourceType = {
    name: source.name,
    git,
    ...(source.ttl !== undefined ? { ttl: source.ttl } : {}),
  };

  return normalized;
}

/**
 * Validates a template source object and returns the result.
 */
export function validate_template_source(
  data: unknown,
): z.SafeParseReturnType<unknown, TemplateSourceType> {
  return template_source_schema.safeParse(data);
}
