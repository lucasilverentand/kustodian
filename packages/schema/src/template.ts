import { z } from 'zod';

import {
  api_version_schema,
  health_check_schema,
  metadata_schema,
  namespace_config_schema,
  substitution_schema,
} from './common.js';

/**
 * A single kustomization within a template.
 * Maps to a Flux Kustomization resource.
 */
export const kustomization_schema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  namespace: namespace_config_schema.optional(),
  depends_on: z.array(z.string()).optional(),
  substitutions: z.array(substitution_schema).optional(),
  health_checks: z.array(health_check_schema).optional(),
  prune: z.boolean().optional().default(true),
  wait: z.boolean().optional().default(true),
  timeout: z.string().optional(),
  retry_interval: z.string().optional(),
});

export type KustomizationType = z.infer<typeof kustomization_schema>;

/**
 * Template specification containing kustomizations.
 */
export const template_spec_schema = z.object({
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
