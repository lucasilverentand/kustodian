import type { LoadedClusterType } from '../../loader/project.js';

/**
 * A single semantic validation error.
 */
export interface SemanticErrorType {
  readonly type: 'duplicate' | 'invalid_format' | 'inconsistency' | 'missing_required';
  readonly cluster: string;
  readonly field: string;
  readonly message: string;
}

/**
 * Result of semantic validation.
 */
export interface SemanticValidationResultType {
  readonly valid: boolean;
  readonly errors: SemanticErrorType[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a string is a valid IPv4 address.
 */
function is_valid_ipv4(address: string): boolean {
  const parts = address.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number.parseInt(part, 10);
    return num >= 0 && num <= 255 && String(num) === part;
  });
}

/**
 * Checks whether a string is a valid IPv6 address (simplified check).
 */
function is_valid_ipv6(address: string): boolean {
  // Must contain at least one colon
  if (!address.includes(':')) return false;
  // Split by colon, handle :: expansion
  const has_double_colon = address.includes('::');
  // Only one :: allowed
  if (has_double_colon && address.indexOf('::') !== address.lastIndexOf('::')) return false;
  const groups = address.split(':');
  // Without :: must have exactly 8 groups, with :: can have fewer
  if (!has_double_colon && groups.length !== 8) return false;
  if (has_double_colon && groups.length > 8) return false;
  return groups.every((group) => group === '' || /^[\da-fA-F]{1,4}$/.test(group));
}

/**
 * Checks whether a string is a valid DNS hostname.
 */
function is_valid_hostname(address: string): boolean {
  if (address.length === 0 || address.length > 253) return false;
  const labels = address.split('.');
  if (labels.length < 1) return false;
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label),
  );
}

/**
 * Checks whether a string looks like an IPv4 address attempt (4 dot-separated numeric groups).
 */
function looks_like_ipv4(address: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address);
}

/**
 * Validates whether a string is a valid IP address or hostname.
 * If the string looks like an IPv4 address, it is validated strictly as IPv4
 * and will not fall through to hostname validation.
 */
function is_valid_ip_or_hostname(address: string): boolean {
  if (looks_like_ipv4(address)) return is_valid_ipv4(address);
  return is_valid_ipv6(address) || is_valid_hostname(address);
}

/**
 * Validates whether a string is a valid Go duration format.
 * Matches patterns like "30s", "5m", "1h30m", "1.5h", "100ms".
 */
function is_valid_go_duration(s: string): boolean {
  return /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(s);
}

/**
 * Validates whether a string is a valid Kubernetes label key.
 * Format: [prefix/]name where prefix is a DNS subdomain and name is <=63 chars.
 */
function is_valid_k8s_label_key(key: string): boolean {
  const parts = key.split('/');
  if (parts.length > 2) return false;

  if (parts.length === 2) {
    const [prefix, name] = parts;
    if (!prefix || !name) return false;
    // Prefix must be a valid DNS subdomain (<=253 chars)
    if (!is_valid_hostname(prefix)) return false;
    return is_valid_k8s_label_name(name);
  }

  const name = parts[0];
  if (!name) return false;
  return is_valid_k8s_label_name(name);
}

/**
 * Validates the name segment of a Kubernetes label key or value.
 * Must be <=63 chars, alphanumeric start/end, with dashes/dots/underscores in between.
 */
function is_valid_k8s_label_name(name: string): boolean {
  if (name.length === 0 || name.length > 63) return false;
  return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(name);
}

/**
 * Validates whether a string is a valid Kubernetes label value.
 * Must be <=63 chars, empty or alphanumeric start/end with dashes/dots/underscores.
 */
function is_valid_k8s_label_value(value: string): boolean {
  if (value.length === 0) return true;
  if (value.length > 63) return false;
  return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(value);
}

// ---------------------------------------------------------------------------
// Per-cluster check functions
// ---------------------------------------------------------------------------

/**
 * Validates that metadata.code is set when oci.tag_strategy is 'cluster'.
 */
export function validate_cluster_metadata(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const oci = cluster.cluster.spec.oci;

  if (oci && oci.tag_strategy === 'cluster' && !cluster.cluster.metadata.code) {
    errors.push({
      type: 'missing_required',
      cluster: name,
      field: 'metadata.code',
      message: `Cluster '${name}': metadata.code is required when spec.oci.tag_strategy is 'cluster'`,
    });
  }

  return errors;
}

/**
 * Validates OCI registry and repository format.
 */
