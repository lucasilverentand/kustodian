import { z } from 'zod';

import { api_version_schema } from './common.js';
import { taint_schema } from './node-list.js';

/**
 * Node profile specification schema.
 * Defines reusable configuration for labels, taints, and annotations.
 */
export const node_profile_spec_schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  labels: z.record(z.union([z.string(), z.boolean(), z.number()])).optional(),
  taints: z.array(taint_schema).optional(),
  annotations: z.record(z.string()).optional(),
});

export type NodeProfileSpecType = z.infer<typeof node_profile_spec_schema>;

/**
 * Node profile metadata schema.
 */
export const node_profile_metadata_schema = z.object({
  name: z.string().min(1),
});

export type NodeProfileMetadataType = z.infer<typeof node_profile_metadata_schema>;

/**
 * Standalone NodeProfile resource definition.
 * Used for profile files at profiles/<profile-name>.yaml
 */
export const node_profile_resource_schema = z.object({
  apiVersion: api_version_schema,
  kind: z.literal('NodeProfile'),
  metadata: node_profile_metadata_schema,
  spec: node_profile_spec_schema,
});

export type NodeProfileResourceType = z.infer<typeof node_profile_resource_schema>;

/**
 * Validates a NodeProfile resource and returns the result.
 */
export function validate_node_profile_resource(
  data: unknown,
): z.SafeParseReturnType<unknown, NodeProfileResourceType> {
  return node_profile_resource_schema.safeParse(data);
}

/**
 * Internal node profile type for use after loading.
 */
export interface NodeProfileType {
  name: string;
  display_name?: string;
  description?: string;
  labels?: Record<string, string | boolean | number>;
  taints?: z.infer<typeof taint_schema>[];
  annotations?: Record<string, string>;
}

/**
 * Converts a NodeProfile resource to a NodeProfileType for internal use.
 */
export function node_profile_resource_to_profile(
  resource: NodeProfileResourceType,
): NodeProfileType {
  const profile: NodeProfileType = {
    name: resource.metadata.name,
  };

  if (resource.spec.name !== undefined) {
    profile.display_name = resource.spec.name;
  }
  if (resource.spec.description !== undefined) {
    profile.description = resource.spec.description;
  }
  if (resource.spec.labels !== undefined) {
    profile.labels = resource.spec.labels;
  }
  if (resource.spec.taints !== undefined) {
    profile.taints = resource.spec.taints;
  }
  if (resource.spec.annotations !== undefined) {
    profile.annotations = resource.spec.annotations;
  }

  return profile;
}
