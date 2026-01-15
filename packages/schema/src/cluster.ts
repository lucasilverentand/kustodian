import { z } from 'zod';

import { api_version_schema, metadata_schema, values_schema } from './common.js';
import { ssh_config_schema } from './node-list.js';

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
 * OCI repository configuration for a cluster.
 */
export const oci_config_schema = z.object({
  registry: z.string().min(1),
  repository: z.string().min(1),
  tag_strategy: z.enum(['cluster', 'git-sha', 'version', 'manual']).optional().default('git-sha'),
  tag: z.string().optional(),
  secret_ref: z.string().optional(),
  provider: z.enum(['aws', 'azure', 'gcp', 'generic']).optional().default('generic'),
  insecure: z.boolean().optional().default(false),
});

export type OciConfigType = z.infer<typeof oci_config_schema>;

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
 * Node defaults configuration within a cluster.
 */
export const node_defaults_schema = z.object({
  label_prefix: z.string().optional(),
  ssh: ssh_config_schema.optional(),
});

export type NodeDefaultsType = z.infer<typeof node_defaults_schema>;

/**
 * GitHub repository configuration for GitOps metadata.
 */
export const github_config_schema = z.object({
  organization: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1).optional().default('main'),
});

export type GithubConfigType = z.infer<typeof github_config_schema>;

/**
 * Cluster specification.
 */
export const cluster_spec_schema = z
  .object({
    code: z.string().min(1).optional(),
    domain: z.string().min(1),
    git: git_config_schema.optional(),
    oci: oci_config_schema.optional(),
    github: github_config_schema.optional(),
    templates: z.array(template_config_schema).optional(),
    plugins: z.array(plugin_config_schema).optional(),
    node_defaults: node_defaults_schema.optional(),
    nodes: z.array(z.string()).optional(),
  })
  .refine((data) => data.git || data.oci, {
    message: "Either 'git' or 'oci' must be specified",
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
