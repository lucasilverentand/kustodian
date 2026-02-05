import type { KustomizationType, TemplateType } from '../schema/index.js';

import type { ResolvedTemplateType } from './types.js';

/**
 * Gets the set of system namespaces for a given flux namespace.
 *
 * System namespaces are never generated as Namespace resources.
 *
 * @param flux_namespace - The Flux system namespace (defaults to 'flux-system')
 * @returns Set of system namespace names
 */
export function get_system_namespaces(flux_namespace = 'flux-system'): Set<string> {
  return new Set(['default', flux_namespace, 'kube-system', 'kube-public', 'kube-node-lease']);
}

/**
 * System namespaces that should not be generated.
 * Uses the default Flux namespace 'flux-system'.
 *
 * @deprecated Use get_system_namespaces() for dynamic flux namespace support
 */
export const SYSTEM_NAMESPACES = get_system_namespaces();

/**
 * Namespace resource type.
 */
export interface NamespaceResourceType {
  apiVersion: 'v1';
  kind: 'Namespace';
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
}

/**
 * Extracts the namespace from a kustomization.
 * Returns undefined if no namespace is configured.
 */
export function get_kustomization_namespace(kustomization: KustomizationType): string | undefined {
  return kustomization.namespace?.default;
}

/**
 * Extracts all namespaces from a template.
 */
export function get_template_namespaces(template: TemplateType): string[] {
  const namespaces = new Set<string>();

  for (const kustomization of template.spec.kustomizations) {
    const namespace = get_kustomization_namespace(kustomization);
    if (namespace) {
      namespaces.add(namespace);
    }
  }

  return Array.from(namespaces);
}

/**
 * Extracts all namespaces from resolved templates.
 * Only includes templates that are listed in cluster.yaml (enabled = true).
 */
export function collect_namespaces(templates: ResolvedTemplateType[]): string[] {
  const namespaces = new Set<string>();

  for (const resolved of templates) {
    // Only include templates that are listed in cluster.yaml
    if (!resolved.enabled) {
      continue;
    }

    for (const namespace of get_template_namespaces(resolved.template)) {
      namespaces.add(namespace);
    }
  }

  return Array.from(namespaces).sort();
}

/**
 * Filters out system namespaces from a list.
 *
 * @param namespaces - List of namespace names to filter
 * @param flux_namespace - The Flux system namespace (defaults to 'flux-system')
 * @returns Filtered list excluding system namespaces
 */
export function filter_system_namespaces(
  namespaces: string[],
  flux_namespace = 'flux-system',
): string[] {
  return namespaces.filter((ns) => !is_system_namespace(ns, flux_namespace));
}

/**
 * Checks if a namespace is a system namespace.
 *
 * @param namespace - The namespace to check
 * @param flux_namespace - The Flux system namespace (defaults to 'flux-system')
 * @returns true if the namespace is a system namespace
 */
export function is_system_namespace(namespace: string, flux_namespace = 'flux-system'): boolean {
  const system_namespaces = get_system_namespaces(flux_namespace);
  if (system_namespaces.has(namespace)) {
    return true;
  }

  // Also filter kube-* namespaces
  return namespace.startsWith('kube-');
}

/**
 * Creates a namespace resource.
 */
export function create_namespace_resource(
  name: string,
  labels?: Record<string, string>,
): NamespaceResourceType {
  const metadata: NamespaceResourceType['metadata'] = { name };
  if (labels !== undefined) {
    metadata.labels = labels;
  }
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata,
  };
}

/**
 * Generates namespace resources for all namespaces in templates.
 * Filters out system namespaces.
 *
 * @param templates - Resolved templates to extract namespaces from
 * @param labels - Optional labels to apply to all namespace resources
 * @param flux_namespace - The Flux system namespace (defaults to 'flux-system')
 * @returns Array of namespace resources
 */
export function generate_namespace_resources(
  templates: ResolvedTemplateType[],
  labels?: Record<string, string>,
  flux_namespace = 'flux-system',
): NamespaceResourceType[] {
  const namespaces = collect_namespaces(templates);
  const filtered = filter_system_namespaces(namespaces, flux_namespace);

  return filtered.map((name) => create_namespace_resource(name, labels));
}
