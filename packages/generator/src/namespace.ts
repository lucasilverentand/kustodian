import type { KustomizationType, TemplateType } from '@kustodian/schema';

import type { ResolvedTemplateType } from './types.js';

/**
 * System namespaces that should not be generated.
 */
export const SYSTEM_NAMESPACES = new Set([
  'default',
  'flux-system',
  'kube-system',
  'kube-public',
  'kube-node-lease',
]);

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
 */
export function filter_system_namespaces(namespaces: string[]): string[] {
  return namespaces.filter((ns) => !is_system_namespace(ns));
}

/**
 * Checks if a namespace is a system namespace.
 */
export function is_system_namespace(namespace: string): boolean {
  if (SYSTEM_NAMESPACES.has(namespace)) {
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
 */
export function generate_namespace_resources(
  templates: ResolvedTemplateType[],
  labels?: Record<string, string>,
): NamespaceResourceType[] {
  const namespaces = collect_namespaces(templates);
  const filtered = filter_system_namespaces(namespaces);

  return filtered.map((name) => create_namespace_resource(name, labels));
}
