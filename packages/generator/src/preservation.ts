import type { PreservationPolicyType } from '@kustodian/schema';

/**
 * Resource types that are considered stateful and should be preserved by default.
 *
 * This list defines which Kubernetes resources contain state that should not be
 * accidentally deleted when disabling a kustomization.
 */
export const DEFAULT_STATEFUL_RESOURCES = [
  'PersistentVolumeClaim',
  'Secret',
  'ConfigMap',
] as const;

/**
 * Gets the list of resource types that should be preserved based on preservation policy.
 *
 * @param policy - Preservation policy from kustomization configuration
 * @returns Array of Kubernetes resource kinds to preserve
 */
export function get_preserved_resource_types(policy: PreservationPolicyType): string[] {
  switch (policy.mode) {
    case 'none':
      return [];

    case 'stateful':
      return [...DEFAULT_STATEFUL_RESOURCES];

    case 'custom':
      return policy.keep_resources ?? [];

    default: {
      // Exhaustiveness check
      const _exhaustive: never = policy.mode;
      throw new Error(`Unknown preservation mode: ${_exhaustive}`);
    }
  }
}

/**
 * Generates Flux Kustomization patches to label preserved resources.
 *
 * This function creates patches that add a `kustodian.io/preserve: "true"` label
 * to resources that should be kept when a kustomization is disabled.
 *
 * The label-based approach works as follows:
 * 1. Add labels to resources we want to preserve
 * 2. Configure Flux to not prune resources with the preserve label
 * 3. When kustomization is disabled, non-preserved resources are deleted
 * 4. Preserved resources (PVCs, Secrets, etc.) remain in the cluster
 *
 * @param preserved_types - Resource types to keep (from get_preserved_resource_types)
 * @returns Flux patch objects that add preservation labels
 */
export function generate_preservation_patches(
  preserved_types: string[],
): Array<{
  patch: string;
  target: {
    kind: string;
  };
}> {
  if (preserved_types.length === 0) {
    return [];
  }

  return preserved_types.map((kind) => ({
    patch: `
apiVersion: v1
kind: ${kind}
metadata:
  labels:
    kustodian.io/preserve: "true"
`,
    target: {
      kind,
    },
  }));
}

/**
 * Checks if a resource type should be preserved based on the preservation policy.
 *
 * @param resource_kind - Kubernetes resource kind (e.g., 'Deployment', 'PersistentVolumeClaim')
 * @param policy - Preservation policy
 * @returns true if the resource should be preserved, false if it should be deleted
 */
export function should_preserve_resource(
  resource_kind: string,
  policy: PreservationPolicyType,
): boolean {
  const preserved_types = get_preserved_resource_types(policy);
  return preserved_types.includes(resource_kind);
}
