import type { NodeType, TaintType } from './types.js';

/**
 * Node profile type for profile resolution.
 * This mirrors the NodeProfileType from @kustodian/schema but is defined here
 * to avoid circular dependencies.
 */
export interface NodeProfileType {
  name: string;
  display_name?: string;
  description?: string;
  labels?: Record<string, string | boolean | number>;
  taints?: TaintType[];
  annotations?: Record<string, string>;
}

/**
 * Resolved node type with profile values merged.
 * The profile field is removed after resolution.
 */
export type ResolvedNodeType = Omit<NodeType, 'profile'>;

/**
 * Merges taints from profile and node.
 * Node taints are appended after profile taints.
 * Duplicate taints (same key+effect) from node override profile taints.
 */
function merge_taints(
  profile_taints: TaintType[] | undefined,
  node_taints: TaintType[] | undefined,
): TaintType[] | undefined {
  if (!profile_taints && !node_taints) {
    return undefined;
  }

  if (!profile_taints) {
    return node_taints;
  }

  if (!node_taints) {
    return profile_taints;
  }

  // Create a map of node taints keyed by key+effect for deduplication
  const node_taint_keys = new Set(
    node_taints.map((t) => `${t.key}:${t.effect}`),
  );

  // Filter out profile taints that are overridden by node taints
  const filtered_profile_taints = profile_taints.filter(
    (t) => !node_taint_keys.has(`${t.key}:${t.effect}`),
  );

  return [...filtered_profile_taints, ...node_taints];
}

/**
 * Resolves a node with its profile configuration.
 * Profile values are merged with node values, where node values take precedence.
 *
 * Merge strategy:
 * - labels: Profile labels are base, node labels override/extend
 * - taints: Node taints override profile taints with same key+effect, others are combined
 * - annotations: Profile annotations are base, node annotations override/extend
 * - ssh: Not inherited from profile (kept as node-specific)
 *
 * @param node - The node to resolve
 * @param profile - The profile to apply, or undefined if no profile
 * @returns The resolved node with profile values merged
 */
export function resolve_node_profile(
  node: NodeType,
  profile: NodeProfileType | undefined,
): ResolvedNodeType {
  if (!profile) {
    // No profile to apply, return node without profile field
    const { profile: _, ...resolved } = node;
    return resolved;
  }

  // Merge labels: profile as base, node overrides
  const merged_labels =
    profile.labels || node.labels
      ? { ...profile.labels, ...node.labels }
      : undefined;

  // Merge taints: deduplicate by key+effect, node wins
  const merged_taints = merge_taints(profile.taints, node.taints);

  // Merge annotations: profile as base, node overrides
  const merged_annotations =
    profile.annotations || node.annotations
      ? { ...profile.annotations, ...node.annotations }
      : undefined;

  const resolved: ResolvedNodeType = {
    name: node.name,
    role: node.role,
    address: node.address,
  };

  if (node.ssh !== undefined) {
    resolved.ssh = node.ssh;
  }
  if (merged_labels !== undefined) {
    resolved.labels = merged_labels;
  }
  if (merged_taints !== undefined) {
    resolved.taints = merged_taints;
  }
  if (merged_annotations !== undefined) {
    resolved.annotations = merged_annotations;
  }

  return resolved;
}

/**
 * Resolves all nodes in a list with their profiles.
 *
 * @param nodes - The nodes to resolve
 * @param profiles - Map of profile name to profile
 * @returns Object with resolved nodes and any missing profile errors
 */
export function resolve_all_node_profiles(
  nodes: NodeType[],
  profiles: Map<string, NodeProfileType>,
): { resolved: ResolvedNodeType[]; errors: string[] } {
  const resolved: ResolvedNodeType[] = [];
  const errors: string[] = [];

  for (const node of nodes) {
    if (node.profile) {
      const profile = profiles.get(node.profile);
      if (!profile) {
        errors.push(`Node '${node.name}' references unknown profile '${node.profile}'`);
        // Still resolve the node without the profile
        const { profile: _, ...node_without_profile } = node;
        resolved.push(node_without_profile);
      } else {
        resolved.push(resolve_node_profile(node, profile));
      }
    } else {
      resolved.push(resolve_node_profile(node, undefined));
    }
  }

  return { resolved, errors };
}

/**
 * Collects all unique profile names referenced by nodes.
 */
export function get_referenced_profiles(nodes: NodeType[]): Set<string> {
  const profiles = new Set<string>();
  for (const node of nodes) {
    if (node.profile) {
      profiles.add(node.profile);
    }
  }
  return profiles;
}

/**
 * Validates that all referenced profiles exist.
 *
 * @param nodes - The nodes to check
 * @param profiles - Map of available profiles
 * @returns Array of error messages for missing profiles
 */
export function validate_profile_references(
  nodes: NodeType[],
  profiles: Map<string, NodeProfileType>,
): string[] {
  const errors: string[] = [];
  const referenced = get_referenced_profiles(nodes);

  for (const profile_name of referenced) {
    if (!profiles.has(profile_name)) {
      const nodes_using = nodes
        .filter((n) => n.profile === profile_name)
        .map((n) => n.name);
      errors.push(
        `Profile '${profile_name}' not found, referenced by nodes: ${nodes_using.join(', ')}`,
      );
    }
  }

  return errors;
}
