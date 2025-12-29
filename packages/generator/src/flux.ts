import type { KustomizationType, TemplateType } from '@kustodian/schema';

import type { FluxKustomizationType, ResolvedKustomizationType } from './types.js';

/**
 * Default interval for Flux reconciliation.
 */
export const DEFAULT_INTERVAL = '10m';

/**
 * Default timeout for Flux reconciliation.
 */
export const DEFAULT_TIMEOUT = '5m';

/**
 * Generates a Flux Kustomization name from template and kustomization.
 */
export function generate_flux_name(template_name: string, kustomization_name: string): string {
  return `${template_name}-${kustomization_name}`;
}

/**
 * Generates the path for a Flux Kustomization.
 */
export function generate_flux_path(
  template_name: string,
  kustomization_path: string,
  base_path = './templates',
): string {
  // Normalize the path
  const normalized = kustomization_path.replace(/^\.\//, '');
  return `${base_path}/${template_name}/${normalized}`;
}

/**
 * Generates the dependency references for a Flux Kustomization.
 */
export function generate_depends_on(
  template_name: string,
  depends_on: string[] | undefined,
): Array<{ name: string }> | undefined {
  if (!depends_on || depends_on.length === 0) {
    return undefined;
  }

  return depends_on.map((dep) => ({
    name: generate_flux_name(template_name, dep),
  }));
}

/**
 * Generates health checks for a Flux Kustomization.
 */
export function generate_health_checks(
  kustomization: KustomizationType,
  namespace: string,
): FluxKustomizationType['spec']['healthChecks'] {
  if (!kustomization.health_checks || kustomization.health_checks.length === 0) {
    return undefined;
  }

  return kustomization.health_checks.map((check) => ({
    apiVersion: 'apps/v1',
    kind: check.kind,
    name: check.name,
    namespace: check.namespace ?? namespace,
  }));
}

/**
 * Generates a Flux Kustomization resource.
 */
export function generate_flux_kustomization(
  resolved: ResolvedKustomizationType,
  git_repository_name = 'flux-system',
): FluxKustomizationType {
  const { template, kustomization, values, namespace } = resolved;
  const name = generate_flux_name(template.metadata.name, kustomization.name);
  const path = generate_flux_path(template.metadata.name, kustomization.path);

  const spec: FluxKustomizationType['spec'] = {
    interval: DEFAULT_INTERVAL,
    path,
    prune: kustomization.prune ?? true,
    wait: kustomization.wait ?? true,
    sourceRef: {
      kind: 'GitRepository',
      name: git_repository_name,
    },
  };

  // Add timeout if specified
  if (kustomization.timeout) {
    spec.timeout = kustomization.timeout;
  } else {
    spec.timeout = DEFAULT_TIMEOUT;
  }

  // Add retry interval if specified
  if (kustomization.retry_interval) {
    spec.retryInterval = kustomization.retry_interval;
  }

  // Add dependencies
  const depends_on = generate_depends_on(template.metadata.name, kustomization.depends_on);
  if (depends_on) {
    spec.dependsOn = depends_on;
  }

  // Add substitutions if there are values
  if (Object.keys(values).length > 0) {
    spec.postBuild = {
      substitute: values,
    };
  }

  // Add health checks
  const health_checks = generate_health_checks(kustomization, namespace);
  if (health_checks) {
    spec.healthChecks = health_checks;
  }

  return {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name,
      namespace: 'flux-system',
    },
    spec,
  };
}

/**
 * Resolves a kustomization with values from the cluster config.
 */
export function resolve_kustomization(
  template: TemplateType,
  kustomization: KustomizationType,
  cluster_values: Record<string, string> = {},
): ResolvedKustomizationType {
  // Collect values with defaults
  const values: Record<string, string> = {};

  for (const sub of kustomization.substitutions ?? []) {
    // Check cluster-provided value first, then fall back to default
    const value = cluster_values[sub.name] ?? sub.default;
    if (value !== undefined) {
      values[sub.name] = value;
    }
  }

  // Determine namespace
  const namespace = kustomization.namespace?.default ?? 'default';

  return {
    template,
    kustomization,
    values,
    namespace,
  };
}
