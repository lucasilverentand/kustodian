import { z } from 'zod';

import { api_version_schema, metadata_schema, values_schema } from './common.js';
import { ssh_config_schema } from './node-list.js';
import { preservation_mode_schema } from './template.js';

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
 * Kustomization override configuration within a cluster.
 *
 * Allows overriding kustomization enablement and preservation from template defaults.
 */
export const kustomization_override_schema = z.object({
  enabled: z.boolean(),
  preservation: z
    .object({
      mode: preservation_mode_schema,
    })
    .optional(),
});

export type KustomizationOverrideType = z.infer<typeof kustomization_override_schema>;

/**
 * Template enablement configuration within a cluster.
 */
export const template_config_schema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  values: values_schema.optional(),
  kustomizations: z
    .record(
      z.string(), // kustomization name
      z.union([
        z.boolean(), // Simple: just enabled/disabled
        kustomization_override_schema, // Advanced: with preservation
      ]),
    )
    .optional(),
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
 * Bootstrap credential configuration for secret providers.
 * Allows obtaining credentials from another secret provider.
 */
export const bootstrap_credential_schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('1password'),
    ref: z.string().min(1),
  }),
  z.object({
    type: z.literal('doppler'),
    project: z.string().min(1),
    config: z.string().min(1),
    secret: z.string().min(1),
  }),
]);

export type BootstrapCredentialType = z.infer<typeof bootstrap_credential_schema>;

/**
 * Doppler secret provider configuration at cluster level.
 */
export const doppler_config_schema = z.object({
  project: z.string().min(1),
  config: z.string().min(1),
  service_token: bootstrap_credential_schema.optional(),
});

export type DopplerConfigType = z.infer<typeof doppler_config_schema>;

/**
 * 1Password secret provider configuration at cluster level.
 */
export const onepassword_config_schema = z.object({
  vault: z.string().min(1),
  service_account_token: bootstrap_credential_schema.optional(),
});

export type OnePasswordConfigType = z.infer<typeof onepassword_config_schema>;

/**
 * Secret providers configuration at cluster level.
 */
export const secrets_config_schema = z.object({
  doppler: doppler_config_schema.optional(),
  onepassword: onepassword_config_schema.optional(),
});

export type SecretsConfigType = z.infer<typeof secrets_config_schema>;

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
    secrets: secrets_config_schema.optional(),
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