export function validate_oci_format(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const oci = cluster.cluster.spec.oci;

  if (!oci) return errors;

  // Registry should look like a hostname (possibly with port)
  const registry_host = oci.registry.split(':')[0] ?? '';
  if (!is_valid_hostname(registry_host)) {
    errors.push({
      type: 'invalid_format',
      cluster: name,
      field: 'spec.oci.registry',
      message: `Cluster '${name}': OCI registry '${oci.registry}' does not look like a valid hostname`,
    });
  }

  // Repository should not start with /
  if (oci.repository.startsWith('/')) {
    errors.push({
      type: 'invalid_format',
      cluster: name,
      field: 'spec.oci.repository',
      message: `Cluster '${name}': OCI repository '${oci.repository}' should not start with '/'`,
    });
  }

  // tag_strategy manual requires a tag
  if (oci.tag_strategy === 'manual' && !oci.tag) {
    errors.push({
      type: 'missing_required',
      cluster: name,
      field: 'spec.oci.tag',
      message: `Cluster '${name}': OCI tag_strategy is 'manual' but no tag is specified`,
    });
  }

  return errors;
}

/**
 * Validates git/github branch consistency.
 */
export function validate_git_github_consistency(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const git = cluster.cluster.spec.git;
  const github = cluster.cluster.spec.github;

  if (git && github && git.branch !== github.branch) {
    errors.push({
      type: 'inconsistency',
      cluster: name,
      field: 'spec.git.branch',
      message: `Cluster '${name}': git branch '${git.branch}' does not match github branch '${github.branch}'`,
    });
  }

  return errors;
}

/**
 * Collects all duration fields from a cluster config.
 */
function collect_duration_fields(
  cluster: LoadedClusterType,
): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];
  const defaults = cluster.cluster.spec.defaults;
  const flux = cluster.cluster.spec.flux;

  if (defaults?.flux_reconciliation_interval) {
    fields.push({
      field: 'spec.defaults.flux_reconciliation_interval',
      value: defaults.flux_reconciliation_interval,
    });
  }
  if (defaults?.flux_reconciliation_timeout) {
    fields.push({
      field: 'spec.defaults.flux_reconciliation_timeout',
      value: defaults.flux_reconciliation_timeout,
    });
  }

  if (flux?.controllers) {
    const c = flux.controllers;
    if (c.requeue_dependency) {
      fields.push({
        field: 'spec.flux.controllers.requeue_dependency',
        value: c.requeue_dependency,
      });
    }
    if (c.kustomize_controller?.requeue_dependency) {
      fields.push({
        field: 'spec.flux.controllers.kustomize_controller.requeue_dependency',
        value: c.kustomize_controller.requeue_dependency,
      });
    }
    if (c.helm_controller?.requeue_dependency) {
      fields.push({
        field: 'spec.flux.controllers.helm_controller.requeue_dependency',
        value: c.helm_controller.requeue_dependency,
      });
    }
    if (c.source_controller?.requeue_dependency) {
      fields.push({
        field: 'spec.flux.controllers.source_controller.requeue_dependency',
        value: c.source_controller.requeue_dependency,
      });
    }
  }

  return fields;
}

/**
 * Validates that duration fields use valid Go duration format.
 */
export function validate_flux_durations(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const fields = collect_duration_fields(cluster);

  for (const { field, value } of fields) {
    if (!is_valid_go_duration(value)) {
      errors.push({
        type: 'invalid_format',
        cluster: name,
        field,
        message: `Cluster '${name}': '${value}' is not a valid Go duration format (e.g. '30s', '5m', '1h30m')`,
      });
    }
  }

  return errors;
}

/**
 * Validates there are no duplicate template names in spec.templates[].
 */
export function validate_duplicate_templates(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const templates = cluster.cluster.spec.templates ?? [];
  const seen = new Set<string>();

  for (const t of templates) {
    if (seen.has(t.name)) {
      errors.push({
        type: 'duplicate',
        cluster: name,
        field: 'spec.templates',
        message: `Cluster '${name}': duplicate template name '${t.name}'`,
      });
    }
    seen.add(t.name);
  }

  return errors;
}

/**
 * Validates there are no duplicate plugin names in spec.plugins[].
 */
export function validate_duplicate_plugins(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const plugins = cluster.cluster.spec.plugins ?? [];
  const seen = new Set<string>();

  for (const p of plugins) {
    if (seen.has(p.name)) {
      errors.push({
        type: 'duplicate',
        cluster: name,
        field: 'spec.plugins',
        message: `Cluster '${name}': duplicate plugin name '${p.name}'`,
      });
    }
    seen.add(p.name);
  }

  return errors;
}

/**
 * Validates there are no duplicate node names within a cluster.
 */
export function validate_node_names(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const seen = new Set<string>();

  for (const node of cluster.nodes) {
    if (seen.has(node.name)) {
      errors.push({
        type: 'duplicate',
        cluster: name,
        field: 'nodes',
        message: `Cluster '${name}': duplicate node name '${node.name}'`,
      });
    }
    seen.add(node.name);
  }

  return errors;
}

/**
 * Validates node addresses: no duplicates and each is a valid IP/hostname.
 */
