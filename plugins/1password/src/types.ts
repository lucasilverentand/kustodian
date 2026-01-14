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

  const [, vault, item, section, field] = match;

  // If section is undefined, the field is in position 3
  if (field === undefined) {
    return {
      vault: vault!,
      item: item!,
      field: section!,
    };
  }

  return {
    vault: vault!,
    item: item!,
    section,
    field,
  };
}
