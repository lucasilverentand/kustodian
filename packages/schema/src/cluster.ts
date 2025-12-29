import { z } from 'zod';

import { api_version_schema, metadata_schema, values_schema } from './common.js';

/**
 * Git repository configuration for a cluster.
 */
export const git_config_schema = z.object({
  owner: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1).optional().default('main'),
  path: z.string().optional(),
});

export type GitConfigType = z.infer<typeof git_config_schema>;

/**
 * Template enablement configuration within a cluster.
 */
export const template_config_schema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  values: values_schema.optional(),
});

export type TemplateConfigType = z.infer<typeof template_config_schema>;

/**
 * Plugin configuration within a cluster.
 */
export const plugin_config_schema = z.object({
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type PluginConfigType = z.infer<typeof plugin_config_schema>;

/**
 * Cluster specification.
 */
export const cluster_spec_schema = z.object({
  domain: z.string().min(1),
  git: git_config_schema,
  templates: z.array(template_config_schema).optional(),
  plugins: z.array(plugin_config_schema).optional(),
});

export type ClusterSpecType = z.infer<typeof cluster_spec_schema>;

/**
 * Complete Cluster resource definition.
 */
export const cluster_schema = z.object({
  apiVersion: api_version_schema,
  kind: z.literal('Cluster'),
  metadata: metadata_schema,
  spec: cluster_spec_schema,
});

export type ClusterType = z.infer<typeof cluster_schema>;

/**
 * Validates a cluster object and returns the result.
 */
export function validate_cluster(data: unknown): z.SafeParseReturnType<unknown, ClusterType> {
  return cluster_schema.safeParse(data);
}