export function validate_node_addresses(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;
  const seen = new Set<string>();

  for (const node of cluster.nodes) {
    if (seen.has(node.address)) {
      errors.push({
        type: 'duplicate',
        cluster: name,
        field: `nodes.${node.name}.address`,
        message: `Cluster '${name}': duplicate node address '${node.address}' on node '${node.name}'`,
      });
    }
    seen.add(node.address);

    if (!is_valid_ip_or_hostname(node.address)) {
      errors.push({
        type: 'invalid_format',
        cluster: name,
        field: `nodes.${node.name}.address`,
        message: `Cluster '${name}': node '${node.name}' has invalid address '${node.address}'`,
      });
    }
  }

  return errors;
}

/**
 * Validates that at least one controller or controller+worker exists when nodes are defined.
 */
export function validate_node_roles(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;

  if (cluster.nodes.length === 0) return errors;

  const has_controller = cluster.nodes.some(
    (n) => n.role === 'controller' || n.role === 'controller+worker',
  );

  if (!has_controller) {
    errors.push({
      type: 'missing_required',
      cluster: name,
      field: 'nodes',
      message: `Cluster '${name}': nodes are defined but none has a controller or controller+worker role`,
    });
  }

  return errors;
}

/**
 * Validates node labels follow Kubernetes label format.
 */
export function validate_node_labels(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;

  for (const node of cluster.nodes) {
    if (!node.labels) continue;

    for (const [key, value] of Object.entries(node.labels)) {
      if (!is_valid_k8s_label_key(key)) {
        errors.push({
          type: 'invalid_format',
          cluster: name,
          field: `nodes.${node.name}.labels`,
          message: `Cluster '${name}', node '${node.name}': label key '${key}' is not a valid Kubernetes label key`,
        });
      }

      const str_value = String(value);
      if (!is_valid_k8s_label_value(str_value)) {
        errors.push({
          type: 'invalid_format',
          cluster: name,
          field: `nodes.${node.name}.labels`,
          message: `Cluster '${name}', node '${node.name}': label value '${str_value}' for key '${key}' is not a valid Kubernetes label value`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validates no duplicate taints (same key + effect) on a single node.
 */
export function validate_node_taints(cluster: LoadedClusterType): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const name = cluster.cluster.metadata.name;

  for (const node of cluster.nodes) {
    if (!node.taints) continue;

    const seen = new Set<string>();
    for (const taint of node.taints) {
      const id = `${taint.key}:${taint.effect}`;
      if (seen.has(id)) {
        errors.push({
          type: 'duplicate',
          cluster: name,
          field: `nodes.${node.name}.taints`,
          message: `Cluster '${name}', node '${node.name}': duplicate taint '${taint.key}' with effect '${taint.effect}'`,
        });
      }
      seen.add(id);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Cross-cluster check
// ---------------------------------------------------------------------------

/**
 * Validates that no two clusters share the same metadata.name or metadata.code.
 */
export function validate_unique_cluster_identifiers(
  clusters: LoadedClusterType[],
): SemanticErrorType[] {
  const errors: SemanticErrorType[] = [];
  const seen_names = new Map<string, string>();
  const seen_codes = new Map<string, string>();

  for (const c of clusters) {
    const name = c.cluster.metadata.name;

    // Check duplicate names
    const prev_name = seen_names.get(name);
    if (prev_name) {
      errors.push({
        type: 'duplicate',
        cluster: name,
        field: 'metadata.name',
        message: `Duplicate cluster name '${name}'`,
      });
    }
    seen_names.set(name, name);

    // Check duplicate codes
    const code = c.cluster.metadata.code;
    if (code) {
      const prev_code = seen_codes.get(code);
      if (prev_code) {
        errors.push({
          type: 'duplicate',
          cluster: name,
          field: 'metadata.code',
          message: `Cluster '${name}': duplicate cluster code '${code}' (also used by '${prev_code}')`,
        });
      }
      seen_codes.set(code, name);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs all semantic validation checks for all clusters.
 */
export function validate_semantics(clusters: LoadedClusterType[]): SemanticValidationResultType {
  const errors: SemanticErrorType[] = [];

  // Cross-cluster checks
  errors.push(...validate_unique_cluster_identifiers(clusters));

  // Per-cluster checks
  for (const cluster of clusters) {
    errors.push(...validate_cluster_metadata(cluster));
    errors.push(...validate_oci_format(cluster));
    errors.push(...validate_git_github_consistency(cluster));
    errors.push(...validate_flux_durations(cluster));
    errors.push(...validate_duplicate_templates(cluster));
    errors.push(...validate_duplicate_plugins(cluster));
    errors.push(...validate_node_names(cluster));
    errors.push(...validate_node_addresses(cluster));
    errors.push(...validate_node_roles(cluster));
    errors.push(...validate_node_labels(cluster));
    errors.push(...validate_node_taints(cluster));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
