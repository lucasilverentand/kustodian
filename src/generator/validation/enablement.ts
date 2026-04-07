import type { ClusterType, TemplateType } from '../../schema/index.js';

import { create_node_id } from './reference.js';

/**
 * Missing dependency error - a deployed kustomization depends on one from a template not listed in cluster.yaml.
 */
export interface MissingDependencyErrorType {
  readonly type: 'missing_dependency';
  /** Node ID of the deployed kustomization */
  readonly source: string;
  /** Node ID of the missing dependency */
  readonly target: string;
  readonly message: string;
}

/**
 * Validates that all kustomization dependencies are satisfied by instances listed in cluster.yaml.
 *
 * Templates are only deployed if they are explicitly listed in cluster.yaml.
 * This validates that all dependency references point to kustomizations from listed instances.
 * Uses instance names (config entry `name`) for node IDs, matching Flux resource naming.
 *
 * @param cluster - Cluster configuration
 * @param templates - Array of templates
 * @returns Array of validation errors (empty if valid)
 */
export function validate_enablement_dependencies(
  cluster: ClusterType,
  templates: TemplateType[],
): MissingDependencyErrorType[] {
  const errors: MissingDependencyErrorType[] = [];
  const template_map = new Map(templates.map((t) => [t.metadata.name, t]));

  // Build a set of kustomization IDs that will be deployed, keyed by instance name
  const deployed_kustomizations = new Set<string>();

  for (const config_entry of cluster.spec.templates ?? []) {
    const template_name = config_entry.template ?? config_entry.name;
    const instance_name = config_entry.name;
    const template = template_map.get(template_name);

    if (!template) {
      continue; // Caught by cross-reference validation
    }

    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(instance_name, kustomization.name);
      deployed_kustomizations.add(node_id);
    }
  }

  // Check each deployed instance's kustomization dependencies
  for (const config_entry of cluster.spec.templates ?? []) {
    const template_name = config_entry.template ?? config_entry.name;
    const instance_name = config_entry.name;
    const template = template_map.get(template_name);

    if (!template) {
      continue;
    }

    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(instance_name, kustomization.name);

      // Check dependencies
      for (const dep of kustomization.depends_on ?? []) {
        // Skip raw dependencies - they're external to kustodian
        if (typeof dep !== 'string') {
          continue;
        }

        // Parse dependency to get target node ID
        const dep_parts = dep.split('/');
        let target_node_id: string;

        if (dep_parts.length === 2) {
          // Cross-instance reference: instance_name/kustomization
          target_node_id = dep;
        } else {
          // Within-instance reference: kustomization
          target_node_id = create_node_id(instance_name, dep);
        }

        // Check if the dependency is deployed
        if (!deployed_kustomizations.has(target_node_id)) {
          errors.push({
            type: 'missing_dependency',
            source: node_id,
            target: target_node_id,
            message: `Kustomization '${node_id}' depends on '${target_node_id}' which is not deployed. Add the template to cluster.yaml.`,
          });
        }
      }
    }
  }

  return errors;
}
