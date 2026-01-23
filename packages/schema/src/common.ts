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
  api_version: z.string().min(1).optional(),
});

export type HealthCheckType = z.infer<typeof health_check_schema>;

/**
 * Health check expression configuration using CEL (Common Expression Language).
 * Supports custom health check conditions via CEL expressions.
 */
export const health_check_expr_schema = z.object({
  api_version: z.string().min(1),
  kind: z.string().min(1),
  namespace: z.string().min(1).optional(),
  /** CEL expression for when resource is healthy/current */
  current: z.string().min(1).optional(),
  /** CEL expression for when resource has failed */
  failed: z.string().min(1).optional(),
});

export type HealthCheckExprType = z.infer<typeof health_check_expr_schema>;

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
 * Helm repository configuration for helm chart version substitutions.
 * Supports both traditional Helm repositories and OCI registries.
 */
export const helm_config_schema = z
  .object({
    /** Helm chart repository URL (e.g., https://traefik.github.io/charts) */
    repository: z.string().url().optional(),
    /** OCI registry URL for Helm charts (e.g., oci://ghcr.io/traefik/helm) */
    oci: z.string().startsWith('oci://').optional(),
    /** Chart name */
    chart: z.string().min(1),
  })
  .refine(
    (data) => {
      // Either repository or oci must be provided
      return data.repository !== undefined || data.oci !== undefined;
    },
    {
      message: "Either 'repository' or 'oci' must be specified",
    },
  );

export type HelmConfigType = z.infer<typeof helm_config_schema>;

/**
 * Base fields shared by all version entries in spec.versions.
 */
const version_entry_base_schema = z.object({
  name: z.string().min(1),
  default: z.string().optional(),
  /** Semver constraint: ^1.0.0, ~2.3.0, >=1.0.0 <2.0.0 */
  constraint: z.string().optional(),
  /** Regex pattern for filtering valid tags */
  tag_pattern: z.string().optional(),
  /** Exclude pre-release versions (default: true) */
  exclude_prerelease: z.boolean().optional(),
});

/**
 * Image version entry - tracks container image versions.
 * Used in template spec.versions for shared version tracking.
 */
export const image_version_entry_schema = version_entry_base_schema.extend({
  registry: registry_config_schema,
});

export type ImageVersionEntryType = z.infer<typeof image_version_entry_schema>;

/**
 * Helm version entry - tracks Helm chart versions.
 * Used in template spec.versions for shared version tracking.
 */
export const helm_version_entry_schema = version_entry_base_schema.extend({
  helm: helm_config_schema,
});

export type HelmVersionEntryType = z.infer<typeof helm_version_entry_schema>;

/**
 * Version entry - either an image or helm version.
 * Discriminated by presence of `registry` (image) vs `helm` (chart) field.
 */
export const version_entry_schema = z.union([
  image_version_entry_schema,
  helm_version_entry_schema,
]);

export type VersionEntryType = z.infer<typeof version_entry_schema>;

/**
 * Type guard for image version entries.
 */
export function is_image_version_entry(entry: VersionEntryType): entry is ImageVersionEntryType {
  return 'registry' in entry;
}

/**
 * Type guard for helm version entries.
 */
export function is_helm_version_entry(entry: VersionEntryType): entry is HelmVersionEntryType {
  return 'helm' in entry;
}

/**
 * Generic substitution (backward compatible, default type).
 */
export const generic_substitution_schema = z.object({
  type: z.literal('generic').optional(),
  name: z.string().min(1),
  default: z.string().optional(),
  secret: z.string().optional(),
  preserve_case: z.boolean().optional(),
});

export type GenericSubstitutionType = z.infer<typeof generic_substitution_schema>;

/**
 * Version substitution for tracking container image versions.
 * Registry is optional for simple version substitutions that just use default values.
 */
export const version_substitution_schema = z.object({
  type: z.literal('version'),
  name: z.string().min(1),
  default: z.string().optional(),
  /** Semver constraint: ^1.0.0, ~2.3.0, >=1.0.0 <2.0.0 */
  constraint: z.string().optional(),
  /** Registry configuration for fetching available versions (optional for simple substitutions) */
  registry: registry_config_schema.optional(),
  /** Regex pattern for filtering valid tags (default: semver-like) */
  tag_pattern: z.string().optional(),
  /** Exclude pre-release versions (default: true) */
  exclude_prerelease: z.boolean().optional(),
});

export type VersionSubstitutionType = z.infer<typeof version_substitution_schema>;

/**
 * Helm chart version substitution for tracking Helm chart versions.
 * Helm config is optional for simple substitutions that just use default values.
 */
export const helm_substitution_schema = z.object({
  type: z.literal('helm'),
  name: z.string().min(1),
  default: z.string().optional(),
  /** Semver constraint: ^1.0.0, ~2.3.0, >=1.0.0 <2.0.0 */
  constraint: z.string().optional(),
  /** Helm repository configuration for fetching available chart versions (optional for simple substitutions) */
  helm: helm_config_schema.optional(),
  /** Regex pattern for filtering valid tags (default: semver-like) */
  tag_pattern: z.string().optional(),
  /** Exclude pre-release versions (default: true) */
  exclude_prerelease: z.boolean().optional(),
});

export type HelmSubstitutionType = z.infer<typeof helm_substitution_schema>;

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
 * 1Password substitution for fetching secrets from 1Password vaults.
 * Uses the op:// secret reference format, or shorthand with cluster defaults.
 */
