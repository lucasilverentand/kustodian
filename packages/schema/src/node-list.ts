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
 * Single node definition schema.
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
 * NodeList metadata schema.
 */
export const node_list_metadata_schema = z.object({
  cluster: z.string().min(1),
});

export type NodeListMetadataType = z.infer<typeof node_list_metadata_schema>;

/**
 * NodeList spec schema.
 */
export const node_list_spec_schema = z.object({
  label_prefix: z.string().optional(),
  ssh: ssh_config_schema.optional(),
  nodes: z.array(node_schema).min(1),
});

export type NodeListSpecType = z.infer<typeof node_list_spec_schema>;

/**
 * Complete NodeList resource definition.
 */
export const node_list_schema = z.object({
  apiVersion: api_version_schema,
  kind: z.literal('NodeList'),
  metadata: node_list_metadata_schema,
  spec: node_list_spec_schema,
});

export type NodeListType = z.infer<typeof node_list_schema>;

/**
 * Validates a NodeList object and returns the result.
 */
export function validate_node_list(data: unknown): z.SafeParseReturnType<unknown, NodeListType> {
  return node_list_schema.safeParse(data);
}
