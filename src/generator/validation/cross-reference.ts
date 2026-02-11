import type { LoadedClusterType, LoadedTemplateType } from '../../loader/project.js';
import type { NodeProfileType } from '../../schema/index.js';
import { get_required_substitutions } from '../substitution.js';

/**
 * A single cross-reference validation error.
 */
export interface CrossReferenceErrorType {
  readonly type:
    | 'missing_template'
    | 'missing_substitution'
    | 'invalid_kustomization_override'
    | 'missing_profile';
  readonly cluster: string;
  readonly message: string;
}

/**
 * Result of cross-reference validation.
 */
export interface CrossReferenceValidationResultType {
  readonly valid: boolean;
  readonly errors: CrossReferenceErrorType[];
}

/**
 * Validates that every template referenced by a cluster exists in the project.
 */
export function validate_template_references(
  cluster: LoadedClusterType,
  templates: LoadedTemplateType[],
): CrossReferenceErrorType[] {
  const errors: CrossReferenceErrorType[] = [];
  const template_names = new Set(templates.map((t) => t.template.metadata.name));
  const cluster_name = cluster.cluster.metadata.name;

  for (const ref of cluster.cluster.spec.templates ?? []) {
    if (!template_names.has(ref.name)) {
      errors.push({
        type: 'missing_template',
        cluster: cluster_name,
        message: `Cluster '${cluster_name}' references template '${ref.name}' which does not exist`,
      });
    }
  }

  return errors;
}

/**
 * Validates that all required substitutions (those without defaults) have values
 * provided by cluster-level values or template-level values in the cluster config.
 */
export function validate_substitution_completeness(
  cluster: LoadedClusterType,
  templates: LoadedTemplateType[],
): CrossReferenceErrorType[] {
  const errors: CrossReferenceErrorType[] = [];
  const cluster_name = cluster.cluster.metadata.name;
  const cluster_values = cluster.cluster.spec.values ?? {};
  const template_map = new Map(templates.map((t) => [t.template.metadata.name, t]));

  for (const ref of cluster.cluster.spec.templates ?? []) {
    const loaded = template_map.get(ref.name);
    if (!loaded) {
      // Already caught by validate_template_references
      continue;
    }

    const template_values = ref.values ?? {};
    const combined_values = { ...cluster_values, ...template_values };

    // Check template-level versions (those without defaults)
    for (const version of loaded.template.spec.versions ?? []) {
      if (version.default === undefined && combined_values[version.name] === undefined) {
        errors.push({
          type: 'missing_substitution',
          cluster: cluster_name,
          message: `Cluster '${cluster_name}', template '${ref.name}': required version '${version.name}' has no value or default`,
        });
      }
    }

    // Check kustomization-level substitutions
    for (const kustomization of loaded.template.spec.kustomizations) {
      const required = get_required_substitutions(kustomization);

      for (const name of required) {
        if (combined_values[name] === undefined) {
          errors.push({
            type: 'missing_substitution',
            cluster: cluster_name,
            message: `Cluster '${cluster_name}', template '${ref.name}', kustomization '${kustomization.name}': required substitution '${name}' has no value or default`,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Validates that kustomization override keys in cluster template configs
 * match actual kustomization names in the referenced template.
 */
export function validate_kustomization_overrides(
  cluster: LoadedClusterType,
  templates: LoadedTemplateType[],
): CrossReferenceErrorType[] {
  const errors: CrossReferenceErrorType[] = [];
  const cluster_name = cluster.cluster.metadata.name;
  const template_map = new Map(templates.map((t) => [t.template.metadata.name, t]));

  for (const ref of cluster.cluster.spec.templates ?? []) {
    if (!ref.kustomizations) {
      continue;
    }

    const loaded = template_map.get(ref.name);
    if (!loaded) {
      // Already caught by validate_template_references
      continue;
    }

    const kustomization_names = new Set(loaded.template.spec.kustomizations.map((k) => k.name));

    for (const override_key of Object.keys(ref.kustomizations)) {
      if (!kustomization_names.has(override_key)) {
        errors.push({
          type: 'invalid_kustomization_override',
          cluster: cluster_name,
          message: `Cluster '${cluster_name}', template '${ref.name}': kustomization override '${override_key}' does not match any kustomization in the template`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validates that node profile references exist in the loaded profiles map.
 */
export function validate_profile_references(
  cluster: LoadedClusterType,
  profiles: Map<string, NodeProfileType>,
): CrossReferenceErrorType[] {
  const errors: CrossReferenceErrorType[] = [];
  const cluster_name = cluster.cluster.metadata.name;

  for (const node of cluster.nodes) {
    if (node.profile && !profiles.has(node.profile)) {
      errors.push({
        type: 'missing_profile',
        cluster: cluster_name,
        message: `Cluster '${cluster_name}', node '${node.name}': profile '${node.profile}' does not exist`,
      });
    }
  }

  return errors;
}

/**
 * Orchestrator: runs all cross-reference checks for all clusters.
 */
export function validate_cross_references(
  clusters: LoadedClusterType[],
  templates: LoadedTemplateType[],
  profiles: Map<string, NodeProfileType>,
): CrossReferenceValidationResultType {
  const errors: CrossReferenceErrorType[] = [];

  for (const cluster of clusters) {
    errors.push(...validate_template_references(cluster, templates));
    errors.push(...validate_substitution_completeness(cluster, templates));
    errors.push(...validate_kustomization_overrides(cluster, templates));
    errors.push(...validate_profile_references(cluster, profiles));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
