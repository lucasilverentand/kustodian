import type {
  ClusterType,
  KustomizationType,
  PreservationPolicyType,
  TemplateConfigType,
} from '@kustodian/schema';

/**
 * Resolved kustomization enablement and preservation state.
 */
export interface ResolvedKustomizationStateType {
  enabled: boolean;
  preservation: PreservationPolicyType;
}

/**
 * Resolves kustomization enablement state from template defaults and cluster overrides.
 *
 * Resolution order (last wins):
 * 1. Template kustomization default (enabled field, defaults to true)
 * 2. Cluster kustomization override (if specified)
 *
 * @param kustomization - Template kustomization definition
 * @param template_config - Cluster template configuration (may be undefined)
 * @param kustomization_name - Name of the kustomization to resolve
 * @returns Resolved enablement state
 */
export function resolve_kustomization_enabled(
  kustomization: KustomizationType,
  template_config: TemplateConfigType | undefined,
  kustomization_name: string,
): boolean {
  // Start with template default (defaults to true via schema)
  const template_default = kustomization.enabled ?? true;

  // Check for cluster override
  if (!template_config?.kustomizations) {
    return template_default;
  }

  const override = template_config.kustomizations[kustomization_name];
  if (override === undefined) {
    return template_default;
  }

  // Handle simple boolean override
  if (typeof override === 'boolean') {
    return override;
  }

  // Handle complex override object
  return override.enabled;
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
  if (override === undefined || typeof override === 'boolean') {
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
 * Resolves complete kustomization state (enabled + preservation).
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
    enabled: resolve_kustomization_enabled(kustomization, template_config, kustomization_name),
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
