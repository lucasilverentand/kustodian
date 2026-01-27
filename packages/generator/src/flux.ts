import type {
  ClusterType,
  FluxConfigType,
  FluxControllerSettingsType,
  KustomizationType,
  OciConfigType,
  PreservationPolicyType,
  DependencyRefType as SchemaDependencyRefType,
  TemplateType,
} from '@kustodian/schema';

import { generate_preservation_patches, get_preserved_resource_types } from './preservation.js';
import { collect_all_substitution_values } from './substitution.js';
import type {
  FluxKustomizationType,
  FluxOCIRepositoryType,
  KustomizePatchOpType,
  KustomizePatchType,
  ResolvedKustomizationType,
} from './types.js';
import { is_parse_error, parse_dependency_ref } from './validation/reference.js';
import { is_raw_dependency_ref } from './validation/types.js';

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
 * @param template_name - The template name (used if template_source_path not provided)
 * @param kustomization_path - The kustomization's relative path
 * @param base_path - Base path prefix (default: './templates')
 * @param template_source_path - Optional actual source path relative to templates dir
 */
export function generate_flux_path(
  template_name: string,
  kustomization_path: string,
  base_path = './templates',
  template_source_path?: string,
): string {
  // Normalize the path
  const normalized = kustomization_path.replace(/^\.\//, '');
  // Use actual source path if provided, otherwise fall back to template name
  const template_dir = template_source_path ?? template_name;
  return `${base_path}/${template_dir}/${normalized}`;
}

/**
 * Generates the dependency references for a Flux Kustomization.
 *
 * Supports three formats:
 * - Within-template: `database` → uses current template name
 * - Cross-template: `secrets/doppler` → uses explicit template name
 * - Raw external: `{ raw: { name: 'legacy-infrastructure', namespace: 'gitops-system' } }`
 */
export function generate_depends_on(
  template_name: string,
  depends_on: SchemaDependencyRefType[] | undefined,
): Array<{ name: string; namespace?: string }> | undefined {
  if (!depends_on || depends_on.length === 0) {
    return undefined;
  }

  return depends_on.map((dep) => {
    const parsed = parse_dependency_ref(dep);
    if (is_parse_error(parsed)) {
      // Invalid references are caught during validation, fall back to current behavior
      // This should only happen with string refs
      if (typeof dep === 'string') {
        return { name: generate_flux_name(template_name, dep) };
      }
      // If somehow we have an invalid object ref, use a placeholder
      return { name: 'invalid-reference' };
    }

    // Handle raw dependencies - pass through name and namespace directly
    if (is_raw_dependency_ref(parsed)) {
      return {
        name: parsed.name,
        namespace: parsed.namespace,
      };
    }

    // Handle string-based dependencies (within-template and cross-template)
    const effective_template = parsed.template ?? template_name;
    return { name: generate_flux_name(effective_template, parsed.kustomization) };
  });
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
    apiVersion: check.api_version ?? 'apps/v1',
    kind: check.kind,
    name: check.name,
    namespace: check.namespace ?? namespace,
  }));
}

/**
 * Generates custom health checks with CEL expressions for a Flux Kustomization.
 */
export function generate_custom_health_checks(
  kustomization: KustomizationType,
  namespace: string,
): FluxKustomizationType['spec']['customHealthChecks'] {
  if (!kustomization.health_check_exprs || kustomization.health_check_exprs.length === 0) {
    return undefined;
  }

  return kustomization.health_check_exprs.map((check) => {
    const healthCheck: {
      apiVersion: string;
      kind: string;
      namespace?: string;
      current?: string;
      failed?: string;
    } = {
      apiVersion: check.api_version,
      kind: check.kind,
      namespace: check.namespace ?? namespace,
    };

    if (check.current !== undefined) {
      healthCheck.current = check.current;
    }

    if (check.failed !== undefined) {
      healthCheck.failed = check.failed;
    }

    return healthCheck;
  });
}

/**
 * Generates a Flux OCIRepository resource.
 */
export function generate_flux_oci_repository(
  cluster: ClusterType,
  oci_config: OciConfigType,
  repository_name: string,
  flux_namespace: string,
  interval: string = DEFAULT_INTERVAL,
): FluxOCIRepositoryType {
  const url = `oci://${oci_config.registry}/${oci_config.repository}`;

  const ref: FluxOCIRepositoryType['spec']['ref'] = {};
  switch (oci_config.tag_strategy) {
    case 'cluster':
      ref.tag = cluster.metadata.name;
      break;
    case 'manual':
      ref.tag = oci_config.tag || 'latest';
      break;
    default:
      ref.tag = 'latest'; // CI will update this
  }

  const spec: FluxOCIRepositoryType['spec'] = {
    interval,
    url,
    ref,
    provider: oci_config.provider || 'generic',
  };

  if (oci_config.secret_ref) {
    spec.secretRef = { name: oci_config.secret_ref };
  }

  if (oci_config.insecure) {
    spec.insecure = true;
  }

  return {
    apiVersion: 'source.toolkit.fluxcd.io/v1',
    kind: 'OCIRepository',
    metadata: {
      name: repository_name,
      namespace: flux_namespace,
    },
    spec,
  };
}

