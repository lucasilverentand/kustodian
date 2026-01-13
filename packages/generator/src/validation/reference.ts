import type { DependencyRefType, InvalidReferenceErrorType } from './types.js';

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
export function parse_dependency_ref(ref: string): DependencyRefType | InvalidReferenceErrorType {
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
 * @returns Full node ID in format `template/kustomization`
 */
export function resolve_dependency_ref(ref: DependencyRefType, current_template: string): string {
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
