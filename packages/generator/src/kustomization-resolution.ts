import type {
  ClusterType,
  KustomizationType,
  PreservationPolicyType,
  TemplateConfigType,
} from '@kustodian/schema';

/**
 * Resolved kustomization state (preservation only).
 * Enablement is now determined at the template level - templates listed in cluster.yaml are deployed.
 */
export interface ResolvedKustomizationStateType {
  preservation: PreservationPolicyType;
}

/**
 * Resolves kustomization preservation policy from template defaults and cluster overrides.
 *
 * Resolution order (last wins):
 * 1. Template kustomization preservation policy (defaults to 'stateful')
 * 2. Cluster kustomization override preservation (if specified)
 *
 * @param kustomization - Template kustomization definition
 * @param template_config - Cluster template configuration (may be undefined)
 * @param kustomization_name - Name of the kustomization to resolve
 * @returns Resolved preservation policy
 */
export function resolve_kustomization_preservation(
  kustomization: KustomizationType,
  template_config: TemplateConfigType | undefined,
  kustomization_name: string,
): PreservationPolicyType {
  // Start with template default
  const template_default: PreservationPolicyType = kustomization.preservation ?? {
    mode: 'stateful',
  };

  // Check for cluster override
  if (!template_config?.kustomizations) {
    return template_default;
  }

  const override = template_config.kustomizations[kustomization_name];
  if (override === undefined) {
    return template_default;
  }

  // Merge cluster override with template default
  if (override.preservation) {
    return {
      mode: override.preservation.mode,
      keep_resources: override.preservation.keep_resources ?? template_default.keep_resources,
    };
  }

  return template_default;
}

/**
 * Resolves complete kustomization state (preservation only).
 * Template enablement is now determined by whether the template is listed in cluster.yaml.
 *
 * @param kustomization - Template kustomization definition
 * @param template_config - Cluster template configuration (may be undefined)
 * @param kustomization_name - Name of the kustomization to resolve
 * @returns Resolved kustomization state
 */
export function resolve_kustomization_state(
  kustomization: KustomizationType,
  template_config: TemplateConfigType | undefined,
  kustomization_name: string,
): ResolvedKustomizationStateType {
  return {
    preservation: resolve_kustomization_preservation(
      kustomization,
      template_config,
      kustomization_name,
    ),
  };
}

/**
 * Gets template configuration for a specific template from cluster spec.
 *
 * @param cluster - Cluster configuration
 * @param template_name - Name of the template to find
 * @returns Template configuration or undefined if not found
 */
export function get_template_config(
  cluster: ClusterType,
  template_name: string,
): TemplateConfigType | undefined {
  return cluster.spec.templates?.find((t) => t.name === template_name);
}
