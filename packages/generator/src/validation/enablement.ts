import type { ClusterType, TemplateType } from '@kustodian/schema';

import { get_template_config } from '../kustomization-resolution.js';
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
 * Validates that all kustomization dependencies are satisfied by templates listed in cluster.yaml.
 *
 * Templates are only deployed if they are explicitly listed in cluster.yaml.
 * This validates that all dependency references point to kustomizations from listed templates.
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

  // Build a set of kustomization IDs that will be deployed
  const deployed_kustomizations = new Set<string>();

  for (const template of templates) {
    const template_config = get_template_config(cluster, template.metadata.name);

    // Template is only deployed if listed in cluster.yaml
    if (!template_config) {
      continue;
    }

    // All kustomizations in a listed template are deployed
    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(template.metadata.name, kustomization.name);
      deployed_kustomizations.add(node_id);
    }
  }

  // Check each deployed kustomization's dependencies
  for (const template of templates) {
    const template_config = get_template_config(cluster, template.metadata.name);

    // Skip templates not listed in cluster.yaml
    if (!template_config) {
      continue;
    }

    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(template.metadata.name, kustomization.name);

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
          // Cross-template reference: template/kustomization
          target_node_id = dep;
        } else {
          // Within-template reference: kustomization
          target_node_id = create_node_id(template.metadata.name, dep);
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
