/**
 * Node role in the cluster.
 */
export type NodeRoleType = 'controller' | 'worker' | 'controller+worker';

/**
 * SSH configuration for connecting to a node.
 */
export interface SshConfigType {
  user?: string;
  key_path?: string;
  known_hosts_path?: string;
  port?: number;
  disable_multiplexing?: boolean;
}

/**
 * Kubernetes taint configuration.
 */
export interface TaintType {
  key: string;
  value?: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}

/**
 * Node definition with its configuration.
 */
export interface NodeType {
  name: string;
  role: NodeRoleType;
  address: string;
  profile?: string;
  ssh?: SshConfigType;
  labels?: Record<string, string | boolean | number>;
  taints?: TaintType[];
  annotations?: Record<string, string>;
}

/**
 * Node list with default SSH configuration.
 */
export interface NodeListType {
  cluster: string;
  label_prefix?: string;
  ssh?: SshConfigType;
  nodes: NodeType[];
}

/**
 * Default label prefix.
 */
export const DEFAULT_LABEL_PREFIX = 'kustodian.io';

/**
 * Formats a label key with the configured prefix.
 */
export function format_label_key(key: string, prefix: string = DEFAULT_LABEL_PREFIX): string {
  // If key already has a prefix (contains /), return as-is
  if (key.includes('/')) {
    return key;
  }
  return `${prefix}/${key}`;
}

/**
 * Formats a label value as a string.
 */
export function format_label_value(value: string | boolean | number): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

/**
 * Formats all labels for a node with the configured prefix.
 */
export function format_node_labels(
  labels: Record<string, string | boolean | number> | undefined,
  prefix: string = DEFAULT_LABEL_PREFIX,
): Record<string, string> {
  if (!labels) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    const formatted_key = format_label_key(key, prefix);
    result[formatted_key] = format_label_value(value);
  }
  return result;
}

/**
 * Gets the SSH configuration for a node, merging with defaults.
 */
export function get_node_ssh_config(node: NodeType, default_ssh?: SshConfigType): SshConfigType {
  return {
    ...default_ssh,
    ...node.ssh,
  };
}

/**
 * Checks if a node has a controller role.
 */
export function is_controller(node: NodeType): boolean {
  return node.role === 'controller' || node.role === 'controller+worker';
}

/**
 * Checks if a node has a worker role.
 */
export function is_worker(node: NodeType): boolean {
  return node.role === 'worker' || node.role === 'controller+worker';
}

/**
 * Gets all controller nodes from a node list.
 */
export function get_controllers(nodes: NodeType[]): NodeType[] {
  return nodes.filter(is_controller);
}

/**
 * Gets all worker nodes from a node list.
 */
export function get_workers(nodes: NodeType[]): NodeType[] {
  return nodes.filter(is_worker);
}

/**
 * Gets the primary controller node (first controller).
 */
export function get_primary_controller(nodes: NodeType[]): NodeType | undefined {
  return nodes.find(is_controller);
}
