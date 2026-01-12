import { z } from 'zod';

import { api_version_schema } from './common.js';

/**
 * SSH configuration schema.
 */
export const ssh_config_schema = z.object({
  user: z.string().optional(),
  key_path: z.string().optional(),
  known_hosts_path: z.string().optional(),
  port: z.number().int().positive().optional(),
});

export type SshConfigSchemaType = z.infer<typeof ssh_config_schema>;

/**
 * Kubernetes taint effect.
 */
export const taint_effect_schema = z.enum(['NoSchedule', 'PreferNoSchedule', 'NoExecute']);

export type TaintEffectType = z.infer<typeof taint_effect_schema>;

/**
 * Kubernetes taint schema.
 */
export const taint_schema = z.object({
  key: z.string().min(1),
  value: z.string().optional(),
  effect: taint_effect_schema,
});

export type TaintSchemaType = z.infer<typeof taint_schema>;

/**
 * Node role in the cluster.
 */
export const node_role_schema = z.enum(['controller', 'worker', 'controller+worker']);

export type NodeRoleType = z.infer<typeof node_role_schema>;

/**
 * Single node definition schema (for inline use in NodeList).
 */
export const node_schema = z.object({
  name: z.string().min(1),
  role: node_role_schema,
  address: z.string().min(1),
  ssh: ssh_config_schema.optional(),
  labels: z.record(z.union([z.string(), z.boolean(), z.number()])).optional(),
  taints: z.array(taint_schema).optional(),
  annotations: z.record(z.string()).optional(),
});

export type NodeSchemaType = z.infer<typeof node_schema>;

/**
 * Node metadata schema (for standalone Node resources).
 */
export const node_metadata_schema = z.object({
  name: z.string().min(1),
  cluster: z.string().min(1),
});

export type NodeMetadataType = z.infer<typeof node_metadata_schema>;

/**
 * Node spec schema (for standalone Node resources).
 */
export const node_spec_schema = z.object({
  role: node_role_schema,
  address: z.string().min(1),
  ssh: ssh_config_schema.optional(),
  labels: z.record(z.union([z.string(), z.boolean(), z.number()])).optional(),
  taints: z.array(taint_schema).optional(),
  annotations: z.record(z.string()).optional(),
});

export type NodeSpecType = z.infer<typeof node_spec_schema>;

/**
 * Standalone Node resource definition.
 * Used for individual node files at clusters/<cluster>/nodes/<node>.yml
 */
export const node_resource_schema = z.object({
  apiVersion: api_version_schema,
  kind: z.literal('Node'),
  metadata: node_metadata_schema,
  spec: node_spec_schema,
});

export type NodeResourceType = z.infer<typeof node_resource_schema>;

/**
 * Validates a Node resource and returns the result.
 */
export function validate_node_resource(
  data: unknown,
): z.SafeParseReturnType<unknown, NodeResourceType> {
  return node_resource_schema.safeParse(data);
}

/**
 * Converts a Node resource to a NodeType for internal use.
 */
export function node_resource_to_node(resource: NodeResourceType): NodeSchemaType {
  return {
    name: resource.metadata.name,
    role: resource.spec.role,
    address: resource.spec.address,
    ssh: resource.spec.ssh,
    labels: resource.spec.labels,
    taints: resource.spec.taints,
    annotations: resource.spec.annotations,
  };
}

// NodeList is no longer a schema kind - it's just an internal construct
// Nodes are defined as individual Node resources and aggregated in code
