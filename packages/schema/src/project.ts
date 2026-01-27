import { z } from 'zod';
import { api_version_schema, metadata_schema } from './common.js';

/**
 * Project-level defaults that apply to all clusters.
 * Can be overridden per-cluster in cluster.yaml spec.defaults.
 */
export const project_defaults_schema = z.object({
  /** Flux system namespace where Flux controllers run */
  flux_namespace: z.string().min(1).optional(),
  /** Flux OCIRepository resource name */
  oci_repository_name: z.string().min(1).optional(),
  /** Secret name for OCI registry authentication */
  oci_registry_secret_name: z.string().min(1).optional(),
  /** Default reconciliation interval for Flux resources */
  flux_reconciliation_interval: z.string().min(1).optional(),
  /** Default timeout for Flux reconciliation */
  flux_reconciliation_timeout: z.string().min(1).optional(),
});

export type ProjectDefaultsType = z.infer<typeof project_defaults_schema>;

/**
 * Project specification in kustodian.yaml.
 */
export const project_spec_schema = z.object({
  defaults: project_defaults_schema.optional(),
});

export type ProjectSpecType = z.infer<typeof project_spec_schema>;

/**
 * Project resource schema (kustodian.yaml).
 */
export const project_schema = z.object({
  apiVersion: api_version_schema,
  kind: z.literal('Project'),
  metadata: metadata_schema,
  spec: project_spec_schema.optional(),
});

export type ProjectType = z.infer<typeof project_schema>;

/**
 * Validates a project configuration.
 */
export function validate_project(data: unknown): z.SafeParseReturnType<unknown, ProjectType> {
  return project_schema.safeParse(data);
}
