/**
 * Cluster-level 1Password defaults.
 */
export interface OnePasswordClusterDefaultsType {
  /** Default vault name or ID */
  vault?: string | undefined;
}

/**
 * Options for the 1Password plugin.
 */
export interface OnePasswordPluginOptionsType {
  /** Service account token (can also be set via OP_SERVICE_ACCOUNT_TOKEN env var) */
  service_account_token?: string | undefined;
  /** Timeout for CLI operations in milliseconds (default: 30000) */
  timeout?: number | undefined;
  /** Whether to fail on missing secrets (default: true) */
  fail_on_missing?: boolean | undefined;
  /** Cluster-level defaults for vault */
  cluster_defaults?: OnePasswordClusterDefaultsType | undefined;
}

/**
 * Parsed 1Password reference.
 */
export interface OnePasswordRefType {
  vault: string;
  item: string;
  section?: string | undefined;
  field: string;
}

/**
 * Default timeout for 1Password CLI operations.
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Parses a 1Password secret reference.
 * Format: op://vault/item[/section]/field
 */
export function parse_onepassword_ref(ref: string): OnePasswordRefType | undefined {
  // Match: op://vault/item/field or op://vault/item/section/field
  const match = ref.match(/^op:\/\/([^/]+)\/([^/]+)\/(?:([^/]+)\/)?([^/]+)$/);

  if (!match) {
    return undefined;
  }

  const vault = match[1];
  const item = match[2];
  const section = match[3];
  const field = match[4];

  // If section is undefined, the field is in position 3
  if (field === undefined) {
    // When there's no section, match[3] contains the field
    if (!vault || !item || !section) {
      return undefined;
    }
    return {
      vault,
      item,
      field: section,
    };
  }

  if (!vault || !item || !field) {
    return undefined;
  }

  return {
    vault,
    item,
    section,
    field,
  };
}
