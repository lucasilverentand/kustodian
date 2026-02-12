import { z } from 'zod';

import { api_version_schema, metadata_schema, values_schema } from './common.js';

/**
 * Extended metadata for clusters.
 */
export const cluster_metadata_schema = metadata_schema.extend({
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  environment: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  labels: z.record(z.string(), z.string()).optional(),
});

export type ClusterMetadataType = z.infer<typeof cluster_metadata_schema>;

import { preservation_mode_schema } from './template.js';

/**
 * Git repository configuration for a cluster.
 *
 * This configuration is used for SOURCE METADATA ONLY - to track which git repository
 * and commit the deployment artifacts came from. Flux does NOT watch this git repository.
 *
 * When you run `kustodian apply`, it:
 * 1. Reads this git config to determine the source repository
 * 2. Gets the current git commit SHA
 * 3. Pushes an OCI artifact with this metadata attached
 *
 * For actual deployment, Flux watches the OCI registry (spec.oci), not the git branch.
 * Changes must be pushed via `kustodian apply` to trigger deployments.
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
 *
 * This is the DEPLOYMENT MECHANISM - Flux watches this OCI registry for artifacts.
 *
 * When you run `kustodian apply`, it:
 * 1. Generates Flux manifests locally
 * 2. Pushes them as an OCI artifact to this registry (with git metadata attached)
 * 3. Creates/updates Flux OCIRepository and Kustomization resources in the cluster
 * 4. Flux polls this OCI registry and deploys when new artifacts appear
 *
 * Changes pushed to the git branch do NOT automatically trigger deployments.
 * You must run `kustodian apply` to push artifacts to OCI and trigger reconciliation.
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
 * Allows overriding kustomization preservation from template defaults.
 */
export const kustomization_override_schema = z.object({
  preservation: z
    .object({
      mode: preservation_mode_schema,
      keep_resources: z.array(z.string()).optional(),
    })
    .optional(),
});

export type KustomizationOverrideType = z.infer<typeof kustomization_override_schema>;

/**
 * Template configuration within a cluster.
 * Templates listed here will be deployed. Templates not listed will be skipped.
 */
export const template_config_schema = z.object({
  name: z.string().min(1),
  values: values_schema.optional(),
  kustomizations: z
    .record(
      z.string(), // kustomization name
      kustomization_override_schema, // Override preservation settings
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
 * Cluster secret configuration for bootstrapping secrets into the cluster.
 * Used by external-secrets operator to access secret providers.
 */
export const cluster_secret_config_schema = z.object({
  enabled: z.boolean().optional().default(true),
  namespace: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  annotations: z.record(z.string()).optional(),
});

export type ClusterSecretConfigType = z.infer<typeof cluster_secret_config_schema>;

/**
 * Flux controller settings that can be applied to individual controllers.
 */
export const flux_controller_settings_schema = z.object({
  concurrent: z.number().int().positive().optional(),
  requeue_dependency: z.string().optional(),
});

export type FluxControllerSettingsType = z.infer<typeof flux_controller_settings_schema>;

/**
 * Flux controllers configuration.
 * Settings can be applied globally or per-controller.
 */
export const flux_controllers_config_schema = z.object({
  concurrent: z.number().int().positive().optional(),
  requeue_dependency: z.string().optional(),
  kustomize_controller: flux_controller_settings_schema.optional(),
  helm_controller: flux_controller_settings_schema.optional(),
  source_controller: flux_controller_settings_schema.optional(),
});

export type FluxControllersConfigType = z.infer<typeof flux_controllers_config_schema>;

/**
 * Flux system configuration at cluster level.
 */
export const flux_config_schema = z.object({
  controllers: flux_controllers_config_schema.optional(),
});

export type FluxConfigType = z.infer<typeof flux_config_schema>;

/**
 * Cluster-level defaults that override project defaults.
 * All values are optional - fallback to project defaults, then schema defaults.
 */
export const defaults_config_schema = z.object({
  /** Flux system namespace where Flux controllers run */
  flux_namespace: z.string().min(1).optional(),
  /** Flux OCIRepository resource name */
  oci_repository_name: z.string().min(1).optional(),
  /** Secret name for OCI registry authentication */
  oci_registry_secret_name: z.string().min(1).optional(),
  /** Reconciliation interval for Flux resources */
  flux_reconciliation_interval: z.string().min(1).optional(),
  /** Timeout for Flux reconciliation */
  flux_reconciliation_timeout: z.string().min(1).optional(),
});

export type DefaultsConfigType = z.infer<typeof defaults_config_schema>;

/**
 * Cluster specification.
 *
 * IMPORTANT: Understanding git vs oci configuration:
 * - `git`: Source metadata only (which repo/commit artifacts came from)
 * - `oci`: Deployment mechanism (where Flux watches for artifacts)
 *
 * Deployment flow:
 * 1. You commit changes to git and merge to main
 * 2. Run `kustodian apply` to push artifacts to OCI with git metadata
 * 3. Flux watches the OCI registry and deploys the artifacts
 *
 * The git branch is NOT watched by Flux - only the OCI registry is.
 */
export const cluster_spec_schema = z
  .object({
    git: git_config_schema.optional(),
    oci: oci_config_schema.optional(),
    github: github_config_schema.optional(),
    flux: flux_config_schema.optional(),
    defaults: defaults_config_schema.optional(),
    values: values_schema.optional(),
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
  metadata: cluster_metadata_schema,
  spec: cluster_spec_schema,
});

export type ClusterType = z.infer<typeof cluster_schema>;

/**
 * Validates a cluster object and returns the result.
 */
export function validate_cluster(data: unknown): z.SafeParseReturnType<unknown, ClusterType> {
  return cluster_schema.safeParse(data);
}
