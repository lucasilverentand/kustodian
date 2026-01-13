import { z } from 'zod';

/**
 * Common API version for all Kustodian resources.
 */
export const api_version_schema = z.literal('kustodian.io/v1');

/**
 * Standard metadata for all Kustodian resources.
 */
export const metadata_schema = z.object({
  name: z.string().min(1),
});

export type MetadataType = z.infer<typeof metadata_schema>;

/**
 * Health check configuration for waiting on resources.
 */
export const health_check_schema = z.object({
  kind: z.string().min(1),
  name: z.string().min(1),
  namespace: z.string().min(1).optional(),
});

export type HealthCheckType = z.infer<typeof health_check_schema>;

/**
 * Registry configuration for version substitutions.
 */
export const registry_config_schema = z.object({
  /** Full image reference: registry/namespace/image or just namespace/image for Docker Hub */
  image: z.string().min(1),
  /** Registry type for API selection */
  type: z.enum(['dockerhub', 'ghcr']).optional(),
});

export type RegistryConfigType = z.infer<typeof registry_config_schema>;

/**
 * Generic substitution (backward compatible, default type).
 */
export const generic_substitution_schema = z.object({
  type: z.literal('generic').optional(),
  name: z.string().min(1),
  default: z.string().optional(),
  secret: z.string().optional(),
});

export type GenericSubstitutionType = z.infer<typeof generic_substitution_schema>;

/**
 * Version substitution for tracking container image versions.
 */
export const version_substitution_schema = z.object({
  type: z.literal('version'),
  name: z.string().min(1),
  default: z.string().optional(),
  /** Semver constraint: ^1.0.0, ~2.3.0, >=1.0.0 <2.0.0 */
  constraint: z.string().optional(),
  /** Registry configuration for fetching available versions */
  registry: registry_config_schema,
  /** Regex pattern for filtering valid tags (default: semver-like) */
  tag_pattern: z.string().optional(),
  /** Exclude pre-release versions (default: true) */
  exclude_prerelease: z.boolean().optional(),
});

export type VersionSubstitutionType = z.infer<typeof version_substitution_schema>;

/**
 * Namespace substitution with Kubernetes naming validation.
 */
export const namespace_substitution_schema = z.object({
  type: z.literal('namespace'),
  name: z.string().min(1),
  default: z.string().optional(),
});

export type NamespaceSubstitutionType = z.infer<typeof namespace_substitution_schema>;

/**
 * Union of all substitution types.
 * Supports backward compatibility: substitutions without 'type' are treated as generic.
 */
export const substitution_schema = z.union([
  version_substitution_schema,
  namespace_substitution_schema,
  generic_substitution_schema,
]);

export type SubstitutionType = z.infer<typeof substitution_schema>;

/**
 * Type guard for version substitutions.
 */
export function is_version_substitution(sub: SubstitutionType): sub is VersionSubstitutionType {
  return 'type' in sub && sub.type === 'version';
}

/**
 * Type guard for namespace substitutions.
 */
export function is_namespace_substitution(sub: SubstitutionType): sub is NamespaceSubstitutionType {
  return 'type' in sub && sub.type === 'namespace';
}

/**
 * Type guard for generic substitutions.
 */
export function is_generic_substitution(sub: SubstitutionType): sub is GenericSubstitutionType {
  return !('type' in sub) || sub.type === 'generic' || sub.type === undefined;
}

/**
 * Namespace configuration with fallback behavior.
 */
export const namespace_config_schema = z.object({
  default: z.string().min(1),
  create: z.boolean().optional().default(true),
});

export type NamespaceConfigType = z.infer<typeof namespace_config_schema>;

/**
 * Key-value pairs for substitution values.
 */
export const values_schema = z.record(z.string(), z.string());

export type ValuesType = z.infer<typeof values_schema>;
