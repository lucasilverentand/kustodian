import type { NodeListType, NodeType, SshConfigType } from 'kustodian/nodes';
import { get_node_ssh_config, get_primary_controller } from 'kustodian/nodes';

import {
  type K0sProviderOptionsType,
  type K0sctlConfigType,
  type K0sctlHostType,
  to_k0sctl_role,
  to_k0sctl_ssh_config,
} from './types.js';

/**
 * Generates a k0sctl configuration from node definitions.
 */
export function generate_k0sctl_config(
  node_list: NodeListType,
  options: K0sProviderOptionsType = {},
): K0sctlConfigType {
  const primary_controller = get_primary_controller(node_list.nodes);
  const default_ssh = options.default_ssh ?? node_list.ssh;

  const hosts: K0sctlHostType[] = node_list.nodes.map((node) =>
    node_to_k0sctl_host(node, default_ssh),
  );

  return {
    apiVersion: 'k0sctl.k0sproject.io/v1beta1',
    kind: 'Cluster',
    metadata: {
      name: options.cluster_name ?? node_list.cluster,
    },
    spec: {
      k0s: build_k0s_config(primary_controller, options),
      hosts,
    },
  };
}

/**
 * Converts a node to a k0sctl host configuration.
 */
export function node_to_k0sctl_host(node: NodeType, default_ssh?: SshConfigType): K0sctlHostType {
  const ssh_config = get_node_ssh_config(node, default_ssh);
  const role = to_k0sctl_role(node.role);

  return {
    role,
    noTaints: role === 'controller+worker' ? true : undefined,
    openSSH: to_k0sctl_ssh_config(node.address, ssh_config),
  };
}

/**
 * Builds the k0s configuration block.
 */
function build_k0s_config(
  primary_controller: NodeType | undefined,
  options: K0sProviderOptionsType,
) {
  return {
    version: options.k0s_version,
    dynamicConfig: options.dynamic_config,
    config: {
      spec: {
        api: primary_controller
          ? {
              externalAddress: primary_controller.address,
              ...(options.sans && options.sans.length > 0 && { sans: options.sans }),
            }
          : undefined,
        telemetry: {
          enabled: options.telemetry_enabled ?? false,
        },
      },
    },
  };
}

/**
 * Serializes k0sctl config to YAML-compatible object.
 * Removes undefined values for clean output.
 */
export function serialize_k0sctl_config(config: K0sctlConfigType): unknown {
  return JSON.parse(JSON.stringify(config));
}
