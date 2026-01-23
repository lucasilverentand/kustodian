import type { KustodianErrorType, ResultType } from '@kustodian/core';
import { Errors, failure, is_success, success } from '@kustodian/core';
import type { PluginRegistryType } from '@kustodian/plugins';
import type {
  ClusterType,
  KustomizationType,
  SubstitutionType,
  TemplateType,
} from '@kustodian/schema';
import { is_plugin_substitution } from '@kustodian/schema';

import type { ResolvedTemplateType } from './types.js';

/**
 * Pattern for matching substitution variables: ${variable_name}
 */
export const SUBSTITUTION_PATTERN = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Result of validating substitution values.
 */
export interface SubstitutionValidationResultType {
  valid: boolean;
  missing: string[];
  unused: string[];
}

/**
 * Extracts variable names from a string containing ${var} patterns.
 */
export function extract_variables(text: string): string[] {
  const matches = text.matchAll(SUBSTITUTION_PATTERN);
  const variables = new Set<string>();
  for (const match of matches) {
    const variable_name = match[1];
    if (variable_name !== undefined) {
      variables.add(variable_name);
    }
  }
  return Array.from(variables);
}

/**
 * Applies substitution values to a string containing ${var} patterns.
 */
export function substitute_string(text: string, values: Record<string, string>): string {
  return text.replace(SUBSTITUTION_PATTERN, (match, variable_name) => {
    return values[variable_name] ?? match;
  });
}

/**
 * Applies substitution values to an object recursively.
 * Only processes string values within the object.
 */
export function substitute_object<T>(obj: T, values: Record<string, string>): T {
  if (typeof obj === 'string') {
    return substitute_string(obj, values) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substitute_object(item, values)) as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substitute_object(value, values);
    }
    return result as T;
  }

  return obj;
}

/**
 * Collects substitution values from a kustomization definition and cluster values.
 * Returns a record of variable name to value.
 */
export function collect_substitution_values(
  kustomization: KustomizationType,
  cluster_values: Record<string, string> = {},
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const sub of kustomization.substitutions ?? []) {
    // Cluster value takes precedence over default
    const value = cluster_values[sub.name] ?? sub.default;
    if (value !== undefined && typeof value === 'string') {
      values[sub.name] = value;
    }
  }

  return values;
}

/**
 * Collects template-level version entries as substitution values.
 * These are shared across all kustomizations in the template.
 */
export function collect_template_versions(
  template: TemplateType,
  cluster_values: Record<string, string> = {},
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const version of template.spec.versions ?? []) {
    // Cluster value takes precedence over default
    const value = cluster_values[version.name] ?? version.default;
    if (value !== undefined && typeof value === 'string') {
      values[version.name] = value;
    }
  }

  return values;
}

/**
 * Collects all substitution values from template versions and kustomization substitutions.
 * Precedence: template versions < kustomization substitutions < cluster values
 */
export function collect_all_substitution_values(
  template: TemplateType,
  kustomization: KustomizationType,
  cluster_values: Record<string, string> = {},
): Record<string, string> {
  // Start with template-level versions (lowest precedence)
  const template_versions = collect_template_versions(template, cluster_values);

  // Add kustomization-level substitutions (higher precedence)
  const kustomization_values = collect_substitution_values(kustomization, cluster_values);

  // Merge with kustomization values taking precedence over template versions
  return {
    ...template_versions,
    ...kustomization_values,
  };
}

/**
 * Gets all defined substitution names from a kustomization.
 */
export function get_defined_substitutions(kustomization: KustomizationType): string[] {
  return (kustomization.substitutions ?? []).map((sub) => sub.name);
}

/**
 * Gets all required substitution names (those without defaults) from a kustomization.
 */
export function get_required_substitutions(kustomization: KustomizationType): string[] {
  return (kustomization.substitutions ?? [])
    .filter((sub) => sub.default === undefined)
    .map((sub) => sub.name);
}

/**
 * Validates that all required substitutions have values.
 */
export function validate_substitutions(
  kustomization: KustomizationType,
  cluster_values: Record<string, string> = {},
): SubstitutionValidationResultType {
  const required = get_required_substitutions(kustomization);
  const defined = get_defined_substitutions(kustomization);
  const provided = Object.keys(cluster_values);

  // Find missing required values
  const missing = required.filter((name) => cluster_values[name] === undefined);

  // Find unused provided values
  const unused = provided.filter((name) => !defined.includes(name));

  return {
    valid: missing.length === 0,
    missing,
    unused,
  };
}

/**
 * Generates the postBuild.substitute object for a Flux Kustomization.
 * Only includes values that have actual values (not undefined).
 */
export function generate_flux_substitutions(
  values: Record<string, string>,
): Record<string, string> | undefined {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

/**
 * Extracts all substitutions from resolved templates.
 * Returns a flat list of all substitution objects from all kustomizations.
 */
export function extract_all_substitutions(templates: ResolvedTemplateType[]): SubstitutionType[] {
  const substitutions: SubstitutionType[] = [];

  for (const resolved of templates) {
    if (!resolved.enabled) {
      continue;
    }

    for (const kustomization of resolved.template.spec.kustomizations) {
      if (kustomization.substitutions) {
        substitutions.push(...kustomization.substitutions);
      }
    }
  }

  return substitutions;
}

/**
 * Resolves external substitutions using registered providers.
 * Only resolves plugin-provided substitution types (e.g., 'sops', 'vault').
 * Core types (version, helm, namespace, generic) are handled elsewhere.
 * Legacy types (doppler, 1password) are handled by their respective plugins.
 *
 * @param templates - All resolved templates
 * @param cluster - Cluster configuration
 * @param registry - Plugin registry with registered substitution providers
 * @returns Result containing a map of substitution names to their resolved values
 */
export async function resolve_external_substitutions(
  templates: ResolvedTemplateType[],
  cluster: ClusterType,
  registry: PluginRegistryType,
): Promise<ResultType<Record<string, string>, KustodianErrorType>> {
  const values: Record<string, string> = {};

  // Extract all substitutions
  const all_substitutions = extract_all_substitutions(templates);

  // Filter to only external (plugin-provided) substitutions
  const external_substitutions = all_substitutions.filter((sub) => is_plugin_substitution(sub));

  if (external_substitutions.length === 0) {
    return success(values);
  }

  // Group substitutions by type
  const by_type = new Map<string, SubstitutionType[]>();
  for (const sub of external_substitutions) {
    if (!('type' in sub) || !sub.type) {
      continue; // Should not happen after filtering, but be safe
    }

    const type = sub.type;
    if (!by_type.has(type)) {
      by_type.set(type, []);
    }
    by_type.get(type)?.push(sub);
  }

  // Resolve each type using its provider
  for (const [type, subs] of by_type) {
    const provider = registry.get_substitution_provider(type);

    if (!provider) {
      // No provider registered for this type - skip with warning
      // In the future, we could make this an error or collect warnings
      continue;
    }

    // Resolve this batch of substitutions
    // Find plugin config for this provider
    const plugin_config = cluster.spec.plugins?.find((p) => p.name === provider.type)?.config;

    const result = await provider.resolve(subs, {
      cluster,
      templates: templates.map((t) => t.template),
      config: plugin_config ?? undefined,
    });

    if (!is_success(result)) {
      return failure(
        Errors.validation_error(
          `Failed to resolve ${type} substitutions: ${result.error.message}`,
        ),
      );
    }

    // Merge resolved values
    Object.assign(values, result.value);
  }

  return success(values);
}
