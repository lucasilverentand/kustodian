import type { ClusterType, TemplateType } from '@kustodian/schema';

import {
  get_template_config,
  resolve_kustomization_state,
} from '../kustomization-resolution.js';
import { create_node_id } from './reference.js';

/**
 * Disabled dependency error - an enabled kustomization depends on a disabled one.
 */
export interface DisabledDependencyErrorType {
  readonly type: 'disabled_dependency';
  /** Node ID of the enabled kustomization */
  readonly source: string;
  /** Node ID of the disabled dependency */
  readonly target: string;
  readonly message: string;
}

/**
 * Validates that no enabled kustomizations depend on disabled ones.
 *
 * This implements the "block by default" policy: you cannot disable a kustomization
 * if other enabled kustomizations depend on it.
 *
 * @param cluster - Cluster configuration
 * @param templates - Array of templates
 * @returns Array of validation errors (empty if valid)
 */
export function validate_enablement_dependencies(
  cluster: ClusterType,
  templates: TemplateType[],
): DisabledDependencyErrorType[] {
  const errors: DisabledDependencyErrorType[] = [];

  // Build a map of kustomization ID to enabled state
  const enablement_map = new Map<string, boolean>();

  for (const template of templates) {
    const template_config = get_template_config(cluster, template.metadata.name);

    // Check if template itself is enabled
    const template_enabled = template_config?.enabled ?? true;
    if (!template_enabled) {
      // All kustomizations in disabled templates are disabled
      for (const kustomization of template.spec.kustomizations) {
        const node_id = create_node_id(template.metadata.name, kustomization.name);
        enablement_map.set(node_id, false);
      }
      continue;
    }

    // Template is enabled, check individual kustomizations
    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(template.metadata.name, kustomization.name);
      const state = resolve_kustomization_state(
        kustomization,
        template_config,
        kustomization.name,
      );
      enablement_map.set(node_id, state.enabled);
    }
  }

  // Check each enabled kustomization's dependencies
  for (const template of templates) {
    const template_config = get_template_config(cluster, template.metadata.name);
    const template_enabled = template_config?.enabled ?? true;

    if (!template_enabled) {
      continue;
    }

    for (const kustomization of template.spec.kustomizations) {
      const node_id = create_node_id(template.metadata.name, kustomization.name);
      const state = resolve_kustomization_state(
        kustomization,
        template_config,
        kustomization.name,
      );

      // Skip if this kustomization is disabled
      if (!state.enabled) {
        continue;
      }

      // This kustomization is enabled - check its dependencies
      for (const dep of kustomization.depends_on ?? []) {
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

        // Check if the dependency is disabled
        const dep_enabled = enablement_map.get(target_node_id);
        if (dep_enabled === false) {
          errors.push({
            type: 'disabled_dependency',
            source: node_id,
            target: target_node_id,
            message: `Enabled kustomization '${node_id}' depends on disabled kustomization '${target_node_id}'. Either enable '${target_node_id}' or disable '${node_id}'.`,
          });
        }
      }
    }
  }

  return errors;
}
