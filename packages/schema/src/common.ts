import { z } from 'zod';

/**
 * Common API version for all Kustodian resources.
 */
export const api_version_schema = z.literal('kustodian.io/v1');

/**
 * Standard metadata for all Kustodian resources.
 */
export const metadata_schema = z.object({
  name: z.string().min(1),
});

export type MetadataType = z.infer<typeof metadata_schema>;

/**
 * Health check configuration for waiting on resources.
 */
export const health_check_schema = z.object({
  kind: z.string().min(1),
  name: z.string().min(1),
  namespace: z.string().min(1).optional(),
  api_version: z.string().min(1).optional(),
});

export type HealthCheckType = z.infer<typeof health_check_schema>;

/**
 * Substitution variable configuration.
 */
export const substitution_schema = z.object({
  name: z.string().min(1),
  default: z.string().optional(),
  secret: z.string().optional(),
  preserve_case: z.boolean().optional(),
});

export type SubstitutionType = z.infer<typeof substitution_schema>;

/**
 * Namespace configuration with fallback behavior.
 */
export const namespace_config_schema = z.object({
  default: z.string().min(1),
  create: z.boolean().optional().default(true),
});

export type NamespaceConfigType = z.infer<typeof namespace_config_schema>;

/**
 * Key-value pairs for substitution values.
 */
export const values_schema = z.record(z.string(), z.string());

export type ValuesType = z.infer<typeof values_schema>;
