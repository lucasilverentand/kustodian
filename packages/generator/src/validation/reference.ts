import type { DependencyRefType as SchemaDependencyRefType } from '@kustodian/schema';
import type {
  DependencyRefType,
  InvalidReferenceErrorType,
  ParsedDependencyRefType,
  RawDependencyRefType,
} from './types.js';

/**
 * Checks if a dependency reference is a raw object reference.
 */
function is_raw_object(ref: SchemaDependencyRefType): ref is { raw: { name: string; namespace: string } } {
  return typeof ref === 'object' && 'raw' in ref;
}

/**
 * Parses a dependency reference from the schema.
 *
 * Supports three formats:
 * - Within-template: `kustomization-name` (e.g., `operator`)
 * - Cross-template: `template-name/kustomization-name` (e.g., `001-secrets/doppler`)
 * - Raw external: `{ raw: { name: 'legacy-infrastructure', namespace: 'gitops-system' } }`
 *
 * @param ref - The dependency reference from schema (string or raw object)
 * @returns Parsed dependency reference or error
 */
export function parse_dependency_ref(ref: SchemaDependencyRefType): DependencyRefType | InvalidReferenceErrorType {
  // Handle raw object references
  if (is_raw_object(ref)) {
    return {
      name: ref.raw.name,
      namespace: ref.raw.namespace,
    } satisfies RawDependencyRefType;
  }

  // Handle string references
  return parse_string_dependency_ref(ref);
}

/**
 * Parses a dependency reference string.
 *
 * Supports two formats:
 * - Within-template: `kustomization-name` (e.g., `operator`)
 * - Cross-template: `template-name/kustomization-name` (e.g., `001-secrets/doppler`)
 *
 * @param ref - The raw dependency reference string
 * @returns Parsed dependency reference or error
 */
function parse_string_dependency_ref(ref: string): ParsedDependencyRefType | InvalidReferenceErrorType {
  const trimmed = ref.trim();

  if (trimmed.length === 0) {
    return {
      type: 'invalid_reference',
      source: '',
      reference: ref,
      message: 'Empty dependency reference',
    };
  }

  const parts = trimmed.split('/');

  if (parts.length === 1) {
    // Within-template reference: `kustomization-name`
    const kustomization = parts[0];
    if (kustomization === undefined) {
      return {
        type: 'invalid_reference',
        source: '',
        reference: ref,
        message: `Invalid dependency reference: '${ref}'`,
      };
    }
    return {
      kustomization,
      raw: ref,
    };
  }

  if (parts.length === 2) {
    // Cross-template reference: `template-name/kustomization-name`
    const template = parts[0];
    const kustomization = parts[1];

    if (
      template === undefined ||
      kustomization === undefined ||
      template.length === 0 ||
      kustomization.length === 0
    ) {
      return {
        type: 'invalid_reference',
        source: '',
        reference: ref,
        message: `Invalid dependency reference format: '${ref}' - both template and kustomization names must be non-empty`,
      };
    }

    return {
      template,
      kustomization,
      raw: ref,
    };
  }

  // More than one slash is invalid
  return {
    type: 'invalid_reference',
    source: '',
    reference: ref,
    message: `Invalid dependency reference format: '${ref}' - expected 'kustomization' or 'template/kustomization'`,
  };
}

/**
 * Type guard to check if parse result is an error.
 */
export function is_parse_error(
  result: DependencyRefType | InvalidReferenceErrorType,
): result is InvalidReferenceErrorType {
  return 'type' in result && result.type === 'invalid_reference';
}

/**
 * Resolves a dependency reference to a full node ID.
 *
 * @param ref - Parsed dependency reference
 * @param current_template - The template containing the reference
 * @returns Full node ID in format `template/kustomization` for string refs, or null for raw refs
 */
export function resolve_dependency_ref(ref: DependencyRefType, current_template: string): string | null {
  // Raw dependencies don't resolve to node IDs - they're external
  if ('name' in ref && 'namespace' in ref) {
    return null;
  }

  // String-based dependency references
  const template = ref.template ?? current_template;
  return `${template}/${ref.kustomization}`;
}

/**
 * Creates a node ID from template and kustomization names.
 *
 * @param template - Template name
 * @param kustomization - Kustomization name
 * @returns Node ID in format `template/kustomization`
 */
export function create_node_id(template: string, kustomization: string): string {
  return `${template}/${kustomization}`;
}

/**
 * Parses a node ID into its components.
 *
 * @param node_id - Node ID in format `template/kustomization`
 * @returns Object with template and kustomization names
 */
export function parse_node_id(node_id: string): { template: string; kustomization: string } {
  const slash_index = node_id.indexOf('/');
  if (slash_index === -1) {
    return { template: '', kustomization: node_id };
  }
  return {
    template: node_id.slice(0, slash_index),
    kustomization: node_id.slice(slash_index + 1),
  };
}
