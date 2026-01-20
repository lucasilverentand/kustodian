import { z } from 'zod';

import {
  api_version_schema,
  auth_config_schema,
  health_check_expr_schema,
  health_check_schema,
  metadata_schema,
  namespace_config_schema,
  substitution_schema,
  version_entry_schema,
} from './common.js';

/**
 * Raw dependency reference to an external Flux Kustomization.
 * Used for dependencies outside the kustodian-generated system.
 */
export const raw_dependency_ref_schema = z.object({
  raw: z.object({
    name: z.string().min(1),
    namespace: z.string().min(1),
  }),
});

export type RawDependencyRefType = z.infer<typeof raw_dependency_ref_schema>;

/**
 * Dependency reference - either a string or a raw reference object.
 *
 * Supports three formats:
 * - Within-template: `database`
 * - Cross-template: `secrets/doppler`
 * - Raw external: `{ raw: { name: 'legacy-infrastructure', namespace: 'gitops-system' } }`
 */
export const dependency_ref_schema = z.union([z.string(), raw_dependency_ref_schema]);

export type DependencyRefType = z.infer<typeof dependency_ref_schema>;

/**
 * Preservation mode for disabled kustomizations.
 *
 * - none: Delete all resources when disabled
 * - stateful: Keep PVCs, Secrets, and ConfigMaps (default, safe)
 * - custom: Keep only specified resource types
 */
export const preservation_mode_schema = z.enum(['none', 'stateful', 'custom']);

export type PreservationModeType = z.infer<typeof preservation_mode_schema>;

/**
 * Preservation policy for a kustomization when disabled.
 */
export const preservation_policy_schema = z.object({
  mode: preservation_mode_schema.default('stateful'),
  keep_resources: z.array(z.string()).optional(),
});

export type PreservationPolicyType = z.infer<typeof preservation_policy_schema>;

/**
 * A single kustomization within a template.
 * Maps to a Flux Kustomization resource.
 */
export const kustomization_schema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  namespace: namespace_config_schema.optional(),
  depends_on: z.array(dependency_ref_schema).optional(),
  substitutions: z.array(substitution_schema).optional(),
  health_checks: z.array(health_check_schema).optional(),
  health_check_exprs: z.array(health_check_expr_schema).optional(),
  prune: z.boolean().optional().default(true),
  wait: z.boolean().optional().default(true),
  timeout: z.string().optional(),
  retry_interval: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  preservation: preservation_policy_schema.optional(),
  /** Auth configuration for SSO integration (processed by auth plugins) */
  auth: auth_config_schema.optional(),
});

export type KustomizationType = z.infer<typeof kustomization_schema>;

/**
 * Node label requirement - requires specific labels to be present on cluster nodes.
 */
export const node_label_requirement_schema = z.object({
  type: z.literal('nodeLabel'),
  key: z.string().min(1),
  value: z.string().optional(),
  atLeast: z.number().int().positive().default(1),
});

export type NodeLabelRequirementType = z.infer<typeof node_label_requirement_schema>;

/**
 * Template requirement - validates cluster prerequisites before deployment.
 * Currently supports node label requirements, extensible for future types.
 */
export const template_requirement_schema = z.discriminatedUnion('type', [
  node_label_requirement_schema,
]);

export type TemplateRequirementType = z.infer<typeof template_requirement_schema>;

/**
 * Template specification containing kustomizations.
 */
export const template_spec_schema = z.object({
  requirements: z.array(template_requirement_schema).optional(),
  /** Template-level version tracking, shared across all kustomizations */
  versions: z.array(version_entry_schema).optional(),
  kustomizations: z.array(kustomization_schema).min(1),
});

export type TemplateSpecType = z.infer<typeof template_spec_schema>;

/**
 * Complete Template resource definition.
 */
export const template_schema = z.object({
  apiVersion: api_version_schema,
  kind: z.literal('Template'),
  metadata: metadata_schema,
  spec: template_spec_schema,
});

export type TemplateType = z.infer<typeof template_schema>;

/**
 * Validates a template object and returns the result.
 */
export function validate_template(data: unknown): z.SafeParseReturnType<unknown, TemplateType> {
  return template_schema.safeParse(data);
}
