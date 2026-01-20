import type { KustomizationType, TemplateType } from '@kustodian/schema';

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
    if (value !== undefined) {
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
    if (value !== undefined) {
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