export const onepassword_substitution_schema = z
  .object({
    type: z.literal('1password'),
    name: z.string().min(1),
    /** 1Password secret reference: op://vault/item[/section]/field, or shorthand item/field when vault is configured at cluster level */
    ref: z.string().min(1).optional(),
    /** Item name (shorthand, requires cluster-level vault configuration) */
    item: z.string().min(1).optional(),
    /** Field name (shorthand, requires cluster-level vault configuration) */
    field: z.string().min(1).optional(),
    /** Section name (optional, for shorthand references) */
    section: z.string().optional(),
    /** Optional default value if secret cannot be fetched */
    default: z.string().optional(),
  })
  .refine(
    (data) => {
      // Either ref must be provided, or both item and field
      return data.ref !== undefined || (data.item !== undefined && data.field !== undefined);
    },
    {
      message: "Either 'ref' or both 'item' and 'field' must be specified",
    },
  );

export type OnePasswordSubstitutionType = z.infer<typeof onepassword_substitution_schema>;

/**
 * Doppler substitution for fetching secrets from Doppler projects.
 * Project and config can be omitted if configured at cluster level.
 */
export const doppler_substitution_schema = z.object({
  type: z.literal('doppler'),
  name: z.string().min(1),
  /** Doppler project name (optional if configured at cluster level) */
  project: z.string().min(1).optional(),
  /** Doppler config name (optional if configured at cluster level, e.g., 'dev', 'stg', 'prd') */
  config: z.string().min(1).optional(),
  /** Secret key name in Doppler */
  secret: z.string().min(1),
  /** Optional default value if secret cannot be fetched */
  default: z.string().optional(),
});

export type DopplerSubstitutionType = z.infer<typeof doppler_substitution_schema>;

/**
 * Core substitution types provided by Kustodian.
 * These are always validated by the schema.
 */
export const core_substitution_schema = z.union([
  version_substitution_schema,
  helm_substitution_schema,
  namespace_substitution_schema,
  generic_substitution_schema, // Must be last due to optional 'type' field
]);

/**
 * Plugin-provided substitution types.
 * Plugins can register custom types (e.g., 'sops', 'vault', 'aws-secrets').
 * Schema validation is delegated to the plugin's substitution provider.
 */
export const plugin_substitution_schema = z
  .object({
    type: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough(); // Allow additional fields defined by plugins

/**
 * Union of all substitution types.
 * Includes core types (version, helm, namespace, generic) plus plugin-provided types.
 * Also includes Doppler and 1Password for backward compatibility (will be migrated to plugins).
 *
 * Supports backward compatibility: substitutions without 'type' are treated as generic.
 */
export const substitution_schema = z.union([
  core_substitution_schema,
  onepassword_substitution_schema, // Temporary: will move to plugin
  doppler_substitution_schema, // Temporary: will move to plugin
  plugin_substitution_schema, // Must be last to not shadow specific types
]);

export type SubstitutionType = z.infer<typeof substitution_schema>;

/**
 * Type guard for version substitutions.
 */
export function is_version_substitution(sub: SubstitutionType): sub is VersionSubstitutionType {
  return 'type' in sub && sub.type === 'version';
}

/**
 * Type guard for helm substitutions.
 */
export function is_helm_substitution(sub: SubstitutionType): sub is HelmSubstitutionType {
  return 'type' in sub && sub.type === 'helm';
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
 * Type guard for 1Password substitutions.
 */
export function is_onepassword_substitution(
  sub: SubstitutionType,
): sub is OnePasswordSubstitutionType {
  return 'type' in sub && sub.type === '1password';
}

/**
 * Type guard for Doppler substitutions.
 */
export function is_doppler_substitution(sub: SubstitutionType): sub is DopplerSubstitutionType {
  return 'type' in sub && sub.type === 'doppler';
}

/**
 * Type guard for plugin-provided substitutions.
 * Returns true if the substitution type is not a core type (version, helm, namespace, generic)
 * and not a legacy type (1password, doppler).
 */
export function is_plugin_substitution(sub: SubstitutionType): boolean {
  if (!('type' in sub) || !sub.type) {
    return false; // No type = generic (core type)
  }

  const core_types = ['version', 'helm', 'namespace', 'generic'];
  const legacy_types = ['1password', 'doppler'];

  return !core_types.includes(sub.type) && !legacy_types.includes(sub.type);
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
 * Base auth configuration for kustomizations.
 * This schema defines common fields that all auth providers share.
 * Plugins (e.g., authelia, authentik) extend validation for provider-specific fields.
 */
export const auth_config_schema = z.object({
  /** Auth provider plugin name (e.g., 'authelia', 'authentik') */
  provider: z.string().min(1),
  /** Provider-specific auth type (e.g., 'oidc', 'proxy', 'oauth2', 'saml') */
  type: z.string().min(1),
  /** Application identifier (used for client_id, slug, etc.) */
  app_name: z.string().min(1),
  /** Display name for the application */
  app_display_name: z.string().optional(),
  /** Application description */
  app_description: z.string().optional(),
  /** Application icon URL */
  app_icon: z.string().optional(),
  /** Application group/category */
  app_group: z.string().optional(),
  /** Application launch URL */
  app_launch_url: z.string().optional(),
  /** External host for the application */
  external_host: z.string().optional(),
  /** Internal service host (for proxy auth) */
  internal_host: z.string().optional(),
  /** Provider-specific configuration (validated by auth plugins) */
  config: z.record(z.string(), z.unknown()).optional(),
});

export type AuthConfigType = z.infer<typeof auth_config_schema>;

/**
 * Key-value pairs for substitution values.
 */
export const values_schema = z.record(z.string(), z.string());

export type ValuesType = z.infer<typeof values_schema>;