/**
 * Generates a Flux Kustomization resource.
 */
export function generate_flux_kustomization(
  resolved: ResolvedKustomizationType,
  source_repository_name = 'flux-system',
  source_kind: 'GitRepository' | 'OCIRepository' = 'GitRepository',
  preservation?: PreservationPolicyType,
  template_source_path?: string,
  interval: string = DEFAULT_INTERVAL,
  timeout: string = DEFAULT_TIMEOUT,
): FluxKustomizationType {
  const { template, kustomization, values, namespace } = resolved;
  const name = generate_flux_name(template.metadata.name, kustomization.name);
  const path = generate_flux_path(template.metadata.name, kustomization.path, './templates', template_source_path);

  const spec: FluxKustomizationType['spec'] = {
    interval,
    targetNamespace: namespace,
    path,
    prune: kustomization.prune ?? true,
    wait: kustomization.wait ?? true,
    sourceRef: {
      kind: source_kind,
      name: source_repository_name,
    },
  };

  // Add preservation patches if preservation is configured
  if (preservation) {
    const preserved_types = get_preserved_resource_types(preservation);
    if (preserved_types.length > 0) {
      const patches = generate_preservation_patches(preserved_types);
      spec.patches = patches;
    }
  }

  // Add timeout if specified
  if (kustomization.timeout) {
    spec.timeout = kustomization.timeout;
  } else {
    spec.timeout = timeout;
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

  // Add custom health checks with CEL expressions
  const custom_health_checks = generate_custom_health_checks(kustomization, namespace);
  if (custom_health_checks) {
    spec.customHealthChecks = custom_health_checks;
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
 * Includes both template-level versions and kustomization-level substitutions.
 */
export function resolve_kustomization(
  template: TemplateType,
  kustomization: KustomizationType,
  cluster_values: Record<string, string> = {},
): ResolvedKustomizationType {
  // Collect values from template versions and kustomization substitutions
  const values = collect_all_substitution_values(template, kustomization, cluster_values);

  // Determine namespace
  const namespace = kustomization.namespace?.default ?? 'default';

  // Add namespace to substitution values so ${namespace} works in templates
  values['namespace'] = namespace;

  return {
    template,
    kustomization,
    values,
    namespace,
  };
}

/**
 * Controller names that can be patched.
 */
type ControllerNameType = 'kustomize-controller' | 'helm-controller' | 'source-controller';

/**
 * Gets effective settings for a controller by merging global and controller-specific settings.
 */
function get_effective_controller_settings(
  flux_config: FluxConfigType,
  controller_key: 'kustomize_controller' | 'helm_controller' | 'source_controller',
): FluxControllerSettingsType {
  const controllers = flux_config.controllers;
  if (!controllers) {
    return {};
  }

  const global_concurrent = controllers.concurrent;
  const global_requeue = controllers.requeue_dependency;
  const controller_settings = controllers[controller_key];

  return {
    concurrent: controller_settings?.concurrent ?? global_concurrent,
    requeue_dependency: controller_settings?.requeue_dependency ?? global_requeue,
  };
}

/**
 * Builds JSON patch operations for a controller based on its settings.
 */
function build_controller_patch_ops(settings: FluxControllerSettingsType): KustomizePatchOpType[] {
  const ops: KustomizePatchOpType[] = [];

  if (settings.concurrent !== undefined) {
    ops.push({
      op: 'add',
      path: '/spec/template/spec/containers/0/args/-',
      value: `--concurrent=${settings.concurrent}`,
    });
  }

  if (settings.requeue_dependency !== undefined) {
    ops.push({
      op: 'add',
      path: '/spec/template/spec/containers/0/args/-',
      value: `--requeue-dependency=${settings.requeue_dependency}`,
    });
  }

  return ops;
}

/**
 * Generates Kustomize patches for Flux controllers based on cluster configuration.
 * These patches are applied to the gotk-components during Flux bootstrap/install.
 */
export function generate_flux_controller_patches(
  flux_config: FluxConfigType,
): KustomizePatchType[] | undefined {
  if (!flux_config.controllers) {
    return undefined;
  }

  const controller_mapping: Array<{
    key: 'kustomize_controller' | 'helm_controller' | 'source_controller';
    name: ControllerNameType;
  }> = [
    { key: 'kustomize_controller', name: 'kustomize-controller' },
    { key: 'helm_controller', name: 'helm-controller' },
    { key: 'source_controller', name: 'source-controller' },
  ];

  const patches: KustomizePatchType[] = [];

  for (const { key, name } of controller_mapping) {
    const settings = get_effective_controller_settings(flux_config, key);
    const ops = build_controller_patch_ops(settings);

    if (ops.length > 0) {
      patches.push({
        patch: JSON.stringify(ops),
        target: {
          kind: 'Deployment',
          name,
        },
      });
    }
  }

  return patches.length > 0 ? patches : undefined;
}
